-- =====================================================================================
-- Flip – prawdziwa wersja: plik zbiorczy klocków 6–15 (06_reszta.sql)
-- Wgrywane w Supabase: SQL Editor -> wklej całość -> Run (po klockach 1–5).
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.
-- Kolejność: 6 szef firmy, 7 paragony, 9 terminy, 10 płatności, 11 poprawki, 12 chat,
--            14 ilości, 15 szukaj ekipy, 13 powiadomienia (na końcu – podpina się do tabel wyżej).
-- Klocek 8 (pieniądze) nie potrzebuje osobnego SQL – jego pola są w części klocka 6.
-- =====================================================================================


-- ===================== sql/06_szef_firmy.sql =====================
-- ===== Klocek 6: szef firmy (zaproszenie linkiem, dostęp, widok firmy) =====

-- Zaproszenia i dostęp firmy do mieszkania
create table if not exists public.dostepy (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kod uuid not null unique default gen_random_uuid(),
  firma uuid references auth.users(id) on delete set null,
  aktywny boolean not null default true,
  utworzono timestamptz not null default now(),
  przyjeto timestamptz
);
create index if not exists dostepy_mieszkanie_idx on public.dostepy(mieszkanie);
create index if not exists dostepy_firma_idx on public.dostepy(firma);
alter table public.dostepy enable row level security;

-- Wspólne funkcje dostępu (używają ich wszystkie klocki 6–15)
create or replace function public.wlasciciel_mieszkania(m uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select wlasciciel from public.mieszkania where id = m $$;
create or replace function public.jest_firma_mieszkania(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dostepy d where d.mieszkanie = m and d.firma = auth.uid() and d.aktywny) $$;
create or replace function public.ma_dostep(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mieszkania x where x.id = m and x.wlasciciel = auth.uid())
      or exists (select 1 from public.dostepy d where d.mieszkanie = m and d.firma = auth.uid() and d.aktywny) $$;
create or replace function public.jest_firma() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profile p where p.id = auth.uid() and p.rola = 'firma') $$;
revoke all on function public.wlasciciel_mieszkania(uuid), public.jest_firma_mieszkania(uuid), public.ma_dostep(uuid), public.jest_firma() from public, anon;
grant execute on function public.wlasciciel_mieszkania(uuid), public.jest_firma_mieszkania(uuid), public.ma_dostep(uuid), public.jest_firma() to authenticated;

drop policy if exists dostepy_wlasciciel on public.dostepy;
create policy dostepy_wlasciciel on public.dostepy for all to authenticated
  using (wlasciciel = auth.uid())
  with check (wlasciciel = auth.uid() and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid()));
drop policy if exists dostepy_firma on public.dostepy;
create policy dostepy_firma on public.dostepy for select to authenticated using (firma = auth.uid());
revoke all on public.dostepy from anon;
grant select, insert, delete on public.dostepy to authenticated;
grant update (aktywny) on public.dostepy to authenticated;

