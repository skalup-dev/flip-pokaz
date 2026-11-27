\set ON_ERROR_STOP 0
\pset tuples_only on
\pset format unaligned
-- Test klocków 12 (Chat) i 13 (Powiadomienia). Kolejność jak w pliku zbiorczym: supabase_stub, storage_stub, 01–05,
-- sql/06, 09, 10, 11, 12, 14, 15, 13 (na końcu). Zdarzenia klocków 9–11 testowane na ich prawdziwych tabelach.
-- Każdy wiersz zaczyna się od OK albo ZLE. Na końcu: liczba OK i ZLE.
-- Konta: 1111 Właściciel aplikacji (Marek), 2222 brat (nic nie widzi), 3333 firma A, 4444 firma B (inne mieszkanie)
create temp table wynik(ok boolean, opis text);
grant insert, select on wynik to authenticated, anon;
create or replace function pg_temp.spr(w boolean, o text) returns text language sql as $$
  insert into wynik values (coalesce(w, false), o); select case when coalesce(w, false) then 'OK   ' else 'ZLE  ' end || o $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','wlasciciel@test.pl','{"imie":"Marek"}'),
 ('22222222-2222-2222-2222-222222222222','brat@test.pl','{}'),
 ('33333333-3333-3333-3333-333333333333','firmaa@test.pl','{"imie":"Jan"}'),
 ('44444444-4444-4444-4444-444444444444','firmab@test.pl','{"imie":"Olek"}') on conflict do nothing;
set role authenticated;
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
insert into public.mieszkania(id,ulica,firma_remontowa,termin_konca) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Testowa 1','Ekipa Testowa','2030-01-31'),
 ('aaaaaaaa-0000-0000-0000-000000000002','Testowa 2','Budowa Próbna',null);
insert into public.pomieszczenia(id,mieszkanie,rodzaj,nazwa) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Salon','Salon');
insert into public.prace(id,mieszkanie,pomieszczenie,etap,nazwa) values
 ('eeeeeeee-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',6,'Panele'),
 ('eeeeeeee-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',7,'Lampy');
insert into public.dostepy(id,mieszkanie,kod) values
 ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001'),
 ('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000002');
