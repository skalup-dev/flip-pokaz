-- Flip – prawdziwa wersja, klocek 4: Moje dane (imię, nazwa firmy) i firma remontowa przy mieszkaniu
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run (po klockach 1 i 2)
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.

-- 1. Nazwa firmy Właściciela aplikacji (pokazuje się w górnym pasku zamiast „FLIP”)
alter table public.profile add column if not exists nazwa_firmy text;
alter table public.profile drop constraint if exists profile_nazwa_firmy_dlugosc;
alter table public.profile add constraint profile_nazwa_firmy_dlugosc
  check (nazwa_firmy is null or length(nazwa_firmy) <= 80);
alter table public.profile drop constraint if exists profile_imie_dlugosc;
alter table public.profile add constraint profile_imie_dlugosc
  check (imie is null or length(imie) <= 40);

-- Profil dla kont założonych, zanim profil zakładał się sam (jeśli jakiegoś brakuje)
insert into public.profile(id, imie)
select u.id, u.raw_user_meta_data->>'imie' from auth.users u
on conflict (id) do nothing;

-- Każdy zmienia TYLKO swoje imię i nazwę firmy (rola dalej chroniona)
revoke update on public.profile from authenticated;
grant select on public.profile to authenticated;
grant update (imie, nazwa_firmy) on public.profile to authenticated;

-- 2. Firma remontowa przy mieszkaniu (nieobowiązkowa)
alter table public.mieszkania add column if not exists firma_remontowa text;
alter table public.mieszkania drop constraint if exists mieszkania_firma_remontowa_dlugosc;
alter table public.mieszkania add constraint mieszkania_firma_remontowa_dlugosc
  check (firma_remontowa is null or length(firma_remontowa) <= 80);