-- Przyjęcie zaproszenia (link z kodem). Konto z własnymi mieszkaniami nie może zostać kontem firmy.
create or replace function public.przyjmij_zaproszenie(k uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d public.dostepy; m public.mieszkania;
begin
  if auth.uid() is null then raise exception 'Najpierw trzeba się zalogować'; end if;
  select * into d from public.dostepy where kod = k;
  if not found then raise exception 'Ten link zaproszenia jest nieprawidłowy'; end if;
  if not d.aktywny then raise exception 'Dostęp z tego zaproszenia został zabrany'; end if;
  if d.firma is not null and d.firma <> auth.uid() then raise exception 'To zaproszenie zostało już przyjęte przez inną firmę'; end if;
  if exists (select 1 from public.mieszkania x where x.wlasciciel = auth.uid()) then
    raise exception 'To konto ma własne mieszkania, więc nie może zostać kontem firmy. Szef firmy potrzebuje osobnego konta';
  end if;
  select * into m from public.mieszkania where id = d.mieszkanie;
  update public.dostepy set firma = auth.uid(), przyjeto = coalesce(przyjeto, now()) where id = d.id;
  update public.profile set rola = 'firma', nazwa_firmy = coalesce(nullif(trim(nazwa_firmy), ''), m.firma_remontowa)
    where id = auth.uid();
  return d.mieszkanie;
end $$;
revoke all on function public.przyjmij_zaproszenie(uuid) from public, anon;
grant execute on function public.przyjmij_zaproszenie(uuid) to authenticated;

-- Mieszkania szefa firmy: tylko to, co mu wolno (bez zakupu, budżetu, opisu)
create or replace function public.zlecenia_firmy() returns table(id uuid, ulica text, miasto text, metraz numeric, data_startu date, termin_konca date, firma_remontowa text, wlasciciel uuid)
language sql stable security definer set search_path = public as $$
  select m.id, m.ulica, m.miasto, m.metraz, m.data_startu, m.termin_konca, m.firma_remontowa, m.wlasciciel
  from public.mieszkania m join public.dostepy d on d.mieszkanie = m.id
  where d.firma = auth.uid() and d.aktywny $$;
revoke all on function public.zlecenia_firmy() from public, anon;
grant execute on function public.zlecenia_firmy() to authenticated;

-- Firma widzi pomieszczenia i prace swojego mieszkania; odznacza prace (podpis: nazwa firmy)
drop policy if exists pomieszczenia_firma on public.pomieszczenia;
create policy pomieszczenia_firma on public.pomieszczenia for select to authenticated using (public.jest_firma_mieszkania(mieszkanie));
drop policy if exists prace_firma_odczyt on public.prace;
create policy prace_firma_odczyt on public.prace for select to authenticated using (public.jest_firma_mieszkania(mieszkanie));
drop policy if exists prace_firma_zmiana on public.prace;
create policy prace_firma_zmiana on public.prace for update to authenticated
  using (public.jest_firma_mieszkania(mieszkanie)) with check (public.jest_firma_mieszkania(mieszkanie));

-- Pliki: firma widzi plany, postępy, poprawki, zdjęcia i paragony swojego mieszkania (bez faktur);
-- dodaje postępy, poprawki i paragony (plik należy do Właściciela aplikacji, „dodał” = firma)
drop policy if exists pliki_firma_odczyt on public.pliki;
create policy pliki_firma_odczyt on public.pliki for select to authenticated using (
  public.jest_firma_mieszkania(mieszkanie)
  and folder in ('plany','postepy','poprawki','zdjecia_po','zdjecia_przed','zdjecia_wiz','paragony'));
drop policy if exists pliki_firma_dodanie on public.pliki;
create policy pliki_firma_dodanie on public.pliki for insert to authenticated with check (
  public.jest_firma_mieszkania(mieszkanie) and wlasciciel = public.wlasciciel_mieszkania(mieszkanie)
  and folder in ('postepy','poprawki','paragony'));

create or replace function public.firma_widzi_plik(sc text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pliki f where f.sciezka = sc and public.jest_firma_mieszkania(f.mieszkanie)
    and f.folder in ('plany','postepy','poprawki','zdjecia_po','zdjecia_przed','zdjecia_wiz','paragony')) $$;
create or replace function public.firma_moze_wgrac(sc text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cz text[] := string_to_array(sc, '/'); m uuid;
begin
  if array_length(cz, 1) <> 4 then return false; end if;
  begin m := cz[2]::uuid; exception when others then return false; end;
  return public.jest_firma_mieszkania(m) and cz[1] = public.wlasciciel_mieszkania(m)::text and cz[3] in ('postepy','poprawki','paragony');
end $$;
revoke all on function public.firma_widzi_plik(text), public.firma_moze_wgrac(text) from public, anon;
grant execute on function public.firma_widzi_plik(text), public.firma_moze_wgrac(text) to authenticated;

drop policy if exists biblioteka_firma_odczyt on storage.objects;
create policy biblioteka_firma_odczyt on storage.objects for select to authenticated using (
  bucket_id = 'biblioteka' and public.firma_widzi_plik(name));
drop policy if exists biblioteka_firma_dodanie on storage.objects;
create policy biblioteka_firma_dodanie on storage.objects for insert to authenticated with check (
  bucket_id = 'biblioteka' and public.firma_moze_wgrac(name));

-- Podpisy „Odznaczone przez” / „dodane przez”: też firma ↔ Właściciel aplikacji wspólnego mieszkania
create or replace function public.kto_nazwy(ids uuid[]) returns table(id uuid, nazwa text)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(trim(case when p.rola = 'firma' then p.nazwa_firmy else p.imie end), ''),
                  case when p.rola = 'firma' then 'Firma remontowa' else 'Właściciel aplikacji' end)
  from public.profile p
  where p.id = any(ids)
    and (p.id = auth.uid()
         or exists (select 1 from public.prace r where r.zrobiona_przez = p.id and public.ma_dostep(r.mieszkanie))
         or exists (select 1 from public.pliki f where f.dodal = p.id and public.ma_dostep(f.mieszkanie))
         or exists (select 1 from public.dostepy d where d.firma = p.id and d.wlasciciel = auth.uid())
         or exists (select 1 from public.dostepy d where d.wlasciciel = p.id and d.firma = auth.uid() and d.aktywny));
$$;

-- Pola pieniędzy mieszkania (używają ich klocki 7, 8, 10). Firma ich nie widzi (zlecenia_firmy ich nie zwraca).
alter table public.mieszkania add column if not exists cena_zakupu numeric(12,2) check (cena_zakupu is null or cena_zakupu >= 0);
alter table public.mieszkania add column if not exists cena_firmy_m2 numeric(10,2) check (cena_firmy_m2 is null or cena_firmy_m2 >= 0);
alter table public.mieszkania add column if not exists budzet_materialow numeric(12,2) check (budzet_materialow is null or budzet_materialow >= 0);

-- ===================== sql/07_paragony.sql =====================
-- ===== Klocek 7: Paragony i materiały (dokumenty zakupów przy mieszkaniu) =====
-- Wgrywane w Supabase po sql/06_szef_firmy.sql. Można uruchomić kilka razy, niczego nie usuwa z danych.
-- Zdjęcie dokumentu leży w Bibliotece › Paragony (tabela pliki, folder 'paragony'),
-- a tu są dane z dokumentu: sklep, co kupiono, kwota, data, kto zapłacił, kto dodał, czy sprawdzone.
-- Do budżetu materiałów (wydane) wchodzą tylko dokumenty „Sprawdzone”; „Do sprawdzenia” aplikacja pokazuje osobno jako „czeka”.
-- Klocek 8 (Pieniądze) nie potrzebuje nowych tabel: używa kolumn mieszkania z 06 i sum z tej tabeli.

create table if not exists public.paragony (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  wlasciciel uuid not null references auth.users(id) on delete cascade,      -- zawsze Właściciel aplikacji (właściciel mieszkania)
  dodal uuid default auth.uid() references auth.users(id) on delete set null, -- kto dodał (Właściciel aplikacji albo szef firmy)
  plik uuid references public.pliki(id) on delete set null,                  -- zdjęcie albo PDF dokumentu w Bibliotece › Paragony
  sklep text not null check (length(trim(sklep)) between 1 and 120),
  co text check (co is null or length(co) <= 300),
  kwota numeric(12,2) not null check (kwota >= 0),
  data date not null default current_date,
  zaplacil text not null default 'firma' check (zaplacil in ('firma','wlasciciel')),
  sprawdzone boolean not null default false,
  sprawdzil uuid references auth.users(id) on delete set null,
  sprawdzono timestamptz,
  utworzono timestamptz not null default now()
);
-- Odczyt ze zdjęcia (Tesseract w telefonie, później ewentualnie AI). Ręczne wpisanie = 'reczny'.
alter table public.paragony add column if not exists nip text check (nip is null or nip ~ '^[0-9]{10}$');
alter table public.paragony add column if not exists tekst_surowy text check (tekst_surowy is null or length(tekst_surowy) <= 20000);
alter table public.paragony add column if not exists zrodlo_odczytu text not null default 'reczny' check (zrodlo_odczytu in ('reczny','tesseract','ai'));
alter table public.paragony add column if not exists pewnosc smallint check (pewnosc is null or pewnosc between 0 and 100);
alter table public.paragony add column if not exists pola_niepewne text[] not null default '{}'
  check (pola_niepewne <@ array['sklep','co','kwota','data','nip','pozycje']::text[]);
alter table public.paragony add column if not exists pozycje jsonb not null default '[]'::jsonb
  check (jsonb_typeof(pozycje) = 'array' and jsonb_array_length(pozycje) <= 200);
create index if not exists paragony_mieszkanie_idx on public.paragony(mieszkanie);
create index if not exists paragony_plik_idx on public.paragony(plik);
alter table public.paragony enable row level security;

-- Pilnuje zasad niezależnie od tego, co wyśle aplikacja:
-- właściciel wiersza = właściciel mieszkania, „dodał” = zalogowana osoba,
-- firma dodaje tylko paragony zapłacone przez firmę i zawsze „do sprawdzenia”,
-- zdjęcie musi być z folderu Paragony tego samego mieszkania, „kto i kiedy sprawdził” ustawia baza.
create or replace function public.paragony_pilnuj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.wlasciciel := public.wlasciciel_mieszkania(new.mieszkanie);
    new.dodal := auth.uid();
    if new.wlasciciel is distinct from auth.uid() then   -- szef firmy
      new.zaplacil := 'firma';
      new.sprawdzone := false;
    end if;
  else
    new.mieszkanie := old.mieszkanie; new.wlasciciel := old.wlasciciel; new.dodal := old.dodal; new.utworzono := old.utworzono;
    new.tekst_surowy := old.tekst_surowy; new.zrodlo_odczytu := old.zrodlo_odczytu; new.pewnosc := old.pewnosc; new.pozycje := old.pozycje;
    if new.plik is distinct from old.plik and new.plik is not null then new.plik := old.plik; end if;   -- zdjęcia nie da się podmienić, można je tylko stracić (usunięcie z Biblioteki)
  end if;
  if new.plik is not null and not exists (
       select 1 from public.pliki f where f.id = new.plik and f.mieszkanie = new.mieszkanie and f.folder = 'paragony') then
    raise exception 'Zdjęcie dokumentu musi być w Bibliotece › Paragony tego mieszkania';
  end if;
  if new.sprawdzone and (tg_op = 'INSERT' or not old.sprawdzone) then
    new.sprawdzil := auth.uid(); new.sprawdzono := now();
  elsif not new.sprawdzone then
    new.sprawdzil := null; new.sprawdzono := null;
  else
    new.sprawdzil := old.sprawdzil; new.sprawdzono := old.sprawdzono;
  end if;
  return new;
end $$;
revoke all on function public.paragony_pilnuj() from public, anon;
drop trigger if exists paragony_pilnuj on public.paragony;
create trigger paragony_pilnuj before insert or update on public.paragony
  for each row execute function public.paragony_pilnuj();

-- Właściciel aplikacji: widzi, dodaje, poprawia, sprawdza i usuwa dokumenty swoich mieszkań
drop policy if exists paragony_wlasciciel on public.paragony;
create policy paragony_wlasciciel on public.paragony for all to authenticated
  using (wlasciciel = auth.uid())
  with check (wlasciciel = auth.uid() and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid()));
