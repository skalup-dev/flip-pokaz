\set ON_ERROR_STOP 0
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati profil: '||coalesce(imie,'(brak)')||' / '||coalesce(nazwa_firmy,'(brak)') from public.profile;
update public.profile set imie='Pati', nazwa_firmy='Firma Testowa' where id=auth.uid();
select 'pati po zmianie: '||imie||' / '||nazwa_firmy from public.profile;
update public.profile set rola='firma' where id=auth.uid();
update public.profile set nazwa_firmy=repeat('x',81) where id=auth.uid();
insert into public.mieszkania(ulica,firma_remontowa) values ('Testowa 1','Remonty Test');
select 'pati mieszkanie firma: '||firma_remontowa from public.mieszkania where ulica='Testowa 1';
insert into public.mieszkania(ulica,firma_remontowa) values ('Testowa 2',repeat('x',81));
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'brat widzi profili (1 = tylko swoj): '||count(*) from public.profile;
select 'brat widzi profil pati (0): '||count(*) from public.profile where id='11111111-1111-1111-1111-111111111111';
update public.profile set nazwa_firmy='Podmiana' where id='11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati nadal: '||nazwa_firmy||', rola '||rola from public.profile;
