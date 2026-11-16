// Write-маршруты: POST/PATCH/DELETE.
// Все обработчики async: store может быть как памятью, так и PostgreSQL.
// Перед записью проверяем существование задачи и валидируем тело.

import { Router } from "express";
import { ApiError } from "./errors.js";
import { parsePositiveId } from "./validation.js";
import { validateTaskInput, normalizeTaskChanges } from "./task-validation.js";

export function createWriteRoutes(store) {
  const router = Router();

  // POST /api/tasks — создание новой задачи.
  router.post("/tasks", async (req, res, next) => {
    try {
      const categoryIds = await store.categoryIds();
      const errors = validateTaskInput(req.body, {
        partial: false,
        categoryIds,
      });
      if (Object.keys(errors).length > 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "Данные задачи не прошли проверку.", errors);
      }

      const changes = normalizeTaskChanges(req.body, errors);
      const created = await store.createTask(changes);

      res
        .status(201)
        .location(`/api/tasks/${created.id}`)
        .json({ data: created });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/tasks/:id — частичное обновление.
  router.patch("/tasks/:id", async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (id === null) {
        throw new ApiError(400, "INVALID_ID", "id должен быть положительным целым числом.");
      }

      const existing = await store.getTask(id);
      if (!existing) {
        throw new ApiError(404, "TASK_NOT_FOUND", `Задача с id ${id} не найдена.`, { id });
      }

      const categoryIds = await store.categoryIds();
      const errors = validateTaskInput(req.body, {
        partial: true,
        categoryIds,
      });
      if (Object.keys(errors).length > 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "Данные задачи не прошли проверку.", errors);
      }

      const changes = normalizeTaskChanges(req.body, errors);
      const updated = await store.updateTask(id, changes);
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/tasks/:id — удаление без тела.
  router.delete("/tasks/:id", async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      if (id === null) {
        throw new ApiError(400, "INVALID_ID", "id должен быть положительным целым числом.");
      }

      const removed = await store.deleteTask(id);
      if (!removed) {
        throw new ApiError(404, "TASK_NOT_FOUND", `Задача с id ${id} не найдена.`, { id });
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
