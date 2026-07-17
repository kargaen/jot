-- EPIC-002: task attachment metadata and storage bucket.

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0 and size_bytes <= 5242880),
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint task_attachments_storage_path_key unique (storage_path),
  constraint task_attachments_storage_path_shape check (
    storage_path = 'task-attachments/' || user_id::text || '/' || task_id::text || '/' || filename
  )
);

create index if not exists task_attachments_task_id_idx on public.task_attachments (task_id);
create index if not exists task_attachments_user_id_idx on public.task_attachments (user_id);

alter table public.task_attachments enable row level security;

alter table public.task_attachments drop constraint if exists task_attachments_count_per_task;

create or replace function public.task_attachment_count_ok(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 3
  from public.task_attachments
  where task_id = p_task_id;
$$;

drop policy if exists "task_attachments_select" on public.task_attachments;
create policy "task_attachments_select" on public.task_attachments
  for select using (user_id = (select auth.uid()) or can_access_task(task_id));

drop policy if exists "task_attachments_insert" on public.task_attachments;
create policy "task_attachments_insert" on public.task_attachments
  for insert with check (
    user_id = (select auth.uid())
    and can_access_task(task_id)
    and size_bytes <= 5242880
    and public.task_attachment_count_ok(task_id)
  );

drop policy if exists "task_attachments_delete" on public.task_attachments;
create policy "task_attachments_delete" on public.task_attachments
  for delete using (user_id = (select auth.uid()) or can_access_task(task_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "task_attachment_objects_select" on storage.objects;
create policy "task_attachment_objects_select" on storage.objects
  for select using (
    bucket_id = 'task-attachments'
    and exists (
      select 1
      from public.task_attachments ta
      where ta.storage_path = storage.objects.name
        and (ta.user_id = (select auth.uid()) or can_access_task(ta.task_id))
    )
  );

drop policy if exists "task_attachment_objects_insert" on storage.objects;
create policy "task_attachment_objects_insert" on storage.objects
  for insert with check (
    bucket_id = 'task-attachments'
    and exists (
      select 1
      from public.tasks t
      where name like 'task-attachments/' || (select auth.uid())::text || '/' || t.id::text || '/%'
        and t.user_id = (select auth.uid())
        and can_access_task(t.id)
    )
  );

drop policy if exists "task_attachment_objects_delete" on storage.objects;
create policy "task_attachment_objects_delete" on storage.objects
  for delete using (
    bucket_id = 'task-attachments'
    and exists (
      select 1
      from public.task_attachments ta
      where ta.storage_path = storage.objects.name
        and (ta.user_id = (select auth.uid()) or can_access_task(ta.task_id))
    )
  );
