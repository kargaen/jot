-- Feedback is now handled via GitHub issues instead of an in-app surface.
-- Drop the unused feedback table (and its RLS policies) entirely.
drop table if exists public.feedback cascade;
