-- Super Admin / Sub-Admin RBAC foundation.
-- Authorization is stored in trusted database tables, never user-editable metadata.
-- Writes are intentionally reserved for server-side service-role workflows.

create table if not exists public.admin_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  role text not null check (role in ('super_admin', 'sub_admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_memberships_role_status_idx
  on public.admin_memberships(role, status);

create table if not exists public.admin_feature_permissions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.admin_memberships(id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'approve', 'export', 'manage')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (membership_id, feature_key, action)
);

create index if not exists admin_feature_permissions_lookup_idx
  on public.admin_feature_permissions(membership_id, feature_key, action);

create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  invited_email text not null check (length(trim(invited_email)) between 3 and 320),
  invited_by uuid not null references auth.users(id) on delete restrict,
  role text not null default 'sub_admin' check (role = 'sub_admin'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists admin_invitations_email_status_idx
  on public.admin_invitations(lower(invited_email), status);

create table if not exists public.admin_rbac_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'invite_created', 'invite_revoked', 'sub_admin_activated',
    'sub_admin_suspended', 'sub_admin_removed', 'permission_granted',
    'permission_revoked', 'role_changed'
  )),
  feature_key text,
  permission_action text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_rbac_audit_created_at_idx
  on public.admin_rbac_audit(created_at desc);
create index if not exists admin_rbac_audit_actor_idx
  on public.admin_rbac_audit(actor_user_id, created_at desc);
create index if not exists admin_rbac_audit_target_idx
  on public.admin_rbac_audit(target_user_id, created_at desc);

alter table public.admin_memberships enable row level security;
alter table public.admin_feature_permissions enable row level security;
alter table public.admin_invitations enable row level security;
alter table public.admin_rbac_audit enable row level security;

revoke all on public.admin_memberships from anon, authenticated;
revoke all on public.admin_feature_permissions from anon, authenticated;
revoke all on public.admin_invitations from anon, authenticated;
revoke all on public.admin_rbac_audit from anon, authenticated;

grant select on public.admin_memberships to authenticated;
grant select on public.admin_feature_permissions to authenticated;
grant select on public.admin_invitations to authenticated;
grant select on public.admin_rbac_audit to authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_memberships m
    where m.user_id = (select auth.uid())
      and m.role = 'super_admin'
      and m.status = 'active'
  );
$$;

create or replace function public.has_admin_permission(_feature_key text, _action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.admin_memberships m
      join public.admin_feature_permissions p on p.membership_id = m.id
      where m.user_id = (select auth.uid())
        and m.role = 'sub_admin'
        and m.status = 'active'
        and p.feature_key = _feature_key
        and p.action = _action
    );
$$;

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.has_admin_permission(text, text) from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.has_admin_permission(text, text) to authenticated;

drop policy if exists "Super admins view admin memberships" on public.admin_memberships;
create policy "Super admins view admin memberships"
  on public.admin_memberships for select to authenticated
  using (public.is_super_admin() or user_id = (select auth.uid()));

drop policy if exists "Members view their own feature permissions" on public.admin_feature_permissions;
create policy "Members view their own feature permissions"
  on public.admin_feature_permissions for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.admin_memberships m
      where m.id = membership_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

drop policy if exists "Super admins view admin invitations" on public.admin_invitations;
create policy "Super admins view admin invitations"
  on public.admin_invitations for select to authenticated
  using (public.is_super_admin());

drop policy if exists "Super admins view RBAC audit" on public.admin_rbac_audit;
create policy "Super admins view RBAC audit"
  on public.admin_rbac_audit for select to authenticated
  using (public.is_super_admin());

-- Promote the explicitly approved, verified account as the first Primary Super Admin.
-- Keep its legacy admin role intact during the staged migration to avoid breaking
-- existing Admin Panel and Edge Function checks before they are upgraded.
do $$
declare
  primary_user_id uuid;
begin
  select id into primary_user_id
  from auth.users
  where lower(trim(email)) = 'zobaerio24@gmail.com'
    and email_confirmed_at is not null;

  if primary_user_id is null then
    raise exception 'Primary Super Admin account zobaerio24@gmail.com was not found or is not email-verified';
  end if;

  insert into public.admin_memberships (user_id, role, status)
  values (primary_user_id, 'super_admin', 'active')
  on conflict (user_id) do update
    set role = 'super_admin',
        status = 'active',
        updated_at = now();
end;
$$;
