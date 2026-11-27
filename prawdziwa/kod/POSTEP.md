# Postęp: reszta aplikacji (klocki 6–15)

Zadanie od Pati (27.11.2026, 23:09): zbudować całą resztę według flip-wersja-3.html, na gałęzi roboczej `claude/zealous-mayer-nllf57`. Do main NIC bez „okej” Pati. Zasady: CLAUDE.md.

## Jak jest zbudowane (dla każdego, kto przejmuje pracę)
- `prawdziwa/index.html` – rdzeń: logowanie, mieszkania, Biblioteka, Moje dane, kroki dodawania, Lista prac, klocek 6 (szef firmy).
- `prawdziwa/js/kNN_nazwa.js` – każdy klocek 7–15 we własnym pliku, ładowany w index.html po rdzeniu.
- Klocek dopina się przez `rejestrujModul({...})` (opis w index.html, sekcja „Moduły”): przycisk na ekranie mieszkania (A–Z), widoczność dla szefa firmy, licznik, haki po wczytaniu.
- SQL: `prawdziwa/kod/06_reszta.sql` – jeden plik zbiorczy (klocek 6 + części klocków 7–15, w kolejności). Części robocze: `prawdziwa/kod/sql/NN_*.sql`.
- Dostęp: funkcje w bazie `ma_dostep(mieszkanie)` (właściciel albo aktywna firma), `jest_firma_mieszkania(mieszkanie)`, `wlasciciel_mieszkania(mieszkanie)`. Każda nowa tabela ma RLS oparte na nich.
- Testy: zastępcza baza `mock2.js` (w scratchpadzie), prawdziwa baza na kontach testowych skalup.info+fliptest / +flipbrat (+ konto szefa firmy testowego – do założenia).

## Klocki
| Klocek | Stan |
|---|---|
| 6 Szef firmy (zaproszenie linkiem, dostęp, Zabierz/Przywróć, widok firmy, podpis nazwą firmy) | zbudowany, testy zastępcze OK, test bazy lokalnie OK (sql/06_szef_firmy.sql) |
| 7 Paragony i materiały | zbudowany (js/k07_paragony.js, js/k07_odczyt.js, lib/tesseract/, sql/07_paragony.sql): odczyt Tesseract.js pol, jakość zdjęcia, „Zapisz mimo to”, AI wyłączone; ekrany 108 OK |
| 8 Pieniądze mieszkania | zbudowany (js/k08_pieniadze.js, bez nowego SQL) |
| 9 Terminy | zbudowany (js/k09_terminy.js, sql/09_terminy.sql); testy ekranów 86 OK razem z 10 |
| 10 Płatności | zbudowany (js/k10_platnosci.js, sql/10_platnosci.sql); „Dostaliście” zmienione na „Zapłacone firmie” (zasada 20) |
| 11 Poprawki | zbudowany (js/k11_poprawki.js, sql/11_poprawki.sql); ekrany 102 OK razem z 14 |
| 12 Chat z firmą + Chat ogólny | zbudowany (js/k12_chat.js, sql/12_chat.sql); ekrany 92 OK razem z 13 |
| 13 Powiadomienia (dzwonek) | zbudowany (js/k13_powiadomienia.js, sql/13_powiadomienia.sql – w pliku zbiorczym NA KOŃCU) |
| 14 Ilości z planu | zbudowany (js/k14_ilosci.js, sql/14_ilosci.sql); hak HAKI.listaPrac w rdzeniu |
| 15 Szukaj ekipy | zbudowany (js/k15_szukaj.js, sql/15_szukaj.sql), testy: baza 29 OK, ekrany 80 OK; w rdzeniu haki listaFirmy/kartaMieszkania/poLiscie i pole widoczny |

## Założenia przyjęte bez pytania (do potwierdzenia przez Pati)
1. Zaproszenie szefa firmy: link do skopiowania (bez SMS). Szef firmy zakłada zwykłe konto i otwiera link – konto staje się kontem firmy.
2. Konto, które ma własne mieszkania, nie może zostać kontem firmy (żeby Właściciel aplikacji nie zmienił się przez pomyłkę w firmę).
3. Szef firmy widzi w Bibliotece: Plany od architekta, Postępy prac, Poprawki, Zdjęcia, Paragony. Nie widzi Faktur.

