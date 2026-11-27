-- ===== Klocek 14: Ilości z planu (wpisywane ręcznie), pytania do architekta, wysokość pomieszczeń =====
-- Wgrywane w Supabase po klockach 1–6. Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.
-- Automatycznego odczytu planów nie ma (usługa płatna – później). Ilości wpisuje Właściciel aplikacji.
-- Kto co może: Właściciel aplikacji dodaje, sprawdza („Zgadza się” / „Popraw” / „Odznacz”), usuwa.
--              Firma remontowa (aktywny dostęp) tylko ogląda. Inne konta nic nie widzą.

-- 1. Pozycje ilości po grupach
create table if not exists public.ilosci (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  grupa text not null check (grupa in ('Elektryka','Hydraulika','Płyty G-K','Podłogi')),
  nazwa text not null check (length(trim(nazwa)) > 0 and length(nazwa) <= 120),
  ilosc numeric(12,2) check (ilosc is null or ilosc >= 0),
  jednostka text check (jednostka is null or length(jednostka) <= 20),
  do_sprawdzenia boolean not null default false,
  stan text not null default 'nowa' check (stan in ('nowa','zgadza','poprawiona')),
  ilosc_architekt numeric(12,2) check (ilosc_architekt is null or ilosc_architekt >= 0),
  powod text check (powod is null or length(powod) <= 200),
  sprawdzil uuid references auth.users(id) on delete set null,
  sprawdzono timestamptz,
  dodal uuid references auth.users(id) on delete set null,
  utworzono timestamptz not null default now(),
  constraint ilosci_liczba_albo_do_sprawdzenia check (ilosc is not null or do_sprawdzenia),
  constraint ilosci_poprawiona_ma_liczbe check (stan <> 'poprawiona' or ilosc_architekt is not null)
);
create index if not exists ilosci_mieszkanie_idx on public.ilosci(mieszkanie);
alter table public.ilosci enable row level security;

create or replace function public.pilnuj_ilosci() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.wlasciciel := coalesce(public.wlasciciel_mieszkania(new.mieszkanie), new.wlasciciel);
    new.dodal := auth.uid(); new.stan := 'nowa'; new.ilosc_architekt := null; new.powod := null;
    new.sprawdzil := null; new.sprawdzono := null;
    return new;
  end if;
  if new.mieszkanie <> old.mieszkanie or new.wlasciciel <> old.wlasciciel then raise exception 'Pozycji nie można przenieść do innego mieszkania'; end if;
  new.dodal := old.dodal;
  if new.stan = 'nowa' then
    new.ilosc_architekt := null; new.powod := null; new.sprawdzil := null; new.sprawdzono := null;
  else
    if new.stan = 'zgadza' then
      if new.ilosc is null then raise exception 'Najpierw trzeba wpisać ilość z planu'; end if;
      new.ilosc_architekt := null; new.powod := null;
    end if;
    if new.stan is distinct from old.stan or new.ilosc_architekt is distinct from old.ilosc_architekt then
      new.sprawdzil := auth.uid(); new.sprawdzono := now();
    else
      new.sprawdzil := old.sprawdzil; new.sprawdzono := old.sprawdzono;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ilosci_pilnuj on public.ilosci;
create trigger ilosci_pilnuj before insert or update on public.ilosci
  for each row execute function public.pilnuj_ilosci();

-- 2. Pytania do architekta
create table if not exists public.pytania_architekt (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tresc text not null check (length(trim(tresc)) > 0 and length(tresc) <= 300),
  wyjasnione boolean not null default false,
  dodal uuid references auth.users(id) on delete set null,
  utworzono timestamptz not null default now(),
  wyjasnil uuid references auth.users(id) on delete set null,
  wyjasniono timestamptz
);
create index if not exists pytania_architekt_mieszkanie_idx on public.pytania_architekt(mieszkanie);
alter table public.pytania_architekt enable row level security;

create or replace function public.pilnuj_pytania() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.wlasciciel := coalesce(public.wlasciciel_mieszkania(new.mieszkanie), new.wlasciciel);
    new.dodal := auth.uid(); new.wyjasnione := false; new.wyjasnil := null; new.wyjasniono := null;
    return new;
  end if;
  if new.mieszkanie <> old.mieszkanie or new.wlasciciel <> old.wlasciciel then raise exception 'Pytania nie można przenieść do innego mieszkania'; end if;
  new.dodal := old.dodal; new.utworzono := old.utworzono;
  if new.wyjasnione and not old.wyjasnione then new.wyjasnil := auth.uid(); new.wyjasniono := now();
  elsif not new.wyjasnione then new.wyjasnil := null; new.wyjasniono := null;
  else new.wyjasnil := old.wyjasnil; new.wyjasniono := old.wyjasniono; end if;
  return new;
