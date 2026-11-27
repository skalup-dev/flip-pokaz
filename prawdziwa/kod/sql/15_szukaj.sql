-- ===== Klocek 15: Szukaj ekipy (zlecenie dla firm, terminy oglądania, pytania) =====
-- Wgrywane po 06_szef_firmy.sql. Można uruchomić kilka razy – niczego nie psuje i nie usuwa danych.

-- Pomocnicze sprawdzenia (używane w zasadach tabel)
create or replace function public.szukaj_trzy_rozne_dni(t timestamp[]) returns boolean
language sql immutable as $$
  select coalesce(array_length(t, 1), 0) = 3 and (select count(distinct x::date) from unnest(t) x where x is not null) = 3 $$;
create or replace function public.szukaj_zakres_ok(z text[]) returns boolean
language sql immutable as $$
  select z <@ array['Drzwi wewnętrzne','Drzwi zewnętrzne','Elektryka','Hydraulika','Kuchnia','Łazienka','Okna','Podłogi','Ściany i sufity','Tapeta']::text[] $$;
create or replace function public.szukaj_sciezki_firmy(s text[], f uuid) returns boolean
language sql immutable as $$
  select coalesce(array_length(s, 1), 0) <= 20 and not exists (select 1 from unnest(s) x where x not like f::text || '/realizacje/%') $$;

-- 1. Zlecenie „Szukaj ekipy” – jedno na mieszkanie, widzi i zmienia tylko Właściciel aplikacji
create table if not exists public.zlecenia (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null unique references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  generalny boolean not null default false,
  zakres text[] not null default '{}' check (public.szukaj_zakres_ok(zakres)),
  dopisek text check (dopisek is null or length(dopisek) <= 500),
  termin text check (termin is null or length(termin) <= 100),
  cena_m2 numeric(10,2) not null default 900 check (cena_m2 > 0),
  terminy timestamp[] check (terminy is null or public.szukaj_trzy_rozne_dni(terminy)),
  wystawione boolean not null default false,
  wystawiono timestamptz,
  utworzono timestamptz not null default now(),
  check (not wystawione or (terminy is not null and (generalny or cardinality(zakres) > 0)))
);
create index if not exists zlecenia_wystawione_idx on public.zlecenia(wystawione);
alter table public.zlecenia enable row level security;

drop policy if exists zlecenia_wlasciciel on public.zlecenia;
create policy zlecenia_wlasciciel on public.zlecenia for all to authenticated
  using (wlasciciel = auth.uid())
  with check (wlasciciel = auth.uid() and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid()));
revoke all on public.zlecenia from anon;
grant select, insert on public.zlecenia to authenticated;
grant update (generalny, zakres, dopisek, termin, cena_m2, terminy, wystawione, wystawiono) on public.zlecenia to authenticated;

