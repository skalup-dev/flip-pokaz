-- Flip – prawdziwa wersja, klocek 4: Dodaj mieszkanie krokami (pomieszczenia, lista prac, wizualizacje)
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run (po klockach 1, 2 i 3)
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.

-- 1. Nowy podfolder Biblioteki: Zdjęcia › Wizualizacje
alter table public.pliki drop constraint if exists pliki_folder_check;
alter table public.pliki add constraint pliki_folder_check check (folder in (
  'faktury_firma','faktury_materialy','faktury_notariusz','faktury_posrednicy','faktury_inne',
  'paragony','plany','postepy','poprawki','zdjecia_po','zdjecia_przed','zdjecia_wiz'));

-- 2. Pomieszczenia mieszkania (krok 3)
create table if not exists public.pomieszczenia (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  rodzaj text not null check (rodzaj in ('Balkon','Korytarz','Kuchnia','Łazienka','Pokój','Salon','WC','Inne')),
  nazwa text not null check (length(trim(nazwa)) > 0 and length(nazwa) <= 60),
  metraz numeric(7,2) check (metraz is null or metraz > 0),
  utworzono timestamptz not null default now(),
  unique (id, mieszkanie)
);
create index if not exists pomieszczenia_mieszkanie_idx on public.pomieszczenia(mieszkanie);

-- 3. Lista prac (krok 4) – potrzebna w klocku 5: Lista prac
create table if not exists public.prace (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  pomieszczenie uuid not null,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  etap smallint not null check (etap between 1 and 7),
  nazwa text not null check (length(trim(nazwa)) > 0 and length(nazwa) <= 120),
  dopisana boolean not null default false,
  zrobiona boolean not null default false,
  utworzono timestamptz not null default now(),
  -- praca należy do pomieszczenia z TEGO SAMEGO mieszkania
  foreign key (pomieszczenie, mieszkanie) references public.pomieszczenia(id, mieszkanie) on delete cascade
);
create index if not exists prace_mieszkanie_idx on public.prace(mieszkanie);
create index if not exists prace_pomieszczenie_idx on public.prace(pomieszczenie);

-- 4. Zasady dostępu: każdy widzi i zmienia TYLKO swoje, dodaje tylko do swojego mieszkania
alter table public.pomieszczenia enable row level security;
alter table public.prace enable row level security;

drop policy if exists pomieszczenia_odczyt on public.pomieszczenia;
create policy pomieszczenia_odczyt on public.pomieszczenia for select to authenticated using (wlasciciel = auth.uid());
drop policy if exists pomieszczenia_dodanie on public.pomieszczenia;
create policy pomieszczenia_dodanie on public.pomieszczenia for insert to authenticated with check (
  wlasciciel = auth.uid()
  and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid()));
drop policy if exists pomieszczenia_zmiana on public.pomieszczenia;
create policy pomieszczenia_zmiana on public.pomieszczenia for update to authenticated
  using (wlasciciel = auth.uid()) with check (wlasciciel = auth.uid());
drop policy if exists pomieszczenia_usuniecie on public.pomieszczenia;
create policy pomieszczenia_usuniecie on public.pomieszczenia for delete to authenticated using (wlasciciel = auth.uid());

drop policy if exists prace_odczyt on public.prace;
create policy prace_odczyt on public.prace for select to authenticated using (wlasciciel = auth.uid());
drop policy if exists prace_dodanie on public.prace;
create policy prace_dodanie on public.prace for insert to authenticated with check (
  wlasciciel = auth.uid()
  and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid())
  and exists (select 1 from public.pomieszczenia p where p.id = pomieszczenie and p.wlasciciel = auth.uid()));
drop policy if exists prace_zmiana on public.prace;
create policy prace_zmiana on public.prace for update to authenticated
  using (wlasciciel = auth.uid()) with check (wlasciciel = auth.uid());
drop policy if exists prace_usuniecie on public.prace;
create policy prace_usuniecie on public.prace for delete to authenticated using (wlasciciel = auth.uid());

-- Pomieszczenia i prac nie da się przepisać na inne mieszkanie ani innego właściciela
revoke all on public.pomieszczenia from anon;
revoke all on public.prace from anon;
grant select, insert, delete on public.pomieszczenia to authenticated;
grant update (nazwa, metraz) on public.pomieszczenia to authenticated;
grant select, insert, delete on public.prace to authenticated;
grant update (nazwa, etap, zrobiona) on public.prace to authenticated;
