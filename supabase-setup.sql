-- Fluxo — estrutura de sincronização pessoal no Supabase
-- Execute este arquivo inteiro em: Supabase Dashboard > SQL Editor > New query

begin;

create table if not exists public.finance_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create table if not exists public.finance_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('transactions', 'goals', 'debts', 'monthly_goals')),
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);

create table if not exists public.finance_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'manual',
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists finance_records_user_updated_idx
  on public.finance_records (user_id, client_updated_at desc);
create index if not exists finance_records_user_collection_idx
  on public.finance_records (user_id, collection, deleted_at);
create index if not exists finance_backups_user_created_idx
  on public.finance_backups (user_id, created_at desc);

create or replace function public.set_finance_server_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

drop trigger if exists finance_profiles_set_updated_at on public.finance_profiles;
create trigger finance_profiles_set_updated_at
before update on public.finance_profiles
for each row execute function public.set_finance_server_updated_at();

drop trigger if exists finance_records_set_updated_at on public.finance_records;
create trigger finance_records_set_updated_at
before update on public.finance_records
for each row execute function public.set_finance_server_updated_at();

alter table public.finance_profiles enable row level security;
alter table public.finance_records enable row level security;
alter table public.finance_backups enable row level security;

-- Cada usuário autenticado só pode acessar linhas cujo user_id seja o próprio UID.
drop policy if exists "finance_profiles_own_rows" on public.finance_profiles;
create policy "finance_profiles_own_rows"
on public.finance_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "finance_records_own_rows" on public.finance_records;
create policy "finance_records_own_rows"
on public.finance_records
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "finance_backups_own_rows" on public.finance_backups;
create policy "finance_backups_own_rows"
on public.finance_backups
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.finance_profiles from anon;
revoke all on table public.finance_records from anon;
revoke all on table public.finance_backups from anon;

grant select, insert, update, delete on table public.finance_profiles to authenticated;
grant select, insert, update, delete on table public.finance_records to authenticated;
grant select, insert, update, delete on table public.finance_backups to authenticated;

-- Habilita atualizações em tempo real nas tabelas compartilhadas.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'finance_records'
  ) then
    alter publication supabase_realtime add table public.finance_records;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'finance_profiles'
  ) then
    alter publication supabase_realtime add table public.finance_profiles;
  end if;
end $$;

commit;
