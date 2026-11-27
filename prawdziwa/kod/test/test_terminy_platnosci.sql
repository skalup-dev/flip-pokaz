\set ON_ERROR_STOP 0
-- Test klocków 9 (Terminy) i 10 (Płatności). Po supabase_stub, storage_stub, 01–05, sql/06_szef_firmy.sql, sql/09_terminy.sql, sql/10_platnosci.sql.
-- Linie z (ERROR) w opisie mają skończyć się błędem. Pozostałe – bez błędu.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}'),
 ('33333333-3333-3333-3333-333333333333','firma@x.pl','{"imie":"Jan"}') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica,firma_remontowa,metraz,budzet,cena_zakupu,cena_firmy_m2,termin_konca) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Testowa 1','Ekipa Testowa',50,95000,300000,1000,'2027-02-01'),
 ('aaaaaaaa-0000-0000-0000-000000000002','Testowa 2',null,40,1,null,null,null);
select 'etapy 1-7 zalozone same (7): '||count(*) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001';
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Salon','Salon');
insert into public.prace(id,mieszkanie,pomieszczenie,etap,nazwa) values
 ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',1,'Wywóz gruzu'),
 ('eeeeeeee-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',2,'Gniazda');
-- daty etapów
update public.terminy set data_od='2026-11-02', data_do='2026-11-13' where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=1;
select 'daty etapu 1: '||data_od||' – '||data_do from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=1;
-- zły zakres dat (ERROR)
update public.terminy set data_od='2026-12-10', data_do='2026-12-01' where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=2;
-- etap 1–7 nie może być „zrobiony” ręcznie (ERROR)
update public.terminy set zrobiony=true where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=2;
-- drugi etap nr 1 (ERROR)
insert into public.terminy(mieszkanie,nr) values ('aaaaaaaa-0000-0000-0000-000000000001',1);
-- etap dodany
insert into public.terminy(id,mieszkanie,nazwa,data_od,data_do) values ('77777777-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Odbiór mieszkania','2027-01-25','2027-01-29');
update public.terminy set zrobiony=true where id='77777777-0000-0000-0000-000000000001';
select 'etap dodany zrobiony: '||zrobiony from public.terminy where id='77777777-0000-0000-0000-000000000001';
-- etap bez nazwy i bez numeru (ERROR)
insert into public.terminy(mieszkanie) values ('aaaaaaaa-0000-0000-0000-000000000001');
-- etapu 1–7 nie da się usunąć (0 usuniętych)
with u as (delete from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=7 returning 1) select 'usunieto etapow 1-7 (0): '||count(*) from u;

-- PŁATNOŚCI
select 'umowa pati: '||cena_firmy_m2||' x '||metraz||' = '||kwota from public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000001');
select 'umowa bez ceny: '||coalesce(kwota::text,'brak') from public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000002');
-- zapis 2 płatności: P1 = etapy 1+2, P2 = etap 3 + dodany
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('kwota',20000,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr in (1,2))),
  jsonb_build_object('kwota',30000,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and (nr=3 or id='77777777-0000-0000-0000-000000000001')))));
select 'platnosci: '||string_agg(nr||'='||kwota,', ' order by nr)||' suma '||sum(kwota) from public.platnosci;
select 'etapow w platnosciach (4): '||count(*) from public.platnosci_etapy;
-- etap w dwóch płatnościach (ERROR)
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('kwota',1,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=1)),
  jsonb_build_object('kwota',2,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr in (1,4)))));
-- etap w dwóch płatnościach wprost w tabeli (ERROR – brak prawa i klucz główny)
insert into public.platnosci_etapy(termin,platnosc,mieszkanie) select t.id,p.id,p.mieszkanie from public.terminy t, public.platnosci p where t.nr=1 and t.mieszkanie=p.mieszkanie and p.nr=2;
-- płatność bez kwoty (ERROR), bez etapu (ERROR), pusta lista (ERROR), etap z innego mieszkania (ERROR)
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', '[{"kwota":0,"etapy":[]}]');
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', '[{"kwota":100,"etapy":[]}]');
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', '[]');
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('kwota',5,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000002' and nr=1))));
select 'po odrzuconych nadal 2 platnosci: '||count(*) from public.platnosci;
-- etapu, który jest w płatności, nie da się usunąć (ERROR)
delete from public.terminy where id='77777777-0000-0000-0000-000000000001';
-- oznacz jako zapłacone / odznacz
update public.platnosci set zaplacona=true where nr=1;
select 'P1 zaplacona: '||zaplacona||', data jest: '||(zaplacona_kiedy is not null) from public.platnosci where nr=1;
update public.platnosci set zaplacona=false where nr=1;
select 'P1 po Odznacz: '||zaplacona||', data jest: '||(zaplacona_kiedy is not null) from public.platnosci where nr=1;
-- kwoty nie da się zmienić wprost (ERROR – tylko przez zapisz_platnosci)
update public.platnosci set kwota=1 where nr=1;
-- zmiana zapłaconej płatności zdejmuje „zapłacone”, niezmieniona zostaje zapłacona
update public.platnosci set zaplacona=true;
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', (select jsonb_agg(jsonb_build_object('id',p.id,'kwota',case when p.nr=2 then 25000 else p.kwota end,
  'etapy',(select jsonb_agg(e.termin) from public.platnosci_etapy e where e.platnosc=p.id)) order by p.nr) from public.platnosci p));
