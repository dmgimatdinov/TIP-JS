// Юнит-тесты построителей SQL. Не требуют PostgreSQL — проверяют только
// сборку текста запроса и массива values.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListTasksQuery,
  buildUpdateTaskQuery,
  escapeLikePattern,
  taskColumns,
} from "../src/query-builders.js";

test("taskColumns содержит алиас category_id AS categoryId", () => {
  assert.match(taskColumns, /category_id AS "categoryId"/);
});

test("escapeLikePattern экранирует %, _ и \\", () => {
  assert.equal(escapeLikePattern("скидка 50%"), "скидка 50\\%");
  assert.equal(escapeLikePattern("a_b"), "a\\_b");
  assert.equal(escapeLikePattern("a\\b"), "a\\\\b");
  assert.equal(escapeLikePattern("обычная строка"), "обычная строка");
});

test("buildListTasksQuery без фильтров — нет WHERE", () => {
  const query = buildListTasksQuery({
    completed: null,
    priority: null,
    categoryId: null,
    q: "",
  });
  assert.match(query.text, /SELECT[\s\S]+FROM public\.tasks/);
  assert.doesNotMatch(query.text, /WHERE/);
  assert.match(query.text, /ORDER BY id/);
  assert.deepEqual(query.values, []);
});

test("buildListTasksQuery с одним фильтром — одно условие, $1", () => {
  const query = buildListTasksQuery({
    completed: false,
    priority: null,
    categoryId: null,
    q: "",
  });
  assert.match(query.text, /WHERE completed = \$1/);
  assert.deepEqual(query.values, [false]);
});

test("buildListTasksQuery с q — ILIKE с экранированием и ESCAPE", () => {
  const query = buildListTasksQuery({
    completed: null,
    priority: null,
    categoryId: null,
    q: "модель",
  });
  assert.match(query.text, /title ILIKE \$1 ESCAPE '\\'/);
  assert.deepEqual(query.values, ["%модель%"]);
});

test("buildListTasksQuery с q со спецсимволом — экранирует", () => {
  const query = buildListTasksQuery({
    completed: null,
    priority: null,
    categoryId: null,
    q: "скидка 50%",
  });
  assert.deepEqual(query.values, ["%скидка 50\\%%"]);
});

test("buildListTasksQuery со всеми фильтрами — четыре условия, нумерация по порядку", () => {
  const query = buildListTasksQuery({
    completed: true,
    priority: "high",
    categoryId: 2,
    q: "провер",
  });
  assert.match(query.text, /completed = \$1 AND priority = \$2 AND category_id = \$3 AND title ILIKE \$4/);
  assert.deepEqual(query.values, [true, "high", 2, "%провер%"]);
});

test("buildUpdateTaskQuery собирает SET в фиксированном порядке", () => {
  const query = buildUpdateTaskQuery(4, {
    title: "Новое название",
    completed: true,
    priority: "low",
    categoryId: 3,
  });
  assert.match(query.text, /SET title = \$1, completed = \$2, priority = \$3, category_id = \$4/);
  assert.match(query.text, /WHERE id = \$5/);
  assert.match(query.text, /RETURNING/);
  assert.deepEqual(query.values, ["Новое название", true, "low", 3, 4]);
});

test("buildUpdateTaskQuery с одним полем — только оно в SET", () => {
  const query = buildUpdateTaskQuery(7, { completed: true });
  assert.match(query.text, /SET completed = \$1/);
  assert.doesNotMatch(query.text, /title =/);
  assert.deepEqual(query.values, [true, 7]);
});

test("buildUpdateTaskQuery с categoryId — отображается в category_id", () => {
  const query = buildUpdateTaskQuery(10, { categoryId: 2 });
  assert.match(query.text, /SET category_id = \$1/);
  assert.deepEqual(query.values, [2, 10]);
});

test("buildUpdateTaskQuery без полей — пустой запрос", () => {
  const query = buildUpdateTaskQuery(1, {});
  assert.equal(query.values.length, 0);
  // Текст не содержит UPDATE — маршрут не должен до него доходить
  // (валидация ловит пустое тело раньше).
});
