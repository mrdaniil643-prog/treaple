-- Treaple · схема и политики доступа
-- Выполнить целиком в Supabase → SQL Editor → New query → Run.
-- Повторный запуск безопасен.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
-- Таблицы
-- ─────────────────────────────────────────────────────────────────────

-- Профиль заводится триггером при регистрации. Почту видит только сам
-- пользователь и администратор приложения — участникам магазина видно
-- лишь отображаемое имя.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  code        text not null unique,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  display_name  text not null default '',
  role          text not null default 'staff' check (role in ('owner','staff')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (team_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);

create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references public.teams(id) on delete cascade,
  name                 text not null default '',
  category             text not null default '',
  purchase_price       numeric(12,2) not null default 0 check (purchase_price >= 0),
  sale_price           numeric(12,2) not null default 0 check (sale_price >= 0),
  quantity             integer not null default 0 check (quantity >= 0),
  low_stock_threshold  integer not null default 3 check (low_stock_threshold >= 0),
  in_stock             boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null
);
create index if not exists products_team_idx on public.products (team_id);

create table if not exists public.events (
  id       bigserial primary key,
  team_id  uuid not null references public.teams(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete set null,
  actor    text not null default '',
  kind     text not null,
  subject  text not null default '',
  detail   text not null default '',
  at       timestamptz not null default now()
);
create index if not exists events_team_at_idx on public.events (team_id, at desc);

-- Кто видит сводку по всем магазинам. Себя нужно добавить сюда вручную
-- после первой регистрации — инструкция в README.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ─────────────────────────────────────────────────────────────────────
-- Вспомогательные функции
--
-- security definer обязателен: политика на memberships, которая сама
-- читает memberships, иначе уходит в бесконечную рекурсию. Функция
-- выполняется с правами владельца и обходит RLS, поэтому search_path
-- зафиксирован — иначе её можно подменить своей таблицей.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.is_member(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                  where team_id = t and user_id = auth.uid());
$$;

create or replace function public.is_team_owner(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships
                  where team_id = t and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Права доступа к строкам
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles    enable row level security;
alter table public.teams       enable row level security;
alter table public.memberships enable row level security;
alter table public.products    enable row level security;
alter table public.events      enable row level security;
alter table public.app_admins  enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_app_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Магазин видят только его участники. Вступление идёт через join_team,
-- поэтому читать чужие магазины по коду не нужно и нельзя.
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select
  using (public.is_member(id) or public.is_app_admin());

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update
  using (public.is_team_owner(id)) with check (public.is_team_owner(id));

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams for delete
  using (public.is_team_owner(id));

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships for select
  using (public.is_member(team_id) or public.is_app_admin());

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update
  using (user_id = auth.uid() or public.is_team_owner(team_id))
  with check (user_id = auth.uid() or public.is_team_owner(team_id));

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete
  using (user_id = auth.uid() or public.is_team_owner(team_id));

-- Политика проверяет только новую строку и не видит старую, поэтому
-- «сотрудник переписал себе role = owner» ею не ловится. Ловит триггер.
create or replace function public.guard_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_team_owner(old.team_id) then
    raise exception 'роль участника меняет только управляющий';
  end if;
  if new.team_id is distinct from old.team_id or new.user_id is distinct from old.user_id then
    raise exception 'участника нельзя перенести в другой магазин';
  end if;
  return new;
end $$;

drop trigger if exists memberships_guard on public.memberships;
create trigger memberships_guard before update on public.memberships
  for each row execute function public.guard_membership();

-- Товары: читают и правят участники магазина. Администратор приложения
-- читает всё, но писать в чужой магазин не может — with check без него.
drop policy if exists products_select on public.products;
create policy products_select on public.products for select
  using (public.is_member(team_id) or public.is_app_admin());

drop policy if exists products_write on public.products;
create policy products_write on public.products for insert
  with check (public.is_member(team_id));

drop policy if exists products_update on public.products;
create policy products_update on public.products for update
  using (public.is_member(team_id)) with check (public.is_member(team_id));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete
  using (public.is_member(team_id));

-- Журнал только дополняется: правка и удаление записей не предусмотрены
-- намеренно, иначе след «кто менял остаток» ничего не стоит.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select
  using (public.is_member(team_id) or public.is_app_admin());

drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert
  with check (public.is_member(team_id) and user_id = auth.uid());

drop policy if exists admins_select on public.app_admins;
create policy admins_select on public.app_admins for select
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- Регистрация профиля
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────
-- Вступление в магазин
--
-- Обе операции идут через функции, а не прямыми insert: создание
-- магазина должно атомарно заводить управляющего, а вступление по коду
-- требует прочитать магазин, которого человек ещё не участник.
-- ─────────────────────────────────────────────────────────────────────

-- Алфавит без похожих знаков: ноль и O, единица и I, S и 5 на слух и
-- на глаз путаются, а код диктуют вслух.
create or replace function public.gen_team_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ACEFHKLMNPRTUVWXY349';
  result   text := '';
  i        int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

create or replace function public.create_team(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text; v_try int := 0;
begin
  if auth.uid() is null then raise exception 'нужен вход'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'введите название магазина'; end if;

  loop
    v_try := v_try + 1;
    v_code := public.gen_team_code();
    exit when not exists (select 1 from public.teams where code = v_code);
    if v_try > 25 then raise exception 'не удалось подобрать код'; end if;
  end loop;

  insert into public.teams (name, code, owner_id)
    values (btrim(p_name), v_code, auth.uid())
    returning id into v_id;

  insert into public.memberships (team_id, user_id, display_name, role)
    values (v_id, auth.uid(), coalesce(nullif(btrim(p_display_name), ''), 'Участник'), 'owner');

  return v_id;
end $$;

create or replace function public.join_team(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'нужен вход'; end if;

  select id into v_id from public.teams where code = upper(btrim(p_code));
  if v_id is null then raise exception 'магазин с таким кодом не найден'; end if;

  insert into public.memberships (team_id, user_id, display_name, role)
    values (v_id, auth.uid(), coalesce(nullif(btrim(p_display_name), ''), 'Участник'), 'staff')
    on conflict (team_id, user_id)
      do update set display_name = excluded.display_name, last_seen_at = now();

  return v_id;
end $$;

revoke all on function public.create_team(text, text) from public, anon;
revoke all on function public.join_team(text, text)  from public, anon;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.join_team(text, text)  to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Живое обновление у всех открытых вкладок
-- ─────────────────────────────────────────────────────────────────────
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.products';    exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.events';      exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.memberships'; exception when duplicate_object then null; end;
end $$;
