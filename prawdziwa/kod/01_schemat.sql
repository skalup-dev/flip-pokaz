-- Flip – prawdziwa wersja, klocek 1: konta i mieszkania
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run

-- Profil każdego konta (tworzy się sam przy rejestracji)
create table if not exists public.profile (
  id uuid primary key references auth.users(id) on delete cascade,
  imie text,
  rola text not null default 'wlasciciel'
    check (rola in ('wlasciciel','firma','pracownik')),
  utworzono timestamptz not null default now()
);

-- Mieszkania Właściciela aplikacji
create table if not exists public.mieszkania (
  id uuid primary key default gen_random_uuid(),
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ulica text not null check (length(trim(ulica)) > 0),
  miasto text,
  metraz numeric(7,2) check (metraz is null or metraz > 0),
  budzet numeric(12,2) check (budzet is null or budzet >= 0),
  data_startu date,
  termin_konca date,
  opis text,
  utworzono timestamptz not null default now(),
  zmieniono timestamptz not null default now(),
  check (termin_konca is null or data_startu is null or termin_konca >= data_startu)
);
create index if not exists mieszkania_wlasciciel_idx on public.mieszkania(wlasciciel);

-- Data zmiany ustawia się sama
create or replace function public.ustaw_zmieniono() returns trigger
language plpgsql as $$ begin new.zmieniono := now(); return new; end $$;
drop trigger if exists mieszkania_zmieniono on public.mieszkania;
create trigger mieszkania_zmieniono before update on public.mieszkania
  for each row execute function public.ustaw_zmieniono();

-- Właściciela nie da się podmienić przy zmianie
create or replace function public.blokuj_zmiane_wlasciciela() returns trigger
language plpgsql as $$
begin
  if new.wlasciciel <> old.wlasciciel then
    raise exception 'Nie można zmienić właściciela mieszkania';
  end if;
  return new;
end $$;
drop trigger if exists mieszkania_wlasciciel_staly on public.mieszkania;
create trigger mieszkania_wlasciciel_staly before update on public.mieszkania
  for each row execute function public.blokuj_zmiane_wlasciciela();

-- Profil zakłada się sam przy rejestracji
create or replace function public.nowe_konto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profile(id, imie) values (new.id, new.raw_user_meta_data->>'imie')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists po_rejestracji on auth.users;
create trigger po_rejestracji after insert on auth.users
  for each row execute function public.nowe_konto();

-- Zasady dostępu: każdy widzi i zmienia TYLKO swoje
alter table public.profile enable row level security;
alter table public.mieszkania enable row level security;

drop policy if exists profil_swoj_odczyt on public.profile;
create policy profil_swoj_odczyt on public.profile for select to authenticated using (id = auth.uid());
drop policy if exists profil_swoj_zmiana on public.profile;
create policy profil_swoj_zmiana on public.profile for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());  -- rolę chroni grant: wolno zmienić tylko imię

drop policy if exists mieszkania_odczyt on public.mieszkania;
create policy mieszkania_odczyt on public.mieszkania for select to authenticated using (wlasciciel = auth.uid());
drop policy if exists mieszkania_dodanie on public.mieszkania;
create policy mieszkania_dodanie on public.mieszkania for insert to authenticated with check (wlasciciel = auth.uid());
drop policy if exists mieszkania_zmiana on public.mieszkania;
create policy mieszkania_zmiana on public.mieszkania for update to authenticated using (wlasciciel = auth.uid()) with check (wlasciciel = auth.uid());
drop policy if exists mieszkania_usuniecie on public.mieszkania;
create policy mieszkania_usuniecie on public.mieszkania for delete to authenticated using (wlasciciel = auth.uid());

grant select, insert, update, delete on public.mieszkania to authenticated;
revoke insert, update, delete on public.profile from authenticated;
grant select, update (imie) on public.profile to authenticated;
revoke all on public.mieszkania from anon;
revoke all on public.profile from anon;
