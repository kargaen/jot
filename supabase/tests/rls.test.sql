-- RLS policy tests for the tasks (and related) tables.
--
-- Run with: npx supabase test db
--
-- Pattern: switch to the `authenticated` role with a JWT subject claim matching
-- one of the seeded users, then assert that INSERT/UPDATE/DELETE/SELECT either
-- succeeds or is denied, depending on which user owns the targeted rows.
--
-- Two users are set up at the top via auth.users inserts so all tests are
-- deterministic and self-contained.  The service-role wrapper functions below
-- isolate the JWT-switching boilerplate.

BEGIN;

SELECT plan(25);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Two deterministic user UUIDs used throughout.
DO $$
DECLARE
  uid_a uuid := 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  uid_b uuid := 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  area_a uuid := 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1';
  area_b uuid := 'b1b1b1b1-b1b1-4b1b-b1b1-b1b1b1b1b1b1';
  proj_a uuid := 'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2';
BEGIN
  -- Ensure auth users exist (idempotent).
  INSERT INTO auth.users (id, email, role, aud, created_at, updated_at, email_confirmed_at)
  VALUES
    (uid_a, 'rls-test-a@jot.test', 'authenticated', 'authenticated', now(), now(), now()),
    (uid_b, 'rls-test-b@jot.test', 'authenticated', 'authenticated', now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Areas: one owned by A, one by B.
  INSERT INTO public.areas (id, user_id, name, color)
  VALUES
    (area_a, uid_a, 'Area A', '#aaaaaa'),
    (area_b, uid_b, 'Area B', '#bbbbbb')
  ON CONFLICT (id) DO NOTHING;

  -- Project owned by A in area A.
  INSERT INTO public.projects (id, user_id, area_id, name, color, status)
  VALUES (proj_a, uid_a, area_a, 'Project A', '#aaaaaa', 'active')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ── Helper: switch auth context ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _as_user(uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
END $$;

CREATE OR REPLACE FUNCTION _as_service()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  SET LOCAL ROLE service_role;
END $$;

-- ── Unauthenticated access ────────────────────────────────────────────────────

-- 1. Unauthenticated request (auth.uid() = null) cannot insert any task.
--    This is the most common cause of RLS INSERT errors in the wild: an
--    expired or missing JWT reaches Postgres while the client sends a real
--    user_id, causing auth.uid() to return NULL on the server side.
DO $$ BEGIN SET LOCAL ROLE anon; END $$;
SELECT throws_ok(
  $$INSERT INTO public.tasks (id, user_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000099',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'Unauthenticated task', 'todo', 'none'
    )$$,
  '42501',
  NULL,
  'unauthenticated request (anon role) cannot insert a task'
);

-- ── tasks INSERT ──────────────────────────────────────────────────────────────

-- 2. User can insert a task into their own area.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$INSERT INTO public.tasks (id, user_id, area_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000001',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
      'Test task — own area', 'todo', 'none'
    )$$,
  'user A can insert task into own area'
);

-- 3. User can insert a task into their own project (area_id auto-null).
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$INSERT INTO public.tasks (id, user_id, project_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000002',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2',
      'Test task — own project', 'todo', 'none'
    )$$,
  'user A can insert task into own project'
);

-- 4. User can insert an inbox task (no area, no project).
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$INSERT INTO public.tasks (id, user_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000003',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'Test task — inbox', 'todo', 'none'
    )$$,
  'user A can insert inbox task (null area, null project)'
);

-- 5. User CANNOT insert a task into another user's area.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT throws_ok(
  $$INSERT INTO public.tasks (id, user_id, area_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000004',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
      'Test task — other user area', 'todo', 'none'
    )$$,
  '42501',
  NULL,
  'user B cannot insert task into user A''s area'
);

-- 6. User CANNOT forge another user's user_id.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT throws_ok(
  $$INSERT INTO public.tasks (id, user_id, area_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000005',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
      'Test task — forged user_id', 'todo', 'none'
    )$$,
  '42501',
  NULL,
  'user B cannot insert task with user A''s user_id'
);

-- ── tasks UPDATE (complete) ───────────────────────────────────────────────────

