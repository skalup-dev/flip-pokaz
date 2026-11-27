\set ON_ERROR_STOP 0
-- Test klocka 15 (Szukaj ekipy). Po supabase_stub, storage_stub, 01–05, sql/06_szef_firmy.sql, sql/15_szukaj.sql.
-- Właściciel 1111…, brat 2222… (zwykłe konto bez firmy), firma 3333…, druga firma 4444…
-- Linie „OCZEKIWANY BLAD” muszą skończyć się błędem; wszystkie wiersze z wynikiem mają na końcu (OK) albo (ZLE).
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','wlasciciel@x.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}'),
 ('33333333-3333-3333-3333-333333333333','firma@x.pl','{"imie":"Jan"}'),
 ('44444444-4444-4444-4444-444444444444','firma2@x.pl','{"imie":"Ola"}') on conflict do nothing;
update public.profile set rola='firma', nazwa_firmy='Ekipa Zielona' where id='33333333-3333-3333-3333-333333333333';
update public.profile set rola='firma', nazwa_firmy='Bud-Test' where id='44444444-4444-4444-4444-444444444444';
create or replace function pg_temp.ok(b boolean, t text) returns text language sql as $$ select t || case when b then ' (OK)' else ' (ZLE)' end $$;

set role authenticated;
-- WŁAŚCICIEL
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica,miasto,metraz) values ('aaaaaaaa-0000-0000-0000-000000000015','Przykładowa 7/3','Testowo',50);
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values
 ('aaaaaaaa-0000-0000-0000-000000000015','plany','Przykladowa 7 plan.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000015/plany/p.pdf','pdf'),
 ('aaaaaaaa-0000-0000-0000-000000000015','faktury_firma','f.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000015/faktury_firma/f.pdf','pdf');
insert into storage.objects(bucket_id,name) values
 ('biblioteka','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000015/plany/p.pdf'),
 ('biblioteka','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000015/faktury_firma/f.pdf');
-- OCZEKIWANY BLAD: wystawienie bez zakresu
insert into public.zlecenia(mieszkanie,terminy,wystawione) values ('aaaaaaaa-0000-0000-0000-000000000015',array['2030-03-04 16:00','2030-03-05 17:00','2030-03-06 10:00']::timestamp[],true);
-- OCZEKIWANY BLAD: dwa terminy w ten sam dzień
insert into public.zlecenia(mieszkanie,zakres,terminy) values ('aaaaaaaa-0000-0000-0000-000000000015','{Elektryka}',array['2030-03-04 16:00','2030-03-04 18:00','2030-03-06 10:00']::timestamp[]);
-- OCZEKIWANY BLAD: zakres spoza listy
insert into public.zlecenia(mieszkanie,zakres) values ('aaaaaaaa-0000-0000-0000-000000000015','{Basen}');
insert into public.zlecenia(id,mieszkanie,zakres,generalny,dopisek,termin,terminy,wystawione,wystawiono) values
 ('bbbbbbbb-0000-0000-0000-000000000015','aaaaaaaa-0000-0000-0000-000000000015','{Elektryka,Łazienka}',true,'Okna zostają','2,5 miesiąca',
  array['2030-03-04 16:00','2030-03-05 17:00','2030-03-06 10:00']::timestamp[],true,now());
select pg_temp.ok(count(*)=1,'wlasciciel widzi swoje zlecenie: '||count(*)) from public.zlecenia;
select pg_temp.ok(count(*)=0,'wlasciciel (nie firma) nie dostaje folderu Nowe mieszkania: '||count(*)) from public.nowe_mieszkania();

-- BRAT: zwykłe konto bez firmy – nic nie widzi, nic nie bierze
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select pg_temp.ok(count(*)=0,'brat widzi zlecen w tabeli: '||count(*)) from public.zlecenia;
select pg_temp.ok(count(*)=0,'brat widzi Nowe mieszkania: '||count(*)) from public.nowe_mieszkania();
select pg_temp.ok(count(*)=0,'brat widzi pliki zlecenia: '||count(*)) from public.pliki_zlecenia('bbbbbbbb-0000-0000-0000-000000000015');
-- OCZEKIWANY BLAD: brat bierze zlecenie
insert into public.zgloszenia(zlecenie) values ('bbbbbbbb-0000-0000-0000-000000000015');
-- OCZEKIWANY BLAD: brat zadaje pytanie
insert into public.pytania_zlecen(zlecenie,firma,tresc) values ('bbbbbbbb-0000-0000-0000-000000000015','22222222-2222-2222-2222-222222222222','?');
update public.zlecenia set wystawione=false;
select pg_temp.ok(count(*)=0,'brat nie widzi plikow zlecenia w schowku: '||count(*)) from storage.objects;