-- Szef firmy (aktywny dostęp): widzi dokumenty zapłacone przez firmę albo dodane przez siebie, dodaje nowe.
-- Nie poprawia i nie usuwa (brak zasad update/delete dla firmy).
drop policy if exists paragony_firma_odczyt on public.paragony;
create policy paragony_firma_odczyt on public.paragony for select to authenticated
  using (public.jest_firma_mieszkania(mieszkanie) and (zaplacil = 'firma' or dodal = auth.uid()));
drop policy if exists paragony_firma_dodanie on public.paragony;
create policy paragony_firma_dodanie on public.paragony for insert to authenticated
  with check (public.jest_firma_mieszkania(mieszkanie) and wlasciciel = public.wlasciciel_mieszkania(mieszkanie)
              and zaplacil = 'firma' and not sprawdzone);

revoke all on public.paragony from anon, public;
grant select, insert, delete on public.paragony to authenticated;
grant update (sklep, co, kwota, data, zaplacil, sprawdzone, nip, pola_niepewne) on public.paragony to authenticated;

-- ===================== sql/09_terminy.sql =====================
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

-- ===================== sql/10_platnosci.sql =====================
-- ===== Klocek 10: Płatności dla firmy =====
-- Wgrywane w Supabase po sql/09_terminy.sql. Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.
-- Umowa z firmą = mieszkania.cena_firmy_m2 × mieszkania.metraz (kolumny z sql/06_szef_firmy.sql).
-- Płatność łączy etapy (terminy). Każdy etap może być tylko w jednej płatności.

create table if not exists public.platnosci (
  id uuid primary key default gen_random_uuid(),
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  nr integer not null default 1 check (nr >= 1),
  kwota numeric(12,2) not null check (kwota > 0),
  zaplacona boolean not null default false,
  zaplacona_kiedy timestamptz,
  utworzono timestamptz not null default now(),
  unique (id, mieszkanie)
);
create index if not exists platnosci_mieszkanie_idx on public.platnosci(mieszkanie);

-- Etapy w płatności. Klucz główny = etap, więc etap może być tylko w jednej płatności.
create table if not exists public.platnosci_etapy (
  termin uuid primary key,
  platnosc uuid not null,
  mieszkanie uuid not null references public.mieszkania(id) on delete cascade,
  -- płatność i etap muszą być z tego samego mieszkania
  foreign key (platnosc, mieszkanie) references public.platnosci(id, mieszkanie) on delete cascade,
  foreign key (termin, mieszkanie) references public.terminy(id, mieszkanie)
);
create index if not exists platnosci_etapy_platnosc_idx on public.platnosci_etapy(platnosc);
create index if not exists platnosci_etapy_mieszkanie_idx on public.platnosci_etapy(mieszkanie);

