// Единый формат ошибок API. ApiError — ожидаемая ошибка, попадает в JSON-ответ.
// Обработчик ошибок (errorHandler) приводит любые исключения к формату { error: {...} },
// включая ошибки драйвера pg (по коду SQLSTATE).

export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    const error = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return error;
  }
}

// Приводит ошибку драйвера pg к ApiError по коду SQLSTATE.
// Вызывается обработчиком ошибок Express для не-API ошибок.
function toDatabaseApiError(err) {
  const code = err?.code;
  // 23503 — foreign_key_violation: ссылка на несуществующую категорию.
  if (code === "23503") {
    return new ApiError(
      400,
      "INVALID_CATEGORY",
      "Указана несуществующая категория.",
      { constraint: err.constraint ?? null }
    );
  }
  // 23514 — check_violation: например priority вне множества.
  if (code === "23514") {
    return new ApiError(
      400,
      "CONSTRAINT_VIOLATION",
      "Значение нарушает ограничение базы данных.",
      { constraint: err.constraint ?? null }
    );
  }
  // 23505 — unique_violation: дубликат уникального поля.
  if (code === "23505") {
    return new ApiError(
      409,
      "DUPLICATE_VALUE",
      "Значение нарушает ограничение уникальности.",
      { constraint: err.constraint ?? null }
    );
  }
  // 23502 — not_null_violation: обязательное поле пропущено.
  if (code === "23502") {
    return new ApiError(
      400,
      "MISSING_REQUIRED_FIELD",
      "Пропущено обязательное поле.",
      { column: err.column ?? null }
    );
  }
  // ECONNREFUSED / ENOTFOUND / 57P03 — база недоступна.
  if (
    err?.code === "ECONNREFUSED" ||
    err?.code === "ENOTFOUND" ||
    code === "57P03" ||
    code === "08006" ||
    code === "08001"
  ) {
    return new ApiError(
      503,
      "DATABASE_UNAVAILABLE",
      "База данных недоступна. Попробуйте позже."
    );
  }
  return null;
}

// Обработчик ошибок Express: четыре аргумента — сигнал, что это errorware.
export function errorHandler(err, req, res, next) {
  void next;

  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.toJSON() });
    return;
  }

  // Ошибки express.json
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Тело запроса содержит некорректный JSON.",
      },
    });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Тело запроса слишком велико.",
      },
    });
    return;
  }
  if (err?.type === "mediaType.unsupported") {
    res.status(415).json({
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Тело запроса должно иметь Content-Type application/json.",
      },
    });
    return;
  }

  // Ошибки драйвера pg — различаем по SQLSTATE.
  const dbError = toDatabaseApiError(err);
  if (dbError) {
    console.error("Ошибка базы данных:", err.message);
    res.status(dbError.status).json({ error: dbError.toJSON() });
    return;
  }

  // Неожиданная ошибка — не отправляем стек клиенту.
  console.error("Неожиданная ошибка:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Внутренняя ошибка сервера.",
    },
  });
}
