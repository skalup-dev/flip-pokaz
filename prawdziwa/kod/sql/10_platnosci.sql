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