alter table public.platnosci enable row level security;
alter table public.platnosci_etapy enable row level security;

-- Odczyt: Właściciel aplikacji i firma z dostępem. Zmiana „zapłacone”: tylko Właściciel aplikacji.
-- Dodawanie, zmiana kwot i etapów, usuwanie: tylko przez funkcję zapisz_platnosci (sprawdza właściciela).
drop policy if exists platnosci_odczyt on public.platnosci;
create policy platnosci_odczyt on public.platnosci for select to authenticated using (public.ma_dostep(mieszkanie));
drop policy if exists platnosci_zmiana on public.platnosci;
create policy platnosci_zmiana on public.platnosci for update to authenticated
  using (public.wlasciciel_mieszkania(mieszkanie) = auth.uid()) with check (public.wlasciciel_mieszkania(mieszkanie) = auth.uid());
drop policy if exists platnosci_etapy_odczyt on public.platnosci_etapy;
create policy platnosci_etapy_odczyt on public.platnosci_etapy for select to authenticated using (public.ma_dostep(mieszkanie));

revoke all on public.platnosci, public.platnosci_etapy from anon, public;
grant select on public.platnosci, public.platnosci_etapy to authenticated;
grant update (zaplacona) on public.platnosci to authenticated;

-- Data zapłaty ustawia baza
create or replace function public.platnosc_kiedy() returns trigger
language plpgsql as $$
begin
  if new.zaplacona and not old.zaplacona then new.zaplacona_kiedy := now();
  elsif not new.zaplacona then new.zaplacona_kiedy := null;
  else new.zaplacona_kiedy := old.zaplacona_kiedy; end if;
  return new;
end $$;
drop trigger if exists platnosci_kiedy on public.platnosci;
create trigger platnosci_kiedy before update on public.platnosci
  for each row execute function public.platnosc_kiedy();

-- Etapu, który jest w płatności, nie da się usunąć (najpierw trzeba go zdjąć z płatności)
create or replace function public.blokuj_usuniecie_terminu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.platnosci_etapy e where e.termin = old.id)
     and exists (select 1 from public.mieszkania m where m.id = old.mieszkanie) then
    raise exception 'Ten etap jest w płatności. Najpierw trzeba go zdjąć z płatności w „Ustal płatności”';
  end if;
  return old;
end $$;
revoke all on function public.blokuj_usuniecie_terminu() from public, anon;
drop trigger if exists terminy_w_platnosci on public.terminy;
create trigger terminy_w_platnosci before delete on public.terminy
  for each row execute function public.blokuj_usuniecie_terminu();

-- Zapis wszystkich płatności mieszkania naraz („Ustal płatności”).
-- dane = [{"id": uuid albo null, "kwota": liczba, "etapy": [uuid terminu, ...]}, ...] w kolejności płatności.
-- Płatność zapłacona, której zmieniono kwotę albo etapy, przestaje być zapłacona.
create or replace function public.zapisz_platnosci(m uuid, dane jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  p jsonb; i integer := 0; pid uuid; kw numeric(12,2); et uuid[]; stare uuid[]; wszystkie uuid[] := '{}'; zostaja uuid[] := '{}'; zmienione uuid[] := '{}';
begin
  if auth.uid() is null or public.wlasciciel_mieszkania(m) is distinct from auth.uid() then
    raise exception 'Płatności ustala tylko Właściciel aplikacji tego mieszkania';
  end if;
  if dane is null or jsonb_typeof(dane) <> 'array' or jsonb_array_length(dane) = 0 then
    raise exception 'Trzeba dodać co najmniej jedną płatność';
  end if;
  for p in select * from jsonb_array_elements(dane) loop
    kw := nullif(p->>'kwota', '')::numeric(12,2);
    if kw is null or kw <= 0 then raise exception 'Każda płatność musi mieć kwotę większą od zera'; end if;
    et := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p->'etapy', '[]')) x);
    if coalesce(array_length(et, 1), 0) = 0 then raise exception 'Każda płatność musi mieć zaznaczony co najmniej jeden etap'; end if;
    if wszystkie && et then raise exception 'Etap może być tylko w jednej płatności'; end if;
    if exists (select 1 from unnest(et) t where not exists (select 1 from public.terminy x where x.id = t and x.mieszkanie = m)) then
      raise exception 'Etap nie należy do tego mieszkania';
    end if;
    wszystkie := wszystkie || et;
    pid := nullif(p->>'id', '')::uuid;
    if pid = any(zostaja) then raise exception 'Ta sama płatność jest podana dwa razy'; end if;
    if pid is not null and exists (select 1 from public.platnosci where id = pid and mieszkanie = m) then
      zostaja := zostaja || pid;
      stare := array(select termin from public.platnosci_etapy where platnosc = pid order by 1);
      if stare is distinct from array(select unnest(et) order by 1)
         or (select kwota from public.platnosci where id = pid) is distinct from kw then
        zmienione := zmienione || pid;
      end if;
    end if;
  end loop;

  delete from public.platnosci where mieszkanie = m and not (id = any(zostaja));
  for p in select * from jsonb_array_elements(dane) loop
    i := i + 1;
    kw := (p->>'kwota')::numeric(12,2);
    et := array(select distinct x::uuid from jsonb_array_elements_text(p->'etapy') x order by 1);
    pid := nullif(p->>'id', '')::uuid;
    if pid is not null and pid = any(zostaja) then
      update public.platnosci set nr = i, kwota = kw,
        zaplacona = case when pid = any(zmienione) then false else zaplacona end
        where id = pid;
    else
      insert into public.platnosci(mieszkanie, nr, kwota) values (m, i, kw) returning id into pid;
    end if;
    delete from public.platnosci_etapy where platnosc = pid and not (termin = any(et));
    delete from public.platnosci_etapy where mieszkanie = m and termin = any(et) and platnosc <> pid;
    insert into public.platnosci_etapy(termin, platnosc, mieszkanie) select t, pid, m from unnest(et) t
      on conflict (termin) do nothing;
  end loop;
