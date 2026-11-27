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
| 6 Szef firmy (zaproszenie linkiem, dostęp, Zabierz/Przywróć, widok firmy, podpis nazwą firmy) | w budowie |
| 7 Paragony i materiały | czeka |
| 8 Pieniądze mieszkania | czeka |
| 9 Terminy | czeka |
| 10 Płatności | czeka |
| 11 Poprawki | czeka |
| 12 Chat z firmą + Chat ogólny | czeka |
| 13 Powiadomienia (dzwonek) | czeka |
| 14 Ilości z planu | czeka |
| 15 Szukaj ekipy | czeka |

## Założenia przyjęte bez pytania (do potwierdzenia przez Pati)
1. Zaproszenie szefa firmy: link do skopiowania (bez SMS). Szef firmy zakłada zwykłe konto i otwiera link – konto staje się kontem firmy.
2. Konto, które ma własne mieszkania, nie może zostać kontem firmy (żeby Właściciel aplikacji nie zmienił się przez pomyłkę w firmę).
3. Szef firmy widzi w Bibliotece: Plany od architekta, Postępy prac, Poprawki, Zdjęcia, Paragony. Nie widzi Faktur.

## Usługi płatne / klucze (nic nie założone)
(uzupełniane przy klockach 6, 7, 13)

## Dziennik
- 27.11 23:15 – plan, POSTEP.md.