create or replace function public.wlasciciel_zlecenia(z uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select wlasciciel from public.zlecenia where id = z $$;
create or replace function public.zlecenie_wystawione(z uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zlecenia where id = z and wystawione) $$;

-- 2. Firmy, które wzięły zlecenie: zdjęcia i adresy realizacji, wybrany termin oglądania
create table if not exists public.zgloszenia (
  id uuid primary key default gen_random_uuid(),
  zlecenie uuid not null references public.zlecenia(id) on delete cascade,
  firma uuid not null default auth.uid() references auth.users(id) on delete cascade,
  adresy text[] not null default '{}' check (coalesce(array_length(adresy, 1), 0) <= 20),
  zdjecia text[] not null default '{}',
  wybor smallint check (wybor between 1 and 3),
  zaden boolean not null default false,
  utworzono timestamptz not null default now(),
  unique (zlecenie, firma),
  check (public.szukaj_sciezki_firmy(zdjecia, firma)),
  check (not (zaden and wybor is not null))
);
alter table public.zgloszenia enable row level security;

drop policy if exists zgloszenia_odczyt on public.zgloszenia;
create policy zgloszenia_odczyt on public.zgloszenia for select to authenticated
  using (firma = auth.uid() or public.wlasciciel_zlecenia(zlecenie) = auth.uid());
drop policy if exists zgloszenia_dodanie on public.zgloszenia;
create policy zgloszenia_dodanie on public.zgloszenia for insert to authenticated
  with check (firma = auth.uid() and public.jest_firma() and public.zlecenie_wystawione(zlecenie));
drop policy if exists zgloszenia_zmiana on public.zgloszenia;
create policy zgloszenia_zmiana on public.zgloszenia for update to authenticated
  using (firma = auth.uid()) with check (firma = auth.uid() and public.zlecenie_wystawione(zlecenie));
drop policy if exists zgloszenia_rezygnacja on public.zgloszenia;
create policy zgloszenia_rezygnacja on public.zgloszenia for delete to authenticated using (firma = auth.uid());
revoke all on public.zgloszenia from anon;
grant select, insert, delete on public.zgloszenia to authenticated;
grant update (adresy, zdjecia, wybor, zaden) on public.zgloszenia to authenticated;

-- Nowe terminy oglądania: każda firma wybiera jeszcze raz
create or replace function public.szukaj_nowe_terminy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.terminy is distinct from old.terminy then
    update public.zgloszenia set wybor = null, zaden = false where zlecenie = new.id;
  end if;
  return new;
end $$;
drop trigger if exists zlecenia_nowe_terminy on public.zlecenia;
create trigger zlecenia_nowe_terminy after update on public.zlecenia
  for each row execute function public.szukaj_nowe_terminy();

-- Właściciel aplikacji odwołuje spotkanie z firmą (firma wybiera termin jeszcze raz)
create or replace function public.odwolaj_spotkanie(g uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.zgloszenia x set wybor = null, zaden = false
   where x.id = g and exists (select 1 from public.zlecenia z where z.id = x.zlecenie and z.wlasciciel = auth.uid());
  if not found then raise exception 'Nie ma takiej firmy przy zleceniu'; end if;
end $$;

-- 3. Pytania firmy – prywatne: widzi je tylko ta jedna firma i Właściciel aplikacji
create table if not exists public.pytania_zlecen (
  id uuid primary key default gen_random_uuid(),
  zlecenie uuid not null references public.zlecenia(id) on delete cascade,
  firma uuid not null references auth.users(id) on delete cascade,
  od uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tresc text not null check (length(trim(tresc)) between 1 and 2000),
  utworzono timestamptz not null default now()
);
create index if not exists pytania_zlecen_idx on public.pytania_zlecen(zlecenie, firma);
alter table public.pytania_zlecen enable row level security;

create or replace function public.firma_w_zleceniu(z uuid, f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zgloszenia where zlecenie = z and firma = f)
      or exists (select 1 from public.pytania_zlecen where zlecenie = z and firma = f and od = f) $$;

drop policy if exists pytania_odczyt on public.pytania_zlecen;
create policy pytania_odczyt on public.pytania_zlecen for select to authenticated
  using (firma = auth.uid() or public.wlasciciel_zlecenia(zlecenie) = auth.uid());
drop policy if exists pytania_dodanie on public.pytania_zlecen;
create policy pytania_dodanie on public.pytania_zlecen for insert to authenticated with check (
  od = auth.uid() and (
    (firma = auth.uid() and public.jest_firma() and public.zlecenie_wystawione(zlecenie))
    or (public.wlasciciel_zlecenia(zlecenie) = auth.uid() and public.firma_w_zleceniu(zlecenie, firma))));
revoke all on public.pytania_zlecen from anon;
grant select, insert on public.pytania_zlecen to authenticated;

-- 4. Folder „Nowe mieszkania” dla kont firm: tylko miejscowość. Pełny adres dostaje tylko firma, która wybrała termin.
drop function if exists public.nowe_mieszkania();
create function public.nowe_mieszkania() returns table(
  id uuid, miasto text, ulica text, metraz numeric, generalny boolean, zakres text[], dopisek text, termin text,
  cena_m2 numeric, terminy timestamp[], wystawiono timestamptz,
  zgloszenie uuid, adresy text[], zdjecia text[], wybor smallint, zaden boolean)
language sql stable security definer set search_path = public as $$
  select z.id, m.miasto, case when g.wybor is not null then m.ulica end, m.metraz, z.generalny, z.zakres, z.dopisek, z.termin,
         z.cena_m2, z.terminy, z.wystawiono, g.id, g.adresy, g.zdjecia, g.wybor, g.zaden
  from public.zlecenia z join public.mieszkania m on m.id = z.mieszkanie
  left join public.zgloszenia g on g.zlecenie = z.id and g.firma = auth.uid()
  where z.wystawione and public.jest_firma()
  order by m.miasto nulls last, z.wystawiono $$;

-- Plan i zdjęcia mieszkania z wystawionego zlecenia (bez nazw plików – nazwa mogłaby zdradzić adres)
create or replace function public.pliki_zlecenia(z uuid) returns table(sciezka text, folder text, typ text)
language sql stable security definer set search_path = public as $$
  select f.sciezka, f.folder, f.typ from public.pliki f join public.zlecenia x on x.mieszkanie = f.mieszkanie
  where x.id = z and x.wystawione and public.jest_firma() and f.folder in ('plany','zdjecia_przed','zdjecia_wiz')
  order by case f.folder when 'plany' then 1 when 'zdjecia_przed' then 2 else 3 end, f.utworzono $$;
create or replace function public.firma_widzi_plik_zlecenia(sc text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.jest_firma() and exists (select 1 from public.pliki f join public.zlecenia x on x.mieszkanie = f.mieszkanie
    where f.sciezka = sc and x.wystawione and f.folder in ('plany','zdjecia_przed','zdjecia_wiz')) $$;

-- Zdjęcia realizacji: firma wgrywa do <firma>/realizacje/…, widzi je Właściciel aplikacji zlecenia
create or replace function public.widzi_realizacje(sc text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.zgloszenia g join public.zlecenia z on z.id = g.zlecenie
    where z.wlasciciel = auth.uid() and sc = any(g.zdjecia)) $$;

-- Nazwy firm przy zleceniu (dla Właściciela aplikacji tego zlecenia)
create or replace function public.szukaj_firmy(z uuid) returns table(firma uuid, nazwa text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(trim(p.nazwa_firmy), ''), nullif(trim(p.imie), ''), 'Firma remontowa')
  from public.profile p
  where exists (select 1 from public.zlecenia x where x.id = z and x.wlasciciel = auth.uid())
    and public.firma_w_zleceniu(z, p.id) $$;

revoke all on function public.szukaj_trzy_rozne_dni(timestamp[]), public.szukaj_zakres_ok(text[]), public.szukaj_sciezki_firmy(text[], uuid),
  public.wlasciciel_zlecenia(uuid), public.zlecenie_wystawione(uuid), public.odwolaj_spotkanie(uuid), public.firma_w_zleceniu(uuid, uuid),
  public.nowe_mieszkania(), public.pliki_zlecenia(uuid), public.firma_widzi_plik_zlecenia(text), public.widzi_realizacje(text),
  public.szukaj_firmy(uuid), public.szukaj_nowe_terminy() from public, anon;
grant execute on function public.szukaj_trzy_rozne_dni(timestamp[]), public.szukaj_zakres_ok(text[]), public.szukaj_sciezki_firmy(text[], uuid),
  public.wlasciciel_zlecenia(uuid), public.zlecenie_wystawione(uuid), public.odwolaj_spotkanie(uuid), public.firma_w_zleceniu(uuid, uuid),
  public.nowe_mieszkania(), public.pliki_zlecenia(uuid), public.firma_widzi_plik_zlecenia(text), public.widzi_realizacje(text),
  public.szukaj_firmy(uuid) to authenticated;

-- 5. Schowek plików: zdjęcia realizacji firmy i plan / zdjęcia mieszkania z wystawionego zlecenia
drop policy if exists realizacje_dodanie on storage.objects;
create policy realizacje_dodanie on storage.objects for insert to authenticated with check (
  bucket_id = 'biblioteka' and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'realizacje' and public.jest_firma());
drop policy if exists realizacje_wlasciciel_odczyt on storage.objects;
create policy realizacje_wlasciciel_odczyt on storage.objects for select to authenticated using (
  bucket_id = 'biblioteka' and public.widzi_realizacje(name));
drop policy if exists zlecenie_firma_odczyt on storage.objects;
create policy zlecenie_firma_odczyt on storage.objects for select to authenticated using (
  bucket_id = 'biblioteka' and public.firma_widzi_plik_zlecenia(name));
