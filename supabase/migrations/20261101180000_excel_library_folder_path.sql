-- Preserve source folder hierarchy for ZIP and direct folder uploads.
alter table public.excel_library_files
  add column if not exists folder_path text;

create index if not exists excel_library_files_folder_path_idx
  on public.excel_library_files(folder_path);
