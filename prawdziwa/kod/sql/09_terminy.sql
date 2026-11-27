-- ===== Klocek 9: Terminy (etapy remontu z datami od–do) =====
-- Wgrywane w Supabase po 01–05 i sql/06_szef_firmy.sql. Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.
-- Etapy 1–7 (nr) to stałe etapy remontu, takie same jak w liście prac (prace.etap). Etap dodany przez Właściciela aplikacji ma nr = null i własną nazwę.
-- Etap 1–7 jest skończony, gdy wszystkie jego prace są odznaczone. Etap dodany jest skończony, gdy Właściciel aplikacji go odznaczy (zrobiony).

create table if not exists public.terminy (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  nr smallint check (nr between 1 and 7),
  nazwa text check (nazwa is null or (length(trim(nazwa)) > 0 and length(nazwa) <= 80)),
  data_od date,
  data_do date,
  zrobiony boolean not null default false,
  utworzono timestamptz not null default now(),
  check (data_od is null or data_do is null or data_do >= data_od),
  check (nr is not null or nazwa is not null),
  check (nr is null or not zrobiony),
  unique (mieszkanie, nr),
  unique (id, mieszkanie)
);
create index if not exists terminy_mieszkanie_idx on public.terminy(mieszkanie);
alter table public.terminy enable row level security;

-- Odczyt: Właściciel aplikacji i firma z dostępem. Zmiany: tylko Właściciel aplikacji.
drop policy if exists terminy_odczyt on public.terminy;
create policy terminy_odczyt on public.terminy for select to authenticated using (public.ma_dostep(mieszkanie));
drop policy if exists terminy_dodanie on public.terminy;
create policy terminy_dodanie on public.terminy for insert to authenticated with check (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());
drop policy if exists terminy_zmiana on public.terminy;
create policy terminy_zmiana on public.terminy for update to authenticated
  using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid()) with check (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());
-- usunąć można tylko etap dodany (nie 1–7)
drop policy if exists terminy_usuniecie on public.terminy;
create policy terminy_usuniecie on public.terminy for delete to authenticated
  using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid() and nr is null);

revoke all on public.terminy from anon, public;
grant select, insert, delete on public.terminy to authenticated;
grant update (nazwa, data_od, data_do, zrobiony) on public.terminy to authenticated;

-- Etapy 1–7 zakładają się same przy nowym mieszkaniu i dla mieszkań, które już są
create or replace function public.zaloz_terminy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.terminy(mieszkanie, nr) select new.id, g from generate_series(1, 7) g
  on conflict (mieszkanie, nr) do nothing;
  return new;
end $$;
revoke all on function public.zaloz_terminy() from public, anon;
drop trigger if exists mieszkania_terminy on public.mieszkania;
create trigger mieszkania_terminy after insert on public.mieszkania
  for each row execute function public.zaloz_terminy();
insert into public.terminy(mieszkanie, nr) select m.id, g from public.mieszkania m cross join generate_series(1, 7) g
on conflict (mieszkanie, nr) do nothing;
