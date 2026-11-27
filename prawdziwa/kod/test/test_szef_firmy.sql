\set ON_ERROR_STOP 0
-- Test klocka 6. Po supabase_stub, storage_stub, 01–05, sql/06_szef_firmy.sql.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}'),
 ('33333333-3333-3333-3333-333333333333','firma@x.pl','{"imie":"Jan"}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica,firma_remontowa,budzet) values ('aaaaaaaa-0000-0000-0000-000000000001','Testowa 1','Ekipa Testowa',95000),('aaaaaaaa-0000-0000-0000-000000000002','Testowa 2',null,1);
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Salon','Salon');
insert into public.prace(id,mieszkanie,pomieszczenie,etap,nazwa) values ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',6,'Panele');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','faktury_firma','f.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/faktury_firma/f.pdf','pdf'),('aaaaaaaa-0000-0000-0000-000000000001','plany','p.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/plany/p.pdf','pdf');
insert into public.dostepy(id,mieszkanie,kod) values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001');
-- Pati nie może przyjąć (ma mieszkania)
select public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000001');
-- FIRMA
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'firma przed przyjeciem widzi prac (0): '||count(*) from public.prace;
select 'przyjeto mieszkanie: '||public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000001');
select 'profil firmy: '||rola||' / '||coalesce(nazwa_firmy,'-') from public.profile where id=auth.uid();
select 'zlecenia firmy: '||count(*)||' '||string_agg(ulica,',') from public.zlecenia_firmy();
select 'firma widzi mieszkania wprost (0): '||count(*) from public.mieszkania;
select 'firma widzi prace (1): '||count(*) from public.prace;
select 'firma widzi pliki (1, bez faktury): '||count(*)||' '||string_agg(folder,',') from public.pliki;
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ,praca) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','postepy','z.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/z.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000001');
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','faktury_firma','x.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/faktury_firma/x.pdf','pdf');
select 'firma moze wgrac postepy (t): '||public.firma_moze_wgrac('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/a.jpg')||', faktury (f): '||public.firma_moze_wgrac('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/faktury_firma/a.pdf');
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
select 'podpis firmy: '||nazwa from public.kto_nazwy(array['33333333-3333-3333-3333-333333333333']::uuid[]);
update public.mieszkania set budzet=1;
-- PATI widzi podpis firmy, zabiera dostęp
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati widzi zrobione przez firme: '||n.nazwa from public.prace r join public.kto_nazwy(array[r.zrobiona_przez]) n on true;
select 'budzet nietkniety: '||budzet from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
update public.dostepy set aktywny=false where id='dddddddd-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'po zabraniu: zlecen '||(select count(*) from public.zlecenia_firmy())||', prac '||(select count(*) from public.prace)||', plikow '||(select count(*) from public.pliki);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.dostepy set aktywny=true where id='dddddddd-0000-0000-0000-000000000001';
-- BRAT: nie przyjmie zaproszenia przyjętego przez firmę, nie widzi nic
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000001');
select 'brat: dostepow '||(select count(*) from public.dostepy)||', zlecen '||(select count(*) from public.zlecenia_firmy())||', prac '||(select count(*) from public.prace);
insert into public.dostepy(mieszkanie) values ('aaaaaaaa-0000-0000-0000-000000000001');
reset role; set role anon;
select public.zlecenia_firmy();
