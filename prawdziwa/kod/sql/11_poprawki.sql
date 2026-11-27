-- ===== Klocek 11: Poprawki (zgłoszenie ze zdjęciem, zdjęcie po poprawce od firmy, zatwierdzenie) =====
-- Wgrywane w Supabase po klockach 1–6. Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.
-- Kto co może:
--   Właściciel aplikacji: dodaje poprawkę, zatwierdza, cofa („Odznacz”), usuwa; może też sam dodać zdjęcie po poprawce.
--   Firma remontowa (aktywny dostęp): widzi poprawki, oznacza „zrobione” – tylko ze zdjęciem po poprawce; cofa swoje wysłanie,
--   dopóki poprawka nie jest zatwierdzona. Nie dodaje, nie zatwierdza, nie usuwa, nie zmienia treści.
--   Inne konta: nic nie widzą i nic nie zmieniają.

create table if not exists public.poprawki (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tresc text not null check (length(trim(tresc)) > 0 and length(tresc) <= 300),
  pomieszczenie uuid references public.pomieszczenia(id) on delete set null,
  praca uuid references public.prace(id) on delete set null,
  termin date,
  zgloszona_przez uuid references auth.users(id) on delete set null,
  zgloszona_kiedy timestamptz,
  zrobiona boolean not null default false,
  zrobiona_przez uuid references auth.users(id) on delete set null,
  zrobiona_kiedy timestamptz,
  zatwierdzona boolean not null default false,
  zatwierdzona_przez uuid references auth.users(id) on delete set null,
  zatwierdzona_kiedy timestamptz,
  utworzono timestamptz not null default now(),
  constraint poprawki_zatwierdzona_zrobiona check (not zatwierdzona or zrobiona)
);
create index if not exists poprawki_mieszkanie_idx on public.poprawki(mieszkanie);
create index if not exists poprawki_praca_idx on public.poprawki(praca);
alter table public.poprawki enable row level security;

-- Zdjęcia poprawki leżą w Bibliotece › Poprawki (folder 'poprawki'); 'przed' = zgłoszenie, 'po' = po poprawce
alter table public.pliki add column if not exists poprawka uuid references public.poprawki(id) on delete set null;
alter table public.pliki add column if not exists poprawka_etap text;
alter table public.pliki drop constraint if exists pliki_poprawka_etap_check;
alter table public.pliki add constraint pliki_poprawka_etap_check check (
  (poprawka_etap is null or poprawka_etap in ('przed','po')) and (poprawka is null or poprawka_etap is not null));
create index if not exists pliki_poprawka_idx on public.pliki(poprawka);

create or replace function public.sprawdz_zdjecie_poprawki() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.poprawka is not null and (tg_op = 'INSERT' or new.poprawka is distinct from old.poprawka) then
    if new.folder <> 'poprawki' then raise exception 'Zdjęcie poprawki musi być w folderze Poprawki'; end if;
    if not exists (select 1 from public.poprawki p where p.id = new.poprawka and p.mieszkanie = new.mieszkanie) then
      raise exception 'Ta poprawka nie należy do tego mieszkania';
    end if;
    if public.wlasciciel_mieszkania(new.mieszkanie) is distinct from auth.uid() and new.poprawka_etap <> 'po' then
      raise exception 'Firma dodaje tylko zdjęcie po poprawce';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pliki_zdjecie_poprawki on public.pliki;
create trigger pliki_zdjecie_poprawki before insert or update on public.pliki
  for each row execute function public.sprawdz_zdjecie_poprawki();

-- Kto i kiedy ustawia baza; firma tylko „zrobione” ze zdjęciem; zatwierdza tylko Właściciel aplikacji
create or replace function public.pilnuj_poprawki() returns trigger
language plpgsql security definer set search_path = public as $$
declare wl uuid := public.wlasciciel_mieszkania(new.mieszkanie);
        firma boolean := public.jest_firma_mieszkania(new.mieszkanie) and auth.uid() is distinct from wl;
