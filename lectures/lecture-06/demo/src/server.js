// Запуск сервера. createApp() — отдельно, чтобы тесты могли открыть приложение на свободном порту.
//
// Если задан DATABASE_URL — приложение подключается к PostgreSQL (через pg.Pool),
// и данные сохраняются между перезапусками. Это главное отличие от Лекции 5.
// Если DATABASE_URL не задан — используется память процесса (как в Лекции 5),
// что удобно для первой отладки HTTP-контракта без установки PostgreSQL.

import { createApp } from "./app.js";
import { createStore } from "./store.js";
import { createPool } from "./db.js";
import { createPostgresStore } from "./store-postgres.js";
import { readConfig } from "./config.js";

const DEFAULT_PORT = 5505;
const HOST = "127.0.0.1";

function readPort(raw) {
  const port = Number(raw ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new TypeError("Порт должен быть целым числом от 1024 до 65535.");
  }
  return port;
}

const port = readPort(process.argv[2] ?? process.env.API_PORT);

// Если DATABASE_URL задан — используем PostgreSQL. Иначе — память.
let store;
let pool = null;
if (process.env.DATABASE_URL?.trim()) {
  const config = readConfig(process.env);
  pool = createPool(config.connectionString);
  store = createPostgresStore(pool);
  console.log("Хранилище: PostgreSQL (постоянное хранение).");
} else {
  store = createStore();
  console.log("Хранилище: память процесса (без DATABASE_URL). Перезапуск теряет данные.");
}

const app = createApp({ store });

const server = app.listen(port, HOST, () => {
  console.log(`Учебный API Лекции 6: http://${HOST}:${port}/api`);
  console.log(`Health: http://${HOST}:${port}/api/health`);
  if (pool) {
    console.log("Остановка: Ctrl+C. Данные хранятся в PostgreSQL.");
  } else {
    console.log("Остановка: Ctrl+C. Изменения данных хранятся до перезапуска сервера.");
  }
});

// Корректное закрытие пула при остановке.
async function shutdown(signal) {
  console.log(`\nПолучен ${signal}, останавливаюсь...`);
  server.close(() => {
    if (pool) {
      pool.end().then(() => {
        console.log("Пул PostgreSQL закрыт. Выход.");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
