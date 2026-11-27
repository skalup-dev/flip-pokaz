\set ON_ERROR_STOP 0
-- Test klocków 7 i 8. Po supabase_stub, storage_stub, 01–05, sql/06_szef_firmy.sql, sql/07_paragony.sql.
-- Linie „ERROR” są oczekiwane tam, gdzie komentarz mówi „ma się nie udać”.
insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','pati@x.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@x.pl','{}'),
 ('33333333-3333-3333-3333-333333333333','firma@x.pl','{"imie":"Jan"}') on conflict do nothing;
set role authenticated;
-- WŁAŚCICIEL
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
insert into public.mieszkania(id,ulica,firma_remontowa,metraz,cena_zakupu,cena_firmy_m2,budzet_materialow) values ('aaaaaaaa-0000-0000-0000-000000000071','Testowa 71','Ekipa Testowa',50,230000,900,55000);
insert into public.mieszkania(id,ulica) values ('aaaaaaaa-0000-0000-0000-000000000072','Testowa 72');
insert into public.pliki(id,mieszkanie,folder,nazwa,sciezka,typ) values
 ('f0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000071','paragony','p1.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000071/paragony/p1.jpg','zdjecie'),
 ('f0000000-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000071','plany','plan.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000071/plany/plan.pdf','pdf');
insert into public.paragony(id,mieszkanie,wlasciciel,dodal,plik,sklep,co,kwota,data,zaplacil,sprawdzone,zrodlo_odczytu,pewnosc,pola_niepewne,pozycje,nip,tekst_surowy)
 values ('b0000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000071','22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222','f0000000-0000-0000-0000-000000000001',
 'Sklep Testowy','Farba',228.18,'2026-11-14','wlasciciel',true,'tesseract',94,'{}','[{"nazwa":"Farba","ilosc":2,"cena":89.99,"wartosc":179.98}]','1234563218','SUMA PLN 228,18');
