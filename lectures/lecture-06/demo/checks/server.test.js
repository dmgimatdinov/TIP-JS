// Интеграционные тесты HTTP-контракта через node:test и fetch.
// Используют fake-store — работают без PostgreSQL.
// Каждый тест запускает createApp({ store }) на свободном порту и делает реальные HTTP-запросы.
//
// Эти тесты проверяют то же, что и Лекция 5: статусы, формат ответа, CORS,
// обработку ошибок. Дополнительно — что контракт не изменился при переходе
// от памяти к базе: маршруты не зависят от реализации store.

import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createFakeStore } from "./support/fake-store.js";

async function withServer(action, store) {
  const app = createApp({ store: store ?? createFakeStore() });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api`;
  try {
    await action(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function readJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

test("GET /api/health возвращает 200 и status ok", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.deepEqual(body, { data: { status: "ok" } });
  });
});

test("GET /api/categories возвращает 3 категории", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/categories`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.data.length, 3);
    assert.equal(body.meta.total, 3);
    assert.equal(body.data[0].name, "Учёба");
  });
});

test("GET /api/tasks возвращает 12 задач в исходном порядке", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.meta.total, 12);
    assert.equal(body.data[0].id, 1);
    assert.equal(body.data[11].id, 34);
    // Контракт camelCase сохранён даже при store на PostgreSQL
    assert.ok("categoryId" in body.data[0]);
    assert.ok(!("category_id" in body.data[0]));
  });
});

test("GET /api/tasks с фильтрами completed=false и priority=high", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks?completed=false&priority=high`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.meta.total, 3);
    const ids = body.data.map((t) => t.id);
    assert.deepEqual(ids, [4, 13, 34]);
  });
});

test("GET /api/tasks с тремя фильтрами", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/tasks?completed=false&priority=high&categoryId=2`
    );
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.meta.total, 2);
    const ids = body.data.map((t) => t.id);
    assert.deepEqual(ids, [4, 34]);
  });
});

test("GET /api/tasks с поиском по кириллице без учёта регистра", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks?q=провер`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.meta.total, 2);
    const ids = body.data.map((t) => t.id);
    assert.deepEqual(ids, [7, 16]);
  });
});

test("GET /api/tasks с несуществующей категорией возвращает пустой массив", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks?categoryId=999`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.meta.total, 0);
    assert.deepEqual(body.data, []);
  });
});

test("GET /api/tasks с неизвестным параметром возвращает 400 INVALID_QUERY", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks?foo=bar`);
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "INVALID_QUERY");
  });
});

test("GET /api/tasks с повторяющимся параметром возвращает 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks?priority=low&priority=high`);
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "INVALID_QUERY");
  });
});

test("GET /api/tasks с неверным completed возвращает 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks?completed=maybe`);
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "INVALID_QUERY");
  });
});

test("GET /api/tasks/:id возвращает одну задачу", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/25`);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.data.id, 25);
    assert.equal(body.data.title, "Исправить обработку ошибок");
  });
});

test("GET /api/tasks/:id для отсутствующей задачи возвращает 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/999`);
    assert.equal(response.status, 404);
    const body = await readJson(response);
    assert.equal(body.error.code, "TASK_NOT_FOUND");
    assert.equal(body.error.details.id, 999);
  });
});

test("GET /api/tasks/:id с неверным форматом id возвращает 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/abc`);
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "INVALID_ID");
  });
});

test("POST /api/tasks создаёт задачу с id 35 и заголовком Location", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Новая задача", priority: "medium", categoryId: 1 }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("location"), "/api/tasks/35");
    const body = await readJson(response);
    assert.equal(body.data.id, 35);
    assert.equal(body.data.completed, false);
    assert.equal(body.data.priority, "medium");
  });
});

test("POST /api/tasks без Content-Type возвращает 415", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      body: '{"title":"x","priority":"low","categoryId":1}',
    });
    assert.equal(response.status, 415);
    const body = await readJson(response);
    assert.equal(body.error.code, "UNSUPPORTED_MEDIA_TYPE");
  });
});

test("POST /api/tasks с повреждённым JSON возвращает 400 INVALID_JSON", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "INVALID_JSON");
  });
});

test("POST /api/tasks с неверными полями возвращает 400 VALIDATION_ERROR с details", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", priority: "urgent", categoryId: 999 }),
    });
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details.title);
    assert.ok(body.error.details.priority);
    assert.ok(body.error.details.categoryId);
  });
});

