// Test reguł odczytu paragonu (js/k07_odczyt.js) na zmyślonych tekstach z typowymi błędami OCR.
// Uruchamianie: node test_odczyt_regul.js
const O = require('../../js/k07_odczyt.js');
let ok = 0, zle = 0; const spr = (w, t) => { console.log((w ? 'OK   ' : 'ZLE  ') + t); w ? ok++ : zle++; };
const DZIS = '2026-11-27';
const T = [
  { n:'czysty paragon (słownik, data rrrr-mm-dd, NIP, 3 pozycje)', t:`LEROY MERLIN
Market Testowy Sp. Z 0.0.
ul. Przykładowa 1, 00-001 Miasto
NIP 123-456-32-18
PARAGON FISKALNY
2026-11-14 nr 0042
Farba biała 101 2 x 89,99 179,98 A
Wałek malarski 1 x 24,50 24,50 A
Taśma malarska 3 x 7,90 23,70 A
SPRZEDAŻ OPOD. A 228,18
PTU A 23% 42,67
SUMA PTU 42,67
SUMA PLN 228,18
Karta płatnicza 228,18`,
    w:{ sklep:'Leroy Merlin', data:'2026-11-14', nip:'1234563218', kwota:228.18, poz:3, niepewne:[] } },
  { n:'błędy OCR w liczbach (O→0, l→1, S→5), data dd.mm.rrrr, „DO ZAPŁATY”', t:`CA5TORAMA
NIP: 123 456 32 18
PARAGON FISKALNY
O3.11.2026 12:40
Kabel YDY 3x2,5 1 x l25,9O 125,90 A
Puszka podtynkowa 1O x 1,2O 12,OO A
DO ZAPŁATY PLN 137,9O`,
    w:{ sklep:'Castorama', data:'2026-11-03', nip:'1234563218', kwota:137.90, poz:2, niepewne:[] } },
  { n:'suma pozycji ≠ suma → kwota do sprawdzenia', t:`OBI
PARAGON FISKALNY
2026-11-10
Klej 4 x 39,90 159,60 A
SUMA PLN 195,60`,
    w:{ sklep:'OBI', data:'2026-11-10', kwota:195.60, poz:1, niepewne:['kwota'] } },
  { n:'zły NIP (suma kontrolna), data nieprawdziwa (31.02), brak sumy, sklep spoza słownika', t:`Hurtownia Pod Lasem
NIP 123-456-32-19
PARAGON FISKALNY
31.02.2026
Gips 2 x 30,00 60,00 B`,
    w:{ sklep:'Hurtownia Pod Lasem', data:null, nip:null, kwota:null, poz:1, niepewne:['sklep','data','nip','kwota'] } },
  { n:'pozycja z błędem mnożenia → pozycje do sprawdzenia; data z przyszłości odrzucona', t:`JULA
2027-05-01
Wkręty 3 x 10,00 31,00 A
RAZEM 31,00`,
    w:{ sklep:'Jula', data:null, kwota:31.00, poz:1, niepewne:['data','pozycje'] } },
  { n:'literówka OCR w nazwie sklepu (Bricomarche bez ogonka, jedna litera), „SUNA PLN”', t:`BRIC0MARCHE
NIP 1234563218
2026/11/20
Silikon szt. 2 x 18,99 = 37,98 A
SUNA PLN 37,98`,
    w:{ sklep:'Bricomarché', data:'2026-11-20', nip:'1234563218', kwota:37.98, poz:1, niepewne:[] } },
  { n:'dwie różne daty → nie zgadujemy', t:`PSB Mrówka
14.11.2026
Wiadro 1 x 9,99 9,99 A
SUMA PLN 9,99
Wydruk 24.11.2026`,
    w:{ sklep:'PSB Mrówka', data:null, kwota:9.99, poz:1, niepewne:['data'] } },
  { n:'pusty / nieczytelny tekst → wszystko puste, nic nie zgadnięte', t:`~~ ..
|||`,
    w:{ sklep:'', data:null, nip:null, kwota:null, poz:0, niepewne:['sklep','data','kwota'] } },
  { n:'kwota z tysiącami „1 234,50”', t:`Merkury Market
2026-10-02
Płytki 30 x 41,15 1 234,50 A
SUMA PLN 1 234,50`,
    w:{ sklep:'Merkury Market', data:'2026-10-02', kwota:1234.50, poz:1, niepewne:[] } }
];
for (const x of T){
  const r = O.analizuj(x.t, DZIS), w = x.w; const bl = [];
  if (r.sklep !== w.sklep) bl.push(`sklep „${r.sklep}”`);
  if (r.data !== w.data) bl.push(`data ${r.data}`);
  if ('nip' in w && r.nip !== w.nip) bl.push(`nip ${r.nip}`);
  if (r.kwota !== w.kwota) bl.push(`kwota ${r.kwota}`);
  if (r.pozycje.length !== w.poz) bl.push(`pozycji ${r.pozycje.length}`);
  if ([...r.niepewne].sort().join() !== [...w.niepewne].sort().join()) bl.push(`niepewne [${r.niepewne}]`);
  spr(!bl.length, x.n + (bl.length ? ' → ' + bl.join(', ') : ''));
}
spr(O.nipOk('1234563218') && !O.nipOk('1234563219') && !O.nipOk('123456321'), 'suma kontrolna NIP');
spr(O.SKLEPY.join() === [...O.SKLEPY].sort((a, b) => a.localeCompare(b, 'pl')).join(), 'słownik sklepów od A do Z: ' + O.SKLEPY.join(', '));
const p = O.analizuj(T[0].t, DZIS).pozycje[0];
spr(p.nazwa === 'Farba biała 101' && p.ilosc === 2 && p.cena === 89.99 && p.wartosc === 179.98 && p.ptu === 'A', 'pozycja: nazwa, ilość × cena = wartość, litera PTU');
console.log(zle ? 'ZLE: ' + zle : 'WSZYSTKO OK (' + ok + ')');
process.exit(zle ? 1 : 0);