-- 7. User can complete their own area-anchored task.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$UPDATE public.tasks
    SET status = 'completed', completed_at = now()
    WHERE id = 'c0000001-0000-4000-8000-000000000001'$$,
  'user A can complete own area task'
);

-- 8. User can complete their own project-anchored task.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$UPDATE public.tasks
    SET status = 'completed', completed_at = now()
    WHERE id = 'c0000001-0000-4000-8000-000000000002'$$,
  'user A can complete own project task'
);

-- 9. User can complete an inbox task (null area, null project) — this was the bug.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$UPDATE public.tasks
    SET status = 'completed', completed_at = now()
    WHERE id = 'c0000001-0000-4000-8000-000000000003'$$,
  'user A can complete inbox task (null area, null project)'
);

-- 10. User CANNOT update another user's task.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT is(
  (SELECT COUNT(*)::int FROM public.tasks
   WHERE id = 'c0000001-0000-4000-8000-000000000001' AND status = 'todo'),
  0,
  'user B cannot see or modify user A''s task via UPDATE'
);

-- ── tasks SELECT ──────────────────────────────────────────────────────────────

-- 11. User can select their own tasks.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT COUNT(*)::int FROM public.tasks
   WHERE user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  3,
  'user A sees exactly their 3 test tasks'
);

-- 12. User B sees none of user A's tasks.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT is(
  (SELECT COUNT(*)::int FROM public.tasks
   WHERE user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  0,
  'user B cannot see user A''s tasks'
);

-- ── tasks DELETE ──────────────────────────────────────────────────────────────

-- 13. User can delete their own task.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$DELETE FROM public.tasks WHERE id = 'c0000001-0000-4000-8000-000000000001'$$,
  'user A can delete own task'
);

-- 14. User CANNOT delete another user's task.
SELECT _as_service();
INSERT INTO public.tasks (id, user_id, area_id, title, status, priority)
VALUES (
  'c0000001-0000-4000-8000-000000000010',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
  'Task to survive delete attempt', 'todo', 'none'
);

SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT lives_ok(
  $$DELETE FROM public.tasks WHERE id = 'c0000001-0000-4000-8000-000000000010'$$,
  'DELETE on other user task is silently ignored (no error, 0 rows affected)'
);
SELECT _as_service();
SELECT is(
  (SELECT COUNT(*)::int FROM public.tasks WHERE id = 'c0000001-0000-4000-8000-000000000010'),
  1,
  'task still exists after user B delete attempt — RLS filtered it out'
);

-- ── areas INSERT / SELECT ─────────────────────────────────────────────────────

-- 15. User can insert their own area.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT lives_ok(
  $$INSERT INTO public.areas (id, user_id, name, color)
    VALUES ('b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2', 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'Area B2', '#cccccc')$$,
  'user B can insert own area'
);

-- 16. User B cannot see user A's area.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT is(
  (SELECT COUNT(*)::int FROM public.areas
   WHERE user_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  0,
  'user B cannot see user A''s area'
);

-- ── Shared-area access ────────────────────────────────────────────────────────

-- 17. After area_member invite is accepted, user B can insert tasks into A's area.
SELECT _as_service();
INSERT INTO public.area_members (area_id, owner_user_id, invited_email, status, user_id)
VALUES (
  'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'rls-test-b@jot.test',
  'accepted',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
)
ON CONFLICT DO NOTHING;

SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT lives_ok(
  $$INSERT INTO public.tasks (id, user_id, area_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000020',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
      'Shared area task by B', 'todo', 'none'
    )$$,
  'accepted area member (user B) can insert task into shared area'
);

