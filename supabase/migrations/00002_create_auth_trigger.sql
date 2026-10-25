-- Migration: 00002_create_auth_trigger.sql
-- Description: Trigger and function to automatically create a workspace when a new auth user signs up

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_workspace_name text;
begin
  v_workspace_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(new.email, '@', 1), ''),
    'My'
  ) || '''s Workspace';

  insert into public.workspaces (owner_id, name)
  values (new.id, v_workspace_name);

  return new;
end;
$$;

-- Drop trigger if it already exists
drop trigger if exists on_auth_user_created on auth.users;

-- Create the trigger on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
