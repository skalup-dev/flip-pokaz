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
| 7 Paragony i materiały | w budowie (pomocnik A, razem z 8) – dopisek Pati: odczyt Tesseract.js (pol), przycinanie 4 narożnikami, reguły polskich paragonów, tylko „Sprawdzone” do budżetu, miejsce na AI (wyłączone) |
| 8 Pieniądze mieszkania | w budowie (pomocnik A) |
| 9 Terminy | w budowie (pomocnik B, razem z 10) |
| 10 Płatności | w budowie (pomocnik B) |
| 11 Poprawki | w budowie (pomocnik C, razem z 14) |
| 12 Chat z firmą + Chat ogólny | w budowie (pomocnik D, razem z 13) |
| 13 Powiadomienia (dzwonek) | w budowie (pomocnik D) |
| 14 Ilości z planu | w budowie (pomocnik C) |
| 15 Szukaj ekipy | zbudowany (js/k15_szukaj.js, sql/15_szukaj.sql), testy: baza 29 OK, ekrany 80 OK; w rdzeniu haki listaFirmy/kartaMieszkania/poLiscie i pole widoczny |

## Założenia przyjęte bez pytania (do potwierdzenia przez Pati)
1. Zaproszenie szefa firmy: link do skopiowania (bez SMS). Szef firmy zakłada zwykłe konto i otwiera link – konto staje się kontem firmy.
2. Konto, które ma własne mieszkania, nie może zostać kontem firmy (żeby Właściciel aplikacji nie zmienił się przez pomyłkę w firmę).
3. Szef firmy widzi w Bibliotece: Plany od architekta, Postępy prac, Poprawki, Zdjęcia, Paragony. Nie widzi Faktur.

## Usługi płatne / klucze (nic nie założone)
(uzupełniane przy klockach 6, 7, 13)

## Dziennik
- 28.11 – klocek 15 dołączony; rdzeń: HAKI.listaFirmy, HAKI.kartaMieszkania, HAKI.poLiscie, moduł.widoczny(f).
- 27.11 – dopisek Pati do klocka 7 (odczyt paragonu za 0 zł: Tesseract.js, reguły, tekst_surowy/zrodlo_odczytu/pewnosc/pola_niepewne) przekazany pomocnikowi A.
- 27.11 23:40 – klocek 6 gotowy (commit 604d77f), pola pieniędzy mieszkania w 06. Klocki 7–15 zlecone 5 pomocnikom (osobne kopie repo); każdy oddaje js/kNN_*.js + sql/NN_*.sql + testy. Potem: złożenie, 06_reszta.sql, testy na prawdziwej bazie, obrazy.
- 27.11 23:15 – plan, POSTEP.md.
