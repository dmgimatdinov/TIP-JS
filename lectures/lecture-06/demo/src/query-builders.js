// Построители SQL: динамические фрагменты + параметризованные значения.
// Главное правило: фиксированные SQL-фрагменты собираются в коде,
// а все значения передаются через $1, $2, ... в массиве values.
// Ни одно пользовательское значение не попадает в текст SQL.

// Алиасы snake_case -> camelCase для сохранения HTTP-контракта ПР10.
export const taskColumns = `
  id,
  title,
  completed,
  priority,
  category_id AS "categoryId"`;

// В LIKE/ILIKE символы %, _ и \ имеют специальный смысл.
// API выполняет буквальный поиск подстроки, поэтому перед оборачиванием
// в %...% эти символы нужно экранировать, а в SQL указать ESCAPE '\'.
export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// SELECT задач с динамическим WHERE по фильтрам.
// Условия добавляются только для переданных фильтров.
export function buildListTasksQuery(filters) {
  const conditions = [];
  const values = [];

  if (filters.completed !== null) {
    conditions.push(`completed = $${values.length + 1}`);
    values.push(filters.completed);
  }
  if (filters.priority !== null) {
    conditions.push(`priority = $${values.length + 1}`);
    values.push(filters.priority);
  }
  if (filters.categoryId !== null) {
    conditions.push(`category_id = $${values.length + 1}`);
    values.push(filters.categoryId);
  }
  if (filters.q) {
    conditions.push(`title ILIKE $${values.length + 1} ESCAPE '\\'`);
    values.push(`%${escapeLikePattern(filters.q)}%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const text = `SELECT ${taskColumns} FROM public.tasks ${where} ORDER BY id`;
  return { text, values };
}

// UPDATE задач: динамический SET из переданных полей.
// Порядок колонок фиксирован: title, completed, priority, categoryId.
// id добавляется в values последним (для WHERE).
export function buildUpdateTaskQuery(id, changes) {
  const sets = [];
  const values = [];

  if (changes.title !== undefined) {
    sets.push(`title = $${values.length + 1}`);
    values.push(changes.title);
  }
  if (changes.completed !== undefined) {
    sets.push(`completed = $${values.length + 1}`);
    values.push(changes.completed);
  }
  if (changes.priority !== undefined) {
    sets.push(`priority = $${values.length + 1}`);
    values.push(changes.priority);
  }
  if (changes.categoryId !== undefined) {
    sets.push(`category_id = $${values.length + 1}`);
    values.push(changes.categoryId);
  }

  if (sets.length === 0) {
    // Вызов без полей — возвращаем пустой запрос, который ничего не делает.
    // Маршрут должен отлавливать пустое тело раньше (через валидацию).
    return { text: "SELECT 1 WHERE false", values: [] };
  }

  values.push(id);
  const text = `
    UPDATE public.tasks
    SET ${sets.join(", ")}
    WHERE id = $${values.length}
    RETURNING ${taskColumns}`;
  return { text, values };
}
