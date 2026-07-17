-- Allow authenticated API/test sessions to reach the RLS policies on Jot tables.
--
-- Table privileges are checked before row-level security. Without these grants,
-- direct authenticated sessions fail with 42501 before the task/area/project
-- policies can decide row visibility or writability.

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.areas,
  public.projects,
  public.tasks,
  public.tags,
  public.task_tags,
  public.area_members,
  public.project_members,
  public.task_attachments
TO authenticated;
