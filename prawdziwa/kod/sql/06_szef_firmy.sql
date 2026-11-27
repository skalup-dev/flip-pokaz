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
