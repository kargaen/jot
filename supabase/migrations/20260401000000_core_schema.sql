CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6B7280',
  email text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  area_id uuid REFERENCES areas(id) ON DELETE RESTRICT,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6B7280',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  area_id uuid REFERENCES areas(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description jsonb,
  icon text,
  notes text,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'none' CHECK (priority IN ('none', 'low', 'medium', 'high')),
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_email text,
  due_date date,
  due_time text,
  scheduled_date date,
  recurrence_rule text,
  estimated_mins integer,
  sort_order integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6B7280',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_user_id_name_key UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'planned', 'in_progress', 'done', 'declined')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS area_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS area_members_area_email_key
  ON area_members (area_id, lower(invited_email));

CREATE INDEX IF NOT EXISTS areas_user_sort_idx
  ON areas (user_id, sort_order);

CREATE INDEX IF NOT EXISTS projects_user_sort_idx
  ON projects (user_id, sort_order);

CREATE INDEX IF NOT EXISTS tasks_user_status_sort_idx
  ON tasks (user_id, status, sort_order);
