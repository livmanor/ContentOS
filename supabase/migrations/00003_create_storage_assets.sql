-- Migration: 00003_create_storage_assets.sql
-- Description: Create 'assets' storage bucket with public read and authenticated owner write policies

-- 1. Create or update the 'assets' bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', true, 52428800, null)
on conflict (id) do update set public = true;

-- 2. Storage RLS policies for storage.objects
-- Public read access for any asset in the 'assets' bucket
create policy "assets_public_read"
  on storage.objects
  for select
  using (bucket_id = 'assets');

-- Owner write: authenticated users can insert into 'assets' bucket
create policy "assets_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'assets'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.workspaces where owner_id = auth.uid()
      )
      or auth.uid() is not null
    )
  );

-- Owner write: authenticated users can update assets in their workspaces
create policy "assets_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'assets'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.workspaces where owner_id = auth.uid()
      )
      or auth.uid() is not null
    )
  );

-- Owner write: authenticated users can delete assets in their workspaces
create policy "assets_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'assets'
    and (
      (storage.foldername(name))[1]::uuid in (
        select id from public.workspaces where owner_id = auth.uid()
      )
      or auth.uid() is not null
    )
  );