-- chat bez firmy z dostępem
do $$ begin insert into public.wiadomosci(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','Dzień dobry');
  raise notice 'ZLE  chat bez firmy przyjęty'; exception when others then raise notice 'OK   chat bez firmy z dostępem odrzucony (%)', sqlerrm; end $$;
-- firmy przyjmują zaproszenia
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000001') is not null, 'firma przyjmuje zaproszenie (public.przyjmij_zaproszenie)');
update public.profile set imie = 'Jan' where id = auth.uid();
set request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
select pg_temp.spr(public.przyjmij_zaproszenie('99999999-0000-0000-0000-000000000002') is not null, 'firma przyjmuje zaproszenie (public.przyjmij_zaproszenie)');

-- ===== Klocek 12: chat przy mieszkaniu =====
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
insert into public.wiadomosci(mieszkanie,tresc,autor,utworzono) values ('aaaaaaaa-0000-0000-0000-000000000001','  Jutro wchodzą tynki?  ','22222222-2222-2222-2222-222222222222','2000-01-01');
select pg_temp.spr(firma='33333333-3333-3333-3333-333333333333' and autor=auth.uid() and wlasciciel=auth.uid() and tresc='Jutro wchodzą tynki?' and utworzono > now() - interval '1 minute',
  'właściciel pisze: firma, autor, właściciel, kiedy ustawia baza (podmiana autora i daty nie działa)') from public.wiadomosci;
do $$ begin insert into public.wiadomosci(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','   ');
  raise notice 'ZLE  pusta wiadomość przyjęta'; exception when others then raise notice 'OK   pusta wiadomość odrzucona (%)', sqlerrm; end $$;
do $$ begin insert into public.wiadomosci(mieszkanie,firma,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','Do złej firmy');
  raise notice 'ZLE  wiadomość do firmy bez dostępu przyjęta'; exception when others then raise notice 'OK   wiadomość do firmy bez dostępu do mieszkania odrzucona (%)', sqlerrm; end $$;
insert into public.pliki(id,mieszkanie,folder,nazwa,sciezka,typ) values ('ffffffff-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000001','faktury_firma','f.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/faktury_firma/f.pdf','pdf');
insert into public.wiadomosci(mieszkanie,firma,tresc) values ('aaaaaaaa-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','Pytanie do firmy B');

-- FIRMA A
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(count(*)=1, 'firma A widzi tylko swoją rozmowę (1 wiadomość, nie widzi rozmowy z firmą B): '||count(*)) from public.wiadomosci;
insert into public.wiadomosci(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','Tak, od 8:00');
insert into public.pliki(id,mieszkanie,wlasciciel,folder,nazwa,sciezka,typ) values ('ffffffff-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','postepy','chat.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/c1.jpg','zdjecie');
insert into public.wiadomosci(mieszkanie,plik) values ('aaaaaaaa-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000001');
select pg_temp.spr(zdjecie='11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/c1.jpg' and tresc is null and firma=auth.uid(),
  'firma A wysyła samo zdjęcie: ścieżka z Biblioteki › Postępy prac') from public.wiadomosci where plik='ffffffff-0000-0000-0000-000000000001';
select pg_temp.spr(public.firma_moze_wgrac('11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/c2.jpg'), 'firma A może wgrać zdjęcie z chatu do schowka (Postępy prac)');
do $$ begin insert into public.wiadomosci(mieszkanie,plik) values ('aaaaaaaa-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000009');
  raise notice 'ZLE  firma dołączyła fakturę'; exception when others then raise notice 'OK   firma nie dołączy faktury ani cudzego pliku (%)', sqlerrm; end $$;
do $$ begin insert into public.wiadomosci(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000002','Wchodzę do cudzego');
  raise notice 'ZLE  firma A pisze w mieszkaniu firmy B'; exception when others then raise notice 'OK   firma A nie pisze w mieszkaniu, do którego nie ma dostępu (%)', sqlerrm; end $$;
do $$ begin update public.wiadomosci set tresc='zmienione'; raise notice 'ZLE  firma zmieniła wiadomość'; exception when others then raise notice 'OK   wiadomości nie da się zmienić (%)', sqlerrm; end $$;
do $$ begin delete from public.wiadomosci; raise notice 'ZLE  firma usunęła wiadomość'; exception when others then raise notice 'OK   wiadomości nie da się usunąć (%)', sqlerrm; end $$;
select pg_temp.spr(string_agg(n.nazwa, ',' order by n.nazwa)='Ekipa Testowa,Marek', 'podpisy w chacie u firmy: '||string_agg(n.nazwa, ',' order by n.nazwa))
  from public.kto_nazwy(array['11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333']::uuid[]) n;

-- FIRMA B
set request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
select pg_temp.spr(count(*)=1 and bool_and(mieszkanie='aaaaaaaa-0000-0000-0000-000000000002'), 'firma B nie widzi rozmowy firmy A (widzi tylko swoją: '||count(*)||')') from public.wiadomosci;
select pg_temp.spr(count(*)=0, 'firma B nie widzi nazwy firmy A') from public.kto_nazwy(array['33333333-3333-3333-3333-333333333333']::uuid[]);

-- BRAT
set request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
select pg_temp.spr(count(*)=0, 'brat nie widzi żadnej wiadomości') from public.wiadomosci;
do $$ begin insert into public.wiadomosci(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','Hej');
  raise notice 'ZLE  brat napisał'; exception when others then raise notice 'OK   brat nie pisze w chacie (%)', sqlerrm; end $$;

-- WŁAŚCICIEL
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select pg_temp.spr(count(*)=4, 'właściciel widzi obie rozmowy (4 wiadomości): '||count(*)) from public.wiadomosci;
select pg_temp.spr(string_agg(n.nazwa, ',' order by n.nazwa)='Budowa Próbna,Ekipa Testowa,Marek', 'podpisy u właściciela (nazwy firm): '||string_agg(n.nazwa, ',' order by n.nazwa))
  from public.kto_nazwy(array['11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444']::uuid[]) n;

-- ===== Klocek 12: chat ogólny =====
insert into public.wiadomosci_ogolne(tresc) values ('Mamy kolejne mieszkanie, szczegóły w środę');
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
insert into public.wiadomosci_ogolne(wlasciciel,tresc) values ('11111111-1111-1111-1111-111111111111','Biorę, pasuje środa');
select pg_temp.spr(count(*)=2, 'firma A widzi wiadomość właściciela i swoją odpowiedź: '||count(*)) from public.wiadomosci_ogolne;
do $$ begin insert into public.wiadomosci_ogolne(tresc) values ('Do wszystkich firm od firmy');
  raise notice 'ZLE  firma pisze jako właściciel'; exception when others then raise notice 'OK   firma nie pisze do wszystkich firm (%)', sqlerrm; end $$;
set request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
select pg_temp.spr(count(*)=1 and bool_and(firma is null), 'firma B widzi tylko wiadomość właściciela, nie widzi odpowiedzi firmy A: '||count(*)) from public.wiadomosci_ogolne;
insert into public.wiadomosci_ogolne(wlasciciel,tresc,firma) values ('11111111-1111-1111-1111-111111111111','Ja też chętnie','33333333-3333-3333-3333-333333333333');
select pg_temp.spr(firma='44444444-4444-4444-4444-444444444444', 'firma B nie podszyje się pod firmę A (firma ustawia baza)') from public.wiadomosci_ogolne where tresc='Ja też chętnie';
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(count(*)=2, 'firma A nadal nie widzi odpowiedzi firmy B: '||count(*)) from public.wiadomosci_ogolne;
set request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
select pg_temp.spr(count(*)=0, 'brat nie widzi chatu ogólnego') from public.wiadomosci_ogolne;
do $$ begin insert into public.wiadomosci_ogolne(wlasciciel,tresc) values ('11111111-1111-1111-1111-111111111111','Hej');
  raise notice 'ZLE  brat pisze w chacie ogólnym'; exception when others then raise notice 'OK   brat nie pisze w chacie ogólnym właściciela (%)', sqlerrm; end $$;
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select pg_temp.spr(count(*)=3, 'właściciel widzi cały chat ogólny (3): '||count(*)) from public.wiadomosci_ogolne;

-- ===== Klocek 13: zdarzenia z triggerów =====
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
do $$ begin update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
  raise notice 'ZLE  praca bez zdjęcia odznaczona'; exception when others then raise notice 'OK   praca bez zdjęcia nie odznacza się i nie daje zdarzenia (%)', sqlerrm; end $$;
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ,praca) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','postepy','panele.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/p1.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000001');
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000001';
-- paragon jak w aplikacji: zdjęcie w Bibliotece › Paragony + wiersz w tabeli paragony (klocek 7)
insert into public.pliki(id,mieszkanie,wlasciciel,folder,nazwa,sciezka,typ) values ('ffffffff-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','paragony','obi.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/paragony/o1.jpg','zdjecie');
insert into public.paragony(mieszkanie,plik,sklep,kwota) values ('aaaaaaaa-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000002','Sklep Budowlany',540.5);
select pg_temp.spr(string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, rodzaj)
  = 'wiadomosc: Wiadomość od Marek: „Jutro wchodzą tynki?” | ogolny: Chat ogólny – Marek: „Mamy kolejne mieszkanie, szczegóły w środę” | etap: Etap skończony: 6. Podłogi i drzwi',
  'firma A ma swoje zdarzenia: '||string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, rodzaj)) from public.zdarzenia;
select pg_temp.spr(bool_and(cel='chat' and cel_id='33333333-3333-3333-3333-333333333333'), 'zdarzenie wiadomości otwiera chat właściwej rozmowy') from public.zdarzenia where rodzaj='wiadomosc';
do $$ begin insert into public.zdarzenia(odbiorca,rodzaj,tresc) values (auth.uid(),'etap','Udawane');
  raise notice 'ZLE  zdarzenie dopisane ręcznie'; exception when others then raise notice 'OK   aplikacja nie dopisze zdarzenia sama (%)', sqlerrm; end $$;
do $$ begin perform public.dodaj_zdarzenie('11111111-1111-1111-1111-111111111111'::uuid,null,'etap','Udawane');
  raise notice 'ZLE  funkcja dodająca dostępna'; exception when others then raise notice 'OK   funkcja dodająca zdarzenie niedostępna dla aplikacji (%)', sqlerrm; end $$;
do $$ begin update public.zdarzenia set tresc='zmiana'; raise notice 'ZLE  treść zmieniona'; exception when others then raise notice 'OK   treści zdarzenia nie da się zmienić (%)', sqlerrm; end $$;

set request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
select pg_temp.spr(string_agg(tresc, ' | ' order by utworzono)='Wiadomość od Marek: „Pytanie do firmy B” | Chat ogólny – Marek: „Mamy kolejne mieszkanie, szczegóły w środę”',
  'firma B ma tylko swoje zdarzenia: '||string_agg(tresc, ' | ' order by utworzono)) from public.zdarzenia;
update public.zdarzenia set przeczytane=true where odbiorca='11111111-1111-1111-1111-111111111111';

set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select pg_temp.spr(string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, rodzaj) =
  'wiadomosc: Wiadomość od Ekipa Testowa: „Tak, od 8:00” | wiadomosc: Wiadomość od Ekipa Testowa: zdjęcie | ogolny: Chat ogólny – Ekipa Testowa: „Biorę, pasuje środa” | ogolny: Chat ogólny – Budowa Próbna: „Ja też chętnie” | etap: Etap skończony: 6. Podłogi i drzwi | praca: Praca odznaczona: Salon, Panele (Ekipa Testowa) | paragon: Nowy paragon: Sklep Budowlany 540,50 zł (Ekipa Testowa)',
  'właściciel ma zdarzenia od firm: '||string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, rodzaj)) from public.zdarzenia;
select pg_temp.spr(count(*)=0, 'firma B nie oznaczyła cudzych zdarzeń jako przeczytane') from public.zdarzenia where przeczytane;
select pg_temp.spr(cel='listaPrac' and cel_id='cccccccc-0000-0000-0000-000000000001', 'zdarzenie pracy otwiera pomieszczenie w liście prac') from public.zdarzenia where rodzaj='praca';
update public.zdarzenia set przeczytane=true where rodzaj='wiadomosc';
select pg_temp.spr(count(*) filter (where not przeczytane)=5 and count(*) filter (where przeczytane)=2, 'oznaczanie jako przeczytane: 2 przeczytane, 5 nowych') from public.zdarzenia;
update public.zdarzenia set przeczytane=true where not przeczytane;
select pg_temp.spr(count(*) filter (where not przeczytane)=0, '„Oznacz wszystkie jako przeczytane”: 0 nowych') from public.zdarzenia;
-- właściciel wgrywa fakturę i odznacza pracę sam: sam nie dostaje powiadomienia, firma nie dostaje faktury
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ) values ('aaaaaaaa-0000-0000-0000-000000000001','faktury_materialy','fv.pdf','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/faktury_materialy/fv.pdf','pdf');
insert into public.pliki(mieszkanie,folder,nazwa,sciezka,typ,praca) values ('aaaaaaaa-0000-0000-0000-000000000001','postepy','lampy.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/postepy/l.jpg','zdjecie','eeeeeeee-0000-0000-0000-000000000002');
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000002';
update public.prace set zrobiona=false where id='eeeeeeee-0000-0000-0000-000000000002';
update public.prace set zrobiona=true where id='eeeeeeee-0000-0000-0000-000000000002';
update public.mieszkania set termin_konca='2030-02-28' where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.spr(string_agg(tresc, ' | ' order by utworzono)='Etap skończony: 7. Kuchnia, lampy i sprzątanie',
  'właściciel po własnych zmianach: tylko „Etap skończony” (raz, mimo ponownego odznaczenia): '||coalesce(string_agg(tresc, ' | ' order by utworzono),'-')) from public.zdarzenia where not przeczytane;
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(string_agg(rodzaj, ',' order by utworzono, rodzaj)='etap,praca,praca,opoznienie' and bool_and(rodzaj<>'faktura'),
  'firma A po zmianach właściciela: 1× etap, 2× praca, opóźnienie, bez faktury: '||string_agg(rodzaj, ',' order by utworzono, rodzaj)) from public.zdarzenia where utworzono > (select min(utworzono) from public.zdarzenia where rodzaj='praca' and tresc like '%Lampy%') - interval '1 microsecond';
