/* ===== Klocek 7: odczyt paragonu – reguły dla polskich paragonów (bez sieci, 0 zł) =====
   analizuj(tekst) dostaje tekst z Tesseracta i zwraca pola. Zasada: NIGDY nie zgadujemy.
   Czego nie da się pewnie odczytać, zostaje puste albo trafia do „niepewne” (status „Do sprawdzenia”).
   Plik działa w przeglądarce (window.OdczytParagonu) i w Node (test: kod/test/test_odczyt_regul.js). */
(function(){
  // Sklepy budowlane i markety, od A do Z (dłuższe nazwy sprawdzane najpierw)
  const SKLEPY = ['Action','Bricoman','Bricomarché','Castorama','Ikea','Jula','Leroy Merlin','Makro','Merkury Market','Mrówka','OBI','PSB','PSB Mrówka','Selgros','Tedi'];
  const bezOgonkow = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
  const litery = s => bezOgonkow(s).toUpperCase().replace(/0/g, 'O').replace(/5/g, 'S').replace(/[1|]/g, 'I').replace(/8/g, 'B').replace(/[^A-Z]/g, '');
  // w polach liczbowych: O/o→0, l/I/|→1, S→5 (tylko tam, nigdy w nazwach)
  const cyfry = s => s.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1').replace(/S/g, '5');
  const N = '[0-9OolIS|]';
  const KWOTA = `(${N}{1,3}(?:[ ]${N}{3})+|${N}{1,7})\\s?[,.]\\s?(${N}{2})(?!${N})`;
  const kwota = (cz, gr) => { const c = cyfry(cz).replace(/ /g, ''), g = cyfry(gr); if (!/^\d+$/.test(c) || !/^\d{2}$/.test(g)) return null; return Math.round(Number(c + '.' + g) * 100) / 100; };
  const kwotyWLinii = l => { const re = new RegExp(KWOTA, 'g'); const w = []; let m; while ((m = re.exec(l))) { const v = kwota(m[1], m[2]); if (v != null) w.push({ v, i:m.index, k:m.index + m[0].length }); } return w; };
  const odl = (a, b) => { const d = Array.from({ length:a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[a.length][b.length]; };

  function nipOk(n){ if (!/^\d{10}$/.test(n)) return false; const w = [6,5,7,2,3,4,5,6,7]; const s = w.reduce((a, x, i) => a + x * +n[i], 0) % 11; return s !== 10 && s === +n[9]; }

  function prawdziwaData(r, m, d, dzis){
    if (r < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const t = new Date(Date.UTC(r, m - 1, d)); if (t.getUTCFullYear() !== r || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    const iso = t.toISOString().slice(0, 10);
    const jutro = new Date((dzis ? Date.parse(dzis) : Date.now()) + 864e5).toISOString().slice(0, 10);
    return iso > jutro ? null : iso;   // data z przyszłości = błąd odczytu
  }
  function znajdzDate(linie, dzis){
    const D = `(${N}{2})`, R = `(${N}{4})`;
    const wz = [[new RegExp(`(?:^|[^0-9])${R}[-.\\/]${D}[-.\\/]${D}(?![0-9])`), m => [m[1], m[2], m[3]]],
                [new RegExp(`(?:^|[^0-9])${D}[-.\\/]${D}[-.\\/]${R}(?![0-9])`), m => [m[3], m[2], m[1]]]];
    const znal = new Set();
    for (const l of linie) for (const [re, kol] of wz) { const m = l.match(re); if (m) { const [r, mi, d] = kol(m).map(x => +cyfry(x)); const iso = prawdziwaData(r, mi, d, dzis); if (iso) znal.add(iso); } }
    return znal.size === 1 ? [...znal][0] : null;   // dwie różne daty = nie zgadujemy
  }
  function znajdzNip(linie){
    for (const l of linie) { const m = l.match(/N[I1l]P\s*[:.]?\s*((?:PL)?[0-9OolIS| -]{10,16})/i); if (!m) continue;
      const n = cyfry(m[1].replace(/^PL/i, '')).replace(/[^0-9]/g, '');
      return { nip: n.length === 10 && nipOk(n) ? n : null, byl:true }; }
    return { nip:null, byl:false };
  }
  function znajdzSklep(linie){
    const gora = linie.slice(0, 8), lista = [...SKLEPY].sort((a, b) => b.length - a.length);
    for (const l of gora) { const L = litery(l);
      for (const s of lista) { const S = litery(s); if (L.includes(S)) return { sklep:s, pewny:true };
        if (S.length >= 5) for (let i = 0; i + S.length <= L.length; i++) if (odl(L.slice(i, i + S.length), S) <= 1) return { sklep:s, pewny:true }; } }
    // poza słownikiem: pierwsza linia, która wygląda na nazwę (same litery) – zawsze do sprawdzenia
    const PUSTE = /PARAGON|FISKALN|NIP|SP\.? ?Z ?O|^UL\.?\s|^\d|KASA|NR\b/i;
    const k = gora.find(l => l.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').length >= 3 && !/\d/.test(l) && !PUSTE.test(l));
    return { sklep: k ? k.replace(/\s+/g, ' ').trim().slice(0, 120) : '', pewny:false };
  }
  const SUMA = [/\bSUMA\s*:?\s*P\s*L\s*N\b/i, /\b[S5][UV][MN]A\s*P[L1I]N\b/i, /\bDO\s*ZAP[ŁL]ATY\b/i, /\bRAZEM\b/i, /\b[S5][UV][MN]A\b(?!\s*PTU)/i];
  function znajdzSume(linie){
    for (const re of SUMA) for (let i = linie.length - 1; i >= 0; i--) { const l = linie[i];
      if (!re.test(l) || /PTU|VAT|OPOD/i.test(l)) continue;
      const k = kwotyWLinii(l); if (k.length) return k[k.length - 1].v; }
    return null;
  }
  function znajdzPozycje(linie){
    const re = new RegExp(`^(.+?)\\s*(${N}+(?:[,.]${N}{1,3})?)\\s*(?:szt\\.?|kg|m2|m|l|op\\.?)?\\s*[x×*]\\s*${KWOTA}\\s*=?\\s*${KWOTA}\\s*([A-G])?\\s*$`, 'i');
    const w = [];
    for (const l of linie) { const m = l.match(re); if (!m) continue;
      const nazwa = m[1].replace(/\s+/g, ' ').trim(); if (nazwa.replace(/[^A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g, '').length < 2) continue;
      const il = Number(cyfry(m[2]).replace(',', '.')), cena = kwota(m[3], m[4]), wart = kwota(m[5], m[6]);
      if (!(il > 0) || cena == null || wart == null) continue;
      w.push({ nazwa, ilosc:il, cena, wartosc:wart, ptu:m[7] ? m[7].toUpperCase() : null, zgodna: Math.abs(Math.round(il * cena * 100) / 100 - wart) <= 0.02 }); }
    return w;
  }

  function analizuj(tekst, dzis){
    const linie = String(tekst || '').split(/\r?\n/).map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
    const niepewne = [];
    const s = znajdzSklep(linie); if (!s.sklep || !s.pewny) niepewne.push('sklep');
    const data = znajdzDate(linie, dzis); if (!data) niepewne.push('data');
    const n = znajdzNip(linie); if (n.byl && !n.nip) niepewne.push('nip');
    const suma = znajdzSume(linie);
    const pozycje = znajdzPozycje(linie);
    const sumaPozycji = Math.round(pozycje.reduce((a, p) => a + p.wartosc, 0) * 100) / 100;
    const zgodne = suma != null && pozycje.length > 0 && Math.abs(sumaPozycji - suma) <= 0.05;
    if (suma == null || !zgodne) niepewne.push('kwota');
    if (pozycje.some(p => !p.zgodna)) niepewne.push('pozycje');
    const co = pozycje.map(p => p.nazwa).join(', ').slice(0, 300);
    return { sklep:s.sklep, sklepZeSlownika:s.pewny, data, nip:n.nip, kwota:suma, pozycje, sumaPozycji, zgodne, co, niepewne };
  }

  /* Jakość zdjęcia PRZED odczytem. Wejście: jasność pikseli (0–255) zdjęcia zmniejszonego do ~600 px.
     Zwraca miary i powód odrzucenia (albo null). Progi dobrane testami na wygenerowanych obrazkach (kod/test/test_jakosc.js). */
  const PROGI = { ciemne:70, przeswietlone:0.45, roznorodnosc:15, tekst:0.006, ostrosc:500, brzeg:0.6 };
  function ocenJakosc(g, w, h){
    const n = w * h; let s = 0, ciem = 0, jas = 0; const hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++){ const v = g[i]; s += v; hist[v]++; if (v < 40) ciem++; if (v >= 250) jas++; }
    const jasnosc = s / n; let wr = 0; for (let i = 0; i < 256; i++) wr += hist[i] * (i - jasnosc) ** 2; const odchylenie = Math.sqrt(wr / n);
    // ostrość: wariancja Laplasjanu; tekst: odsetek mocnych krawędzi
    let ls = 0, ls2 = 0, kraw = 0, m = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++){ const i = y * w + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]; ls += l; ls2 += l * l; m++; if (Math.abs(l) > 40) kraw++; }
    const ostrosc = m ? ls2 / m - (ls / m) ** 2 : 0, krawedzie = m ? kraw / m : 0;
    // próg Otsu: co jest „jasnym papierem”, a co tłem
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, prog = 128;
    for (let t = 0; t < 256; t++){ wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) ** 2; if (b > best){ best = b; prog = t; } }
    const pas = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const brzegJasny = (x0, y0, x1, y1) => { let j = 0, c = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++){ c++; if (g[y * w + x] > prog) j++; } return c ? j / c : 0; };
    const brzeg = { gora:brzegJasny(0, 0, w, pas), dol:brzegJasny(0, h - pas, w, h), lewo:brzegJasny(0, 0, pas, h), prawo:brzegJasny(w - pas, 0, w, h) };
    const M = { jasnosc:Math.round(jasnosc), odchylenie:Math.round(odchylenie), ciemne:ciem / n, przeswietlone:jas / n, ostrosc:Math.round(ostrosc), krawedzie, brzeg, prog };
    let powod = null;
    if (jasnosc < PROGI.ciemne) powod = 'ciemne';
    else if (M.przeswietlone > PROGI.przeswietlone) powod = 'jasne';
    else if (odchylenie < PROGI.roznorodnosc) powod = 'tekst';                         // jednolita plama: nie ma paragonu
    else if (krawedzie < PROGI.tekst || ostrosc < PROGI.ostrosc) powod = 'nieostre';   // jest paragon, ale bez ostrych liter
    else if (Math.max(brzeg.gora, brzeg.dol, brzeg.lewo, brzeg.prawo) > PROGI.brzeg) powod = 'uciety';
    return { ...M, powod };
  }

  // tylko przeglądarka: zdjęcie (canvas) → zmniejszenie do 600 px → szarość → ocenJakosc
  function ocenZdjecie(cv){
    const s = Math.min(1, 600 / Math.max(cv.width, cv.height)), w = Math.max(3, Math.round(cv.width * s)), h = Math.max(3, Math.round(cv.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(cv, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    return ocenJakosc(g, w, h);
  }

  const API = { analizuj, nipOk, ocenJakosc, ocenZdjecie, PROGI, SKLEPY:[...SKLEPY].sort((a, b) => a.localeCompare(b, 'pl')) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else window.OdczytParagonu = API;
})();
