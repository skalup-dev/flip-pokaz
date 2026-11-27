\set ON_ERROR_STOP 0
-- Test klocków 11 (Poprawki) i 14 (Ilości). Po supabase_stub, storage_stub, 01–05, sql/06, sql/11, sql/14.
-- Wiersze „OK …” / „ZLE …” – na końcu nie może być żadnego „ZLE”. Oczekiwane błędy są opisane w „-- BLAD:”.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','wlasciciel@x.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}'),
 ('33333333-3333-3333-3333-333333333333','firma@x.pl','{"imie":"Jan"}') on conflict do nothing;
create or replace function pg_temp.ok(w boolean, t text) returns text language sql as $$ select case when w then 'OK   ' else 'ZLE  ' end || t $$;
set role authenticated;

-- ===== WŁAŚCICIEL: mieszkanie, pomieszczenie, prace, zaproszenie =====
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica,firma_remontowa) values ('aaaaaaaa-0000-0000-0000-000000000011','Zmyslona 11','Ekipa Zmyslona'),('aaaaaaaa-0000-0000-0000-000000000012','Zmyslona 12',null);
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa,metraz) values
 ('cccccccc-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000011','Łazienka','Łazienka',4),
 ('cccccccc-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000012','Salon','Salon',20);
insert into public.prace(id,mieszkanie,pomieszczenie,etap,nazwa) values
 ('eeeeeeee-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000011','cccccccc-0000-0000-0000-000000000011',5,'Płytki ścienne');
insert into public.dostepy(id,mieszkanie,kod) values ('dddddddd-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000011','99999999-0000-0000-0000-000000000011');

-- Poprawka właściciela + zdjęcie „przed”
insert into public.poprawki(id,mieszkanie,tresc,pomieszczenie,praca,termin,zrobiona_przez) values
 ('ffffffff-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000011','Fuga do poprawy','cccccccc-0000-0000-0000-000000000011','eeeeeeee-0000-0000-0000-000000000011','2030-01-10','22222222-2222-2222-2222-222222222222');
select pg_temp.ok(zgloszona_przez='11111111-1111-1111-1111-111111111111' and zgloszona_kiedy is not null and zrobiona_przez is null and wlasciciel='11111111-1111-1111-1111-111111111111','11: kto i kiedy zgłosił ustawia baza (nie da się podsunąć zrobiona_przez)') from public.poprawki where id='ffffffff-0000-0000-0000-000000000011';
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,poprawka,poprawka_etap) values
 ('aaaaaaaa-0000-0000-0000-000000000011','poprawki','przed.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011/poprawki/przed.jpg','zdjecie','ffffffff-0000-0000-0000-000000000011','przed');
select pg_temp.ok(count(*)=1,'11: zdjęcie przed poprawką w Bibliotece › Poprawki') from public.pliki where poprawka='ffffffff-0000-0000-0000-000000000011' and poprawka_etap='przed';
-- BLAD: pomieszczenie z innego mieszkania
insert into public.poprawki(mieszkanie,tresc,pomieszczenie) values ('aaaaaaaa-0000-0000-0000-000000000011','Zle pomieszczenie','cccccccc-0000-0000-0000-000000000012');
-- BLAD: nowa poprawka od razu zrobiona
insert into public.poprawki(mieszkanie,tresc,zrobiona) values ('aaaaaaaa-0000-0000-0000-000000000011','Od razu zrobiona',true);
-- BLAD: pusta treść
insert into public.poprawki(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000011','   ');
-- BLAD: zatwierdzenie bez zdjęcia po poprawce
update public.poprawki set zatwierdzona=true where id='ffffffff-0000-0000-0000-000000000011';
-- BLAD: zdjęcie poprawki w złym folderze
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,poprawka,poprawka_etap) values
 ('aaaaaaaa-0000-0000-0000-000000000011','postepy','zly.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011/postepy/zly.jpg','zdjecie','ffffffff-0000-0000-0000-000000000011','po');
select pg_temp.ok(count(*)=1,'11: błędne poprawki nie zapisały się (jest 1)') from public.poprawki;

