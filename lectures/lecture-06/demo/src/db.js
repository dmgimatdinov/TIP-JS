// Пул подключений к PostgreSQL. Один пул на процесс приложения.
// max=5: максимум пять одновременных подключений. Подбирается под нагрузку и СУБД.
// connectionTimeoutMillis: не висеть бесконечно, если база недоступна.
// allowExitOnIdle: позволить Node.js завершиться, когда подключения простаивают.

import { Pool } from "pg";

export function createPool(connectionString) {
  if (!connectionString || typeof connectionString !== "string") {
    throw new TypeError("Требуется строка подключения PostgreSQL (connectionString).");
  }
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error) => {
    console.error("Ошибка простаивающего подключения PostgreSQL:", error.message);
  });
  return pool;
}