select 'po zmianie P2: '||string_agg(nr||'='||kwota||(case when zaplacona then ' zaplacona' else ' niezaplacona' end),', ' order by nr) from public.platnosci;
-- przeniesienie etapu z zapłaconej P1 do P2: obie przestają być zapłacone
update public.platnosci set zaplacona=true;
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id',(select id from public.platnosci where nr=1),'kwota',20000,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=1)),
  jsonb_build_object('id',(select id from public.platnosci where nr=2),'kwota',25000,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and (nr in (2,3) or id='77777777-0000-0000-0000-000000000001'))),
  jsonb_build_object('kwota',5000,'etapy',(select jsonb_agg(id) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr in (4,5,6,7)))));
select 'po przeniesieniu: '||string_agg(nr||'='||kwota||(case when zaplacona then ' zaplacona' else ' niezaplacona' end)||' etapow '||(select count(*) from public.platnosci_etapy e where e.platnosc=p.id),', ' order by nr) from public.platnosci p;
update public.platnosci set zaplacona=true where nr=1;

-- FIRMA: przyjmuje zaproszenie, widzi terminy, płatności i umowę; nic nie zmienia
insert into public.dostepy(id,mieszkanie,kod) values ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'firma przed przyjeciem: terminow '||(select count(*) from public.terminy)||', platnosci '||(select count(*) from public.platnosci)||', umowa '||(select count(*) from public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000001'));
select 'przyjeto mieszkanie: '||public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000001');
select 'firma widzi terminow (8): '||count(*) from public.terminy;
select 'firma widzi platnosci (3): '||count(*)||', etapow w nich (8): '||(select count(*) from public.platnosci_etapy) from public.platnosci;
select 'firma widzi umowe: '||cena_firmy_m2||' x '||metraz||' = '||kwota from public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000001');
select 'firma: umowa innego mieszkania (0): '||count(*) from public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000002');
select 'firma widzi prace (2): '||count(*) from public.prace;
select 'firma nie widzi ceny zakupu ani budzetu (0 mieszkan): '||count(*) from public.mieszkania;
with u as (update public.terminy set data_do='2030-01-01' where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' returning 1) select 'firma zmienila terminow (0): '||count(*) from u;
with u as (update public.platnosci set zaplacona=false returning 1) select 'firma zmienila platnosci (0): '||count(*) from u;
with u as (delete from public.terminy where id='77777777-0000-0000-0000-000000000001' returning 1) select 'firma usunela terminow (0): '||count(*) from u;
-- firma nie dodaje etapu (ERROR), nie zapisuje płatności (ERROR)
insert into public.terminy(mieszkanie,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','Firma');
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', '[{"kwota":1,"etapy":[]}]');

-- BRAT: nic nie widzi i nic nie zmienia
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'brat widzi: terminow '||(select count(*) from public.terminy)||', platnosci '||(select count(*) from public.platnosci)||', etapow '||(select count(*) from public.platnosci_etapy)||', umowa '||(select count(*) from public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000001'));
with u as (update public.terminy set data_do='2030-01-01' returning 1) select 'brat zmienil terminow (0): '||count(*) from u;
with u as (update public.platnosci set zaplacona=false returning 1) select 'brat zmienil platnosci (0): '||count(*) from u;
-- brat nie dodaje etapu (ERROR), nie zapisuje płatności (ERROR)
insert into public.terminy(mieszkanie,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','Brat');
select public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('kwota',1,'etapy',jsonb_build_array('77777777-0000-0000-0000-000000000001'))));

-- PATI: po próbach firmy i brata wszystko bez zmian
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'pati po probach: '||string_agg(nr||'='||kwota||(case when zaplacona then ' zaplacona' else ' niezaplacona' end),', ' order by nr) from public.platnosci;
select 'pati: terminow '||count(*)||', data_do 2030 (0): '||count(*) filter (where data_do='2030-01-01') from public.terminy;
-- usunięcie mieszkania usuwa jego terminy i płatności
delete from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select 'po usunieciu mieszkania: terminow '||(select count(*) from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001')||', platnosci '||(select count(*) from public.platnosci)||', etapow '||(select count(*) from public.platnosci_etapy);
-- ANON: nic
set role anon;
select public.umowa_mieszkania('aaaaaaaa-0000-0000-0000-000000000002');
select count(*) from public.terminy;
select count(*) from public.platnosci;
reset role;
