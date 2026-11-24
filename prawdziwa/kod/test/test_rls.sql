\set ON_ERROR_STOP 0
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Pati"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}');
select 'profile po rejestracji: '||count(*) from public.profile;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(ulica,miasto,metraz,budzet,data_startu,termin_konca) values ('Krasińskiego 3/4','Sosnowiec',50,120000,'2026-11-17','2027-01-30');
insert into public.mieszkania(ulica) values ('Mickiewicza 5/12');
select 'pati widzi: '||count(*) from public.mieszkania;
-- błędne dane
insert into public.mieszkania(ulica) values ('   ');
insert into public.mieszkania(ulica,metraz) values ('X',-5);
insert into public.mieszkania(ulica,data_startu,termin_konca) values ('X','2027-01-01','2026-01-01');
-- próba dodania na cudze konto
insert into public.mieszkania(ulica,wlasciciel) values ('Cudze','22222222-2222-2222-2222-222222222222');
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'brat widzi: '||count(*) from public.mieszkania;
update public.mieszkania set budzet=1;
select 'brat zmienil: '||count(*) from public.mieszkania where budzet=1;
delete from public.mieszkania;
update public.profile set rola='firma';
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati nadal ma: '||count(*) from public.mieszkania;
update public.mieszkania set wlasciciel='22222222-2222-2222-2222-222222222222';
update public.mieszkania set budzet=130000 where ulica like 'Kras%';
select 'zmiana budzetu: '||budzet||' zmieniono>utworzono: '||(zmieniono>=utworzono) from public.mieszkania where ulica like 'Kras%';
delete from public.mieszkania where ulica like 'Mick%';
select 'po usunieciu: '||count(*) from public.mieszkania;
reset role; set role anon;
select 'anon: '||count(*) from public.mieszkania;
