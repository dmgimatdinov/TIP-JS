// Хранилище в памяти. Тот же интерфейс, что у createPostgresStore() из store-postgres.js.
// Это позволяет app.js подставлять память (для тестов и локальной отладки без БД)
// или PostgreSQL (через DATABASE_URL) без изменения маршрутов.
//
// Методы синхронны, но routes.js их await-ит: await на не-Promise просто возвращает значение,
// поэтому память и PostgreSQL можно менять местами прозрачно для маршрутов.

import { tasks as seedTasks, categories as seedCategories } from "./data.js";
import { selectTasks } from "./task-service.js";

export function createStore() {
  let tasks = seedTasks.map((t) => ({ ...t }));
  const categories = seedCategories.map((c) => ({ ...c }));
  let nextId = Math.max(...tasks.map((t) => t.id)) + 1;

  // filters передаётся маршрутом. Если фильтры есть, фильтруем через selectTasks
  // (та же логика, что в учебном сервере ПР5–ПР8).
  function listTasks(filters) {
    const all = tasks.map((t) => ({ ...t }));
    if (!filters) return all;
    return selectTasks(all, filters);
  }

  function listCategories() {
    return categories.map((c) => ({ ...c }));
  }

  function getTask(id) {
    const task = tasks.find((t) => t.id === id);
    return task ? { ...task } : null;
  }

  function createTask({ title, priority, categoryId }) {
    const task = { id: nextId, title, completed: false, priority, categoryId };
    nextId += 1;
    tasks.push(task);
    return { ...task };
  }

  function updateTask(id, changes) {
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const updated = { ...tasks[index], ...changes, id };
    tasks[index] = updated;
    return { ...updated };
  }

  function deleteTask(id) {
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    tasks.splice(index, 1);
    return { id };
  }

  function reset() {
    tasks = seedTasks.map((t) => ({ ...t }));
    nextId = Math.max(...tasks.map((t) => t.id)) + 1;
    return { reset: true, total: tasks.length };
  }

  function categoryIds() {
    return new Set(categories.map((c) => c.id));
  }

  return {
    listTasks,
    listCategories,
    getTask,
    createTask,
    updateTask,
    deleteTask,
    reset,
    categoryIds,
  };
}
