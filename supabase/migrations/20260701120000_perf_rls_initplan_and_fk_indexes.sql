-- Perf: wrap auth.<fn>() in RLS policies so they evaluate once per query
-- (auth_rls_initplan), + covering indexes for unindexed FKs.
-- auth.uid()/auth.email() -> (select ...) is semantically identical.

-- Covering indexes for unindexed foreign keys
create index if not exists tasks_area_id_idx on public.tasks (area_id);
create index if not exists area_members_user_id_idx on public.area_members (user_id);

alter policy "insert own logs" on public.app_logs
  with check ((user_id = (select auth.uid())));

alter policy "area_members_invitee_select" on public.area_members
  using ((invited_email = (select auth.email())));

alter policy "area_members_invitee_update" on public.area_members
  using ((invited_email = (select auth.email()))) with check ((invited_email = (select auth.email())));

alter policy "area_members_member_delete" on public.area_members
  using ((user_id = (select auth.uid())));

alter policy "area_members_owner_all" on public.area_members
  using ((area_id IN ( SELECT areas.id
   FROM areas
  WHERE (areas.user_id = (select auth.uid())))));

alter policy "areas_delete" on public.areas
  using ((user_id = (select auth.uid())));

alter policy "areas_insert" on public.areas
  with check ((user_id = (select auth.uid())));

alter policy "areas_select" on public.areas
  using (((user_id = (select auth.uid())) OR can_access_area(id)));

alter policy "areas_update" on public.areas
  using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));

alter policy "project_members_invitee_select" on public.project_members
  using ((invited_email = (select auth.email())));

alter policy "project_members_invitee_update" on public.project_members
  using ((invited_email = (select auth.email()))) with check ((invited_email = (select auth.email())));

alter policy "project_members_member_delete" on public.project_members
  using ((user_id = (select auth.uid())));

alter policy "project_members_owner_all" on public.project_members
  using ((project_id IN ( SELECT p.id
   FROM (projects p
     LEFT JOIN areas a ON ((a.id = p.area_id)))
  WHERE ((p.user_id = (select auth.uid())) OR (a.user_id = (select auth.uid()))))));

alter policy "projects_delete" on public.projects
  using (((user_id = (select auth.uid())) OR (area_id IN ( SELECT areas.id
   FROM areas
  WHERE (areas.user_id = (select auth.uid()))))));

alter policy "projects_insert" on public.projects
  with check (((user_id = (select auth.uid())) AND (area_id IS NOT NULL) AND can_access_area(area_id)));

alter policy "projects_select" on public.projects
  using (((user_id = (select auth.uid())) OR can_access_project(id)));

alter policy "tags_delete" on public.tags
  using ((user_id = (select auth.uid())));

alter policy "tags_insert" on public.tags
  with check ((user_id = (select auth.uid())));

alter policy "tags_select" on public.tags
  using (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM task_tags tt
  WHERE ((tt.tag_id = tags.id) AND can_access_task(tt.task_id))))));

alter policy "tags_update" on public.tags
  using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));

alter policy "tasks_insert" on public.tasks
  with check (((user_id = (select auth.uid())) AND (((project_id IS NOT NULL) AND can_access_project(project_id)) OR ((project_id IS NULL) AND (area_id IS NOT NULL) AND can_access_area(area_id)) OR ((project_id IS NULL) AND (area_id IS NULL)))));

alter policy "tasks_select" on public.tasks
  using (((user_id = (select auth.uid())) OR can_access_task(id)));

alter policy "tasks_update" on public.tasks
  using (can_access_task(id)) with check (((((project_id IS NOT NULL) AND can_access_project(project_id)) OR ((project_id IS NULL) AND (area_id IS NOT NULL) AND can_access_area(area_id)) OR ((project_id IS NULL) AND (area_id IS NULL) AND (user_id = (select auth.uid())))) AND ((responsible_user_id IS NULL) OR (responsible_email IS NOT NULL))));
