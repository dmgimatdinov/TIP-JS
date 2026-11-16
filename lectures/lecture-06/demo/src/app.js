// Сборка приложения Express без открытия порта.
// createApp({ store }) принимает хранилище (dependency injection).
// Если store не передан — выбирается по умолчанию:
//   • если задан DATABASE_URL — пул PostgreSQL и createPostgresStore;
//   • иначе — память (createStore), как в Лекции 5.
// Тесты HTTP-контракта передают свою реализацию store (см. checks/fake-store.js).

import express from "express";
import { createStore } from "./store.js";
import { createReadRoutes } from "./routes.js";
import { createWriteRoutes } from "./write-routes.js";
import { errorHandler, ApiError } from "./errors.js";

export function createApp({ store } = {}) {
  const app = express();

  // 1. Общие заголовки: CORS и no-store для всех ответов.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.set("Access-Control-Expose-Headers", "Location");
    res.set("Access-Control-Max-Age", "600");
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });

  // 2. Прекомпьют OPTIONS — до маршрутов, до 405.
  app.options("*", (req, res) => {
    res.status(204).end();
  });

  // 3. JSON-middleware только для POST и PATCH, не глобально.
  const jsonForWrites = (req, res, next) => {
    if (req.method !== "POST" && req.method !== "PATCH") {
      next();
      return;
    }
    const contentType = req.headers["content-type"] ?? "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      next(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Тело запроса должно иметь Content-Type application/json."));
      return;
    }
    express.json({ limit: "16kb" })(req, res, (err) => {
      if (err) next(err);
      else next();
    });
  };
  app.use("/api/tasks", jsonForWrites);
  app.use("/api/tasks/:id", jsonForWrites);

  // 4. Хранилище. Если не передано снаружи — используем память.
  //    Это позволяет запускать демо без PostgreSQL (как Лекцию 5).
  //    В server.js при наличии DATABASE_URL подключается PostgreSQL.
  const dataStore = store ?? createStore();

  // 5. Маршруты /api
  app.use("/api", createReadRoutes(dataStore));
  app.use("/api", createWriteRoutes(dataStore));

  // 6. 405 для известных путей после конкретных методов.
  const knownPaths = ["/api/health", "/api/categories", "/api/tasks", "/api/tasks/:id", "/api/debug/reset"];
  for (const path of knownPaths) {
    app.all(path, (req, res, next) => {
      next(new ApiError(405, "METHOD_NOT_ALLOWED", `Метод ${req.method} не поддерживается для ${path}.`));
    });
  }
  // Заголовок Allow для 405
  app.use((err, req, res, next) => {
    if (err instanceof ApiError && err.status === 405) {
      const allowMap = {
        "/api/health": "GET, HEAD, OPTIONS",
        "/api/categories": "GET, HEAD, OPTIONS",
        "/api/tasks": "GET, HEAD, POST, OPTIONS",
        "/api/tasks/:id": "GET, HEAD, PATCH, DELETE, OPTIONS",
        "/api/debug/reset": "POST, OPTIONS",
      };
      const path = req.path.startsWith("/api/tasks/") ? "/api/tasks/:id" : req.path;
      const allow = allowMap[path] ?? "GET, HEAD, OPTIONS";
      res.set("Allow", allow);
    }
    next(err);
  });

  // 7. 404 для неизвестных путей.
  app.use((req, res, next) => {
    next(new ApiError(404, "ROUTE_NOT_FOUND", `Маршрут ${req.path} не найден.`));
  });

  // 8. Обработчик ошибок — последний.
  app.use(errorHandler);

  // Прокидываем store наружу — серверный скрипт может его закрыть (pool.end()).
  app.locals.store = dataStore;
  return app;
}