## Usługi płatne / klucze (nic nie założone)
- SMS z zaproszeniem (klocek 6): zamiast niego link do skopiowania. SMS wymagałby bramki SMS (płatna, cena do sprawdzenia).
- Odczyt paragonu (klocek 7): działa za 0 zł (Tesseract.js w telefonie). Lepszy odczyt AI przygotowany i wyłączony (ODCZYT_AI=false, Edge Function „odczyt-paragonu”, limit dzienny). Np. Azure Document Intelligence ok. 10 USD / 1000 stron (do potwierdzenia w cenniku).
- Powiadomienia na telefon (klocek 13): Web Push darmowy, potrzebne klucze VAPID + Edge Function; Supabase Free ok. 500 tys. wywołań/mies., Pro ok. 25 USD/mies. (do potwierdzenia).
- Telegram (klocek 13): bot darmowy, token w sekretach Edge Function, tylko „Etap skończony”.
- Klocek 7: odczyt paragonu działa za 0 zł (Tesseract.js 6.0.1 + pol.traineddata w prawdziwa/lib/tesseract/, ok. 10,7 MB, ładowane dopiero przy pierwszym odczycie). Lepszy odczyt przez AI przygotowany, ale WYŁĄCZONY (ODCZYT_AI = false w js/k07_paragony.js, funkcja Supabase 'odczyt-paragonu' nie istnieje).

## Dziennik
- 28.11 – kod/06_reszta.sql gotowy do wgrania (1384 linie): wchodzi 2× bez błędu, wszystkie testy bazy (1–15) zgodne, 0 ZLE. Czeka na wgranie przez Pati, potem testy na prawdziwej bazie.
- 28.11 – klocki 7 i 8 dołączone; kod/06_reszta.sql złożony (06, 07, 09–12, 14, 15, 13), wchodzi 2× bez błędu; testy bazy zgodne poza testem powiadomień (dopasowanie testu do tabeli paragony – pomocnik D). Następnie: Pati wkleja 06_reszta.sql, testy na prawdziwej bazie (właściciel, brat, szef firmy testowy), obrazy.
- 28.11 – próbny plik zbiorczy (06, 09–15, 13 na końcu) wchodzi 2× bez błędu; testy bazy 6, 9, 10, 11, 14, 15 i starsze zgodne. Klocek 13 dopasowuje triggery do prawdziwych tabel terminy/platnosci/poprawki (pomocnik D). Czekają: klocek 7+8 (pomocnik A).
- 28.11 – klocki 11, 12, 13, 14 dołączone; hak HAKI.listaPrac; Chat ogólny przez HAKI.poLiscie. Drugi dopisek Pati do klocka 7 (wskazówka do zdjęcia, sprawdzanie jakości, „Zapisz mimo to”) przekazany pomocnikowi A. Czeka tylko klocek 7+8.
- 28.11 – klocki 9 i 10 dołączone; naprawiony błąd klocka 6: firma nie widziała listy mieszkań.
- 28.11 – klocek 15 dołączony; rdzeń: HAKI.listaFirmy, HAKI.kartaMieszkania, HAKI.poLiscie, moduł.widoczny(f).
- 27.11 – dopisek Pati do klocka 7 (odczyt paragonu za 0 zł: Tesseract.js, reguły, tekst_surowy/zrodlo_odczytu/pewnosc/pola_niepewne) przekazany pomocnikowi A.
- 27.11 23:40 – klocek 6 gotowy (commit 604d77f), pola pieniędzy mieszkania w 06. Klocki 7–15 zlecone 5 pomocnikom (osobne kopie repo); każdy oddaje js/kNN_*.js + sql/NN_*.sql + testy. Potem: złożenie, 06_reszta.sql, testy na prawdziwej bazie, obrazy.
- 27.11 23:15 – plan, POSTEP.md.
