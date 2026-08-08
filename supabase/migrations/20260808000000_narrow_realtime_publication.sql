-- Narrow the Realtime publication to the only table the app subscribes to.
--
-- Realtime decodes WAL for every table in `supabase_realtime` on a poll timer,
-- whether or not a client is connected. The publication carried areas, projects,
-- tags and task_tags, but the only postgres_changes subscriptions in the app are
-- on `tasks` (dashboard.controller.ts, useReminderWindow.ts). The other four were
-- decoded for nothing, and that decoding accounted for ~90% of database execution
-- time on the hosted instance.
--
-- Written as a loop rather than bare ALTER statements so it is idempotent: a fresh
-- local database starts with an empty publication, the hosted one starts with five
-- tables added through the dashboard.

DO $$
DECLARE
  rec record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT schemaname, tablename
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND NOT (schemaname = 'public' AND tablename = 'tasks')
  LOOP
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I',
      rec.schemaname,
      rec.tablename
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks';
  END IF;
END $$;