end $$;
revoke all on function public.zapisz_platnosci(uuid, jsonb) from public, anon;
grant execute on function public.zapisz_platnosci(uuid, jsonb) to authenticated;

-- Umowa z firmą: cena za m², metraż i kwota. Firma nie czyta tabeli mieszkania, więc dostaje tylko te liczby.
create or replace function public.umowa_mieszkania(m uuid) returns table(cena_firmy_m2 numeric, metraz numeric, kwota numeric)
language sql stable security definer set search_path = public as $$
  select x.cena_firmy_m2, x.metraz, round(x.cena_firmy_m2 * x.metraz, 2)
  from public.mieszkania x where x.id = m and public.ma_dostep(m) $$;
revoke all on function public.umowa_mieszkania(uuid) from public, anon;
grant execute on function public.umowa_mieszkania(uuid) to authenticated;

-- ===================== sql/11_poprawki.sql =====================
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

-- ===================== sql/12_chat.sql =====================
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

-- ===================== sql/14_ilosci.sql =====================
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

-- ===================== sql/15_szukaj.sql =====================
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

-- ===================== sql/13_powiadomienia.sql =====================
-- ===== Klocek 13: Powiadomienia (dzwonek) =====
-- Na końcu pliku zbiorczego: po klockach 6–12 (i 7–11, jeśli już są).
-- Zdarzenia zapisuje sama baza (triggery). Aplikacja tylko je czyta i oznacza jako przeczytane.
-- Triggery na tabelach innych klocków (dokumenty, poprawki, etapy, platnosci) powstają tylko wtedy,
-- gdy te tabele już są. Po dodaniu takiej tabeli wystarczy uruchomić ten plik jeszcze raz.
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.

-- 1. Zdarzenia: każde należy do jednej osoby (odbiorcy)
create table if not exists public.zdarzenia (
  id uuid primary key default gen_random_uuid(),
  odbiorca uuid not null references auth.users(id) on delete cascade,
  mieszkanie uuid references public.mieszkania(id) on delete cascade,
  rodzaj text not null check (rodzaj in ('etap','faktura','ogolny','opoznienie','paragon','platnosc','poprawka','praca','wiadomosc')),
  tresc text not null check (length(tresc) <= 400),
  cel text,          -- które miejsce otworzyć: chat, ogolny, listaPrac, biblioteka, mieszkanie, paragony, poprawki, terminy, platnosci
  cel_id text,       -- doprecyzowanie: pomieszczenie, folder Biblioteki, firma w chacie, Właściciel w chacie ogólnym
  autor uuid references auth.users(id) on delete set null,
  klucz text,        -- to samo zdarzenie nie powstaje dwa razy (np. „Etap skończony” danego etapu)
  przeczytane boolean not null default false,
  utworzono timestamptz not null default now()
);
create index if not exists zdarzenia_odbiorca_idx on public.zdarzenia(odbiorca, przeczytane, utworzono desc);
create unique index if not exists zdarzenia_klucz_idx on public.zdarzenia(odbiorca, klucz) where klucz is not null;
alter table public.zdarzenia enable row level security;

drop policy if exists zdarzenia_odczyt on public.zdarzenia;
create policy zdarzenia_odczyt on public.zdarzenia for select to authenticated using (odbiorca = auth.uid());
drop policy if exists zdarzenia_przeczytane on public.zdarzenia;
create policy zdarzenia_przeczytane on public.zdarzenia for update to authenticated
  using (odbiorca = auth.uid()) with check (odbiorca = auth.uid());
revoke all on public.zdarzenia from anon, authenticated;
grant select on public.zdarzenia to authenticated;
grant update (przeczytane) on public.zdarzenia to authenticated;

-- 2. Ustawienia powiadomień (pod dzwonkiem)
create table if not exists public.ustawienia_powiadomien (
  konto uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  dzwonek boolean not null default true,    -- dzwonek w aplikacji: wszystkie zdarzenia
  telefon boolean not null default true,    -- powiadomienie na telefonie z dźwiękiem (działa po podłączeniu usługi)
  telegram boolean not null default true,   -- Telegram: tylko „Etap skończony” (działa po podłączeniu robota)
  telegram_chat_id text,                    -- numer rozmowy na Telegramie, wpisuje go robot (nie aplikacja)
  zmieniono timestamptz not null default now()
);
alter table public.ustawienia_powiadomien enable row level security;
drop policy if exists ustawienia_swoje on public.ustawienia_powiadomien;
create policy ustawienia_swoje on public.ustawienia_powiadomien for all to authenticated
  using (konto = auth.uid()) with check (konto = auth.uid());
create or replace function public.ustawienia_zmieniono() returns trigger
language plpgsql as $$ begin new.zmieniono := now(); if tg_op = 'INSERT' then new.telegram_chat_id := null; end if; return new; end $$;
drop trigger if exists ustawienia_powiadomien_zmieniono on public.ustawienia_powiadomien;
create trigger ustawienia_powiadomien_zmieniono before insert or update on public.ustawienia_powiadomien
  for each row execute function public.ustawienia_zmieniono();
revoke all on public.ustawienia_powiadomien from anon, authenticated;
grant select on public.ustawienia_powiadomien to authenticated;
grant insert (konto, dzwonek, telefon, telegram), update (dzwonek, telefon, telegram) on public.ustawienia_powiadomien to authenticated;

-- 3. Funkcje wewnętrzne (wołają je tylko triggery, aplikacja nie ma do nich dostępu)
create or replace function public.nazwa_konta(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(case when p.rola = 'firma' then p.nazwa_firmy else p.imie end), '')
                   from public.profile p where p.id = u),
                  case when exists (select 1 from public.profile p where p.id = u and p.rola = 'firma') then 'Firma remontowa' else 'Właściciel aplikacji' end) $$;

create or replace function public.skrot(t text, n int default 80) returns text
language sql immutable as $$ select case when length(t) > n then left(t, n - 1) || '…' else t end $$;

