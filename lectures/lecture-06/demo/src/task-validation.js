// Проверка тела POST/PATCH. Чистая функция: не трогает req/res, не знает про store.
// Возвращает словарь ошибок по полям; пустой объект = нет ошибок.

const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);

// partial=false: режим POST (title, priority, categoryId обязательны; completed запрещён).
// partial=true: режим PATCH (любое непустое подмножество; id всегда запрещён).
// categoryIds: Set существующих id категорий для проверки categoryId.
export function validateTaskInput(body, { partial = false, categoryIds = new Set() } = {}) {
  const errors = Object.create(null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.body = "Тело запроса должно быть JSON-объектом.";
    return errors;
  }

  const allowed = partial
    ? new Set(["title", "completed", "priority", "categoryId"])
    : new Set(["title", "priority", "categoryId"]);

  for (const name of Object.keys(body)) {
    if (!allowed.has(name)) {
      errors[name] = "Неизвестное поле.";
    }
  }

  if (partial && Object.keys(body).length === 0) {
    errors.body = "Нужно передать хотя бы одно поле.";
  }

  // title
  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 100) {
      errors.title = "Название должно содержать от 1 до 100 символов.";
    }
  } else if (!partial) {
    errors.title = "Обязательное поле.";
  }

  // priority
  if ("priority" in body) {
    if (!ALLOWED_PRIORITIES.has(body.priority)) {
      errors.priority = "Приоритет должен быть low, medium или high.";
    }
  } else if (!partial) {
    errors.priority = "Обязательное поле.";
  }

  // categoryId
  if ("categoryId" in body) {
    if (!Number.isSafeInteger(body.categoryId) || !categoryIds.has(body.categoryId)) {
      errors.categoryId = "Указана неизвестная категория.";
    }
  } else if (!partial) {
    errors.categoryId = "Обязательное поле.";
  }

  // completed (только в partial/PATCH)
  if ("completed" in body) {
    if (typeof body.completed !== "boolean") {
      errors.completed = "completed должен быть логическим значением.";
    }
  }

  return errors;
}

// Нормализация тела: извлекает только проверенные поля, обрезает title.
export function normalizeTaskChanges(body, errors) {
  const changes = {};
  if ("title" in body && !errors.title) {
    changes.title = body.title.trim();
  }
  if ("priority" in body && !errors.priority) {
    changes.priority = body.priority;
  }
  if ("categoryId" in body && !errors.categoryId) {
    changes.categoryId = body.categoryId;
  }
  if ("completed" in body && !errors.completed) {
    changes.completed = body.completed;
  }
  return changes;
}
