// Разбор параметров URL: id и query. Не знает про Express, только URL/URLSearchParams.

import { ApiError } from "./errors.js";

const ALLOWED_QUERY_NAMES = new Set(["completed", "priority", "categoryId", "q"]);
const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);

// Принимает строку, возвращает число или null.
// Регулярное выражение отвергает 0, -1, 01, 1.5, 1e2, 4abc, пробелы.
export function parsePositiveId(raw) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

// Принимает URLSearchParams, возвращает объект фильтров.
// Бросает ApiError(400, "INVALID_QUERY", ...) при ошибке.
export function parseFilters(searchParams) {
  for (const name of searchParams.keys()) {
    if (!ALLOWED_QUERY_NAMES.has(name)) {
      throw new ApiError(400, "INVALID_QUERY", `Неизвестный параметр запроса: ${name}.`);
    }
  }

  const filters = { completed: null, priority: null, categoryId: null, q: "" };

  const completedValues = searchParams.getAll("completed");
  if (completedValues.length > 1) {
    throw new ApiError(400, "INVALID_QUERY", "Параметр completed нельзя повторять.");
  }
  if (completedValues.length === 1) {
    const raw = completedValues[0];
    if (raw === "") {
      throw new ApiError(400, "INVALID_QUERY", "completed не должен быть пустым.");
    }
    if (raw !== "true" && raw !== "false") {
      throw new ApiError(400, "INVALID_QUERY", "completed должен быть true или false.");
    }
    filters.completed = raw === "true";
  }

  const priorityValues = searchParams.getAll("priority");
  if (priorityValues.length > 1) {
    throw new ApiError(400, "INVALID_QUERY", "Параметр priority нельзя повторять.");
  }
  if (priorityValues.length === 1) {
    const raw = priorityValues[0];
    if (raw === "") {
      throw new ApiError(400, "INVALID_QUERY", "priority не должен быть пустым.");
    }
    if (!ALLOWED_PRIORITIES.has(raw)) {
      throw new ApiError(400, "INVALID_QUERY", "priority должен быть low, medium или high.");
    }
    filters.priority = raw;
  }

  const categoryValues = searchParams.getAll("categoryId");
  if (categoryValues.length > 1) {
    throw new ApiError(400, "INVALID_QUERY", "Параметр categoryId нельзя повторять.");
  }
  if (categoryValues.length === 1) {
    const raw = categoryValues[0];
    const id = parsePositiveId(raw);
    if (id === null) {
      throw new ApiError(400, "INVALID_QUERY", "categoryId должен быть положительным целым числом.");
    }
    filters.categoryId = id;
  }

  const qValues = searchParams.getAll("q");
  if (qValues.length > 1) {
    throw new ApiError(400, "INVALID_QUERY", "Параметр q нельзя повторять.");
  }
  if (qValues.length === 1) {
    const raw = qValues[0].trim();
    if (raw.length > 100) {
      throw new ApiError(400, "INVALID_QUERY", "q не должен быть длиннее 100 символов.");
    }
    filters.q = raw;
  }

  return filters;
}
