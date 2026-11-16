// Хранилище на PostgreSQL. Тот же интерфейс, что у createStore() из store.js.
// Это позволяет в app.js заменить источник данных одной строкой, не трогая маршруты.
// Все методы асинхронны; routes.js их await-ит.
//
// SQL живёт только здесь и в query-builders.js. routes.js и task-service.js
// не знают ни про таблицы, ни про колонки, ни про пул.

import { buildListTasksQuery, buildUpdateTaskQuery, taskColumns } from "./query-builders.js";

const noFilters = { completed: null, priority: null, categoryId: null, q: "" };

// Исходные данные для reset() — те же, что в sql/02_seed.sql.
const seedCategories = [
  [1, "Учёба"],
  [2, "Проект"],
  [3, "Организация"],
];
const seedTasks = [
  [1,  "Изучить функции",                 true,  "medium", 1],
  [4,  "Подготовить модель задач",         false, "high",   2],
  [7,  "Проверить методы массивов",        false, "low",    1],
  [10, "Оформить README",                  true,  "medium", 3],
  [13, "Разобрать Promise",                false, "high",   1],
  [16, "Проверить учебный API",            true,  "high",   2],
  [19, "Описать контракт запросов",        false, "medium", 3],
  [22, "Подготовить демонстрацию",         false, "low",    2],
  [25, "Исправить обработку ошибок",       true,  "high",   2],
  [28, "Добавить фильтры API",             false, "medium", 2],
  [31, "Сверить отчёт",                    true,  "low",    3],
  [34, "Провести рефакторинг клиента",     false, "high",   2],
];

export function createPostgresStore(pool) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("Требуется пул PostgreSQL (pg.Pool).");
  }

  return {
    async ping() {
      const result = await pool.query("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    },

    async listCategories() {
      const result = await pool.query(
        'SELECT id, name FROM public.categories ORDER BY id'
      );
      return result.rows;
    },

    async categoryIds() {
      const result = await pool.query("SELECT id FROM public.categories ORDER BY id");
      return new Set(result.rows.map((r) => r.id));
    },

    async listTasks(filters = noFilters) {
      const query = buildListTasksQuery(filters);
      const result = await pool.query(query);
      return result.rows;
    },

    async getTask(id) {
      const result = await pool.query({
        text: `SELECT ${taskColumns} FROM public.tasks WHERE id = $1`,
        values: [id],
      });
      return result.rows[0] ?? null;
    },

    async createTask({ title, priority, categoryId }) {
      const result = await pool.query({
        text: `INSERT INTO public.tasks (title, priority, category_id)
               VALUES ($1, $2, $3)
               RETURNING ${taskColumns}`,
        values: [title, priority, categoryId],
      });
      return result.rows[0];
    },

    async updateTask(id, changes) {
      const query = buildUpdateTaskQuery(id, changes);
      const result = await pool.query(query);
      return result.rows[0] ?? null;
    },

    async deleteTask(id) {
      const result = await pool.query({
        text: "DELETE FROM public.tasks WHERE id = $1 RETURNING id",
        values: [id],
      });
      return result.rowCount === 1 ? { id } : null;
    },

    // reset() — атомарная перезагрузка исходных данных.
    // Использует ОДИН клиент из pool.connect(): транзакция привязана к подключению.
    // При любой ошибке — ROLLBACK и проброс исключения; в finally — release().
    async reset() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM public.tasks");
        await client.query("DELETE FROM public.categories");

        // Загружаем категории пакетом.
        const catRows = seedCategories
          .map(([id, name]) => `(${id}, '${name.replace(/'/g, "''")}')`)
          .join(", ");
        await client.query(
          `INSERT INTO public.categories (id, name) VALUES ${catRows}`
        );

        // Загружаем задачи пакетом. Значения фиксированы (сид-данные), поэтому
        // можно собирать литералы — это не пользовательский ввод.
        const taskRows = seedTasks
          .map(
            ([id, title, completed, priority, categoryId]) =>
              `(${id}, '${title.replace(/'/g, "''")}', ${completed}, '${priority}', ${categoryId})`
          )
          .join(", ");
        await client.query(
          `INSERT INTO public.tasks (id, title, completed, priority, category_id)
           VALUES ${taskRows}`
        );

        // Синхронизируем последовательности с max(id).
        await client.query(
          `SELECT setval(pg_get_serial_sequence('public.categories', 'id'),
                         (SELECT max(id) FROM public.categories), true)`
        );
        await client.query(
          `SELECT setval(pg_get_serial_sequence('public.tasks', 'id'),
                         (SELECT max(id) FROM public.tasks), true)`
        );

        await client.query("COMMIT");
        return { reset: true, total: seedTasks.length };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
