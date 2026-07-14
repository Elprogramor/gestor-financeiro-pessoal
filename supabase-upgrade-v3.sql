-- Fluxo v3 — contas individuais, espaços compartilhados, convites e permissões
-- Execute uma única vez no Supabase Dashboard > SQL Editor > New query.
-- Este script preserva todos os lançamentos já existentes.

begin;

create table if not exists public.finance_spaces (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Meu financeiro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_space_members (
  space_owner_id uuid not null references public.finance_spaces(owner_user_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (space_owner_id, user_id)
);

create table if not exists public.finance_space_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  space_owner_id uuid not null references public.finance_spaces(owner_user_id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create index if not exists finance_space_members_user_idx
  on public.finance_space_members (user_id, space_owner_id);
create index if not exists finance_space_invites_space_idx
  on public.finance_space_invites (space_owner_id, status, created_at desc);
create index if not exists finance_space_invites_email_idx
  on public.finance_space_invites (lower(email), status);

create or replace function public.set_finance_space_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists finance_spaces_set_updated_at on public.finance_spaces;
create trigger finance_spaces_set_updated_at
before update on public.finance_spaces
for each row execute function public.set_finance_space_updated_at();

-- Cria automaticamente o espaço pessoal de cada novo usuário.
create or replace function public.bootstrap_finance_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(split_part(new.email, '@', 1), ''), 'Meu financeiro');

  insert into public.finance_spaces (owner_user_id, name)
  values (new.id, left(v_name, 80))
  on conflict (owner_user_id) do nothing;

  insert into public.finance_space_members (space_owner_id, user_id, role)
  values (new.id, new.id, 'owner')
  on conflict (space_owner_id, user_id) do update set role = 'owner';

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_finance_space on auth.users;
create trigger on_auth_user_created_finance_space
after insert on auth.users
for each row execute function public.bootstrap_finance_user();

-- Migra todos os usuários existentes sem alterar os dados financeiros atuais.
insert into public.finance_spaces (owner_user_id, name)
select
  id,
  left(coalesce(nullif(raw_user_meta_data ->> 'name', ''), nullif(split_part(email, '@', 1), ''), 'Meu financeiro'), 80)
from auth.users
on conflict (owner_user_id) do nothing;

insert into public.finance_space_members (space_owner_id, user_id, role)
select id, id, 'owner'
from auth.users
on conflict (space_owner_id, user_id) do update set role = 'owner';

-- Retorna a função do usuário autenticado em determinado espaço.
create or replace function public.finance_current_role(p_space_owner_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.finance_space_members m
  where m.space_owner_id = p_space_owner_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.finance_can_edit(p_space_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.finance_current_role(p_space_owner_id) in ('owner', 'editor'), false);
$$;

-- Lista o espaço pessoal e todos os espaços recebidos por convite.
create or replace function public.list_finance_spaces()
returns table (
  space_owner_id uuid,
  name text,
  role text,
  is_personal boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.owner_user_id, s.name, m.role, (s.owner_user_id = auth.uid())
  from public.finance_space_members m
  join public.finance_spaces s on s.owner_user_id = m.space_owner_id
  where m.user_id = auth.uid()
  order by (s.owner_user_id = auth.uid()) desc, s.name asc;
$$;

-- Lista pessoas do espaço. Somente o proprietário pode consultar os e-mails.
create or replace function public.list_finance_space_members(p_space_owner_id uuid)
returns table (
  member_user_id uuid,
  email text,
  display_name text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.finance_current_role(p_space_owner_id) <> 'owner' then
    raise exception 'Somente o proprietário pode consultar os acessos.' using errcode = '42501';
  end if;

  return query
  select
    m.user_id,
    u.email::text,
    coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(split_part(u.email, '@', 1), ''), 'Usuário')::text,
    m.role,
    m.joined_at
  from public.finance_space_members m
  join auth.users u on u.id = m.user_id
  where m.space_owner_id = p_space_owner_id
  order by (m.role = 'owner') desc, m.joined_at asc;
end;
$$;

-- Cria um link de convite vinculado ao e-mail e com validade de sete dias.
create or replace function public.create_finance_invite(
  p_space_owner_id uuid,
  p_email text,
  p_role text
)
returns table (token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if public.finance_current_role(p_space_owner_id) <> 'owner' then
    raise exception 'Somente o proprietário pode criar convites.' using errcode = '42501';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'Permissão inválida.';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Informe um e-mail válido.';
  end if;

  if exists (
    select 1
    from public.finance_space_members m
    join auth.users u on u.id = m.user_id
    where m.space_owner_id = p_space_owner_id
      and lower(u.email) = v_email
  ) then
    raise exception 'Esta pessoa já possui acesso ao espaço.';
  end if;

  update public.finance_space_invites
  set status = 'cancelled'
  where space_owner_id = p_space_owner_id
    and lower(email) = v_email
    and status = 'pending';

  return query
  insert into public.finance_space_invites as i (
    space_owner_id, email, role, created_by, expires_at
  ) values (
    p_space_owner_id, v_email, p_role, auth.uid(), now() + interval '7 days'
  )
  returning i.token, i.expires_at;
end;
$$;

-- Aceita o convite somente quando o e-mail autenticado coincide com o convite.
create or replace function public.accept_finance_invite(p_token uuid)
returns table (
  space_owner_id uuid,
  role text,
  space_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.finance_space_invites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta antes de aceitar o convite.' using errcode = '42501';
  end if;

  select * into v_invite
  from public.finance_space_invites
  where token = p_token
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Convite inválido, cancelado ou já utilizado.';
  end if;

  if v_invite.expires_at <= now() then
    update public.finance_space_invites set status = 'expired' where id = v_invite.id;
    raise exception 'Este convite expirou. Solicite um novo convite.';
  end if;

  if lower(v_invite.email) <> v_email then
    raise exception 'Entre com o mesmo e-mail que recebeu o convite.' using errcode = '42501';
  end if;

  insert into public.finance_space_members (space_owner_id, user_id, role)
  values (v_invite.space_owner_id, auth.uid(), v_invite.role)
  on conflict (space_owner_id, user_id)
  do update set role = excluded.role;

  update public.finance_space_invites
  set status = 'accepted', accepted_at = now()
  where id = v_invite.id;

  return query
  select s.owner_user_id, v_invite.role, s.name
  from public.finance_spaces s
  where s.owner_user_id = v_invite.space_owner_id;
end;
$$;

create or replace function public.update_finance_member_role(
  p_space_owner_id uuid,
  p_member_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.finance_current_role(p_space_owner_id) <> 'owner' then
    raise exception 'Somente o proprietário pode alterar permissões.' using errcode = '42501';
  end if;
  if p_member_user_id = p_space_owner_id then
    raise exception 'A permissão do proprietário não pode ser alterada.';
  end if;
  if p_role not in ('editor', 'viewer') then
    raise exception 'Permissão inválida.';
  end if;

  update public.finance_space_members
  set role = p_role
  where space_owner_id = p_space_owner_id
    and user_id = p_member_user_id;

  if not found then raise exception 'Membro não encontrado.'; end if;
end;
$$;

create or replace function public.remove_finance_member(
  p_space_owner_id uuid,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.finance_current_role(p_space_owner_id) <> 'owner' then
    raise exception 'Somente o proprietário pode remover acessos.' using errcode = '42501';
  end if;
  if p_member_user_id = p_space_owner_id then
    raise exception 'O proprietário não pode ser removido do próprio espaço.';
  end if;

  delete from public.finance_space_members
  where space_owner_id = p_space_owner_id
    and user_id = p_member_user_id;
end;
$$;

-- Segurança das novas tabelas.
alter table public.finance_spaces enable row level security;
alter table public.finance_space_members enable row level security;
alter table public.finance_space_invites enable row level security;

drop policy if exists "finance_spaces_members_read" on public.finance_spaces;
create policy "finance_spaces_members_read"
on public.finance_spaces for select to authenticated
using (public.finance_current_role(owner_user_id) is not null);

drop policy if exists "finance_spaces_owner_update" on public.finance_spaces;
create policy "finance_spaces_owner_update"
on public.finance_spaces for update to authenticated
using (public.finance_current_role(owner_user_id) = 'owner')
with check (public.finance_current_role(owner_user_id) = 'owner');

drop policy if exists "finance_space_members_read" on public.finance_space_members;
create policy "finance_space_members_read"
on public.finance_space_members for select to authenticated
using (public.finance_current_role(space_owner_id) is not null);

drop policy if exists "finance_space_invites_owner_or_recipient_read" on public.finance_space_invites;
create policy "finance_space_invites_owner_or_recipient_read"
on public.finance_space_invites for select to authenticated
using (
  public.finance_current_role(space_owner_id) = 'owner'
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "finance_space_invites_owner_insert" on public.finance_space_invites;
create policy "finance_space_invites_owner_insert"
on public.finance_space_invites for insert to authenticated
with check (public.finance_current_role(space_owner_id) = 'owner' and created_by = auth.uid());

drop policy if exists "finance_space_invites_owner_update" on public.finance_space_invites;
create policy "finance_space_invites_owner_update"
on public.finance_space_invites for update to authenticated
using (public.finance_current_role(space_owner_id) = 'owner')
with check (public.finance_current_role(space_owner_id) = 'owner');

drop policy if exists "finance_space_invites_owner_delete" on public.finance_space_invites;
create policy "finance_space_invites_owner_delete"
on public.finance_space_invites for delete to authenticated
using (public.finance_current_role(space_owner_id) = 'owner');

-- Substitui as políticas antigas de dono único por políticas de espaço compartilhado.
drop policy if exists "finance_profiles_own_rows" on public.finance_profiles;
drop policy if exists "finance_profiles_read" on public.finance_profiles;
drop policy if exists "finance_profiles_insert" on public.finance_profiles;
drop policy if exists "finance_profiles_update" on public.finance_profiles;
drop policy if exists "finance_profiles_delete" on public.finance_profiles;
create policy "finance_profiles_read" on public.finance_profiles for select to authenticated
using (public.finance_current_role(user_id) is not null);
create policy "finance_profiles_insert" on public.finance_profiles for insert to authenticated
with check (public.finance_can_edit(user_id));
create policy "finance_profiles_update" on public.finance_profiles for update to authenticated
using (public.finance_can_edit(user_id)) with check (public.finance_can_edit(user_id));
create policy "finance_profiles_delete" on public.finance_profiles for delete to authenticated
using (public.finance_current_role(user_id) = 'owner');

drop policy if exists "finance_records_own_rows" on public.finance_records;
drop policy if exists "finance_records_read" on public.finance_records;
drop policy if exists "finance_records_insert" on public.finance_records;
drop policy if exists "finance_records_update" on public.finance_records;
drop policy if exists "finance_records_delete" on public.finance_records;
create policy "finance_records_read" on public.finance_records for select to authenticated
using (public.finance_current_role(user_id) is not null);
create policy "finance_records_insert" on public.finance_records for insert to authenticated
with check (public.finance_can_edit(user_id));
create policy "finance_records_update" on public.finance_records for update to authenticated
using (public.finance_can_edit(user_id)) with check (public.finance_can_edit(user_id));
create policy "finance_records_delete" on public.finance_records for delete to authenticated
using (public.finance_can_edit(user_id));

drop policy if exists "finance_backups_own_rows" on public.finance_backups;
drop policy if exists "finance_backups_read" on public.finance_backups;
drop policy if exists "finance_backups_insert" on public.finance_backups;
drop policy if exists "finance_backups_delete" on public.finance_backups;
create policy "finance_backups_read" on public.finance_backups for select to authenticated
using (public.finance_current_role(user_id) is not null);
create policy "finance_backups_insert" on public.finance_backups for insert to authenticated
with check (public.finance_can_edit(user_id));
create policy "finance_backups_delete" on public.finance_backups for delete to authenticated
using (public.finance_can_edit(user_id));

revoke all on table public.finance_spaces from anon;
revoke all on table public.finance_space_members from anon;
revoke all on table public.finance_space_invites from anon;

grant select, update on table public.finance_spaces to authenticated;
grant select on table public.finance_space_members to authenticated;
grant select, insert, update, delete on table public.finance_space_invites to authenticated;

revoke all on function public.finance_current_role(uuid) from public;
revoke all on function public.finance_can_edit(uuid) from public;
revoke all on function public.list_finance_spaces() from public;
revoke all on function public.list_finance_space_members(uuid) from public;
revoke all on function public.create_finance_invite(uuid, text, text) from public;
revoke all on function public.accept_finance_invite(uuid) from public;
revoke all on function public.update_finance_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_finance_member(uuid, uuid) from public;

grant execute on function public.finance_current_role(uuid) to authenticated;
grant execute on function public.finance_can_edit(uuid) to authenticated;
grant execute on function public.list_finance_spaces() to authenticated;
grant execute on function public.list_finance_space_members(uuid) to authenticated;
grant execute on function public.create_finance_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_finance_invite(uuid) to authenticated;
grant execute on function public.update_finance_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_finance_member(uuid, uuid) to authenticated;

commit;
