-- Flip – prawdziwa wersja, klocek 2: Biblioteka mieszkania (zdjęcia i pliki PDF)
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run (po klocku 1)
-- Można uruchomić kilka razy, niczego nie psuje i niczego nie usuwa z danych.

-- 1. Lista plików w Bibliotece (same pliki leżą w schowku "biblioteka")
create table if not exists public.pliki (
  id uuid primary key default gen_random_uuid(),
  -- mieszkania z plikami nie da się usunąć: najpierw trzeba usunąć pliki z Biblioteki
  mieszkanie uuid not null references public.mieszkania(id) on delete no action,
  wlasciciel uuid not null default auth.uid() references auth.users(id) on delete cascade,
  folder text not null check (folder in (
    'faktury_firma','faktury_materialy','faktury_notariusz','faktury_posrednicy','faktury_inne',
    'paragony','plany','postepy','poprawki','zdjecia_po','zdjecia_przed')),
  nazwa text not null check (length(trim(nazwa)) > 0),
  sciezka text not null unique,
  typ text not null check (typ in ('zdjecie','pdf')),
  rozmiar bigint check (rozmiar is null or rozmiar >= 0),
  utworzono timestamptz not null default now(),
  -- plik musi leżeć w katalogu właściciela i swojego mieszkania
  check (sciezka like wlasciciel::text || '/' || mieszkanie::text || '/' || folder || '/%')
);
create index if not exists pliki_mieszkanie_idx on public.pliki(mieszkanie, folder);

alter table public.pliki enable row level security;

-- Każdy widzi i usuwa TYLKO swoje pliki; dodać można tylko do swojego mieszkania.
-- (Plany od architekta zobaczy później też firma remontowa – osobny klocek.)
drop policy if exists pliki_odczyt on public.pliki;
create policy pliki_odczyt on public.pliki for select to authenticated using (wlasciciel = auth.uid());
drop policy if exists pliki_dodanie on public.pliki;
create policy pliki_dodanie on public.pliki for insert to authenticated with check (
  wlasciciel = auth.uid()
  and exists (select 1 from public.mieszkania m where m.id = mieszkanie and m.wlasciciel = auth.uid()));
drop policy if exists pliki_usuniecie on public.pliki;
create policy pliki_usuniecie on public.pliki for delete to authenticated using (wlasciciel = auth.uid());

grant select, insert, delete on public.pliki to authenticated;
revoke all on public.pliki from anon;

-- 2. Schowek na pliki: prywatny, do 20 MB na plik, tylko zdjęcia i PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('biblioteka', 'biblioteka', false, 20971520,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Pliki leżą w katalogach: <konto>/<mieszkanie>/<folder>/<plik>
-- Każdy otwiera, wgrywa i usuwa TYLKO pliki w swoim katalogu i swoich mieszkaniach.
drop policy if exists biblioteka_odczyt on storage.objects;
create policy biblioteka_odczyt on storage.objects for select to authenticated using (
  bucket_id = 'biblioteka' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists biblioteka_dodanie on storage.objects;
create policy biblioteka_dodanie on storage.objects for insert to authenticated with check (
  bucket_id = 'biblioteka' and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.mieszkania m
              where m.id::text = (storage.foldername(name))[2] and m.wlasciciel = auth.uid()));
drop policy if exists biblioteka_usuniecie on storage.objects;
create policy biblioteka_usuniecie on storage.objects for delete to authenticated using (
  bucket_id = 'biblioteka' and (storage.foldername(name))[1] = auth.uid()::text);
