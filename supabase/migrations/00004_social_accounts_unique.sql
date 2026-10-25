-- Migration: 00004_social_accounts_unique.sql
-- Description: Add unique constraint on social_accounts(workspace_id, platform, external_id) for upsert support

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_social_accounts_workspace_platform_external'
  ) then
    alter table public.social_accounts
      add constraint uq_social_accounts_workspace_platform_external
      unique (workspace_id, platform, external_id);
  end if;
end $$;