-- Ilości (klocek 14)
insert into public.ilosci(id,mieszkanie,grupa,nazwa,ilosc,jednostka,stan,sprawdzil) values
 ('bbbbbbbb-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000011','Elektryka','Gniazda pojedyncze',5,'szt.','zgadza','22222222-2222-2222-2222-222222222222'),
 ('bbbbbbbb-0000-0000-0000-000000000012','aaaaaaaa-0000-0000-0000-000000000011','Podłogi','Panele',12.5,'m²','nowa',null);
insert into public.ilosci(id,mieszkanie,grupa,nazwa,do_sprawdzenia) values ('bbbbbbbb-0000-0000-0000-000000000013','aaaaaaaa-0000-0000-0000-000000000011','Płyty G-K','Wnęka LED',true);
select pg_temp.ok(stan='nowa' and sprawdzil is null and dodal='11111111-1111-1111-1111-111111111111','14: nowa pozycja zawsze „nowa”, kto dodał ustawia baza') from public.ilosci where id='bbbbbbbb-0000-0000-0000-000000000011';
-- BLAD: pozycja bez liczby i nie „do sprawdzenia”
insert into public.ilosci(mieszkanie,grupa,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000011','Podłogi','Bez liczby');
-- BLAD: zła grupa
insert into public.ilosci(mieszkanie,grupa,nazwa,ilosc) values ('aaaaaaaa-0000-0000-0000-000000000011','Dachy','Dach',1);
-- BLAD: „Zgadza się” przy pozycji bez liczby
update public.ilosci set stan='zgadza' where id='bbbbbbbb-0000-0000-0000-000000000013';
-- BLAD: „Popraw” bez liczby architekta
update public.ilosci set stan='poprawiona' where id='bbbbbbbb-0000-0000-0000-000000000012';
update public.ilosci set stan='zgadza' where id='bbbbbbbb-0000-0000-0000-000000000011';
update public.ilosci set stan='poprawiona', ilosc_architekt=14, powod='Architekt dodał korytarz' where id='bbbbbbbb-0000-0000-0000-000000000012';
select pg_temp.ok(string_agg(nazwa||':'||stan||':'||coalesce(ilosc_architekt::text,'-')||':'||(sprawdzil is not null)::text, ',' order by nazwa)='Gniazda pojedyncze:zgadza:-:true,Panele:poprawiona:14.00:true,Wnęka LED:nowa:-:false','14: „Zgadza się” i „Popraw” zapisane z kto/kiedy') from public.ilosci;
update public.ilosci set stan='nowa' where id='bbbbbbbb-0000-0000-0000-000000000011';
select pg_temp.ok(stan='nowa' and sprawdzil is null and sprawdzono is null,'14: „Odznacz” czyści kto/kiedy') from public.ilosci where id='bbbbbbbb-0000-0000-0000-000000000011';
insert into public.pytania_architekt(id,mieszkanie,tresc,wyjasnione) values ('abababab-0000-0000-0000-000000000011','aaaaaaaa-0000-0000-0000-000000000011','Brak wymiaru gniazda',true);
select pg_temp.ok(not wyjasnione and dodal='11111111-1111-1111-1111-111111111111','14: nowe pytanie zawsze niewyjaśnione') from public.pytania_architekt;
update public.pytania_architekt set wyjasnione=true where id='abababab-0000-0000-0000-000000000011';
select pg_temp.ok(wyjasnione and wyjasnil='11111111-1111-1111-1111-111111111111' and wyjasniono is not null,'14: „Wyjaśnione” z kto/kiedy') from public.pytania_architekt;
insert into public.ilosci_wysokosc(mieszkanie,wysokosc_cm) values ('aaaaaaaa-0000-0000-0000-000000000011',265);
-- BLAD: wysokość spoza zakresu
update public.ilosci_wysokosc set wysokosc_cm=40 where mieszkanie='aaaaaaaa-0000-0000-0000-000000000011';
select pg_temp.ok(wysokosc_cm=265 and zmienil is not null,'14: wysokość 265 cm zapisana') from public.ilosci_wysokosc;

-- ===== FIRMA: przyjmuje zaproszenie =====
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select pg_temp.ok(count(*)=0,'firma przed przyjęciem nie widzi poprawek') from public.poprawki;
select pg_temp.ok(public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000011')='aaaaaaaa-0000-0000-0000-000000000011','firma przyjęła zaproszenie');
select pg_temp.ok(count(*)=1,'11: firma widzi poprawkę') from public.poprawki;
select pg_temp.ok((select count(*) from public.ilosci)=3 and (select count(*) from public.pytania_architekt)=1 and (select count(*) from public.ilosci_wysokosc)=1,'14: firma widzi ilości, pytania i wysokość');
-- BLAD: firma nie dodaje poprawki
insert into public.poprawki(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000011','Firma dodaje');
-- BLAD: firma nie zmienia treści
update public.poprawki set tresc='Zmienione' where id='ffffffff-0000-0000-0000-000000000011';
-- BLAD: firma nie oznacza „zrobione” bez zdjęcia
update public.poprawki set zrobiona=true where id='ffffffff-0000-0000-0000-000000000011';
-- BLAD: firma nie dodaje zdjęcia „przed”
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ,poprawka,poprawka_etap) values
 ('aaaaaaaa-0000-0000-0000-000000000011','11111111-1111-1111-1111-111111111111','poprawki','f-przed.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011/poprawki/f-przed.jpg','zdjecie','ffffffff-0000-0000-0000-000000000011','przed');
select pg_temp.ok(public.firma_moze_wgrac('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011/poprawki/po.jpg'),'11: firma może wgrać plik do schowka Poprawki');
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ,poprawka,poprawka_etap) values
 ('aaaaaaaa-0000-0000-0000-000000000011','11111111-1111-1111-1111-111111111111','poprawki','po.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011/poprawki/po.jpg','zdjecie','ffffffff-0000-0000-0000-000000000011','po');
update public.poprawki set zrobiona=true where id='ffffffff-0000-0000-0000-000000000011';
select pg_temp.ok(zrobiona and zrobiona_przez='33333333-3333-3333-3333-333333333333' and zrobiona_kiedy is not null and not zatwierdzona,'11: firma oznaczyła „zrobione” ze zdjęciem (kto/kiedy z bazy)') from public.poprawki;
select pg_temp.ok(dodal='33333333-3333-3333-3333-333333333333','11: zdjęcie po poprawce: dodał = firma') from public.pliki where nazwa='po.jpg';
-- BLAD: firma nie zatwierdza
update public.poprawki set zatwierdzona=true where id='ffffffff-0000-0000-0000-000000000011';
-- „Odznacz – cofnij wysłanie” i ponownie wysłanie
update public.poprawki set zrobiona=false where id='ffffffff-0000-0000-0000-000000000011';
select pg_temp.ok(not zrobiona and zrobiona_przez is null,'11: firma cofnęła wysłanie („Odznacz”)') from public.poprawki;
update public.poprawki set zrobiona=true where id='ffffffff-0000-0000-0000-000000000011';
-- BLAD: firma nie zmienia ilości / pytań / wysokości
insert into public.ilosci(mieszkanie,grupa,nazwa,ilosc) values ('aaaaaaaa-0000-0000-0000-000000000011','Podłogi','Firma',1);
update public.ilosci set stan='zgadza' returning 'ZLE  firma zmieniła ilość';
update public.pytania_architekt set wyjasnione=false returning 'ZLE  firma zmieniła pytanie';
update public.ilosci_wysokosc set wysokosc_cm=300 returning 'ZLE  firma zmieniła wysokość';
delete from public.poprawki returning 'ZLE  firma usunęła poprawkę';
delete from public.pliki where nazwa='po.jpg' returning 'ZLE  firma usunęła zdjęcie';
select pg_temp.ok(n.nazwa='Marek','11: firma widzi podpis „Zgłoszone przez: Marek”') from public.poprawki p join public.kto_nazwy(array[p.zgloszona_przez]) n on true;

-- ===== WŁAŚCICIEL: zatwierdza, odznacza, widzi podpis firmy =====
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select pg_temp.ok(n.nazwa='Ekipa Zmyslona','11: właściciel widzi podpis „Zdjęcie dodane przez: Ekipa Zmyslona”') from public.poprawki p join public.kto_nazwy(array[p.zrobiona_przez]) n on true;
update public.poprawki set zatwierdzona=true where id='ffffffff-0000-0000-0000-000000000011';
select pg_temp.ok(zatwierdzona and zatwierdzona_przez='11111111-1111-1111-1111-111111111111' and zatwierdzona_kiedy is not null,'11: właściciel zatwierdził') from public.poprawki;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
-- BLAD: firma nie cofa zatwierdzonej
update public.poprawki set zrobiona=false where id='ffffffff-0000-0000-0000-000000000011';
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.poprawki set zatwierdzona=false where id='ffffffff-0000-0000-0000-000000000011';
select pg_temp.ok(zrobiona and not zatwierdzona and zatwierdzona_przez is null,'11: „Odznacz” cofa zatwierdzenie, zdjęcie zostaje') from public.poprawki;
-- usunięcie ostatniego zdjęcia „po” z Biblioteki: poprawka wraca do niezrobionej
delete from public.pliki where nazwa='po.jpg';
select pg_temp.ok(not zrobiona,'11: po usunięciu zdjęcia po poprawce poprawka wraca do „niezrobiona”') from public.poprawki;
-- właściciel sam dodaje zdjęcie po poprawce i zatwierdza
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,poprawka,poprawka_etap) values
 ('aaaaaaaa-0000-0000-0000-000000000011','poprawki','po2.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000011/poprawki/po2.jpg','zdjecie','ffffffff-0000-0000-0000-000000000011','po');
