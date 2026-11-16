// Fake-хранилище для тестов HTTP-слоя без базы данных.
// Реализует тот же интерфейс, что createStore() и createPostgresStore(),
// но хранит данные в памяти и позволяет тестам контролировать состояние.
//
// Используется tests/server.test.js для проверки маршрутов, обработчика ошибок,
// статусов и формата ответов без подключения к PostgreSQL.

import { tasks as seedTasks, categories as seedCategories } from "../../src/data.js";

export function createFakeStore() {
  let tasks = seedTasks.map((t) => ({ ...t }));
  const categories = seedCategories.map((c) => ({ ...c }));
  let nextId = Math.max(...tasks.map((t) => t.id)) + 1;

  return {
    async ping() {
      return true;
    },
    async listCategories() {
      return categories.map((c) => ({ ...c }));
    },
    async categoryIds() {
      return new Set(categories.map((c) => c.id));
    },
    async listTasks(filters) {
      const all = tasks.map((t) => ({ ...t }));
      if (!filters) return all;
      return all.filter((t) => {
        if (filters.completed !== null && t.completed !== filters.completed) return false;
        if (filters.priority !== null && t.priority !== filters.priority) return false;
        if (filters.categoryId !== null && t.categoryId !== filters.categoryId) return false;
        if (filters.q) {
          const needle = filters.q.toLocaleLowerCase("ru-RU");
          if (!t.title.toLocaleLowerCase("ru-RU").includes(needle)) return false;
        }
        return true;
      });
    },
    async getTask(id) {
      const task = tasks.find((t) => t.id === id);
      return task ? { ...task } : null;
    },
    async createTask({ title, priority, categoryId }) {
      const task = { id: nextId, title, completed: false, priority, categoryId };
      nextId += 1;
      tasks.push(task);
      return { ...task };
    },
    async updateTask(id, changes) {
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return null;
      const updated = { ...tasks[index], ...changes, id };
      tasks[index] = updated;
      return { ...updated };
    },
    async deleteTask(id) {
      const index = tasks.findIndex((t) => t.id === id);
      if (index < 0) return null;
      tasks.splice(index, 1);
      return { id };
    },
    async reset() {
      tasks = seedTasks.map((t) => ({ ...t }));
      nextId = Math.max(...tasks.map((t) => t.id)) + 1;
      return { reset: true, total: tasks.length };
    },
  };
}