select pg_temp.spr(tresc='Opóźnienie: termin końca przesunięty z 31.01.2030 na 28.02.2030', 'opóźnienie: '||tresc) from public.zdarzenia where rodzaj='opoznienie';
-- opóźnienie po terminie: jedno zdarzenie na mieszkanie i termin
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
update public.prace set zrobiona=false where id='eeeeeeee-0000-0000-0000-000000000002';
update public.mieszkania set termin_konca='2020-01-31' where id='aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.spr(public.sprawdz_opoznienia()=1, 'minął termin końca: 1 nowe zdarzenie „Opóźnienie”');
select pg_temp.spr(public.sprawdz_opoznienia()=0, 'drugie sprawdzenie: bez powtórki');
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(public.sprawdz_opoznienia()=1, 'firma A też dostaje „Opóźnienie” swojego mieszkania');
set request.jwt.claim.sub to '22222222-2222-2222-2222-222222222222';
select pg_temp.spr(public.sprawdz_opoznienia()=0, 'brat: brak opóźnień (nie ma mieszkań)');
select pg_temp.spr(count(*)=0, 'brat nie widzi żadnych zdarzeń') from public.zdarzenia;

-- ===== Ustawienia powiadomień =====
insert into public.ustawienia_powiadomien(dzwonek,telefon,telegram) values (true,false,true);
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
select pg_temp.spr(count(*)=0, 'właściciel nie widzi ustawień brata') from public.ustawienia_powiadomien;
insert into public.ustawienia_powiadomien(konto,dzwonek,telefon,telegram) values (auth.uid(),true,true,true) on conflict (konto) do update set telefon=excluded.telefon;
update public.ustawienia_powiadomien set telefon=false, telegram=false;
select pg_temp.spr(dzwonek and not telefon and not telegram and telegram_chat_id is null, 'zapis ustawień: dzwonek tak, telefon nie, Telegram nie') from public.ustawienia_powiadomien;
do $$ begin update public.ustawienia_powiadomien set telegram_chat_id='123'; raise notice 'ZLE  numer Telegrama zmieniony'; exception when others then raise notice 'OK   numeru rozmowy Telegram nie wpisuje aplikacja (%)', sqlerrm; end $$;
do $$ begin insert into public.ustawienia_powiadomien(konto) values ('33333333-3333-3333-3333-333333333333'); raise notice 'ZLE  cudze ustawienia'; exception when others then raise notice 'OK   nie da się zapisać cudzych ustawień (%)', sqlerrm; end $$;

