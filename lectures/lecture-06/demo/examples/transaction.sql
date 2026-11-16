-- Учебная транзакция: изменение задачи с последующим откатом.
-- Запускать БЕЗ флага psql -1, чтобы транзакция управлялась внутри файла:
--   psql -X -h 127.0.0.1 -U tip_app -d tip_tasks -v ON_ERROR_STOP=1 -f examples/transaction.sql

BEGIN;
SELECT id, completed FROM public.tasks WHERE id = 4;
UPDATE public.tasks SET completed = true WHERE id = 4 RETURNING id, completed;
ROLLBACK;
SELECT id, completed FROM public.tasks WHERE id = 4;
