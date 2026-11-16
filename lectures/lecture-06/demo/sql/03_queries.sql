-- Семь запросов к учебной базе.
-- Каждый запрос завершается ; и содержит явный ORDER BY.
-- Запуск: psql -X -h 127.0.0.1 -U tip_app -d tip_tasks -v ON_ERROR_STOP=1 -f sql/03_queries.sql

-- Q1: все задачи с названием категории, порядок t.id.
SELECT t.id, t.title, t.completed, t.priority, c.name AS category_name
FROM public.tasks AS t
INNER JOIN public.categories AS c ON c.id = t.category_id
ORDER BY t.id;

-- Q2: незавершённые high в категории 2 (ожидается id 4, 34).
SELECT t.id, t.title
FROM public.tasks AS t
WHERE t.completed = false AND t.priority = 'high' AND t.category_id = 2
ORDER BY t.id;

-- Q3: название содержит ПРОВЕР без учёта регистра (ожидается id 7, 16).
SELECT id, title
FROM public.tasks
WHERE title ILIKE '%ПРОВЕР%'
ORDER BY id;

-- Q4: число задач в каждой категории, включая пустые (LEFT JOIN).
SELECT c.id, c.name, COUNT(t.id) AS task_count
FROM public.categories AS c
LEFT JOIN public.tasks AS t ON t.category_id = c.id
GROUP BY c.id, c.name
ORDER BY c.id;

-- Q5: число выполненных и невыполненных задач по категориям.
SELECT c.name, t.completed, COUNT(*) AS task_count
FROM public.tasks AS t
INNER JOIN public.categories AS c ON c.id = t.category_id
GROUP BY c.name, t.completed
ORDER BY c.name, t.completed;

-- Q6: категории, у которых не менее 4 задач (HAVING).
SELECT c.name, COUNT(t.id) AS task_count
FROM public.categories AS c
INNER JOIN public.tasks AS t ON t.category_id = c.id
GROUP BY c.name
HAVING COUNT(t.id) >= 4
ORDER BY c.name;

-- Q7: задача id 4; category_id выводим как "categoryId" (snake_case -> camelCase).
SELECT
  id,
  title,
  completed,
  priority,
  category_id AS "categoryId"
FROM public.tasks
WHERE id = 4;
