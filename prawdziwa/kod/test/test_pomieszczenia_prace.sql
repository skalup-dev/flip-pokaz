\set ON_ERROR_STOP 0
-- Test zabezpieczeń klocka 4. Uruchamiać po supabase_stub, storage_stub, 01–04.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Pati"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica) values ('aaaaaaaa-0000-0000-0000-000000000001','Testowa 1'),('aaaaaaaa-0000-0000-0000-000000000002','Testowa 2');
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa,metraz) values
 ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Łazienka','Łazienka',4.2),
 ('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','Pokój','Pokój',10);
insert into public.prace(mieszkanie,pomieszczenie,etap,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',5,'Płytki ścienne');
select 'pati: pomieszczen '||(select count(*) from public.pomieszczenia)||', prac '||(select count(*) from public.prace);
-- złe dane (oczekiwane ERROR)
insert into public.pomieszczenia(mieszkanie,rodzaj,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','Strych','X');
insert into public.pomieszczenia(mieszkanie,rodzaj,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','Pokój','  ');
insert into public.pomieszczenia(mieszkanie,rodzaj,nazwa,metraz) values ('aaaaaaaa-0000-0000-0000-000000000001','Pokój','X',-1);
insert into public.prace(mieszkanie,pomieszczenie,etap,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',8,'X');
-- praca z pomieszczenia innego mieszkania (oczekiwany ERROR)
insert into public.prace(mieszkanie,pomieszczenie,etap,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002',1,'X');
-- przepisanie na inne mieszkanie (oczekiwany ERROR: brak uprawnień)
update public.pomieszczenia set mieszkanie='aaaaaaaa-0000-0000-0000-000000000002';
update public.prace set zrobiona=true;
select 'pati zmienila zrobiona (1): '||count(*) from public.prace where zrobiona;
-- BRAT
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
insert into public.mieszkania(id,ulica) values ('bbbbbbbb-0000-0000-0000-000000000003','Brata 1');
select 'brat widzi pomieszczen pati (0): '||count(*) from public.pomieszczenia;
select 'brat widzi prac pati (0): '||count(*) from public.prace;
insert into public.pomieszczenia(mieszkanie,rodzaj,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','Pokój','Podrzucony');
insert into public.prace(mieszkanie,pomieszczenie,etap,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',1,'Podrzucona');
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa) values ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000003','Pokój','Brata pokój');
insert into public.prace(mieszkanie,pomieszczenie,etap,nazwa) values ('bbbbbbbb-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-000000000001',1,'Do pokoju pati');
update public.prace set nazwa='Podmiana'; update public.pomieszczenia set nazwa='Podmiana' where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001';
delete from public.prace where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001'; delete from public.pomieszczenia where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001';
select 'brat swoje pomieszczenia (1): '||count(*) from public.pomieszczenia;
-- PATI znowu
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati nadal: pomieszczen '||(select count(*) from public.pomieszczenia)||', prac '||(select count(*) from public.prace)||', nazwa '||(select nazwa from public.prace limit 1);
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000002','zdjecia_wiz','w.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000002/zdjecia_wiz/w.jpg','zdjecie');
select 'folder Wizualizacje dziala (1): '||count(*) from public.pliki where folder='zdjecia_wiz';
delete from public.pliki;
delete from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
select 'po usunieciu mieszkania: pomieszczen '||(select count(*) from public.pomieszczenia)||', prac '||(select count(*) from public.prace);
reset role; set role anon;
select 'anon: '||count(*) from public.prace;
