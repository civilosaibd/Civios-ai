-- Per-user company profile for CivilOS AI.
-- Each authenticated user can read and edit only their own company settings.
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text not null,
  registration_number text,
  tax_number text,
  contact_email text,
  phone text,
  website text,
  address text,
  city text,
  country text not null default 'Bangladesh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings enable row level security;

drop policy if exists "Users can view their own company settings" on public.company_settings;
create policy "Users can view their own company settings"
  on public.company_settings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own company settings" on public.company_settings;
create policy "Users can insert their own company settings"
  on public.company_settings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own company settings" on public.company_settings;
create policy "Users can update their own company settings"
  on public.company_settings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.company_settings to authenticated;
