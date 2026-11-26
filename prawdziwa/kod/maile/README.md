# Maile aplikacji Flip

Treści maili, które wysyła aplikacja. Wklejane w Supabase: Authentication → Emails (szablony).

| Plik | Szablon w Supabase | Temat (pole Subject) |
|---|---|---|
| potwierdzenie-rejestracji.html | Confirm signup | Flip – potwierdzenie nowego konta |
| reset-hasla.html | Reset Password | Flip – ustawienie nowego hasła |

Jak wkleić: otworzyć szablon, w pole Subject wpisać temat z tabeli, w pole treści (Message body) wkleić całą zawartość pliku i zapisać.
Link w przycisku to zmienna Supabase `{{ .ConfirmationURL }}`, nie zmieniać jej.