-- 18. Accepted area member can see shared area.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT is(
  (SELECT COUNT(*)::int FROM public.areas WHERE id = 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1'),
  1,
  'accepted area member can select shared area'
);

-- ── Shared-project access ─────────────────────────────────────────────────────

-- 19. After project_member invite, user B can insert tasks into A's project.
SELECT _as_service();
INSERT INTO public.project_members (project_id, owner_user_id, invited_email, status, user_id)
VALUES (
  'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'rls-test-b@jot.test',
  'accepted',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
)
ON CONFLICT DO NOTHING;

SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT lives_ok(
  $$INSERT INTO public.tasks (id, user_id, project_id, title, status, priority)
    VALUES (
      'c0000001-0000-4000-8000-000000000021',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2',
      'Shared project task by B', 'todo', 'none'
    )$$,
  'accepted project member (user B) can insert task into shared project'
);

-- 20. Accepted project member can complete a task in the shared project.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT lives_ok(
  $$UPDATE public.tasks
    SET status = 'completed', completed_at = now()
    WHERE id = 'c0000001-0000-4000-8000-000000000021'$$,
  'accepted project member can complete own task in shared project'
);

-- 21. Non-member cannot see A's project.
SELECT _as_service();
DELETE FROM public.project_members
WHERE project_id = 'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2'
  AND user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');

-- Remove shared area membership too so B truly has no access to A's project.
SELECT _as_service();
DELETE FROM public.area_members
WHERE area_id = 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1'
  AND user_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT is(
  (SELECT COUNT(*)::int FROM public.projects WHERE id = 'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2'),
  0,
  'non-member cannot see user A''s project'
);


-- ── task_attachments ────────────────────────────────────────────────────────

-- 22. User can insert attachment metadata for their own task.
SELECT _as_service();
INSERT INTO public.tasks (id, user_id, title, status, priority)
VALUES (
  'c0000001-0000-4000-8000-000000000030',
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'Attachment owner task', 'todo', 'none'
)
ON CONFLICT (id) DO NOTHING;

SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$INSERT INTO public.task_attachments (id, task_id, user_id, filename, mime_type, size_bytes, storage_path)
    VALUES (
      'd0000001-0000-4000-8000-000000000001',
      'c0000001-0000-4000-8000-000000000030',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'brief.pdf', 'application/pdf', 1024,
      'task-attachments/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/c0000001-0000-4000-8000-000000000030/brief.pdf'
    )$$,
  'user A can insert attachment metadata for own task'
);

-- 23. User cannot insert attachment metadata for another user's task.
SELECT _as_user('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
SELECT throws_ok(
  $$INSERT INTO public.task_attachments (id, task_id, user_id, filename, mime_type, size_bytes, storage_path)
    VALUES (
      'd0000001-0000-4000-8000-000000000002',
      'c0000001-0000-4000-8000-000000000030',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      'forged.pdf', 'application/pdf', 1024,
      'task-attachments/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/c0000001-0000-4000-8000-000000000030/forged.pdf'
    )$$,
  '42501',
  NULL,
  'user B cannot insert attachment metadata for user A task'
);

-- 24. Deleting a task cascades attachment metadata.
SELECT _as_user('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
DELETE FROM public.tasks WHERE id = 'c0000001-0000-4000-8000-000000000030';
SELECT is(
  (SELECT COUNT(*)::int FROM public.task_attachments WHERE task_id = 'c0000001-0000-4000-8000-000000000030'),
  0,
  'deleting a task removes attachment metadata'
);

-- ── Cleanup ───────────────────────────────────────────────────────────────────

SELECT _as_service();
DELETE FROM public.task_attachments WHERE task_id::text LIKE 'c0000001-0000-4000-8000-%';
DELETE FROM public.task_tags WHERE task_id::text LIKE 'c0000001-0000-4000-8000-%';
DELETE FROM public.tasks WHERE id::text LIKE 'c0000001-0000-4000-8000-%';
DELETE FROM public.project_members WHERE project_id = 'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2';
DELETE FROM public.area_members WHERE area_id = 'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1';
DELETE FROM public.projects WHERE id = 'a2a2a2a2-a2a2-4a2a-a2a2-a2a2a2a2a2a2';
DELETE FROM public.areas WHERE id IN (
  'a1a1a1a1-a1a1-4a1a-a1a1-a1a1a1a1a1a1',
  'b1b1b1b1-b1b1-4b1b-b1b1-b1b1b1b1b1b1',
  'b2b2b2b2-b2b2-4b2b-b2b2-b2b2b2b2b2b2'
);
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
);

SELECT * FROM finish();
ROLLBACK;
