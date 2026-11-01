-- Admin-managed Excel workbook library with private object storage.
-- Authenticated users may browse/download; only authorized admins may upload/delete.

create table if not exists public.excel_library_files (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 500),
  category text check (category is null or length(category) <= 80),
  original_filename text not null check (length(original_filename) between 1 and 255),
  storage_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  mime_type text not null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists excel_library_files_created_at_idx
  on public.excel_library_files(created_at desc);
create index if not exists excel_library_files_category_idx
  on public.excel_library_files(category);
create index if not exists excel_library_files_title_idx
  on public.excel_library_files using gin (to_tsvector('simple', title || ' ' || original_filename));

alter table public.excel_library_files enable row level security;
revoke all on public.excel_library_files from anon, authenticated;
grant select, insert, delete on public.excel_library_files to authenticated;
grant all on public.excel_library_files to service_role;

create policy "Authenticated users browse Excel library"
  on public.excel_library_files for select to authenticated
  using (true);

create policy "Admins upload Excel library metadata"
  on public.excel_library_files for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (
      public.has_role((select auth.uid()), 'admin')
    )
  );

create policy "Admins delete Excel library metadata"
  on public.excel_library_files for delete to authenticated
  using (
    public.has_role((select auth.uid()), 'admin')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'excel-library',
  'excel-library',
  false,
  52428800,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins upload Excel library objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'excel-library'
    and (
      public.is_super_admin()
      or public.has_admin_permission('excel_library', 'manage')
      or public.has_role((select auth.uid()), 'admin')
    )
  );

create policy "Authenticated users read Excel library objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'excel-library');

create policy "Admins delete Excel library objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'excel-library'
    and (
      public.is_super_admin()
      or public.has_admin_permission('excel_library', 'manage')
      or public.has_role((select auth.uid()), 'admin')
    )
  );