test("POST /api/tasks с id в теле возвращает 400 (id назначает сервер)", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 100, title: "x", priority: "low", categoryId: 1 }),
    });
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.details.id);
  });
});

test("PATCH /api/tasks/:id обновляет переданные поля и сохраняет остальные", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/4`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.data.id, 4);
    assert.equal(body.data.completed, true);
    assert.equal(body.data.title, "Подготовить модель задач");
  });
});

test("PATCH /api/tasks/:id с пустым телом возвращает 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/4`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 400);
    const body = await readJson(response);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  });
});

test("PATCH /api/tasks/:id для отсутствующей задачи возвращает 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(response.status, 404);
    const body = await readJson(response);
    assert.equal(body.error.code, "TASK_NOT_FOUND");
  });
});

test("DELETE /api/tasks/:id возвращает 204 без тела", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/7`, { method: "DELETE" });
    assert.equal(response.status, 204);
    const text = await response.text();
    assert.equal(text, "");

    // Повторное удаление — 404
    const again = await fetch(`${baseUrl}/tasks/7`, { method: "DELETE" });
    assert.equal(again.status, 404);
  });
});

test("DELETE /api/tasks/:id для отсутствующей задачи возвращает 404", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks/999`, { method: "DELETE" });
    assert.equal(response.status, 404);
    const body = await readJson(response);
    assert.equal(body.error.code, "TASK_NOT_FOUND");
  });
});

test("POST /api/debug/reset восстанавливает исходные данные", async () => {
  await withServer(async (baseUrl) => {
    // Удалим задачу
    await fetch(`${baseUrl}/tasks/7`, { method: "DELETE" });
    const before = await readJson(await fetch(`${baseUrl}/tasks`));
    assert.equal(before.meta.total, 11);

    // Reset
    const resetResp = await fetch(`${baseUrl}/debug/reset`, { method: "POST" });
    assert.equal(resetResp.status, 200);
    const resetBody = await readJson(resetResp);
    assert.equal(resetBody.data.reset, true);
    assert.equal(resetBody.data.total, 12);

    // Задача 7 снова есть
    const after = await readJson(await fetch(`${baseUrl}/tasks`));
    assert.equal(after.meta.total, 12);
  });
});

test("PUT /api/tasks возвращает 405 с Allow", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 405);
    assert.match(response.headers.get("allow"), /GET, HEAD, POST/);
    const body = await readJson(response);
    assert.equal(body.error.code, "METHOD_NOT_ALLOWED");
  });
});

test("OPTIONS /api/tasks возвращает 204", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, { method: "OPTIONS" });
    assert.equal(response.status, 204);
  });
});

test("HEAD /api/tasks возвращает заголовки без тела", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tasks`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type"));
    const text = await response.text();
    assert.equal(text, "");
  });
});

test("Неизвестный маршрут возвращает 404 ROUTE_NOT_FOUND", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/no-such-path`);
    assert.equal(response.status, 404);
    const body = await readJson(response);
    assert.equal(body.error.code, "ROUTE_NOT_FOUND");
  });
});

test("CORS: Access-Control-Allow-Origin равен *", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.match(
      response.headers.get("access-control-allow-methods"),
      /GET, HEAD, POST, PATCH, DELETE/
    );
  });
});

test("Независимые экземпляры приложения не делят store", async () => {
  // Каждый createFakeStore() независим, как и createPostgresStore(pool) с разными пулами.
  const store1 = createFakeStore();
  const store2 = createFakeStore();
  const app1 = createApp({ store: store1 });
  const app2 = createApp({ store: store2 });
  const s1 = app1.listen(0, "127.0.0.1");
  const s2 = app2.listen(0, "127.0.0.1");
  await Promise.all([
    new Promise((r) => s1.once("listening", r)),
    new Promise((r) => s2.once("listening", r)),
  ]);
  try {
    const u1 = `http://127.0.0.1:${s1.address().port}/api`;
    const u2 = `http://127.0.0.1:${s2.address().port}/api`;

    await fetch(`${u1}/tasks/7`, { method: "DELETE" });

    const p1 = await readJson(await fetch(`${u1}/tasks`));
    const p2 = await readJson(await fetch(`${u2}/tasks`));
    assert.equal(p1.meta.total, 11);
    assert.equal(p2.meta.total, 12);
  } finally {
    await new Promise((r) => s1.close(r));
    await new Promise((r) => s2.close(r));
  }
});
