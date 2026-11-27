\set ON_ERROR_STOP 0
-- Test klocka 5. Uruchamiać po supabase_stub, storage_stub, 01–05.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica) values ('aaaaaaaa-0000-0000-0000-000000000001','Testowa 1'),('aaaaaaaa-0000-0000-0000-000000000002','Testowa 2');
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Łazienka','Łazienka'),('cccccccc-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','Salon','Salon');
insert into public.prace(id,mieszkanie,pomieszczenie,etap,nazwa) values ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',5,'Płytki ścienne'),('eeeeeeee-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000002',6,'Panele');
-- nowa praca od razu zrobiona (ERROR)
insert into public.prace(mieszkanie,pomieszczenie,etap,nazwa,zrobiona) values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',1,'X',true);
-- odznaczenie bez zdjęcia (ERROR)
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
select 'bez zdjecia zrobiona (false): '||zrobiona from public.prace where id='eeeeeeee-0000-0000-0000-000000000001';
-- zdjęcie w złym folderze / z pracą innego mieszkania (ERROR)
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,praca) values ('aaaaaaaa-0000-0000-0000-000000000001','zdjecia_po','z.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/zdjecia_po/z.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000001');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,praca) values ('aaaaaaaa-0000-0000-0000-000000000001','postepy','z.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/z.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000002');
-- dobre zdjęcia (2) i odznaczenie
insert into public.pliki(id,mieszkanie,folder,nazwa,sciezka,typ,praca) values
 ('ffffffff-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','postepy','1.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/1.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000001'),
 ('ffffffff-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','postepy','2.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/2.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000001');
select 'zdjecia dodal pati: '||count(*) from public.pliki where dodal='11111111-1111-1111-1111-111111111111';
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
select 'zrobiona: '||zrobiona||', przez pati: '||(zrobiona_przez='11111111-1111-1111-1111-111111111111')||', kiedy jest: '||(zrobiona_kiedy is not null) from public.prace where id='eeeeeeee-0000-0000-0000-000000000001';
select 'podpis: '||nazwa from public.kto_nazwy(array['11111111-1111-1111-1111-111111111111']::uuid[]);
-- usunięcie zdjęć: pierwsze OK, ostatnie zrobionej pracy (ERROR)
delete from public.pliki where id='ffffffff-0000-0000-0000-000000000001';
delete from public.pliki where id='ffffffff-0000-0000-0000-000000000002';
select 'zostalo zdjec (1): '||count(*) from public.pliki where praca='eeeeeeee-0000-0000-0000-000000000001';
-- BRAT
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'brat widzi prac (0): '||count(*) from public.prace;
update public.prace set zrobiona=false where id='eeeeeeee-0000-0000-0000-000000000001';
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,praca) values ('aaaaaaaa-0000-0000-0000-000000000002','postepy','b.jpg','22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002/postepy/b.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000002');
select 'brat widzi podpis pati (0): '||count(*) from public.kto_nazwy(array['11111111-1111-1111-1111-111111111111']::uuid[]);
-- PATI: cofnięcie
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'po bracie zrobiona (true): '||zrobiona from public.prace where id='eeeeeeee-0000-0000-0000-000000000001';
update public.prace set zrobiona=false where id='eeeeeeee-0000-0000-0000-000000000001';
select 'po odznaczeniu: '||zrobiona||', kto pusty: '||(zrobiona_przez is null and zrobiona_kiedy is null) from public.prace where id='eeeeeeee-0000-0000-0000-000000000001';
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
select 'ponownie ze starym zdjeciem: '||zrobiona from public.prace where id='eeeeeeee-0000-0000-0000-000000000001';
update public.prace set zrobiona=false; delete from public.pliki;
select 'po usunieciu zdjec nie da sie odznaczyc:'; update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
reset role; set role anon;
select 'anon: '||count(*) from public.kto_nazwy(array['11111111-1111-1111-1111-111111111111']::uuid[]);
