\set ON_ERROR_STOP 0
-- Test zabezpieczeń Biblioteki. Uruchamiać po supabase_stub.sql, storage_stub.sql, 01_schemat.sql, 02_biblioteka.sql.
-- Każda linijka wyniku mówi, co powinno wyjść; błędy ERROR przy próbach "cudzego" są oczekiwane.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Pati"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}') on conflict do nothing;
set role authenticated;
-- PATI
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica) values ('aaaaaaaa-0000-0000-0000-000000000001','Krasińskiego 3/4');
insert into storage.objects(bucket_id,name) values ('biblioteka','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/plany/a.pdf');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values
 ('aaaaaaaa-0000-0000-0000-000000000001','plany','plan.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/plany/a.pdf','pdf');
select 'pati widzi plikow (1): '||count(*) from public.pliki;
select 'pati widzi w schowku (1): '||count(*) from storage.objects;
-- złe dane (oczekiwane ERROR)
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','zly_folder','x','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/zly_folder/x','pdf');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','plany','x','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/plany/x','exe');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','plany','x','inny/katalog/plany/x','pdf');
-- BRAT
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
insert into public.mieszkania(id,ulica) values ('bbbbbbbb-0000-0000-0000-000000000002','Brata 1');
select 'brat widzi plikow pati (0): '||count(*) from public.pliki;
select 'brat widzi w schowku (0): '||count(*) from storage.objects;
-- próby (oczekiwane ERROR albo 0 zmian)
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','plany','x','22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/plany/x','pdf');
insert into storage.objects(bucket_id,name) values ('biblioteka','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/plany/podrzucony.pdf');
insert into storage.objects(bucket_id,name) values ('biblioteka','22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/plany/podrzucony.pdf');
delete from public.pliki;
delete from storage.objects;
-- brat w swoim mieszkaniu może
insert into storage.objects(bucket_id,name) values ('biblioteka','22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002/zdjecia_po/b.jpg');
select 'brat swoj plik w schowku (1): '||count(*) from storage.objects;
-- PATI znowu
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati nadal ma plikow (1): '||count(*) from public.pliki;
select 'pati nadal ma w schowku (1): '||count(*) from storage.objects;
-- mieszkania z plikami nie da się usunąć (oczekiwany ERROR)
delete from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
select 'mieszkanie z plikami zostalo (1): '||count(*) from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
-- po usunięciu plików już się da
delete from storage.objects; delete from public.pliki;
delete from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
select 'bez plikow mieszkanie usuniete (0): '||count(*) from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
reset role; set role anon;
select 'anon pliki: '||count(*) from public.pliki;
