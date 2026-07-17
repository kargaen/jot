-- Allow pgTAP service_role fixtures to seed rows before authenticated RLS checks.
--
-- Table privileges are checked before row-level security bypass. The RLS test
-- suite switches to service_role for fixtures, so service_role needs the same
-- table access as authenticated sessions before policy-specific assertions run.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.areas,
  public.projects,
  public.tasks,
  public.tags,
  public.task_tags,
  public.area_members,
  public.project_members,
  public.task_attachments
TO service_role;