-- FIRMA 3333
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select pg_temp.ok(count(*)=0,'firma nie widzi tabeli zlecen wprost: '||count(*)) from public.zlecenia;
select pg_temp.ok(count(*)=1 and min(miasto)='Testowo' and bool_and(ulica is null),'firma widzi 1 zlecenie, miasto bez ulicy: '||count(*)||' '||min(miasto)||' ulica='||coalesce(min(ulica),'brak')) from public.nowe_mieszkania();
select pg_temp.ok(count(*)=0,'firma nie widzi mieszkan wprost: '||count(*)) from public.mieszkania;
select pg_temp.ok(count(*)=1 and min(folder)='plany','firma widzi plan zlecenia (bez faktury): '||count(*)||' '||string_agg(folder,',')) from public.pliki_zlecenia('bbbbbbbb-0000-0000-0000-000000000015');
select pg_temp.ok(count(*)=1,'firma moze otworzyc plan w schowku (1, bez faktury): '||count(*)) from storage.objects;
insert into public.pytania_zlecen(zlecenie,firma,tresc) values ('bbbbbbbb-0000-0000-0000-000000000015','33333333-3333-3333-3333-333333333333','Czy okna zostają?');
-- OCZEKIWANY BLAD: pytanie podpisane jako inna firma
insert into public.pytania_zlecen(zlecenie,firma,tresc) values ('bbbbbbbb-0000-0000-0000-000000000015','44444444-4444-4444-4444-444444444444','Podszywam się');
insert into storage.objects(bucket_id,name) values ('biblioteka','33333333-3333-3333-3333-333333333333/realizacje/r1.jpg');
-- OCZEKIWANY BLAD: zdjęcie realizacji w cudzym katalogu
insert into storage.objects(bucket_id,name) values ('biblioteka','44444444-4444-4444-4444-444444444444/realizacje/r1.jpg');
-- OCZEKIWANY BLAD: zgłoszenie ze zdjęciem z cudzego katalogu
insert into public.zgloszenia(zlecenie,zdjecia) values ('bbbbbbbb-0000-0000-0000-000000000015','{44444444-4444-4444-4444-444444444444/realizacje/r1.jpg}');
insert into public.zgloszenia(id,zlecenie,adresy,zdjecia) values ('cccccccc-0000-0000-0000-000000000015','bbbbbbbb-0000-0000-0000-000000000015','{"ul. Wzorowa 1, Testowo"}','{33333333-3333-3333-3333-333333333333/realizacje/r1.jpg}');
-- OCZEKIWANY BLAD: termin 4 (są tylko 3)
update public.zgloszenia set wybor=4;
update public.zgloszenia set wybor=2, zaden=false;
select pg_temp.ok(min(ulica)='Przykładowa 7/3','po wyborze terminu firma dostaje adres: '||coalesce(min(ulica),'brak')||' / termin '||min(wybor)) from public.nowe_mieszkania();
update public.zgloszenia set wybor=null, zaden=true;
select pg_temp.ok(count(*)=1 and bool_and(ulica is null) and bool_and(zaden),'zaden nie pasuje: adres ukryty, zaden=t') from public.nowe_mieszkania();
-- OCZEKIWANY BLAD: firma zmienia cudze zlecenie (kolumna niedozwolona / brak wiersza)
update public.zgloszenia set zlecenie='bbbbbbbb-0000-0000-0000-000000000015';
update public.zgloszenia set wybor=1, zaden=false;

-- FIRMA 4444: nie widzi pytań ani zgłoszenia firmy 3333
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
select pg_temp.ok(count(*)=0,'druga firma widzi cudzych pytan: '||count(*)) from public.pytania_zlecen;
select pg_temp.ok(count(*)=0,'druga firma widzi cudzych zgloszen: '||count(*)) from public.zgloszenia;
select pg_temp.ok(bool_and(zgloszenie is null and ulica is null),'druga firma: zlecenie bez adresu i bez cudzego wyboru') from public.nowe_mieszkania();
select pg_temp.ok(count(*)=1,'druga firma nie widzi zdjec realizacji pierwszej (tylko plan): '||count(*)) from storage.objects;
insert into public.zgloszenia(id,zlecenie,adresy) values ('dddddddd-0000-0000-0000-000000000015','bbbbbbbb-0000-0000-0000-000000000015','{"ul. Testowa 9, Testowo"}');
update public.zgloszenia set wybor=3;
delete from public.zgloszenia where id='dddddddd-0000-0000-0000-000000000015';
select pg_temp.ok(count(*)=0,'druga firma zrezygnowala: '||count(*)) from public.zgloszenia;
-- OCZEKIWANY BLAD: druga firma odwołuje spotkanie pierwszej
select public.odwolaj_spotkanie('cccccccc-0000-0000-0000-000000000015');

