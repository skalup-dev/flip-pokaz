-- Flip – prawdziwa wersja, klocek 5: Lista prac (odznaczanie prac ze zdjęciem, kto i kiedy)
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run (po klockach 1–4)
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.

-- 1. Kto i kiedy odznaczył pracę
alter table public.prace add column if not exists zrobiona_przez uuid references auth.users(id) on delete set null;
alter table public.prace add column if not exists zrobiona_kiedy timestamptz;

-- 2. Zdjęcie pracy: przy którym zdjęciu jaka praca, kto je dodał
alter table public.pliki add column if not exists praca uuid references public.prace(id) on delete set null;
alter table public.pliki add column if not exists dodal uuid default auth.uid() references auth.users(id) on delete set null;
create index if not exists pliki_praca_idx on public.pliki(praca);

-- Zdjęcie pracy leży w Bibliotece › Postępy prac i należy do pracy z tego samego mieszkania
create or replace function public.sprawdz_zdjecie_pracy() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.praca is not null then
    if new.folder <> 'postepy' then raise exception 'Zdjęcie pracy musi być w folderze Postępy prac'; end if;
    if not exists (select 1 from public.prace p where p.id = new.praca and p.mieszkanie = new.mieszkanie) then
      raise exception 'Ta praca nie należy do tego mieszkania';
    end if;
  end if;
  if tg_op = 'INSERT' then new.dodal := auth.uid(); end if;   -- kto dodał: zawsze zalogowana osoba
  return new;
end $$;
drop trigger if exists pliki_zdjecie_pracy on public.pliki;
create trigger pliki_zdjecie_pracy before insert or update on public.pliki
  for each row execute function public.sprawdz_zdjecie_pracy();

-- 3. Pracy nie da się odznaczyć bez co najmniej jednego zdjęcia; kto i kiedy zapisuje się sam
create or replace function public.odznacz_prace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.zrobiona then raise exception 'Nowa praca nie może być od razu zrobiona'; end if;
    new.zrobiona_przez := null; new.zrobiona_kiedy := null;
    return new;
  end if;
  if new.zrobiona and not old.zrobiona then
    if not exists (select 1 from public.pliki f where f.praca = new.id) then
      raise exception 'Najpierw trzeba dodać co najmniej jedno zdjęcie';
    end if;
    new.zrobiona_przez := auth.uid(); new.zrobiona_kiedy := now();
  elsif not new.zrobiona then
    new.zrobiona_przez := null; new.zrobiona_kiedy := null;
  else
    new.zrobiona_przez := old.zrobiona_przez; new.zrobiona_kiedy := old.zrobiona_kiedy;
  end if;
  return new;
end $$;
drop trigger if exists prace_odznaczanie on public.prace;
create trigger prace_odznaczanie before insert or update on public.prace
  for each row execute function public.odznacz_prace();

-- Ostatniego zdjęcia zrobionej pracy nie da się usunąć (najpierw trzeba ją odznaczyć)
create or replace function public.chron_ostatnie_zdjecie() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.praca is not null
     and exists (select 1 from public.prace p where p.id = old.praca and p.zrobiona)
     and not exists (select 1 from public.pliki f where f.praca = old.praca and f.id <> old.id) then
    raise exception 'To ostatnie zdjęcie zrobionej pracy. Najpierw trzeba odznaczyć pracę';
  end if;
  return old;
end $$;
drop trigger if exists pliki_ostatnie_zdjecie on public.pliki;
create trigger pliki_ostatnie_zdjecie before delete on public.pliki
  for each row execute function public.chron_ostatnie_zdjecie();

-- 4. Podpis „Odznaczone przez” / „Zdjęcie dodane przez”:
--    imię z „Moje dane”, a dla konta firmy remontowej (później) nazwa firmy.
--    Zwraca tylko osoby, które coś robiły w mieszkaniach pytającego, albo jego samego.
create or replace function public.kto_nazwy(ids uuid[]) returns table(id uuid, nazwa text)
language sql stable security definer set search_path = public as $$
  select p.id,
         coalesce(nullif(trim(case when p.rola = 'firma' then p.nazwa_firmy else p.imie end), ''),
                  case when p.rola = 'firma' then 'Firma remontowa' else 'Właściciel aplikacji' end)
  from public.profile p
  where p.id = any(ids)
    and (p.id = auth.uid()
         or exists (select 1 from public.prace r where r.zrobiona_przez = p.id and r.wlasciciel = auth.uid())
         or exists (select 1 from public.pliki f where f.dodal = p.id and f.wlasciciel = auth.uid()));
$$;
revoke all on function public.kto_nazwy(uuid[]) from public, anon;
grant execute on function public.kto_nazwy(uuid[]) to authenticated;

-- Uprawnienia: odznaczać wolno (zrobiona), kto/kiedy ustawia baza; zdjęcie wolno podpiąć pod pracę
grant update (nazwa, etap, zrobiona) on public.prace to authenticated;