begin
  if tg_op = 'INSERT' then
    if new.zrobiona or new.zatwierdzona then raise exception 'Nowa poprawka nie może być od razu zrobiona'; end if;
    new.wlasciciel := coalesce(wl, new.wlasciciel);
    new.zgloszona_przez := auth.uid(); new.zgloszona_kiedy := now();
    new.zrobiona_przez := null; new.zrobiona_kiedy := null; new.zatwierdzona_przez := null; new.zatwierdzona_kiedy := null;
  else
    if new.mieszkanie <> old.mieszkanie or new.wlasciciel <> old.wlasciciel then raise exception 'Poprawki nie można przenieść do innego mieszkania'; end if;
    if firma then
      if new.tresc is distinct from old.tresc or new.pomieszczenie is distinct from old.pomieszczenie
         or new.praca is distinct from old.praca or new.termin is distinct from old.termin
         or new.zatwierdzona is distinct from old.zatwierdzona then
        raise exception 'Firma może tylko oznaczyć poprawkę jako zrobioną (ze zdjęciem)';
      end if;
      if old.zatwierdzona and new.zrobiona is distinct from old.zrobiona then
        raise exception 'Ta poprawka jest już zatwierdzona. Zmienić ją może tylko Właściciel aplikacji';
      end if;
    end if;
    new.zgloszona_przez := old.zgloszona_przez; new.zgloszona_kiedy := old.zgloszona_kiedy;
    if new.zatwierdzona and not old.zatwierdzona and not new.zrobiona then
      raise exception 'Najpierw trzeba dodać zdjęcie po poprawce';
    end if;
    if new.zrobiona and not old.zrobiona then
      if not exists (select 1 from public.pliki f where f.poprawka = new.id and f.poprawka_etap = 'po') then
        raise exception 'Najpierw trzeba dodać zdjęcie po poprawce';
      end if;
      new.zrobiona_przez := auth.uid(); new.zrobiona_kiedy := now();
    elsif not new.zrobiona then
      new.zrobiona_przez := null; new.zrobiona_kiedy := null; new.zatwierdzona := false;
    else
      new.zrobiona_przez := old.zrobiona_przez; new.zrobiona_kiedy := old.zrobiona_kiedy;
    end if;
    if new.zatwierdzona and not old.zatwierdzona then
      new.zatwierdzona_przez := auth.uid(); new.zatwierdzona_kiedy := now();
    elsif not new.zatwierdzona then
      new.zatwierdzona_przez := null; new.zatwierdzona_kiedy := null;
    else
      new.zatwierdzona_przez := old.zatwierdzona_przez; new.zatwierdzona_kiedy := old.zatwierdzona_kiedy;
    end if;
  end if;
  if new.pomieszczenie is not null and (tg_op = 'INSERT' or new.pomieszczenie is distinct from old.pomieszczenie)
     and not exists (select 1 from public.pomieszczenia r where r.id = new.pomieszczenie and r.mieszkanie = new.mieszkanie) then
    raise exception 'To pomieszczenie nie należy do tego mieszkania';
  end if;
  if new.praca is not null and (tg_op = 'INSERT' or new.praca is distinct from old.praca)
     and not exists (select 1 from public.prace r where r.id = new.praca and r.mieszkanie = new.mieszkanie) then
    raise exception 'Ta praca nie należy do tego mieszkania';
  end if;
  return new;
end $$;
drop trigger if exists poprawki_pilnuj on public.poprawki;
create trigger poprawki_pilnuj before insert or update on public.poprawki
  for each row execute function public.pilnuj_poprawki();

-- Usunięto z Biblioteki ostatnie zdjęcie po poprawce, a poprawka nie jest zatwierdzona: wraca do „niezrobiona”
create or replace function public.poprawka_bez_zdjecia() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.poprawka is not null and old.poprawka_etap = 'po'
     and not exists (select 1 from public.pliki f where f.poprawka = old.poprawka and f.poprawka_etap = 'po' and f.id <> old.id) then
    update public.poprawki set zrobiona = false where id = old.poprawka and zrobiona and not zatwierdzona;
  end if;
  return old;
end $$;
drop trigger if exists pliki_poprawka_bez_zdjecia on public.pliki;
create trigger pliki_poprawka_bez_zdjecia after delete on public.pliki
  for each row execute function public.poprawka_bez_zdjecia();

-- Zasady dostępu
drop policy if exists poprawki_odczyt on public.poprawki;
create policy poprawki_odczyt on public.poprawki for select to authenticated using (public.ma_dostep(mieszkanie));
drop policy if exists poprawki_dodanie on public.poprawki;
create policy poprawki_dodanie on public.poprawki for insert to authenticated with check (
  public.wlasciciel_mieszkania(mieszkanie) = auth.uid() and wlasciciel = auth.uid());
drop policy if exists poprawki_zmiana on public.poprawki;
create policy poprawki_zmiana on public.poprawki for update to authenticated
  using (public.ma_dostep(mieszkanie)) with check (public.ma_dostep(mieszkanie));
drop policy if exists poprawki_usuniecie on public.poprawki;
create policy poprawki_usuniecie on public.poprawki for delete to authenticated using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());

revoke all on public.poprawki from anon;
revoke all on public.poprawki from authenticated;
grant select, insert, delete on public.poprawki to authenticated;
grant update (tresc, pomieszczenie, praca, termin, zrobiona, zatwierdzona) on public.poprawki to authenticated;
