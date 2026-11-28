-- ===== Naprawa 17: Właściciel aplikacji może usunąć swoje wiadomości z Chatu ogólnego =====
-- Wgrywane w Supabase: SQL Editor -> wklej -> Run (po 16_umowa.sql). Można uruchomić kilka razy.
grant delete on public.wiadomosci_ogolne to authenticated;
drop policy if exists wiadomosci_ogolne_usuniecie on public.wiadomosci_ogolne;
create policy wiadomosci_ogolne_usuniecie on public.wiadomosci_ogolne for delete to authenticated using (wlasciciel = auth.uid());
