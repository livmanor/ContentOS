-- Migration: 00001_create_schema.sql
-- Description: Core database schema with enums, tables, and owner-only RLS policies

-- 1. Enums
create type public.social_platform as enum ('facebook', 'instagram', 'linkedin', 'x');
create type public.asset_type as enum ('image', 'video', 'text');
create type public.post_status as enum (
  'draft',
  'needs_review',
  'changes_requested',
  'approved',
  'publishing',
  'published',
  'failed'
);

-- 2. Workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index idx_workspaces_owner_id on public.workspaces(owner_id);

alter table public.workspaces enable row level security;

create policy "workspaces_owner_all"
  on public.workspaces
  for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 3. Social Accounts
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.social_platform not null,
  external_id text not null,
  display_name text,
  avatar_url text,
  access_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_social_accounts_workspace_id on public.social_accounts(workspace_id);

alter table public.social_accounts enable row level security;

create policy "social_accounts_owner_all"
  on public.social_accounts
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );

-- 4. Brand Kits
create table public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  logo_url text,
  colors jsonb not null default '[]'::jsonb,
  fonts jsonb not null default '[]'::jsonb,
  tone text,
  style_notes text,
  banned_words text[] not null default '{}'::text[]
);

create index idx_brand_kits_workspace_id on public.brand_kits(workspace_id);

alter table public.brand_kits enable row level security;

create policy "brand_kits_owner_all"
  on public.brand_kits
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );

-- 5. Assets
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type public.asset_type not null,
  storage_path text,
  public_url text,
  rough_text text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index idx_assets_workspace_id on public.assets(workspace_id);

alter table public.assets enable row level security;

create policy "assets_owner_all"
  on public.assets
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );

-- 6. Audits
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audits_workspace_id on public.audits(workspace_id);

alter table public.audits enable row level security;

create policy "audits_owner_all"
  on public.audits
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );

-- 7. Content Plans
create table public.content_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  audit_id uuid references public.audits(id) on delete set null,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create index idx_content_plans_workspace_id on public.content_plans(workspace_id);

alter table public.content_plans enable row level security;

create policy "content_plans_owner_all"
  on public.content_plans
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );

-- 8. Posts
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.content_plans(id) on delete set null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  caption text,
  hashtags text[] not null default '{}'::text[],
  asset_ids uuid[] not null default '{}'::uuid[],
  platforms text[] not null default '{}'::text[],
  scheduled_at timestamptz,
  status public.post_status not null default 'draft',
  review_note text,
  version int not null default 1,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_posts_workspace_id on public.posts(workspace_id);
create index idx_posts_plan_id on public.posts(plan_id);
create index idx_posts_status_scheduled on public.posts(status, scheduled_at);

alter table public.posts enable row level security;

create policy "posts_owner_all"
  on public.posts
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );

-- 9. Post Versions
create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_post_versions_post_id on public.post_versions(post_id);

alter table public.post_versions enable row level security;

create policy "post_versions_owner_all"
  on public.post_versions
  for all
  to authenticated
  using (
    post_id in (
      select p.id from public.posts p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  )
  with check (
    post_id in (
      select p.id from public.posts p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

-- 10. Post Publications
create table public.post_publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  social_account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null,
  external_post_id text,
  published_at timestamptz,
  status text not null default 'pending',
  error text,
  metrics jsonb not null default '{}'::jsonb,
  metrics_fetched_at timestamptz
);

create index idx_post_publications_post_id on public.post_publications(post_id);
create index idx_post_publications_social_account_id on public.post_publications(social_account_id);

alter table public.post_publications enable row level security;

create policy "post_publications_owner_all"
  on public.post_publications
  for all
  to authenticated
  using (
    post_id in (
      select p.id from public.posts p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  )
  with check (
    post_id in (
      select p.id from public.posts p
      join public.workspaces w on w.id = p.workspace_id
      where w.owner_id = auth.uid()
    )
  );

-- 11. Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month date not null,
  summary jsonb not null default '{}'::jsonb,
  learnings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_reports_workspace_id on public.reports(workspace_id);

alter table public.reports enable row level security;

create policy "reports_owner_all"
  on public.reports
  for all
  to authenticated
  using (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_id = auth.uid())
  );
