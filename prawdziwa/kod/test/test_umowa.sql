\set ON_ERROR_STOP 0
-- Test dodatku 16: folder „Umowa z firmą” (firma tylko ogląda) i usuwanie wiadomości z Chatu ogólnego.
-- Po supabase_stub, storage_stub, 01–05, 06_reszta.sql.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','w@x.pl','{"imie":"Marek"}'),
 ('33333333-3333-3333-3333-333333333333','f@x.pl','{}'),
 ('44444444-4444-4444-4444-444444444444','obcy@x.pl','{}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica,firma_remontowa) values ('aaaaaaaa-0000-0000-0000-000000000001','Testowa 1','Ekipa Testowa');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','umowa','umowa.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/umowa/umowa.pdf','pdf');
select 'wlasciciel wgral umowe: ' || count(*) from public.pliki where folder='umowa';
insert into public.dostepy(id,mieszkanie,kod) values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000001') is not null as firma_przyjela;
select 'firma widzi umowe: ' || count(*) from public.pliki where folder='umowa';
select 'firma widzi plik umowy w schowku: ' || public.firma_widzi_plik('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/umowa/umowa.pdf');
select 'firma moze wgrac umowe (ma byc false): ' || public.firma_moze_wgrac('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/umowa/x.pdf');
-- firma nie wgra umowy (oczekiwany ERROR)
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','umowa','u2.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/umowa/u2.pdf','pdf');
delete from public.pliki where folder='umowa';
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'umowa nadal jest (firma nie usunela): ' || count(*) from public.pliki where folder='umowa';
-- Chat ogólny: Właściciel aplikacji usuwa swoją wiadomość, obcy nie usunie
insert into public.wiadomosci_ogolne(tresc) values ('do wszystkich firm'),('druga');
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
delete from public.wiadomosci_ogolne;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'po probie obcego: ' || count(*) from public.wiadomosci_ogolne;
delete from public.wiadomosci_ogolne where tresc='druga';
select 'po usunieciu przez wlasciciela: ' || count(*) from public.wiadomosci_ogolne;
