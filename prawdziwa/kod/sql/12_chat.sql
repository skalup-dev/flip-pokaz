-- ===== Klocek 12: Chat z firmą (osobny dla każdego mieszkania) i Chat ogólny z firmami =====
-- Po klocku 6 (dostepy, ma_dostep, jest_firma_mieszkania, wlasciciel_mieszkania).
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.

-- 1. Chat przy mieszkaniu: rozmowa Właściciela aplikacji z jedną firmą (szefem firmy)
create table if not exists public.wiadomosci (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null references auth.users(id) on delete cascade,   -- Właściciel aplikacji (ustawia baza)
  firma uuid not null references auth.users(id) on delete cascade,        -- firma, z którą jest ta rozmowa
  autor uuid references auth.users(id) on delete set null,                -- kto napisał (ustawia baza)
  tresc text check (tresc is null or length(tresc) <= 2000),
  plik uuid references public.pliki(id) on delete set null,               -- zdjęcie w Bibliotece › Postępy prac
  zdjecie text,                                                           -- ścieżka zdjęcia (ustawia baza)
  utworzono timestamptz not null default now()                            -- kiedy (ustawia baza)
);
create index if not exists wiadomosci_mieszkanie_idx on public.wiadomosci(mieszkanie, firma, utworzono);
alter table public.wiadomosci enable row level security;

create or replace function public.wiadomosc_przed() returns trigger
language plpgsql security definer set search_path = public as $$
declare w uuid := public.wlasciciel_mieszkania(new.mieszkanie);
begin
  if auth.uid() is null then raise exception 'Najpierw trzeba się zalogować'; end if;
  if w is null then raise exception 'Nie ma takiego mieszkania'; end if;
  new.autor := auth.uid(); new.utworzono := now(); new.wlasciciel := w;
  new.tresc := nullif(trim(coalesce(new.tresc, '')), '');
  if auth.uid() = w then
    if new.firma is null then
      select d.firma into new.firma from public.dostepy d
       where d.mieszkanie = new.mieszkanie and d.aktywny and d.firma is not null order by d.przyjeto desc nulls last limit 1;
      if new.firma is null then raise exception 'To mieszkanie nie ma jeszcze firmy z dostępem. Chat ruszy, gdy szef firmy przyjmie zaproszenie'; end if;
    elsif not exists (select 1 from public.dostepy d where d.mieszkanie = new.mieszkanie and d.firma = new.firma and d.aktywny) then
      raise exception 'Ta firma nie ma teraz dostępu do mieszkania, więc nie można do niej pisać';
    end if;
  else
    new.firma := auth.uid();   -- firma pisze tylko we własnej rozmowie (zasady dostępu sprawdzają, czy ma dostęp)
  end if;
  if new.plik is not null then
    select f.sciezka into new.zdjecie from public.pliki f
     where f.id = new.plik and f.mieszkanie = new.mieszkanie and f.folder = 'postepy' and f.typ = 'zdjecie' and f.dodal = auth.uid();
    if new.zdjecie is null then raise exception 'To zdjęcie nie należy do tego mieszkania'; end if;
  else
    new.zdjecie := null;
  end if;
  if new.tresc is null and new.plik is null then raise exception 'Najpierw trzeba wpisać wiadomość albo dołączyć zdjęcie'; end if;
  return new;
end $$;
drop trigger if exists wiadomosci_przed on public.wiadomosci;
create trigger wiadomosci_przed before insert on public.wiadomosci
  for each row execute function public.wiadomosc_przed();

-- Właściciel aplikacji widzi wszystkie rozmowy swoich mieszkań; firma tylko swoją i tylko, gdy ma dostęp
drop policy if exists wiadomosci_odczyt on public.wiadomosci;
create policy wiadomosci_odczyt on public.wiadomosci for select to authenticated using (
  wlasciciel = auth.uid() or (firma = auth.uid() and public.jest_firma_mieszkania(mieszkanie)));
drop policy if exists wiadomosci_dodanie on public.wiadomosci;
create policy wiadomosci_dodanie on public.wiadomosci for insert to authenticated with check (
  autor = auth.uid() and public.ma_dostep(mieszkanie)
  and (wlasciciel = auth.uid() or (firma = auth.uid() and public.jest_firma_mieszkania(mieszkanie))));
revoke all on public.wiadomosci from anon;
grant select, insert on public.wiadomosci to authenticated;

-- 2. Chat ogólny: Właściciel aplikacji pisze do wszystkich swoich firm naraz, każda firma odpisuje tylko jemu
create table if not exists public.wiadomosci_ogolne (
  id uuid primary key default gen_random_uuid(),
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,  -- czyj to chat ogólny
  firma uuid references auth.users(id) on delete cascade,     -- puste: wiadomość Właściciela aplikacji do wszystkich firm
  autor uuid references auth.users(id) on delete set null,    -- ustawia baza
  tresc text not null check (length(trim(tresc)) between 1 and 2000),
  utworzono timestamptz not null default now()                -- ustawia baza
);
create index if not exists wiadomosci_ogolne_idx on public.wiadomosci_ogolne(wlasciciel, utworzono);
alter table public.wiadomosci_ogolne enable row level security;

-- Czy firma f ma teraz aktywny dostęp do któregoś mieszkania Właściciela aplikacji w
create or replace function public.wspolpracuje(w uuid, f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dostepy d where d.wlasciciel = w and d.firma = f and d.aktywny) $$;
revoke all on function public.wspolpracuje(uuid, uuid) from public, anon;
grant execute on function public.wspolpracuje(uuid, uuid) to authenticated;

create or replace function public.wiadomosc_ogolna_przed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Najpierw trzeba się zalogować'; end if;
  new.autor := auth.uid(); new.utworzono := now();
  new.tresc := trim(coalesce(new.tresc, ''));
  if new.tresc = '' then raise exception 'Najpierw trzeba wpisać wiadomość'; end if;
  if new.wlasciciel is null then new.wlasciciel := auth.uid(); end if;
  if new.wlasciciel = auth.uid() then new.firma := null; else new.firma := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists wiadomosci_ogolne_przed on public.wiadomosci_ogolne;
create trigger wiadomosci_ogolne_przed before insert on public.wiadomosci_ogolne
  for each row execute function public.wiadomosc_ogolna_przed();

drop policy if exists wiadomosci_ogolne_odczyt on public.wiadomosci_ogolne;
create policy wiadomosci_ogolne_odczyt on public.wiadomosci_ogolne for select to authenticated using (
  wlasciciel = auth.uid()
  or (public.wspolpracuje(wlasciciel, auth.uid()) and (firma is null or firma = auth.uid())));
drop policy if exists wiadomosci_ogolne_dodanie on public.wiadomosci_ogolne;
create policy wiadomosci_ogolne_dodanie on public.wiadomosci_ogolne for insert to authenticated with check (
  autor = auth.uid()
  and ((wlasciciel = auth.uid() and firma is null and not public.jest_firma())
       or (firma = auth.uid() and public.wspolpracuje(wlasciciel, auth.uid()))));
revoke all on public.wiadomosci_ogolne from anon;
grant select, insert on public.wiadomosci_ogolne to authenticated;