select 'wlasciciel: wiersz należy do właściciela mieszkania, dodał = właściciel (podmiana nie działa): '||(wlasciciel='11111111-1111-1111-1111-111111111111')||' '||(dodal='11111111-1111-1111-1111-111111111111')||', sprawdził ustawiony: '||(sprawdzil is not null) from public.paragony;
-- ma się nie udać: zdjęcie z innego folderu, kwota ujemna, pusty sklep, zły NIP, nieznane źródło, nieznane pole niepewne
insert into public.paragony(mieszkanie,plik,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000071','f0000000-0000-0000-0000-000000000009','X',1);
insert into public.paragony(mieszkanie,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000071','X',-1);
insert into public.paragony(mieszkanie,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000071','  ',1);
insert into public.paragony(mieszkanie,sklep,kwota,nip) values ('aaaaaaaa-0000-0000-0000-000000000071','X',1,'12345');
insert into public.paragony(mieszkanie,sklep,kwota,zrodlo_odczytu) values ('aaaaaaaa-0000-0000-0000-000000000071','X',1,'zgadywanie');
insert into public.paragony(mieszkanie,sklep,kwota,pola_niepewne) values ('aaaaaaaa-0000-0000-0000-000000000071','X',1,'{wszystko}');
select 'po złych wpisach dalej 1 dokument: '||count(*) from public.paragony;
-- Odznacz i ponowne sprawdzenie
update public.paragony set sprawdzone=false where id='b0000000-0000-0000-0000-000000000001';
select 'odznaczone: sprawdzone='||sprawdzone||', sprawdzil pusty='||(sprawdzil is null) from public.paragony;
update public.paragony set sprawdzone=true, kwota=228.20, pola_niepewne='{}' where id='b0000000-0000-0000-0000-000000000001';
select 'poprawione i sprawdzone: '||kwota||' '||sprawdzone||' '||(sprawdzono is not null) from public.paragony;
update public.paragony set tekst_surowy='podmiana', mieszkanie='aaaaaaaa-0000-0000-0000-000000000072' where id='b0000000-0000-0000-0000-000000000001';
-- ma się nie udać (brak uprawnienia do kolumny tekst_surowy)
select 'tekst i mieszkanie nietknięte: '||tekst_surowy||' / '||mieszkanie from public.paragony;
update public.mieszkania set cena_zakupu=240000, cena_firmy_m2=950, budzet_materialow=60000 where id='aaaaaaaa-0000-0000-0000-000000000071';
select 'klocek 8: kwoty zmienione: '||cena_zakupu||' '||cena_firmy_m2||' '||budzet_materialow||', umowa = '||cena_firmy_m2*metraz from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000071';
update public.mieszkania set cena_firmy_m2=-5 where id='aaaaaaaa-0000-0000-0000-000000000071';
-- ↑ ma się nie udać (cena ujemna)
insert into public.dostepy(id,mieszkanie,kod) values ('dddddddd-0000-0000-0000-000000000071','aaaaaaaa-0000-0000-0000-000000000071','99999999-0000-0000-0000-000000000071');
-- FIRMA
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'firma przed przyjęciem widzi paragonów (0): '||count(*) from public.paragony;
insert into public.paragony(mieszkanie,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000071','Przed',1);
-- ↑ ma się nie udać (firma bez dostępu)
select 'przyjęto: '||public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000071');
select 'firma nie widzi paragonu zapłaconego przez właściciela (0): '||count(*) from public.paragony;
insert into public.pliki(id,mieszkanie,wlasciciel,folder,nazwa,sciezka,typ) values ('f0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000071','11111111-1111-1111-1111-111111111111','paragony','p2.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000071/paragony/p2.jpg','zdjecie');
select 'firma może wgrać zdjęcie paragonu (t): '||public.firma_moze_wgrac('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000071/paragony/x.jpg');
-- firma próbuje: zapłacił właściciel + od razu sprawdzone → baza i tak zapisze „firma”, „do sprawdzenia”
insert into public.paragony(id,mieszkanie,wlasciciel,plik,sklep,kwota,zaplacil,sprawdzone,zrodlo_odczytu,pola_niepewne)
 values ('b0000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000071','11111111-1111-1111-1111-111111111111','f0000000-0000-0000-0000-000000000002','Market Firmowy',159.60,'wlasciciel',true,'tesseract','{kwota}');
select 'firma dodała: '||zaplacil||', sprawdzone='||sprawdzone||', wlasciciel=Pati '||(wlasciciel='11111111-1111-1111-1111-111111111111')||', dodal=firma '||(dodal='33333333-3333-3333-3333-333333333333') from public.paragony;
select 'firma widzi (1): '||count(*) from public.paragony;
update public.paragony set kwota=1, sprawdzone=true where id='b0000000-0000-0000-0000-000000000002';
delete from public.paragony where id='b0000000-0000-0000-0000-000000000002';
select 'firma nie poprawia i nie usuwa: '||kwota||' '||sprawdzone||' (zostaje 1: '||(select count(*) from public.paragony)||')' from public.paragony;
insert into public.paragony(mieszkanie,wlasciciel,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000072','11111111-1111-1111-1111-111111111111','Obce',1);
-- ↑ ma się nie udać (mieszkanie bez dostępu firmy)
select 'firma: zlecenie bez ceny zakupu i budżetu (f f f), mieszkań wprost (0): '||(to_jsonb(z) ? 'cena_zakupu')||' '||(to_jsonb(z) ? 'cena_firmy_m2')||' '||(to_jsonb(z) ? 'budzet_materialow')||' '||(select count(*) from public.mieszkania) from public.zlecenia_firmy() z;
update public.mieszkania set cena_zakupu=1;
select 'dodał (podpis): '||nazwa from public.kto_nazwy(array['33333333-3333-3333-3333-333333333333']::uuid[]);
-- WŁAŚCICIEL widzi oba, sumy klocka 8
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'właściciel widzi '||count(*)||', wydane (sprawdzone) '||coalesce(sum(kwota) filter (where sprawdzone),0)||', czeka '||coalesce(sum(kwota) filter (where not sprawdzone),0) from public.paragony;
select 'cena zakupu nietknięta przez firmę: '||cena_zakupu from public.mieszkania where id='aaaaaaaa-0000-0000-0000-000000000071';
update public.paragony set sprawdzone=true where id='b0000000-0000-0000-0000-000000000002';
select 'właściciel sprawdził dokument firmy: '||sprawdzone||', sprawdził=Pati '||(sprawdzil='11111111-1111-1111-1111-111111111111') from public.paragony where id='b0000000-0000-0000-0000-000000000002';
-- usunięcie zdjęcia z Biblioteki: dokument zostaje bez zdjęcia
delete from public.pliki where id='f0000000-0000-0000-0000-000000000002';
select 'po usunięciu zdjęcia dokument zostaje, plik pusty: '||(plik is null) from public.paragony where id='b0000000-0000-0000-0000-000000000002';
-- zabrany dostęp
update public.dostepy set aktywny=false where id='dddddddd-0000-0000-0000-000000000071';
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select 'po zabraniu dostępu firma widzi (0): '||count(*) from public.paragony;
-- BRAT
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select 'brat widzi paragonów (0): '||count(*)||', mieszkań: '||(select count(*) from public.mieszkania) from public.paragony;
insert into public.paragony(mieszkanie,wlasciciel,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000071','22222222-2222-2222-2222-222222222222','Brat',1);
-- ↑ ma się nie udać
update public.paragony set kwota=0;
delete from public.paragony;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select 'po próbach brata właściciel ma dalej '||count(*)||' dokumenty, suma '||sum(kwota) from public.paragony;
-- usunięcie dokumentu przez właściciela
delete from public.paragony where id='b0000000-0000-0000-0000-000000000002';
select 'właściciel usunął dokument, zostało: '||count(*) from public.paragony;
reset role; set role anon;
select count(*) from public.paragony;
-- ↑ ma się nie udać (anon)