-- Dodaje zdarzenie jednej osobie. Osoba, która coś zrobiła, nie dostaje powiadomienia o sobie samej.
create or replace function public.dodaj_zdarzenie(odb uuid, m uuid, rodz text, tr text, c text default null, cid text default null,
                                                  kl text default null, tez_sobie boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if odb is null or (odb = auth.uid() and not tez_sobie) then return; end if;
  insert into public.zdarzenia(odbiorca, mieszkanie, rodzaj, tresc, cel, cel_id, autor, klucz)
  values (odb, m, rodz, public.skrot(tr, 400), c, cid, auth.uid(), kl)
  on conflict (odbiorca, klucz) where klucz is not null do nothing;
end $$;

-- Powiadamia osoby mieszkania: Właściciela aplikacji i (gdy dla_firmy) firmy z aktywnym dostępem, bez osoby, która to zrobiła
create or replace function public.powiadom_mieszkanie(m uuid, rodz text, tr text, c text default null, cid text default null,
                                                      dla_firmy boolean default true, kl text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  perform public.dodaj_zdarzenie(public.wlasciciel_mieszkania(m), m, rodz, tr, c, cid, kl);
  if dla_firmy then
    for o in select distinct d.firma from public.dostepy d where d.mieszkanie = m and d.aktywny and d.firma is not null loop
      perform public.dodaj_zdarzenie(o, m, rodz, tr, c, cid, kl);
    end loop;
  end if;
end $$;
revoke all on function public.nazwa_konta(uuid), public.skrot(text, int),
  public.dodaj_zdarzenie(uuid, uuid, text, text, text, text, text, boolean),
  public.powiadom_mieszkanie(uuid, text, text, text, text, boolean, text) from public, anon, authenticated;

-- 4. Zdarzenia z tabel, które na pewno są
-- 4a. Odznaczona praca, a gdy to ostatnia praca etapu w mieszkaniu: „Etap skończony”
create or replace function public.zdarzenie_pracy() returns trigger
language plpgsql security definer set search_path = public as $$
declare pom text; etapy text[] := array['Rozbiórki i przygotowanie','Elektryka','Hydraulika','Ściany i sufity',
  'Łazienka – płytki i biały montaż','Podłogi i drzwi','Kuchnia, lampy i sprzątanie'];
begin
  if new.zrobiona and not old.zrobiona then
    begin
      select nazwa into pom from public.pomieszczenia where id = new.pomieszczenie;
      perform public.powiadom_mieszkanie(new.mieszkanie, 'praca',
        'Praca odznaczona: ' || coalesce(pom || ', ', '') || new.nazwa || ' (' || public.nazwa_konta(auth.uid()) || ')',
        'listaPrac', new.pomieszczenie::text);
      if not exists (select 1 from public.prace p where p.mieszkanie = new.mieszkanie and p.etap = new.etap and not p.zrobiona and p.id <> new.id) then
        perform public.powiadom_mieszkanie(new.mieszkanie, 'etap',
          'Etap skończony: ' || new.etap || '. ' || coalesce(etapy[new.etap], 'etap'),
          'terminy', null, true, 'etap:' || new.mieszkanie || ':' || new.etap);
        -- osoba, która skończyła etap, też dostaje „Etap skończony” (to zdarzenie idzie też na Telegram)
        perform public.dodaj_zdarzenie(auth.uid(), new.mieszkanie, 'etap',
          'Etap skończony: ' || new.etap || '. ' || coalesce(etapy[new.etap], 'etap'),
          'terminy', null, 'etap:' || new.mieszkanie || ':' || new.etap, true);
      end if;
    exception when others then raise warning 'Powiadomienie o pracy nie powstało: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists prace_zdarzenie on public.prace;
create trigger prace_zdarzenie after update of zrobiona on public.prace
  for each row execute function public.zdarzenie_pracy();

-- 4b. Pliki w Bibliotece: faktury (tylko Właściciel aplikacji), paragony, zdjęcia poprawek.
--     Gdy są już tabele klocków 7 (dokumenty) i 11 (poprawki), zdarzenia idą z tamtych tabel, nie stąd.
create or replace function public.zdarzenie_pliku() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := public.nazwa_konta(auth.uid());
begin
  begin
    if new.folder like 'faktury%' then   -- faktury nie mają tabeli dokumentów: zdarzenie zawsze z pliku
      perform public.powiadom_mieszkanie(new.mieszkanie, 'faktura', 'Nowa faktura: ' || new.nazwa || ' (' || k || ')', 'biblioteka', new.folder, false);
    elsif new.folder = 'paragony' and to_regclass('public.paragony') is null then
      perform public.powiadom_mieszkanie(new.mieszkanie, 'paragon', 'Nowy paragon: ' || new.nazwa || ' (' || k || ')', 'biblioteka', new.folder);
    elsif new.folder = 'poprawki' and to_regclass('public.poprawki') is null then
      perform public.powiadom_mieszkanie(new.mieszkanie, 'poprawka', 'Nowe zdjęcie poprawki: ' || new.nazwa || ' (' || k || ')', 'biblioteka', new.folder);
    end if;
  exception when others then raise warning 'Powiadomienie o pliku nie powstało: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists pliki_zdarzenie on public.pliki;
create trigger pliki_zdarzenie after insert on public.pliki
  for each row execute function public.zdarzenie_pliku();

-- 4c. Opóźnienie: Właściciel aplikacji przesunął termin końca na później
create or replace function public.zdarzenie_terminu() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.termin_konca is not null and new.termin_konca is not null and new.termin_konca > old.termin_konca then
    begin
      perform public.powiadom_mieszkanie(new.id, 'opoznienie',
        'Opóźnienie: termin końca przesunięty z ' || to_char(old.termin_konca, 'DD.MM.YYYY') || ' na ' || to_char(new.termin_konca, 'DD.MM.YYYY'),
        'mieszkanie', null);
    exception when others then raise warning 'Powiadomienie o terminie nie powstało: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists mieszkania_zdarzenie on public.mieszkania;
create trigger mieszkania_zdarzenie after update of termin_konca on public.mieszkania
  for each row execute function public.zdarzenie_terminu();

-- 4d. Opóźnienie: minął termin końca, a nie wszystkie prace są zrobione.
--     Aplikacja woła to po wczytaniu mieszkań (dla zalogowanej osoby); jedno zdarzenie na mieszkanie i termin.
create or replace function public.sprawdz_opoznienia() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if auth.uid() is null then return 0; end if;
  for r in select m.id, m.termin_konca from public.mieszkania m
           where public.ma_dostep(m.id) and m.termin_konca < current_date
             and exists (select 1 from public.prace p where p.mieszkanie = m.id and not p.zrobiona) loop
    if not exists (select 1 from public.zdarzenia z where z.odbiorca = auth.uid() and z.klucz = 'opoznienie:' || r.id || ':' || r.termin_konca) then
      perform public.dodaj_zdarzenie(auth.uid(), r.id, 'opoznienie',
        'Opóźnienie: minął termin końca remontu (' || to_char(r.termin_konca, 'DD.MM.YYYY') || '), a nie wszystkie prace są zrobione',
        'listaPrac', null, 'opoznienie:' || r.id || ':' || r.termin_konca, true);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.sprawdz_opoznienia() from public, anon;
grant execute on function public.sprawdz_opoznienia() to authenticated;

-- 4e. Wiadomość w chacie mieszkania: powiadomienie dostaje druga strona rozmowy
create or replace function public.zdarzenie_wiadomosci() returns trigger
language plpgsql security definer set search_path = public as $$
declare tr text := 'Wiadomość od ' || public.nazwa_konta(new.autor) || ': '
                   || coalesce('„' || public.skrot(new.tresc, 80) || '”', 'zdjęcie')
                   || case when new.tresc is not null and new.plik is not null then ' + zdjęcie' else '' end;
begin
  begin
    if new.autor = new.wlasciciel then
      perform public.dodaj_zdarzenie(new.firma, new.mieszkanie, 'wiadomosc', tr, 'chat', new.firma::text);
    else
      perform public.dodaj_zdarzenie(new.wlasciciel, new.mieszkanie, 'wiadomosc', tr, 'chat', new.firma::text);
    end if;
  exception when others then raise warning 'Powiadomienie o wiadomości nie powstało: %', sqlerrm;
  end;
  return new;
end $$;
do $$ begin
  if to_regclass('public.wiadomosci') is not null then
    drop trigger if exists wiadomosci_zdarzenie on public.wiadomosci;
    create trigger wiadomosci_zdarzenie after insert on public.wiadomosci for each row execute function public.zdarzenie_wiadomosci();
  end if;
end $$;

-- 4f. Chat ogólny: wiadomość Właściciela aplikacji → wszystkie jego firmy; odpowiedź firmy → Właściciel aplikacji
create or replace function public.zdarzenie_ogolne() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid; tr text := 'Chat ogólny – ' || public.nazwa_konta(new.autor) || ': „' || public.skrot(new.tresc, 80) || '”';
begin
  begin
    if new.firma is null then
      for o in select distinct d.firma from public.dostepy d where d.wlasciciel = new.wlasciciel and d.aktywny and d.firma is not null loop
        perform public.dodaj_zdarzenie(o, null, 'ogolny', tr, 'ogolny', new.wlasciciel::text);
      end loop;
    else
      perform public.dodaj_zdarzenie(new.wlasciciel, null, 'ogolny', tr, 'ogolny', new.wlasciciel::text);
    end if;
  exception when others then raise warning 'Powiadomienie z chatu ogólnego nie powstało: %', sqlerrm;
  end;
  return new;
end $$;
do $$ begin
  if to_regclass('public.wiadomosci_ogolne') is not null then
    drop trigger if exists wiadomosci_ogolne_zdarzenie on public.wiadomosci_ogolne;
    create trigger wiadomosci_ogolne_zdarzenie after insert on public.wiadomosci_ogolne for each row execute function public.zdarzenie_ogolne();
  end if;
end $$;

-- 5. Zdarzenia z tabel innych klocków: 9 (terminy), 10 (platnosci), 11 (poprawki), 7 (dokumenty – jeszcze w budowie).
--    Funkcje powstają zawsze, triggery tylko wtedy, gdy tabela już jest (na dole pliku).

-- 5a. Klocek 7: paragon albo faktura (faktury widzi tylko Właściciel aplikacji).
--     Klocek 7: tabela paragony (kolumny sklep, kwota).
create or replace function public.pole(j jsonb, klucze text[]) returns text
language sql immutable as $$ select (select nullif(trim(j->>k), '') from unnest(klucze) with ordinality u(k, i) where nullif(trim(j->>k), '') is not null order by i limit 1) $$;
revoke all on function public.pole(jsonb, text[]) from public, anon, authenticated;
create or replace function public.zdarzenie_dokumentu() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); m uuid; f boolean; opis text; kw text;
begin
  begin
    m := (j->>'mieszkanie')::uuid;
    f := false;   -- tabela paragony (klocek 7): paragony i faktury materiałów, widoczne też dla firmy
    opis := coalesce(nullif(trim(j->>'sklep'), ''), 'sklep do sprawdzenia');
    kw := j->>'kwota';
    perform public.powiadom_mieszkanie(m, case when f then 'faktura' else 'paragon' end,
      case when f then 'Nowa faktura: ' else 'Nowy paragon: ' end || opis || coalesce(' ' || replace(kw, '.', ',') || ' zł', '')
        || ' (' || public.nazwa_konta(auth.uid()) || ')',
      'paragony', null, not f and coalesce(j->>'zaplacil', 'firma') <> 'wlasciciel');   -- firma nie widzi paragonów zapłaconych przez Właściciela aplikacji
  exception when others then raise warning 'Powiadomienie o dokumencie nie powstało: %', sqlerrm;
  end;
  return new;
end $$;

-- 5b. Klocek 11 (poprawki): nowa poprawka → firmy; zrobiona (ze zdjęciem) → Właściciel aplikacji; zatwierdzona → firmy
create or replace function public.zdarzenie_poprawki() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := ' (' || public.nazwa_konta(auth.uid()) || ')'; t text := public.skrot(new.tresc, 120);
begin
  begin
    if tg_op = 'INSERT' then
      perform public.powiadom_mieszkanie(new.mieszkanie, 'poprawka', 'Nowa poprawka: ' || t || k, 'poprawki', new.id::text);
    else
      if new.zrobiona and not old.zrobiona then
        perform public.powiadom_mieszkanie(new.mieszkanie, 'poprawka', 'Poprawka zrobiona: ' || t || k || ' – czeka na zatwierdzenie', 'poprawki', new.id::text);
      end if;
      if new.zatwierdzona and not old.zatwierdzona then
        perform public.powiadom_mieszkanie(new.mieszkanie, 'poprawka', 'Poprawka zatwierdzona: ' || t || k, 'poprawki', new.id::text);
      end if;
    end if;
  exception when others then raise warning 'Powiadomienie o poprawce nie powstało: %', sqlerrm;
  end;
  return new;
end $$;

-- 5c. Klocek 9 (terminy): etap dodany odznaczony jako zrobiony → „Etap skończony” (też na Telegram);
--     etapy 1–7 kończą się z prac (4a). Przesunięcie data_do na później → „Opóźnienie”.
create or replace function public.zdarzenie_terminu_etapu() returns trigger
language plpgsql security definer set search_path = public as $$
declare etapy text[] := array['Rozbiórki i przygotowanie','Elektryka','Hydraulika','Ściany i sufity',
  'Łazienka – płytki i biały montaż','Podłogi i drzwi','Kuchnia, lampy i sprzątanie'];
  nazwa text := case when new.nr is not null then new.nr || '. ' || coalesce(nullif(trim(new.nazwa), ''), etapy[new.nr]) else new.nazwa end;
  kl text := 'etap:' || new.mieszkanie || ':' || coalesce(new.nr::text, new.id::text);
begin
  begin
    if new.zrobiony and not old.zrobiony then
      perform public.powiadom_mieszkanie(new.mieszkanie, 'etap', 'Etap skończony: ' || nazwa, 'terminy', null, true, kl);
      perform public.dodaj_zdarzenie(auth.uid(), new.mieszkanie, 'etap', 'Etap skończony: ' || nazwa, 'terminy', null, kl, true);
    end if;
    if old.data_do is not null and new.data_do is not null and new.data_do > old.data_do then
      perform public.powiadom_mieszkanie(new.mieszkanie, 'opoznienie', 'Opóźnienie: etap ' || nazwa || ' przesunięty z '
        || to_char(old.data_do, 'DD.MM.YYYY') || ' na ' || to_char(new.data_do, 'DD.MM.YYYY'), 'terminy', null);
    end if;
  exception when others then raise warning 'Powiadomienie o etapie nie powstało: %', sqlerrm;
  end;
  return new;
end $$;

-- 5d. Klocek 10 (platnosci): płatność zapłacona → firmy
create or replace function public.zdarzenie_platnosci() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.zaplacona and not old.zaplacona then
    begin
      perform public.powiadom_mieszkanie(new.mieszkanie, 'platnosc', 'Płatność zapłacona: płatność ' || new.nr || ' – '
        || replace(to_char(new.kwota, 'FM999999990.00'), '.', ',') || ' zł', 'platnosci', null);
    exception when others then raise warning 'Powiadomienie o płatności nie powstało: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

-- Triggery tylko na tabelach, które już są
do $$
declare t record;
begin
  for t in select * from (values
      ('paragony', 'paragony_zdarzenie', 'after insert', 'zdarzenie_dokumentu'),
      ('poprawki', 'poprawki_zdarzenie', 'after insert or update of zrobiona, zatwierdzona', 'zdarzenie_poprawki'),
      ('terminy', 'terminy_zdarzenie', 'after update of zrobiony, data_do', 'zdarzenie_terminu_etapu'),
      ('platnosci', 'platnosci_zdarzenie', 'after update of zaplacona', 'zdarzenie_platnosci')) v(tab, trg, kiedy, fn) loop
    if to_regclass('public.' || t.tab) is not null and exists (select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.tab and c.column_name = 'mieszkanie') then
      execute format('drop trigger if exists %I on public.%I', t.trg, t.tab);
      execute format('create trigger %I %s on public.%I for each row execute function public.%I()', t.trg, t.kiedy, t.tab, t.fn);
    end if;
  end loop;
end $$;
-- Sprzątanie po wcześniejszej wersji tego pliku (ogólne funkcje do tabel, których nie było)
drop function if exists public.zdarzenie_etapu();
drop function if exists public.stal_sie(jsonb, jsonb, text[], text[], text[]);

-- ===================== sql/16_umowa.sql =====================
-- ===== Dodatek: Umowa z firmą (PDF lub zdjęcie) przy mieszkaniu =====
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run (po 06_reszta.sql). Można uruchomić kilka razy.

-- Nowy folder Biblioteki: „Umowa z firmą”
alter table public.pliki drop constraint if exists pliki_folder_check;
alter table public.pliki add constraint pliki_folder_check check (folder in (
  'faktury_firma','faktury_materialy','faktury_notariusz','faktury_posrednicy','faktury_inne',
  'paragony','plany','postepy','poprawki','umowa','zdjecia_po','zdjecia_przed','zdjecia_wiz'));

-- Szef firmy widzi umowę swojego mieszkania (tylko do odczytu – nie ma jej na liście folderów, do których firma wgrywa)
drop policy if exists pliki_firma_odczyt on public.pliki;
create policy pliki_firma_odczyt on public.pliki for select to authenticated using (
  public.jest_firma_mieszkania(mieszkanie)
  and folder in ('plany','postepy','poprawki','umowa','zdjecia_po','zdjecia_przed','zdjecia_wiz','paragony'));

create or replace function public.firma_widzi_plik(sc text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pliki f where f.sciezka = sc and public.jest_firma_mieszkania(f.mieszkanie)
    and f.folder in ('plany','postepy','poprawki','umowa','zdjecia_po','zdjecia_przed','zdjecia_wiz','paragony')) $$;
