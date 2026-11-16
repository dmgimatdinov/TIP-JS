// GET-маршруты и учебный reset. Write-операции (POST/PATCH/DELETE) — в write-routes.js.
// Все обработчики async: store может быть как синхронным (память), так и асинхронным (PostgreSQL).
// Ошибки из store (включая ошибки базы) пробрасываются в errorHandler.

import { Router } from "express";
import { ApiError } from "./errors.js";
import { parsePositiveId, parseFilters } from "./validation.js";

export function createReadRoutes(store) {
  const router = Router();

  // GET /api/health
  router.get("/health", (req, res) => {
    res.json({ data: { status: "ok" } });
  });

  // GET /api/categories
  router.get("/categories", async (req, res, next) => {
    try {
      const categories = await store.listCategories();
      res.json({ data: categories, meta: { total: categories.length } });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks — фильтры передаются в store, который выполняет фильтрацию
  // либо в JavaScript (память), либо в SQL (PostgreSQL).
  router.get("/tasks", async (req, res, next) => {
    try {
      const url = new URL(req.originalUrl, "http://localhost");
      const filters = parseFilters(url.searchParams);
      const visible = await store.listTasks(filters);
      res.json({
        data: visible,
        meta: { total: visible.length, filters },
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/tasks/:id
  router.get("/tasks/:id", async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (id === null) {
        throw new ApiError(400, "INVALID_ID", "id должен быть положительным целым числом.");
      }
      const task = await store.getTask(id);
      if (!task) {
        throw new ApiError(404, "TASK_NOT_FOUND", `Задача с id ${id} не найдена.`, { id });
      }
      res.json({ data: task });
    } catch (err) {
      next(err);
    }
  });

  // Учебный reset — восстанавливает исходные данные.
  router.post("/debug/reset", async (req, res, next) => {
    try {
      const result = await store.reset();
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
