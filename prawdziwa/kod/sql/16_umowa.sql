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

-- Naprawa (z testów na prawdziwej bazie): Właściciel aplikacji może usunąć swoje wiadomości z Chatu ogólnego
grant delete on public.wiadomosci_ogolne to authenticated;
drop policy if exists wiadomosci_ogolne_usuniecie on public.wiadomosci_ogolne;
create policy wiadomosci_ogolne_usuniecie on public.wiadomosci_ogolne for delete to authenticated using (wlasciciel = auth.uid());
