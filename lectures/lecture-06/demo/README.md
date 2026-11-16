# Демонстрация к Лекции № 6

Пример показывает, как данные приложения переносятся из памяти процесса
(Лекция 5) в PostgreSQL, а Express-приложение подключается к базе через драйвер `pg`,
сохраняя прежний HTTP-контракт.

[К конспекту лекции](../README.md) · [К описанию курса](../../../README.md)

## Состав примера

- `sql/01_schema.sql` — таблицы `categories` и `tasks` с ограничениями (`PRIMARY KEY`, `FOREIGN KEY … ON DELETE RESTRICT`, `CHECK`, `UNIQUE`, `IDENTITY`).
- `sql/02_seed.sql` — загрузка трёх категорий и двенадцати задач, синхронизация последовательностей через `setval`.
- `sql/03_queries.sql` — семь запросов: `SELECT`, `JOIN`, `GROUP BY`, `HAVING`, `ILIKE`, алиасы `snake_case → camelCase`.
- `examples/transaction.sql` — учебная транзакция `BEGIN` / `UPDATE` / `ROLLBACK`.
- `src/db.js` — пул подключений `pg.Pool` (`max`, `connectionTimeoutMillis`, `allowExitOnIdle`).
- `src/config.js` — чтение `DATABASE_URL`, `API_PORT`, `ENABLE_DEBUG_RESET` из окружения.
- `src/query-builders.js` — `buildListTasksQuery`, `buildUpdateTaskQuery`, `escapeLikePattern`, `taskColumns`.
- `src/store.js` — память процесса (по умолчанию, если `DATABASE_URL` не задан).
- `src/store-postgres.js` — то же интерфейс на PostgreSQL; `reset()` через `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`.
- `src/errors.js`, `src/validation.js`, `src/task-validation.js`, `src/task-service.js`, `src/routes.js`, `src/write-routes.js`, `src/app.js`, `src/server.js` — без изменений относительно Лекции 5 (кроме async и инъекции store).
- `checks/server.test.js` — HTTP-контракт через fake-store (без PostgreSQL).
- `checks/query-builders.test.js` — юнит-тесты построителей SQL (без PostgreSQL).
- `checks/database.test.js` — интеграция с PostgreSQL (пропускается без `DATABASE_URL`).
- `checks/support/fake-store.js` — изолированное хранилище для тестов HTTP-слоя.

## Запуск без PostgreSQL (поведение Лекции 5)

```bash
npm install
npm start
```

Сервер запустится с хранилищем в памяти. Полезно для первой отладки HTTP-контракта.

## Запуск с PostgreSQL

### 1. Создать роль и базу (один раз)

```bash
psql -h 127.0.0.1 -U postgres -d postgres
```

```sql
CREATE ROLE tip_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password tip_app
CREATE DATABASE tip_tasks OWNER tip_app ENCODING 'UTF8' TEMPLATE template0;
\q
```

### 2. Загрузить схему и сид

```bash
psql -X -h 127.0.0.1 -U tip_app -d tip_tasks -v ON_ERROR_STOP=1 -1 -f sql/01_schema.sql
psql -X -h 127.0.0.1 -U tip_app -d tip_tasks -v ON_ERROR_STOP=1 -1 -f sql/02_seed.sql
```

### 3. Конфигурация

```bash
cp .env.example .env
# отредактировать .env: подставить пароль tip_app
```

### 4. Запустить сервер

```bash
npm install
npm start
```

В выводе появится строка `Хранилище: PostgreSQL (постоянное хранение)`.

### 5. Проверить

```bash
curl http://127.0.0.1:5505/api/health
curl http://127.0.0.1:5505/api/tasks?priority=high
```

## Тесты

```bash
# HTTP-контракт и построители SQL — без PostgreSQL
npm test

# Интеграция с PostgreSQL — требует DATABASE_URL
export DATABASE_URL=postgresql://tip_app:пароль@127.0.0.1:5432/tip_tasks
npm run check:db

# Семь SQL-запросов из лекции
npm run check:queries
```

## Проверка синтаксиса

```bash
npm run check
```

## Что показывает пример

1. **Контракт не изменился.** `GET /api/tasks?priority=high` возвращает тот же JSON, что в Лекции 5, — но данные приходят из PostgreSQL, а не из массива.
2. **Постоянство.** Созданная задача остаётся после перезапуска сервера. Это главное отличие от Лекции 5.
3. **Параметризованные запросы.** Все значения передаются через `$1`, `$2`, … — никаких конкатенаций.
4. **Слои.** SQL — только в `store-postgres.js` и `query-builders.js`. `routes.js` не знает про таблицы.
5. **Транзакция.** `reset()` использует `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`, а при ошибке откатывается.