end $$;
drop trigger if exists pytania_architekt_pilnuj on public.pytania_architekt;
create trigger pytania_architekt_pilnuj before insert or update on public.pytania_architekt
  for each row execute function public.pilnuj_pytania();

-- 3. Wysokość pomieszczeń (jedna na mieszkanie) – do przeliczenia m² ścian
create table if not exists public.ilosci_wysokosc (
  mieszkanie uuid primary key references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  wysokosc_cm numeric(5,1) not null check (wysokosc_cm between 150 and 500),
  zmienil uuid references auth.users(id) on delete set null,
  zmieniono timestamptz not null default now()
);
alter table public.ilosci_wysokosc enable row level security;

create or replace function public.pilnuj_wysokosci() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.mieszkanie <> old.mieszkanie or new.wlasciciel <> old.wlasciciel) then
    raise exception 'Wysokości nie można przenieść do innego mieszkania';
  end if;
  if tg_op = 'INSERT' then new.wlasciciel := coalesce(public.wlasciciel_mieszkania(new.mieszkanie), new.wlasciciel); end if;
  new.zmienil := auth.uid(); new.zmieniono := now();
  return new;
end $$;
drop trigger if exists ilosci_wysokosc_pilnuj on public.ilosci_wysokosc;
create trigger ilosci_wysokosc_pilnuj before insert or update on public.ilosci_wysokosc
  for each row execute function public.pilnuj_wysokosci();

-- 4. Zasady dostępu: oglądają Właściciel aplikacji i firma z aktywnym dostępem; zmienia tylko Właściciel aplikacji
drop policy if exists ilosci_odczyt on public.ilosci;
create policy ilosci_odczyt on public.ilosci for select to authenticated using (public.ma_dostep(mieszkanie));
drop policy if exists ilosci_dodanie on public.ilosci;
create policy ilosci_dodanie on public.ilosci for insert to authenticated with check (
  public.wlasciciel_mieszkania(mieszkanie) = auth.uid() and wlasciciel = auth.uid());
drop policy if exists ilosci_zmiana on public.ilosci;
create policy ilosci_zmiana on public.ilosci for update to authenticated
  using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid()) with check (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());
drop policy if exists ilosci_usuniecie on public.ilosci;
create policy ilosci_usuniecie on public.ilosci for delete to authenticated using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());

drop policy if exists pytania_odczyt on public.pytania_architekt;
create policy pytania_odczyt on public.pytania_architekt for select to authenticated using (public.ma_dostep(mieszkanie));
drop policy if exists pytania_dodanie on public.pytania_architekt;
create policy pytania_dodanie on public.pytania_architekt for insert to authenticated with check (
  public.wlasciciel_mieszkania(mieszkanie) = auth.uid() and wlasciciel = auth.uid());
drop policy if exists pytania_zmiana on public.pytania_architekt;
create policy pytania_zmiana on public.pytania_architekt for update to authenticated
  using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid()) with check (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());
drop policy if exists pytania_usuniecie on public.pytania_architekt;
create policy pytania_usuniecie on public.pytania_architekt for delete to authenticated using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());

drop policy if exists wysokosc_odczyt on public.ilosci_wysokosc;
create policy wysokosc_odczyt on public.ilosci_wysokosc for select to authenticated using (public.ma_dostep(mieszkanie));
drop policy if exists wysokosc_dodanie on public.ilosci_wysokosc;
create policy wysokosc_dodanie on public.ilosci_wysokosc for insert to authenticated with check (
  public.wlasciciel_mieszkania(mieszkanie) = auth.uid() and wlasciciel = auth.uid());
drop policy if exists wysokosc_zmiana on public.ilosci_wysokosc;
create policy wysokosc_zmiana on public.ilosci_wysokosc for update to authenticated
  using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid()) with check (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());
drop policy if exists wysokosc_usuniecie on public.ilosci_wysokosc;
create policy wysokosc_usuniecie on public.ilosci_wysokosc for delete to authenticated using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());

revoke all on public.ilosci, public.pytania_architekt, public.ilosci_wysokosc from anon;
revoke all on public.ilosci, public.pytania_architekt, public.ilosci_wysokosc from authenticated;
grant select, insert, delete on public.ilosci, public.pytania_architekt, public.ilosci_wysokosc to authenticated;
grant update (grupa, nazwa, ilosc, jednostka, do_sprawdzenia, stan, ilosc_architekt, powod) on public.ilosci to authenticated;
grant update (tresc, wyjasnione) on public.pytania_architekt to authenticated;
grant update (wysokosc_cm) on public.ilosci_wysokosc to authenticated;
