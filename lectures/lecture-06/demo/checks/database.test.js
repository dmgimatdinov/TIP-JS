// Интеграционные тесты с реальной PostgreSQL.
// Запускаются ТОЛЬКО если задана переменная окружения DATABASE_URL.
// Иначе каждый тест пропускается (test.skip), чтобы запуск без базы не падал.
//
// Запуск с базой:
//   export DATABASE_URL=postgresql://tip_app:пароль@127.0.0.1:5432/tip_tasks
//   npm run check:db
//
// Перед запуском необходимо загрузить схему и сид:
//   psql -X -h 127.0.0.1 -U tip_app -d tip_tasks -v ON_ERROR_STOP=1 -1 -f sql/01_schema.sql
//   psql -X -h 127.0.0.1 -U tip_app -d tip_tasks -v ON_ERROR_STOP=1 -1 -f sql/02_seed.sql

import test from "node:test";
import assert from "node:assert/strict";
import { createPool } from "../src/db.js";
import { createPostgresStore } from "../src/store-postgres.js";
import { createApp } from "../src/app.js";

const connectionString = process.env.DATABASE_URL?.trim();
const hasDb = Boolean(connectionString);

// test.skip нужен, потому что test() без базы либо висел бы на connectionTimeout,
// либо падал бы с ошибкой подключения. Пропуск — корректное поведение для окружения без БД.
const it = hasDb ? test : test.skip;

let pool;
let store;

async function setup() {
  if (!hasDb) return;
  if (!pool) {
    pool = createPool(connectionString);
    store = createPostgresStore(pool);
  }
  // Перед каждым набором — reset в исходное состояние.
  await store.reset();
}

it("ping возвращает true при подключении к PostgreSQL", async () => {
  await setup();
  const ok = await store.ping();
  assert.equal(ok, true);
});

it("listCategories возвращает 3 категории в порядке id", async () => {
  await setup();
  const categories = await store.listCategories();
  assert.equal(categories.length, 3);
  assert.equal(categories[0].name, "Учёба");
});

it("listTasks возвращает 12 задач", async () => {
  await setup();
  const tasks = await store.listTasks();
  assert.equal(tasks.length, 12);
  assert.equal(tasks[0].id, 1);
});

it("listTasks с фильтром priority=high возвращает 5 задач", async () => {
  await setup();
  const tasks = await store.listTasks({
    completed: null,
    priority: "high",
    categoryId: null,
    q: "",
  });
  // id 4, 13, 16, 25, 34 — priority=high
  assert.equal(tasks.length, 5);
  const ids = tasks.map((t) => t.id);
  assert.deepEqual(ids, [4, 13, 16, 25, 34]);
});

it("listTasks с q=провер возвращает 2 задачи (id 7, 16)", async () => {
  await setup();
  const tasks = await store.listTasks({
    completed: null,
    priority: null,
    categoryId: null,
    q: "провер",
  });
  assert.equal(tasks.length, 2);
  assert.deepEqual(
    tasks.map((t) => t.id),
    [7, 16]
  );
});

it("getTask возвращает задачу или null", async () => {
  await setup();
  const found = await store.getTask(4);
  assert.equal(found.id, 4);
  const missing = await store.getTask(9999);
  assert.equal(missing, null);
});

it("createTask назначает id и completed=false", async () => {
  await setup();
  const created = await store.createTask({
    title: "Тест POST",
    priority: "medium",
    categoryId: 1,
  });
  assert.equal(created.id, 35);
  assert.equal(created.completed, false);
  assert.equal(created.categoryId, 1);
});

it("updateTask частично обновляет поля", async () => {
  await setup();
  const updated = await store.updateTask(4, { completed: true });
  assert.equal(updated.completed, true);
  assert.equal(updated.title, "Подготовить модель задач");
});

it("updateTask для отсутствующей задачи возвращает null", async () => {
  await setup();
  const result = await store.updateTask(9999, { completed: true });
  assert.equal(result, null);
});

it("deleteTask возвращает {id} или null", async () => {
  await setup();
  const removed = await store.deleteTask(7);
  assert.deepEqual(removed, { id: 7 });
  const again = await store.deleteTask(7);
  assert.equal(again, null);
});

it("reset восстанавливает 12 задач и сбрасывает последовательности", async () => {
  await setup();
  // Удалим пару задач и создадим одну
  await store.deleteTask(1);
  await store.deleteTask(4);
  await store.createTask({ title: "tmp", priority: "low", categoryId: 1 });

  const result = await store.reset();
  assert.equal(result.reset, true);
  assert.equal(result.total, 12);

  // После reset следующая createTask должна получить id 35 (max=34 + 1)
  const created = await store.createTask({
    title: "после reset",
    priority: "medium",
    categoryId: 2,
  });
  assert.equal(created.id, 35);
});

it("HTTP API на PostgreSQL сохраняет контракт camelCase", async () => {
  await setup();
  const app = createApp({ store });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api`;
  try {
    const resp = await fetch(`${base}/tasks/4`);
    const body = await resp.json();
    assert.equal(body.data.id, 4);
    assert.ok("categoryId" in body.data);
    assert.ok(!("category_id" in body.data));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("без DATABASE_URL тесты PostgreSQL пропускаются", { skip: hasDb }, () => {
  // Этот тест существует, чтобы в отчёте было видно: пропуск ожидаем.
  assert.ok(true);
});

// Закрытие пула после всех тестов.
test("закрытие пула PostgreSQL", async () => {
  if (pool) {
    await pool.end();
  }
});