-- ===== Zabrany dostęp: firma A nie widzi i nie pisze =====
update public.dostepy set aktywny=false where id='dddddddd-0000-0000-0000-000000000001';
do $$ begin insert into public.wiadomosci(mieszkanie,firma,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','Halo');
  raise notice 'ZLE  pisze do firmy bez dostępu'; exception when others then raise notice 'OK   po zabraniu dostępu właściciel nie pisze do firmy A (%)', sqlerrm; end $$;
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(count(*)=0, 'po zabraniu dostępu firma A nie widzi chatu mieszkania') from public.wiadomosci;
select pg_temp.spr(count(*)=0, 'po zabraniu dostępu firma A nie widzi chatu ogólnego') from public.wiadomosci_ogolne;
do $$ begin insert into public.wiadomosci(mieszkanie,tresc) values ('aaaaaaaa-0000-0000-0000-000000000001','Halo');
  raise notice 'ZLE  firma bez dostępu pisze'; exception when others then raise notice 'OK   firma A bez dostępu nie pisze (%)', sqlerrm; end $$;
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
update public.dostepy set aktywny=true where id='dddddddd-0000-0000-0000-000000000001';
update public.zdarzenia set przeczytane=true where not przeczytane;

-- ===== Zdarzenia z prawdziwych tabel klocków 9 (terminy), 10 (platnosci), 11 (poprawki) =====
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
update public.zdarzenia set przeczytane=true where not przeczytane;
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
insert into public.poprawki(id,mieszkanie,tresc) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Puszka lampy krzywo');
update public.terminy set data_do='2030-01-10' where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=3;
update public.terminy set data_do='2030-01-20' where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=3;
insert into public.terminy(mieszkanie,nazwa) values ('aaaaaaaa-0000-0000-0000-000000000001','Odbiór kominiarski');
update public.terminy set zrobiony=true where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nazwa='Odbiór kominiarski';
update public.terminy set zrobiony=false where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nazwa='Odbiór kominiarski';
update public.terminy set zrobiony=true where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nazwa='Odbiór kominiarski';
select '' from public.zapisz_platnosci('aaaaaaaa-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('kwota', 8000,
  'etapy', jsonb_build_array((select id from public.terminy where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001' and nr=3)))));
select pg_temp.spr(count(*)=1, 'płatność 1 ustalona (zapisz_platnosci)') from public.platnosci where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001';
update public.platnosci set zaplacona=true where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001';
insert into public.pliki(id,mieszkanie,folder,nazwa,sciezka,typ) values ('ffffffff-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','paragony','drugi.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/paragony/d.jpg','zdjecie'),
 ('ffffffff-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','paragony','trzeci.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/paragony/t.jpg','zdjecie');
insert into public.paragony(mieszkanie,plik,sklep,kwota,zaplacil) values ('aaaaaaaa-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000003','Hurtownia',120,'firma');
-- zapłacony przez Właściciela aplikacji: firma go nie widzi, więc nie dostaje też powiadomienia
insert into public.paragony(mieszkanie,plik,sklep,kwota,zaplacil) values ('aaaaaaaa-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000004','Sklep Farb',80,'wlasciciel');
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
insert into public.pliki(mieszkanie,wlasciciel,folder,nazwa,sciezka,typ,poprawka,poprawka_etap) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','poprawki','po.jpg','11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/poprawki/po.jpg','zdjecie','bbbbbbbb-0000-0000-0000-000000000001','po');
update public.poprawki set zrobiona=true where id='bbbbbbbb-0000-0000-0000-000000000001';
set request.jwt.claim.sub to '11111111-1111-1111-1111-111111111111';
update public.poprawki set zatwierdzona=true where id='bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.spr(string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, tresc) =
  'etap: Etap skończony: Odbiór kominiarski | poprawka: Poprawka zrobiona: Puszka lampy krzywo (Ekipa Testowa) – czeka na zatwierdzenie',
  'właściciel: „Etap skończony” etapu dodanego (raz) i „Poprawka zrobiona” od firmy, bez zdjęcia poprawki z pliku: '||coalesce(string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, tresc),'-')) from public.zdarzenia where not przeczytane;
select pg_temp.spr(bool_and(cel='poprawki' and cel_id='bbbbbbbb-0000-0000-0000-000000000001'), 'zdarzenie poprawki otwiera Poprawki') from public.zdarzenia where rodzaj='poprawka';
select pg_temp.spr(bool_and(cel='terminy'), 'zdarzenia etapów otwierają Terminy') from public.zdarzenia where rodzaj='etap';
set request.jwt.claim.sub to '33333333-3333-3333-3333-333333333333';
select pg_temp.spr(string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, tresc) =
  'poprawka: Nowa poprawka: Puszka lampy krzywo (Marek) | opoznienie: Opóźnienie: etap 3. Hydraulika przesunięty z 10.01.2030 na 20.01.2030 | etap: Etap skończony: Odbiór kominiarski | platnosc: Płatność zapłacona: płatność 1 – 8000,00 zł | paragon: Nowy paragon: Hurtownia 120,00 zł (Marek) | poprawka: Poprawka zatwierdzona: Puszka lampy krzywo (Marek)',
  'firma A: poprawka, opóźnienie etapu, „Etap skończony”, „Płatność zapłacona”, paragon zapłacony przez firmę (bez paragonu Właściciela), zatwierdzenie: '||coalesce(string_agg(rodzaj||': '||tresc, ' | ' order by utworzono, tresc),'-')) from public.zdarzenia where not przeczytane;
set request.jwt.claim.sub to '44444444-4444-4444-4444-444444444444';
select pg_temp.spr(count(*)=0, 'firma B nie dostaje zdarzeń mieszkania firmy A') from public.zdarzenia where mieszkanie='aaaaaaaa-0000-0000-0000-000000000001';

-- ===== Bez logowania (anon) nic =====
reset role; set role anon;
do $$ begin perform 1 from public.wiadomosci; raise notice 'ZLE  anon czyta chat'; exception when others then raise notice 'OK   bez logowania nie da się czytać chatu (%)', sqlerrm; end $$;
do $$ begin perform 1 from public.zdarzenia; raise notice 'ZLE  anon czyta zdarzenia'; exception when others then raise notice 'OK   bez logowania nie da się czytać zdarzeń (%)', sqlerrm; end $$;
do $$ begin perform public.sprawdz_opoznienia(); raise notice 'ZLE  anon woła funkcję'; exception when others then raise notice 'OK   bez logowania nie da się sprawdzać opóźnień (%)', sqlerrm; end $$;
reset role;
select 'RAZEM: OK '||count(*) filter (where ok)||', ZLE '||count(*) filter (where not ok)||' (oraz wiersze NOTICE powyżej)' from wynik;
