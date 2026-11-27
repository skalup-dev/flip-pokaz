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
    if new.folder like 'faktury%' and to_regclass('public.dokumenty') is null then
      perform public.powiadom_mieszkanie(new.mieszkanie, 'faktura', 'Nowa faktura: ' || new.nazwa || ' (' || k || ')', 'biblioteka', new.folder, false);
    elsif new.folder = 'paragony' and to_regclass('public.dokumenty') is null then
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
--     Tabela klocka 7 jeszcze się buduje: nazwa „dokumenty” i kolumny czytane po nazwie są do podmiany po jego oddaniu.
create or replace function public.pole(j jsonb, klucze text[]) returns text
language sql immutable as $$ select (select nullif(trim(j->>k), '') from unnest(klucze) with ordinality u(k, i) where nullif(trim(j->>k), '') is not null order by i limit 1) $$;
revoke all on function public.pole(jsonb, text[]) from public, anon, authenticated;
create or replace function public.zdarzenie_dokumentu() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); m uuid; f boolean; opis text; kw text;
begin
  begin
    m := (j->>'mieszkanie')::uuid;
    f := lower(coalesce(public.pole(j, array['rodzaj','typ','folder','kategoria']), '')) like '%faktur%';
    opis := coalesce(public.pole(j, array['sklep','sprzedawca','dostawca','nazwa','opis']), 'bez opisu');
    kw := public.pole(j, array['kwota','suma','brutto']);
    perform public.powiadom_mieszkanie(m, case when f then 'faktura' else 'paragon' end,
      case when f then 'Nowa faktura: ' else 'Nowy paragon: ' end || opis || coalesce(' ' || replace(kw, '.', ',') || ' zł', '')
        || ' (' || public.nazwa_konta(auth.uid()) || ')',
      'paragony', null, not f);
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
      ('dokumenty', 'dokumenty_zdarzenie', 'after insert', 'zdarzenie_dokumentu'),
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