-- WŁAŚCICIEL: widzi firmę, pytanie, zdjęcie realizacji; odpowiada, odwołuje spotkanie, zmienia terminy, wycofuje
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select pg_temp.ok(count(*)=1 and min(wybor)=1,'wlasciciel widzi firme, ktora wziela zlecenie, termin 1: '||count(*)) from public.zgloszenia;
select pg_temp.ok(string_agg(nazwa,',')='Ekipa Zielona','nazwy firm przy zleceniu: '||string_agg(nazwa,',')) from public.szukaj_firmy('bbbbbbbb-0000-0000-0000-000000000015');
select pg_temp.ok(count(*)=1,'wlasciciel widzi pytanie firmy: '||count(*)) from public.pytania_zlecen;
select pg_temp.ok(count(*)=1,'wlasciciel otwiera zdjecie realizacji: '||count(*)) from storage.objects where name like '%/realizacje/%';
insert into public.pytania_zlecen(zlecenie,firma,tresc) values ('bbbbbbbb-0000-0000-0000-000000000015','33333333-3333-3333-3333-333333333333','Tak, okna zostają.');
-- OCZEKIWANY BLAD: odpowiedź do firmy, która nie ma nic wspólnego ze zleceniem
insert into public.pytania_zlecen(zlecenie,firma,tresc) values ('bbbbbbbb-0000-0000-0000-000000000015','44444444-4444-4444-4444-444444444444','Halo');
update public.zgloszenia set wybor=3;
select pg_temp.ok(min(wybor)=1,'wlasciciel nie zmieni wyboru firmy wprost (dalej 1): '||min(wybor)) from public.zgloszenia;
select public.odwolaj_spotkanie('cccccccc-0000-0000-0000-000000000015');
select pg_temp.ok(min(wybor) is null,'odwolane spotkanie: wybor pusty') from public.zgloszenia;
-- OCZEKIWANY BLAD: zmiana terminów na dwa w ten sam dzień
update public.zlecenia set terminy=array['2030-04-01 10:00','2030-04-01 12:00','2030-04-02 10:00']::timestamp[];
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
update public.zgloszenia set wybor=2;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.zlecenia set terminy=array['2030-04-01 10:00','2030-04-02 12:00','2030-04-03 10:00']::timestamp[];
select pg_temp.ok(min(wybor) is null and not bool_or(zaden),'nowe terminy: firma wybiera jeszcze raz') from public.zgloszenia;
-- Brat próbuje wycofać cudze zlecenie (brak wiersza – nic się nie zmienia)
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
update public.zlecenia set wystawione=false where id='bbbbbbbb-0000-0000-0000-000000000015';
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select pg_temp.ok(bool_and(wystawione),'brat nie wycofal zlecenia') from public.zlecenia;
update public.zlecenia set wystawione=false where id='bbbbbbbb-0000-0000-0000-000000000015';

-- FIRMA po wycofaniu: nic nie widzi
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select pg_temp.ok(count(*)=0,'po wycofaniu firma widzi Nowe mieszkania: '||count(*)) from public.nowe_mieszkania();
select pg_temp.ok(count(*)=0,'po wycofaniu firma widzi plikow zlecenia: '||count(*)) from public.pliki_zlecenia('bbbbbbbb-0000-0000-0000-000000000015');
-- OCZEKIWANY BLAD: wybór terminu po wycofaniu
update public.zgloszenia set wybor=1 where id='cccccccc-0000-0000-0000-000000000015' returning 'ZMIENIONO (ZLE)';
select pg_temp.ok(count(*)=2,'firma widzi swoja rozmowe (2 wiadomosci): '||count(*)) from public.pytania_zlecen;

-- ANON: nic
reset role; set role anon;
select public.nowe_mieszkania();
select count(*) from public.zlecenia;
reset role;