update public.poprawki set zrobiona=true, zatwierdzona=true where id='ffffffff-0000-0000-0000-000000000011';
select pg_temp.ok(zrobiona and zatwierdzona,'11: właściciel sam dodał zdjęcie i zatwierdził') from public.poprawki;

-- ===== BRAT: nic nie widzi i nic nie zmienia =====
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select pg_temp.ok((select count(*) from public.poprawki)=0 and (select count(*) from public.ilosci)=0 and (select count(*) from public.pytania_architekt)=0 and (select count(*) from public.ilosci_wysokosc)=0 and (select count(*) from public.pliki)=0,'brat nic nie widzi');
update public.poprawki set zatwierdzona=false returning 'ZLE  brat zmienił poprawkę';
update public.ilosci set stan='nowa' returning 'ZLE  brat zmienił ilość';
delete from public.pytania_architekt returning 'ZLE  brat usunął pytanie';
-- BLAD: brat nie dodaje
insert into public.poprawki(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000011','Brat');
-- BLAD: brat nie dodaje ilości
insert into public.ilosci(mieszkanie,grupa,nazwa,ilosc) values ('aaaaaaaa-0000-0000-0000-000000000011','Podłogi','Brat',1);

-- ===== Firma po zabraniu dostępu =====
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
update public.dostepy set aktywny=false where id='dddddddd-0000-0000-0000-000000000011';
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select pg_temp.ok((select count(*) from public.poprawki)=0 and (select count(*) from public.ilosci)=0,'po zabraniu dostępu firma nie widzi poprawek ani ilości');
-- ===== Usuwanie przez właściciela: zdjęcia zostają w Bibliotece =====
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
delete from public.ilosci where id='bbbbbbbb-0000-0000-0000-000000000013';
delete from public.poprawki where id='ffffffff-0000-0000-0000-000000000011';
select pg_temp.ok((select count(*) from public.poprawki)=0 and (select count(*) from public.pliki where folder='poprawki')=2 and (select count(*) from public.ilosci)=2,'właściciel usuwa poprawkę i pozycję; zdjęcia zostają w Bibliotece › Poprawki');
-- ===== anon =====
reset role; set role anon;
-- BLAD: anon bez dostępu
select count(*) from public.poprawki;
-- BLAD: anon bez dostępu
select count(*) from public.ilosci;
reset role;
