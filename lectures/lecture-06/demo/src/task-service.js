// Чистые функции поиска и фильтрации для памяти процесса (store.js).
// В PostgreSQL-варианте фильтрация выполняется в SQL, и этот модуль
// используется только memory-store. Не знает про Express, req, res.

const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);

export function findTask(tasks, id) {
  const task = tasks.find((t) => t.id === id);
  return task ? { ...task } : null;
}

export function selectTasks(tasks, filters) {
  const needle = (filters.q ?? "").toLocaleLowerCase("ru-RU");
  return tasks
    .filter((t) => {
      if (filters.completed !== null && t.completed !== filters.completed) return false;
      if (filters.priority !== null && t.priority !== filters.priority) return false;
      if (filters.categoryId !== null && t.categoryId !== filters.categoryId) return false;
      if (needle && !t.title.toLocaleLowerCase("ru-RU").includes(needle)) return false;
      return true;
    })
    .map((t) => ({ ...t }));
}

export function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidPriority(value) {
  return ALLOWED_PRIORITIES.has(value);
}
