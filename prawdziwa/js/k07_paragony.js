/* ===== Klocek 7: Paragony i materiały – dokumenty zakupów przy mieszkaniu, odczyt zdjęcia w telefonie (0 zł) =====
   Zdjęcie dokumentu: Biblioteka › Paragony (pliki, folder 'paragony'), dane: tabela paragony (sql/07_paragony.sql).
   Odczyt: Tesseract.js z językiem polskim, pliki w lib/tesseract/ (ładowane dopiero przy pierwszym odczycie),
   reguły polskich paragonów w js/k07_odczyt.js. Ręczne przepisanie danych zostaje jako zapasowa droga.
   Właściciel aplikacji: dodaje, sprawdza („Sprawdzone, zgadza się” / „Odznacz”), poprawia, usuwa.
   Szef firmy: widzi dokumenty zapłacone przez firmę i dodaje nowe (zawsze „Do sprawdzenia”). */
(function(){
  const LIB = 'lib/tesseract/';
  /* Miejsce na późniejszy, lepszy odczyt przez AI (płatny). WYŁĄCZONE. Po włączeniu aplikacja woła funkcję
     Supabase Edge Function 'odczyt-paragonu' (tylko zalogowani, limit dzienny w bazie, klucz w sekretach Supabase),
     a gdy ona zawiedzie – zwykły odczyt Tesseract. */
  const ODCZYT_AI = false;
  const POLA = { sklep:'Sklep', co:'Co kupiono', kwota:'Kwota', data:'Data', nip:'NIP sklepu', pozycje:'Pozycje' };
  const SUMY = {};   // mieszkanie -> { doSpr }

  const st = document.createElement('style');
  st.textContent = `.ostrz{color:#FF0000;font-weight:700}
    .niep input,.niep textarea{border:2px solid #FF0000}
    .niep .uwaga{display:block;color:#FF0000;font-weight:700;font-size:13px;margin-top:3px}
    .kadr{display:block;margin:0 auto;max-width:100%;max-height:62vh;touch-action:none;border:1px solid var(--z);border-radius:8px;cursor:grab}
    .dok-mini{display:block;max-width:100%;max-height:260px;margin:0 auto 6px;border:1px solid var(--z);border-radius:8px;cursor:pointer}
    .poz{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--z);font-size:14px}
    .poz:last-child{border-bottom:none}.poz span:last-child{white-space:nowrap}
    .surowy{white-space:pre-wrap;font-size:12px;margin:6px 0 0;max-height:260px;overflow:auto;word-break:break-word}
    details summary{cursor:pointer;font-weight:600}
    .postep{font-weight:600;margin:8px 0}`;
  document.head.appendChild(st);

  const F = () => jestFirma();
  const brakTabeli = e => /paragony|pola_niepewne|zrodlo_odczytu/i.test((e && e.message) || '') && /find|exist|relation|schema|column/i.test((e && e.message) || '');
  const bladPar = e => brakTabeli(e) ? 'Paragony nie są jeszcze włączone w bazie danych. Trzeba wgrać plik 07_paragony.sql w Supabase.' : blad(e);
  const kwotaPL = v => zl(v == null ? null : Number(v));
  const zaplacil = (r, f) => r.zaplacil === 'firma' ? ((f.firma_remontowa && f.firma_remontowa.trim()) || 'Firma remontowa') : (F() ? 'Właściciel aplikacji' : kto());
  const sumuj = (l, w) => Math.round(l.filter(w).reduce((a, r) => a + Number(r.kwota || 0), 0) * 100) / 100;
  const poSklepie = (a, b) => a.sklep.localeCompare(b.sklep, 'pl', { numeric:true }) || String(b.data).localeCompare(String(a.data));
  const listaPol = a => a.map(k => POLA[k] || k).join(', ');

  async function wczytajSumy(){
    const { data, error } = await sb.from('paragony').select('mieszkanie,sprawdzone');
    Object.keys(SUMY).forEach(k => delete SUMY[k]); if (error) return;
    (data || []).forEach(r => { const t = SUMY[r.mieszkanie] || (SUMY[r.mieszkanie] = { doSpr:0 }); if (!r.sprawdzone) t.doSpr++; });
  }
  HAKI.poWczytaniu.push(wczytajSumy);

  async function wczytajDok(fid){
    const { data, error } = await sb.from('paragony').select('*').eq('mieszkanie', fid);
    const l = (data || []).sort(poSklepie);
    SUMY[fid] = { doSpr:l.filter(r => !r.sprawdzone).length };
    return { error, l };
  }
  async function linkiPlikow(l){
    const ids = l.map(r => r.plik).filter(Boolean); const pl = {}, linki = {};
    if (!ids.length) return { pl, linki };
    const { data } = await sb.from('pliki').select('id,sciezka,typ,nazwa').in('id', ids);
    (data || []).forEach(p => pl[p.id] = p);
    const sc = Object.values(pl).map(p => p.sciezka);
    if (sc.length){ const { data:u } = await sb.storage.from(SCHOWEK).createSignedUrls(sc, 3600); (u || []).forEach(x => { if (x.signedUrl) linki[x.path] = x.signedUrl; }); }
    return { pl, linki };
  }

  /* ---------- lista dokumentów ---------- */
  async function ekranParagony(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    S.dok = null;
    app.innerHTML = '<p>Wczytuję paragony…</p>';
    const { error, l } = await wczytajDok(fid);
    if (window.odswiezPieniadze) window.odswiezPieniadze();
    const spr = l.filter(r => r.sprawdzone), czeka = l.filter(r => !r.sprawdzone);
    const wyd = sumuj(l, r => r.sprawdzone), wCz = sumuj(l, r => !r.sprawdzone);
    const karta = r => `<div class="card" data-dok="${r.id}"><div class="zw"><b>${esc(r.sklep)}</b><b>${kwotaPL(r.kwota)}</b></div>
      ${r.co ? `<div>${esc(r.co)}</div>` : ''}<small>${dt(r.data)} · zapłacił: ${esc(zaplacil(r, f))}</small>
      ${r.sprawdzone ? `<div class="info2"><b>✓ Sprawdzone, zgadza się</b></div>`
        : `<div class="late info2">Do sprawdzenia${r.pola_niepewne && r.pola_niepewne.length ? ': ' + esc(listaPol(r.pola_niepewne)) : ''}${F() ? ' – czeka na Właściciela aplikacji' : ''}</div>`}
      <div class="acts">${F() ? '' : r.sprawdzone ? `<button class="btn2" data-odznacz="${r.id}">Odznacz</button>` : `<button class="btn" data-ok="${r.id}">Sprawdzone, zgadza się</button>`}
        <button class="btn2" data-zobacz="${r.id}">Zobacz zdjęcie i dane</button></div></div>`;
    const bud = f.budzet_materialow == null ? null : Number(f.budzet_materialow);
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>${F() ? 'Paragony' : 'Paragony i materiały'} – ${esc(f.ulica)}</h1>
      <p class="intro">${F()
        ? `Tu ${esc(kto())} dodaje zdjęcia paragonów i faktur za materiały kupione do tego mieszkania. Aplikacja sama odczytuje ze zdjęcia sklep, datę, kwotę i pozycje – pola, których nie odczyta, trzeba uzupełnić ręcznie. Każdy dokument czeka potem na sprawdzenie przez Właściciela aplikacji. Zdjęcie trafia też do Biblioteki › Paragony.`
        : `Tu są paragony i faktury za materiały do tego mieszkania: sklep, co kupiono, kwota, data i kto zapłacił. Aplikacja odczytuje dane ze zdjęcia, a czego nie odczyta pewnie, oznacza „Do sprawdzenia”. ${esc(kto())} porównuje wtedy dane ze zdjęciem i klika „Sprawdzone, zgadza się”; „Odznacz” cofa sprawdzenie. Do wydanych pieniędzy wchodzą tylko dokumenty sprawdzone. Po kliknięciu „+ Dodaj paragon lub fakturę” otworzy się aparat albo galeria.`}</p>
      ${error ? komunikat(bladPar(error)) : ''}${msg ? komunikat(msg, info) : ''}
      ${F() ? `<div class="card dark kpi"><small>Materiały kupione przez firmę (sprawdzone)</small><div id="kpiFirma">${zl(wyd)}</div>${wCz ? `<small>czeka na sprawdzenie: ${zl(wCz)}</small>` : ''}</div>`
      : `<div class="card" id="budzetMat">${bud == null
          ? `<div class="zw"><b>Materiały: wydane ${zl(wyd)}</b>${wCz ? `<span>czeka: ${zl(wCz)}</span>` : ''}</div><p class="info2">Budżet na materiały nie jest wpisany. Wpisuje się go w „Pieniądze” › „Zmień kwoty”.</p>`
          : `<div class="zw"><b>Materiały: wydane ${zl(wyd)} z ${zl(bud)}</b><span class="${wyd > bud ? 'ostrz' : ''}" style="white-space:nowrap">${wyd > bud ? 'budżet przekroczony o ' + zl(Math.round((wyd - bud) * 100) / 100) : 'zostało ' + zl(Math.round((bud - wyd) * 100) / 100)}</span></div>
             ${pasekP(Math.min(100, bud > 0 ? Math.round(wyd / bud * 100) : 100))}${wCz ? `<p class="info2">Czeka na sprawdzenie: ${zl(wCz)} – wejdzie do wydanych po kliknięciu „Sprawdzone, zgadza się”.</p>` : ''}`}</div>
        <div class="grid g3" style="margin-bottom:12px">
          <div class="card dark kpi"><small>Materiały razem (sprawdzone)</small><div id="kpiRazem">${zl(wyd)}</div></div>
          <div class="card dark kpi"><small>Zapłaciła firma</small><div id="kpiFirma">${zl(sumuj(l, r => r.sprawdzone && r.zaplacil === 'firma'))}</div></div>
          <div class="card dark kpi"><small>Do sprawdzenia</small><div id="kpiDoSpr">${czeka.length}</div></div></div>`}
      <button class="btn full" id="dodajDok" style="margin-bottom:12px">+ Dodaj paragon lub fakturę</button>
      <div id="dokumenty">${l.length ? l.map(karta).join('') : `<div class="card empty"><b>Nie ma jeszcze żadnego dokumentu.</b><br>Po kliknięciu „+ Dodaj paragon lub fakturę” można dodać pierwszy.</div>`}</div>`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    $('#dodajDok').onclick = () => ekranNowyDok(fid);
    app.querySelectorAll('[data-zobacz]').forEach(b => b.onclick = () => ekranDok(fid, b.dataset.zobacz));
    app.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => ustawSpr(fid, l.find(r => r.id === b.dataset.ok), true, ekranParagony));
    app.querySelectorAll('[data-odznacz]').forEach(b => b.onclick = () => ustawSpr(fid, l.find(r => r.id === b.dataset.odznacz), false, ekranParagony));
  }

  async function ustawSpr(fid, r, tak, powrot){
    const { error } = await sb.from('paragony').update({ sprawdzone:tak }).eq('id', r.id);
    powrot(fid, error ? bladPar(error) : tak ? `Sprawdzone: ${r.sklep} ${kwotaPL(r.kwota)}. Kwota weszła do wydanych na materiały.` : `Odznaczono: ${r.sklep} ${kwotaPL(r.kwota)} jest znowu „Do sprawdzenia” i nie liczy się do wydanych.`, !error, r.id);
  }

  /* ---------- nowy dokument: zdjęcie ---------- */
  const linie = (x, y, n, w) => Array.from({ length:n }, (_, i) => `<line x1="${x}" y1="${y + i * 9}" x2="${x + (i % 3 === 2 ? w * 0.6 : w)}" y2="${y + i * 9}" stroke="#1E1A17" stroke-width="2"/>`).join('');
  const RYSUNEK = `<svg viewBox="0 0 300 130" width="100%" style="max-width:420px;display:block;margin:8px auto" role="img" aria-label="Przykład dobrego i złego zdjęcia paragonu">
    <g><rect x="10" y="6" width="120" height="100" rx="8" fill="#f4f1ea" stroke="#1E1A17" stroke-width="3"/>
      <rect x="44" y="14" width="52" height="84" fill="#f4f1ea" stroke="#B8924A" stroke-width="2"/>${linie(50, 24, 8, 40)}
      <path d="M100 92 l8 8 l16 -18" fill="none" stroke="#B8924A" stroke-width="5"/>
      <text x="70" y="124" text-anchor="middle" font-size="14" font-weight="700" fill="#1E1A17">Dobrze</text></g>
    <g><rect x="170" y="6" width="120" height="100" rx="8" fill="#f4f1ea" stroke="#1E1A17" stroke-width="3"/>
      <g transform="rotate(14 230 50)"><rect x="206" y="-12" width="52" height="84" fill="#f4f1ea" stroke="#B8924A" stroke-width="2"/>${linie(212, -2, 8, 40)}</g>
      <ellipse cx="214" cy="80" rx="30" ry="16" fill="#1E1A17" opacity=".45"/>
      <path d="M262 82 l18 18 M280 82 l-18 18" stroke="#1E1A17" stroke-width="5"/>
      <text x="230" y="124" text-anchor="middle" font-size="14" font-weight="700" fill="#1E1A17">Źle</text></g></svg>`;
  const ZASADY = ['Cały paragon w kadrze', 'Płasko, nie zgnieciony', 'Jasno, bez cienia telefonu', 'Ostro, telefon nieruchomo'];
  const POWODY = {
    nieostre:'Zdjęcie jest nieostre – trzeba zrobić je jeszcze raz, trzymając telefon nieruchomo.',
    ciemne:'Zdjęcie jest za ciemne – trzeba zrobić je jeszcze raz w jaśniejszym miejscu.',
    jasne:'Zdjęcie jest prześwietlone – trzeba zrobić je jeszcze raz bez lampy błyskowej i bez ostrego światła na paragonie.',
    uciety:'Paragon jest ucięty – cały paragon musi być w kadrze. Najlepiej położyć go na ciemnym tle.',
    tekst:'Na zdjęciu nie widać paragonu – trzeba zrobić zdjęcie jeszcze raz, z całym paragonem w kadrze.' };

  function ekranNowyDok(fid, msg){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    S.dok = { fid, zle:0 };
    app.innerHTML = `<button class="btnT" id="wroc">← Paragony i materiały</button>
      <h1>Nowy paragon lub faktura</h1>
      <p class="intro">Krok 1 z 3: zdjęcie dokumentu. ${esc(kto())} robi zdjęcie paragonu albo faktury za materiały do mieszkania ${esc(f.ulica)}, wybiera je z galerii albo wybiera plik PDF. Aplikacja od razu sprawdza, czy zdjęcie jest dobre do odczytu. Dalej: przycięcie zdjęcia, potem odczyt danych.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="card" id="wskazowka"><b>Jak zrobić dobre zdjęcie</b>${RYSUNEK}<ol class="info2" style="padding-left:20px;margin:4px 0 0">${ZASADY.map(z => `<li>${z}</li>`).join('')}</ol></div>
      <div class="dwa"><label class="btn wgraj" for="dokAparat" id="lAparat">📷 Zrób zdjęcie</label><label class="btn2 wgraj" for="dokGaleria" id="lGaleria">Z galerii lub plik PDF</label></div>
      <input type="file" id="dokAparat" class="hide" accept="image/*" capture="environment">
      <input type="file" id="dokGaleria" class="hide" accept="image/*,application/pdf,.pdf">
      <div class="card"><b>Co będzie dalej</b><div class="info2">Krok 2: przycięcie zdjęcia czterema narożnikami i obrót.<br>Krok 3: aplikacja odczytuje sklep, datę, NIP, kwotę i pozycje. Pola, których nie odczyta pewnie, będą puste albo z czerwoną ramką – trzeba je uzupełnić. Z pliku PDF dane przepisuje się ręcznie.</div></div>
      <div class="acts"><button class="btn2" id="anuluj">Anuluj</button></div>`;
    $('#wroc').onclick = $('#anuluj').onclick = () => ekranParagony(fid);
    $('#dokAparat').onchange = $('#dokGaleria').onchange = e => wybranoPlik(fid, e.target.files[0], ekranNowyDok);
  }

  async function wybranoPlik(fid, plik, bladEkran){
    if (!plik) return;
    const pdf = plik.type === 'application/pdf' || /\.pdf$/i.test(plik.name);
    if (pdf){
      if (plik.size > MAX_PDF) return bladEkran(fid, 'Plik PDF jest za duży (najwyżej 20 MB).');
      S.dok = { fid, pdf:plik, nazwaPliku:plik.name }; return ekranDaneDok(fid, null, null, { niepewne:[] });
    }
    if (!(plik.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(plik.name))) return bladEkran(fid, `${plik.name}: to nie jest zdjęcie ani plik PDF.`);
    try { await wczytajZdjecie(plik); } catch(err){ return bladEkran(fid, `${plik.name}: nie da się odczytać tego zdjęcia. Trzeba zapisać je jako JPG i spróbować jeszcze raz.`); }
    const o = OdczytParagonu.ocenZdjecie(S.dok.zrodlo); S.dok.ocena = o;
    if (o.powod){ S.dok.zle = (S.dok.zle || 0) + 1; return ekranZleZdjecie(fid); }
    S.dok.zle = 0; ekranKadr(fid);
  }

  // zdjęcie słabe: wprost dlaczego, „Zrób jeszcze raz”; po drugim złym zdjęciu także „Zapisz mimo to”
  function ekranZleZdjecie(fid, msg){
    const f = mieszkanie(fid); if (!f || !S.dok || !S.dok.zrodlo) return ekranParagony(fid);
    const drugi = S.dok.zle >= 2, podglad = S.dok.zrodlo.toDataURL('image/jpeg', 0.6);
    app.innerHTML = `<button class="btnT" id="wroc">← Paragony i materiały</button>
      <h1>Zdjęcie nie nadaje się do odczytu</h1>
      <p class="intro">Aplikacja sprawdziła zdjęcie przed odczytem i znalazła problem opisany poniżej. „Zrób jeszcze raz” otwiera aparat${drugi ? '. To już drugie słabe zdjęcie, więc można też kliknąć „Zapisz mimo to”: zdjęcie zostanie jako dowód w Bibliotece › Paragony, dane trzeba będzie przepisać ręcznie, a dokument będzie „Do sprawdzenia”' : ''}.</p>
      ${komunikat(POWODY[S.dok.ocena.powod])}${msg ? komunikat(msg) : ''}
      <img class="dok-mini" src="${podglad}" alt="Zdjęcie, które nie nadaje się do odczytu">
      <div class="card"><b>Jak zrobić dobre zdjęcie</b><ol class="info2" style="padding-left:20px;margin:4px 0 0">${ZASADY.map(z => `<li>${z}</li>`).join('')}</ol></div>
      <div class="dwa"><label class="btn wgraj" for="dokAparat" id="lPonow">📷 Zrób jeszcze raz</label><label class="btn2 wgraj" for="dokGaleria" id="lGaleria">Z galerii</label></div>
      <input type="file" id="dokAparat" class="hide" accept="image/*" capture="environment">
      <input type="file" id="dokGaleria" class="hide" accept="image/*,application/pdf,.pdf">
      <div class="acts"><button class="btn2" id="anuluj">Anuluj</button>${drugi ? '<button class="btn2" id="mimoTo">Zapisz mimo to</button>' : ''}</div>`;
    $('#wroc').onclick = $('#anuluj').onclick = () => ekranParagony(fid);
    $('#dokAparat').onchange = $('#dokGaleria').onchange = e => wybranoPlik(fid, e.target.files[0], ekranZleZdjecie);
    const m = $('#mimoTo'); if (m) m.onclick = () => { S.dok.mimoTo = true; S.dok.rogi = pelneRogi(S.dok.zrodlo); przytnij(); ekranDaneDok(fid, null, null, { niepewne:['sklep', 'kwota', 'data'], zrodlo:'reczny' }); };
  }

  async function wczytajZdjecie(plik){
    const bmp = await createImageBitmap(plik, { imageOrientation:'from-image' });
    const s = Math.min(1, 1500 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const x = c.getContext('2d'); x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    S.dok.zrodlo = c; S.dok.nazwaPliku = plik.name; S.dok.rogi = pelneRogi(c);
  }
  const pelneRogi = c => [{ x:0, y:0 }, { x:c.width, y:0 }, { x:c.width, y:c.height }, { x:0, y:c.height }];
  function obroc(){
    const z = S.dok.zrodlo, c = document.createElement('canvas'); c.width = z.height; c.height = z.width;
    const x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(z, 0, 0);
    S.dok.zrodlo = c; S.dok.rogi = pelneRogi(c);
  }

  /* ---------- krok 2: przycięcie 4 narożnikami, obrót ---------- */
  function ekranKadr(fid, msg){
    const f = mieszkanie(fid); if (!f || !S.dok || !S.dok.zrodlo) return ekranParagony(fid);
    app.innerHTML = `<button class="btnT" id="wroc">← Paragony i materiały</button>
      <h1>Przycięcie zdjęcia</h1>
      <p class="intro">Krok 2 z 3. Cztery złote narożniki trzeba przesunąć palcem albo myszką na rogi paragonu – wtedy aplikacja wytnie sam paragon i go wyprostuje. „↻ Obróć” obraca zdjęcie o ćwierć obrotu, gdy paragon leży bokiem albo do góry nogami. Po kliknięciu „Odczytaj dane ze zdjęcia” aplikacja odczyta tekst (pierwszy raz wczytuje się około 7 MB, potem idzie szybciej). „Przepisz dane ręcznie” pomija odczyt.</p>
      ${msg ? komunikat(msg) : ''}
      <canvas class="kadr" id="kadr" aria-label="Zdjęcie paragonu z czterema narożnikami do przesuwania"></canvas>
      <div class="acts"><button class="btn2" id="obroc">↻ Obróć</button><button class="btn2" id="calosc">Całe zdjęcie</button><button class="btn2" id="inne">Inne zdjęcie</button></div>
      <div class="postep hide" id="postep" role="status"></div>
      <div class="acts"><button class="btn2" id="reczne">Przepisz dane ręcznie</button><button class="btn" id="odczytaj">Odczytaj dane ze zdjęcia</button></div>`;
    const cv = $('#kadr'); rysuj(cv); kadrDotyk(cv);
    $('#wroc').onclick = () => ekranParagony(fid);
    $('#obroc').onclick = () => { obroc(); rysuj(cv); };
    $('#calosc').onclick = () => { S.dok.rogi = pelneRogi(S.dok.zrodlo); rysuj(cv); };
    $('#inne').onclick = () => ekranNowyDok(fid);
    $('#reczne').onclick = () => { przytnij(); ekranDaneDok(fid, null, null, { niepewne:[] }); };
    $('#odczytaj').onclick = async () => {
      app.querySelectorAll('button').forEach(b => b.disabled = true);
      const p = $('#postep'); p.classList.remove('hide');
      przytnij();
      try {
        const w = await odczyt(t => p.textContent = t);
        ekranDaneDok(fid, null, null, w);
      } catch(e){
        app.querySelectorAll('button').forEach(b => b.disabled = false); p.classList.add('hide');
        ekranDaneDok(fid, null, 'Nie udało się odczytać zdjęcia (' + ((e && e.message) || 'brak połączenia') + '). Dane trzeba przepisać ręcznie.', { niepewne:[] });
      }
    };
  }

  function rysuj(cv){
    const z = S.dok.zrodlo, R = S.dok.rogi; cv.width = z.width; cv.height = z.height;
    const x = cv.getContext('2d'); x.drawImage(z, 0, 0);
    const sk = Math.max(1, z.width / (cv.getBoundingClientRect().width || z.width));
    x.save(); x.fillStyle = 'rgba(30,26,23,.55)'; x.beginPath(); x.rect(0, 0, z.width, z.height);
    x.moveTo(R[0].x, R[0].y); R.slice(1).forEach(p => x.lineTo(p.x, p.y)); x.closePath(); x.fill('evenodd'); x.restore();
    x.strokeStyle = '#B8924A'; x.lineWidth = 3 * sk; x.beginPath(); x.moveTo(R[0].x, R[0].y); R.slice(1).forEach(p => x.lineTo(p.x, p.y)); x.closePath(); x.stroke();
    R.forEach(p => { x.beginPath(); x.arc(p.x, p.y, 13 * sk, 0, Math.PI * 2); x.fillStyle = 'rgba(244,241,234,.35)'; x.fill(); x.lineWidth = 4 * sk; x.strokeStyle = '#B8924A'; x.stroke(); });
  }
  function kadrDotyk(cv){
    let ktory = -1;
    const pkt = e => { const r = cv.getBoundingClientRect(); return { x:(e.clientX - r.left) * cv.width / r.width, y:(e.clientY - r.top) * cv.height / r.height, sk:cv.width / r.width }; };
    cv.addEventListener('pointerdown', e => { const p = pkt(e); let best = -1, d = 40 * p.sk;
      S.dok.rogi.forEach((q, i) => { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < d){ d = dd; best = i; } });
      if (best >= 0){ ktory = best; cv.setPointerCapture(e.pointerId); e.preventDefault(); } });
    cv.addEventListener('pointermove', e => { if (ktory < 0) return; const p = pkt(e);
      S.dok.rogi[ktory] = { x:Math.max(0, Math.min(cv.width, p.x)), y:Math.max(0, Math.min(cv.height, p.y)) }; rysuj(cv); e.preventDefault(); });
    const koniec = () => { ktory = -1; }; cv.addEventListener('pointerup', koniec); cv.addEventListener('pointercancel', koniec);
  }

  // wycięcie czworokąta do prostokąta (przekształcenie perspektywiczne), potem szarość i kontrast do odczytu
  function homografia(src, dst){
    const A = [], b = [];
    for (let i = 0; i < 4; i++){ const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    for (let c = 0; c < 8; c++){ let m = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
      [A[c], A[m]] = [A[m], A[c]]; [b[c], b[m]] = [b[m], b[c]];
      for (let r = 0; r < 8; r++) if (r !== c){ const k = A[r][c] / A[c][c]; for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j]; b[r] -= k * b[c]; } }
    return b.map((v, i) => v / A[i][i]);
  }
  function przytnij(){
    const z = S.dok.zrodlo, R = S.dok.rogi, d = (a, c) => Math.hypot(a.x - c.x, a.y - c.y);
    const w = Math.max(20, Math.round(Math.max(d(R[0], R[1]), d(R[3], R[2])))), h = Math.max(20, Math.round(Math.max(d(R[0], R[3]), d(R[1], R[2]))));
    const H = homografia([[0, 0], [w, 0], [w, h], [0, h]], R.map(p => [p.x, p.y]));
    const we = z.getContext('2d').getImageData(0, 0, z.width, z.height).data, W0 = z.width, H0 = z.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const out = x.createImageData(w, h), o = out.data;
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++){
      const k = H[6] * u + H[7] * v + 1, sx = Math.round((H[0] * u + H[1] * v + H[2]) / k), sy = Math.round((H[3] * u + H[4] * v + H[5]) / k);
      const i = (v * w + u) * 4;
      if (sx < 0 || sy < 0 || sx >= W0 || sy >= H0){ o[i] = 244; o[i + 1] = 241; o[i + 2] = 234; o[i + 3] = 255; continue; }
      const j = (sy * W0 + sx) * 4; o[i] = we[j]; o[i + 1] = we[j + 1]; o[i + 2] = we[j + 2]; o[i + 3] = 255; }
    x.putImageData(out, 0, 0); S.dok.kolor = c;
    // szarość + rozciągnięcie kontrastu (2% najciemniejszych → czarne, 2% najjaśniejszych → białe)
    const g = document.createElement('canvas'); g.width = w; g.height = h; const gx = g.getContext('2d'); const gd = gx.createImageData(w, h), q = gd.data;
    const hist = new Array(256).fill(0), L = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++){ const l = Math.round(0.299 * o[i * 4] + 0.587 * o[i * 4 + 1] + 0.114 * o[i * 4 + 2]); L[i] = l; hist[l]++; }
    let lo = 0, hi = 255, s = 0; const n = w * h * 0.02;
    while (lo < 255 && (s += hist[lo]) < n) lo++; s = 0; while (hi > 0 && (s += hist[hi]) < n) hi--;
    const r = Math.max(1, hi - lo);
    for (let i = 0; i < w * h; i++){ const v = Math.max(0, Math.min(255, Math.round((L[i] - lo) * 255 / r))); q[i * 4] = q[i * 4 + 1] = q[i * 4 + 2] = v; q[i * 4 + 3] = 255; }
    gx.putImageData(gd, 0, 0); S.dok.szary = g;
  }

  /* ---------- odczyt ---------- */
  let silnikP = null, logOdczytu = null;
  const skrypt = src => new Promise((ok, nie) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => nie(new Error('nie wczytano biblioteki odczytu')); document.head.appendChild(s); });
  function silnik(){
    if (!silnikP){
      silnikP = (async () => {
        if (!window.Tesseract) await skrypt(LIB + 'tesseract.min.js');
        const baza = new URL(LIB, location.href).href;
        return Tesseract.createWorker('pol', 1, { workerPath:baza + 'worker.min.js', corePath:baza, langPath:baza.replace(/\/$/, ''),
          logger:m => logOdczytu && logOdczytu(m) });
      })();
      silnikP.catch(() => { silnikP = null; });
    }
    return silnikP;
  }
  async function odczytAI(canvas){
    if (!ODCZYT_AI) return null;
    // Szkic na później (wyłączony): funkcja w Supabase sprawdza zalogowanie i dzienny limit, klucz AI trzyma w sekretach.
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    const obraz = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    const { data, error } = await sb.functions.invoke('odczyt-paragonu', { body:{ obraz } });
    if (error || !data || data.error) return null;   // limit wyczerpany albo błąd: zwykły odczyt
    return { ...data, zrodlo:'ai' };
  }
  async function odczyt(pisz){
    const ai = await odczytAI(S.dok.szary).catch(() => null);
    if (ai) return ai;
    const pierwszy = !silnikP;
    pisz(pierwszy ? 'Wczytuję odczyt paragonu…' : 'Odczytuję paragon…');
    logOdczytu = m => { if (m.status === 'recognizing text') pisz(`Odczytuję paragon… ${Math.round((m.progress || 0) * 100)}%`); else if (pierwszy) pisz('Wczytuję odczyt paragonu…'); };
    const t0 = Date.now();
    const w = await silnik();
    const r = await w.recognize(S.dok.szary);
    logOdczytu = null;
    const a = OdczytParagonu.analizuj(r.data.text, dzis());
    const pewnosc = Math.max(0, Math.min(100, Math.round(r.data.confidence || 0)));
    const niep = new Set(a.niepewne);
    if (pewnosc < 50) ['sklep', 'kwota', 'data'].forEach(k => niep.add(k));   // słaby odczyt: wszystko do sprawdzenia
    S.dok.czasOdczytu = Date.now() - t0;
    return { sklep:a.sklep, co:a.co, kwota:a.kwota, data:a.data, nip:a.nip, pozycje:a.pozycje, zgodne:a.zgodne, sumaPozycji:a.sumaPozycji,
      niepewne:[...niep], tekst:r.data.text, pewnosc, zrodlo:'tesseract' };
  }

  /* ---------- krok 3 / popraw odczyt: dane dokumentu ---------- */
  async function ekranDaneDok(fid, id, msg, wpis){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    let r = null, foto = '';
    if (id){
      app.innerHTML = '<p>Wczytuję dokument…</p>';
      const { data } = await sb.from('paragony').select('*').eq('id', id); r = (data || [])[0];
      if (!r || F()) return ekranParagony(fid);
      const { pl, linki } = await linkiPlikow([r]); const p = pl[r.plik];
      foto = p ? (p.typ === 'pdf' ? '<p class="info2">Dokument jest plikiem PDF – podgląd w „Zobacz zdjęcie i dane”.</p>' : `<img class="dok-mini" src="${esc(linki[p.sciezka] || '')}" alt="Zdjęcie dokumentu">`) : '<p class="info2">Zdjęcie dokumentu zostało usunięte z Biblioteki.</p>';
      if (!wpis) wpis = { sklep:r.sklep, co:r.co, kwota:r.kwota, data:r.data, nip:r.nip, zaplacil:r.zaplacil, niepewne:[...(r.pola_niepewne || [])], pozycje:r.pozycje, zrodlo:r.zrodlo_odczytu, pewnosc:r.pewnosc };
    } else {
      if (!S.dok || S.dok.fid !== fid || !(S.dok.kolor || S.dok.pdf)) return ekranNowyDok(fid);
      if (S.dok.kolor && !S.dok.url){ const b = await new Promise(ok => S.dok.kolor.toBlob(ok, 'image/jpeg', 0.85)); S.dok.blob = b; S.dok.url = URL.createObjectURL(b); }
      foto = S.dok.pdf ? `<p class="info2"><b>Plik PDF: ${esc(S.dok.nazwaPliku)}</b><br>Z pliku PDF aplikacja nie odczytuje danych – trzeba je przepisać.</p>` : `<img class="dok-mini" src="${S.dok.url}" alt="Zdjęcie dokumentu">`;
      S.dok.wpis = wpis;
    }
    const w = wpis, niep = new Set(w.niepewne || []);
    const odczytane = w.zrodlo === 'tesseract' || w.zrodlo === 'ai';
    const uwaga = k => { if (!niep.has(k)) return '';
      const pusty = w[k] == null || w[k] === '';
      if (k === 'kwota' && !pusty && w.pozycje && w.pozycje.length && w.sumaPozycji != null && !w.zgodne) return `<span class="uwaga">Do sprawdzenia – suma pozycji (${zl(w.sumaPozycji)}) nie zgadza się z sumą na paragonie.</span>`;
      return `<span class="uwaga">${pusty ? 'Nie udało się odczytać – trzeba wpisać.' : 'Do sprawdzenia – trzeba porównać ze zdjęciem.'}</span>`; };
    const pole = (k, et, typ, wart, extra = '') => `<div class="${niep.has(k) ? 'niep' : ''}" data-pole="${k}"><label for="d-${k}">${et}</label>${typ === 'area'
      ? `<textarea id="d-${k}" rows="2" maxlength="300" ${extra}>${esc(wart ?? '')}</textarea>` : `<input id="d-${k}" type="${typ}" value="${esc(wart ?? '')}" ${extra}>`}${uwaga(k)}</div>`;
    const kw = w.kwota == null || w.kwota === '' ? '' : String(w.kwota).replace('.', ',');
    const poz = (w.pozycje || []);
    app.innerHTML = `<button class="btnT" id="wroc">← Paragony i materiały</button>
      <div class="narrow"><h1>${id ? 'Popraw odczyt' : 'Dane dokumentu'}</h1>
      <p class="intro">${id ? `Tu ${esc(kto())} poprawia dane dokumentu ${esc(r.sklep)}. Po kliknięciu „Zapisz” dokument będzie „Sprawdzony, zgadza się” i jego kwota wejdzie do wydanych na materiały.`
        : S.dok && S.dok.mimoTo ? `Krok 3 z 3. Zdjęcie jest słabej jakości, więc aplikacja go nie odczytywała – zostanie jako dowód w Bibliotece › Paragony. Dane trzeba przepisać z paragonu: sklep, kwotę i datę. Po kliknięciu „Zapisz dokument” dokument będzie „Do sprawdzenia”.`
        : `Krok 3 z 3. ${odczytane ? `Aplikacja odczytała dane ze zdjęcia (pewność odczytu: ${w.pewnosc}%). Pola z czerwoną ramką trzeba porównać ze zdjęciem albo uzupełnić – aplikacja niczego nie zgaduje.` : `Dane trzeba przepisać z dokumentu: sklep, co kupiono, kwotę i datę.`} ${F() ? 'Po kliknięciu „Zapisz dokument” zdjęcie trafi do Biblioteki › Paragony, a dokument poczeka na sprawdzenie przez Właściciela aplikacji.' : 'Po kliknięciu „Zapisz dokument” zdjęcie trafi do Biblioteki › Paragony. Gdy żadne pole nie ma czerwonej ramki, dokument od razu będzie sprawdzony; inaczej będzie „Do sprawdzenia”.'}`}</p>
      ${msg ? komunikat(msg) : ''}
      ${foto}
      <form id="f" novalidate>
        ${pole('sklep', 'Sklep *', 'text', w.sklep, 'maxlength="120" autocomplete="off"')}
        ${pole('co', 'Co kupiono <small>(nieobowiązkowo)</small>', 'area', w.co)}
        <div class="grid g2"><div>${pole('kwota', 'Kwota (zł) *', 'text', kw, 'inputmode="decimal"')}</div><div>${pole('data', 'Data zakupu *', 'date', w.data, `max="${dzis()}"`)}</div></div>
        ${pole('nip', 'NIP sklepu <small>(nieobowiązkowo)</small>', 'text', w.nip, 'inputmode="numeric" maxlength="16"')}
        ${F() ? '<p class="info2">Zapłacił: firma remontowa.</p>' : `<label for="d-zaplacil">Kto zapłacił</label><select id="d-zaplacil" class="wybor"><option value="firma" ${w.zaplacil !== 'wlasciciel' ? 'selected' : ''}>${esc((f.firma_remontowa && f.firma_remontowa.trim()) || 'Firma remontowa')}</option><option value="wlasciciel" ${w.zaplacil === 'wlasciciel' ? 'selected' : ''}>${esc(kto())}</option></select>`}
        ${poz.length ? `<div class="card ${niep.has('pozycje') ? 'niep' : ''}" style="margin-top:12px" id="pozycje"><b>Pozycje z paragonu (${poz.length})</b>${poz.map(p => `<div class="poz"><span>${p.zgodna === false ? '<span class="ostrz">! </span>' : ''}${esc(p.nazwa)}</span><span>${String(p.ilosc).replace('.', ',')} × ${zl(p.cena)} = ${zl(p.wartosc)}${p.ptu ? ' ' + esc(p.ptu) : ''}</span></div>`).join('')}
          ${niep.has('pozycje') ? '<span class="uwaga">Pozycja z „!” – ilość × cena nie daje wartości. Do sprawdzenia na zdjęciu.</span>' : ''}</div>` : ''}
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapiszDok">${id ? 'Zapisz' : 'Zapisz dokument'}</button></div>
      </form></div>`;
    const sel = $('#d-zaplacil'); if (sel) sel.style.cssText = 'width:100%;padding:10px;border:1px solid #1E1A17;border-radius:8px;background:#f4f1ea;color:#1E1A17;font:inherit';
    const wroc = () => { if (S.dok && S.dok.url) URL.revokeObjectURL(S.dok.url); S.dok = null; id ? ekranDok(fid, id) : ekranParagony(fid); };
    $('#wroc').onclick = $('#anuluj').onclick = wroc;
    app.querySelectorAll('.dok-mini').forEach(im => im.onclick = () => podglad({ nazwa:'Zdjęcie dokumentu', sciezka:'x', typ:'zdjecie' }, { x:im.src }));
    ['sklep', 'co', 'kwota', 'data', 'nip'].forEach(k => { const i = $('#d-' + k); i.addEventListener('input', () => { niep.delete(k); const b = i.closest('[data-pole]'); b.classList.remove('niep'); const u = b.querySelector('.uwaga'); if (u) u.remove(); }); });
    $('#f').onsubmit = async e => {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const v = { sklep:$('#d-sklep').value.trim(), co:$('#d-co').value.trim(), kwotaTxt:$('#d-kwota').value, data:$('#d-data').value, nipTxt:$('#d-nip').value.trim(), zaplacil:F() ? 'firma' : $('#d-zaplacil').value };
      const nw = { ...w, sklep:v.sklep, co:v.co, kwota:v.kwotaTxt, data:v.data, nip:v.nipTxt, zaplacil:v.zaplacil, niepewne:[...niep] };
      const k = liczba(v.kwotaTxt), nip = v.nipTxt.replace(/[\s-]/g, '').replace(/^PL/i, '');
      if (!v.sklep) return ekranDaneDok(fid, id, 'Trzeba wpisać sklep.', nw);
      if (k == null || Number.isNaN(k) || k <= 0) return ekranDaneDok(fid, id, 'Kwota musi być liczbą większą od zera, np. 228,18.', nw);
      if (k > 9999999999) return ekranDaneDok(fid, id, 'Kwota jest za duża.', nw);
      if (Math.round(k * 100) !== Math.round(k * 100 * 1000) / 1000) return ekranDaneDok(fid, id, 'Kwota może mieć najwyżej 2 miejsca po przecinku, np. 228,18.', nw);
      if (!v.data) return ekranDaneDok(fid, id, 'Trzeba wpisać datę zakupu.', nw);
      if (v.data > dzis()) return ekranDaneDok(fid, id, 'Data zakupu nie może być z przyszłości.', nw);
      if (nip && !(OdczytParagonu.nipOk(nip))) return ekranDaneDok(fid, id, 'NIP sklepu jest błędny (10 cyfr, zła suma kontrolna). Trzeba go poprawić albo zostawić puste.', nw);
      const btn = $('#zapiszDok'); btn.disabled = true; btn.classList.add('load');
      const dane = { sklep:v.sklep, co:v.co || null, kwota:Math.round(k * 100) / 100, data:v.data, nip:nip || null, zaplacil:v.zaplacil };
      if (id){
        const { error } = await sb.from('paragony').update({ ...dane, pola_niepewne:[], sprawdzone:true }).eq('id', id);
        if (error) return ekranDaneDok(fid, id, bladPar(error), nw);
        return ekranDok(fid, id, `Odczyt poprawiony i sprawdzony: ${dane.sklep} ${zl(dane.kwota)}.`);
      }
      btn.textContent = 'Wgrywam zdjęcie…';
      const pl = await wgrajDokument(fid, dane);
      if (pl.blad) return ekranDaneDok(fid, null, 'Nie udało się wgrać zdjęcia: ' + pl.blad, nw);
      const zostaje = [...niep].filter(x => POLA[x]);
      const wiersz = { mieszkanie:fid, wlasciciel:wlascicielId(fid), plik:pl.id, ...dane, sprawdzone:!F() && !zostaje.length && !(S.dok && S.dok.mimoTo),
        zrodlo_odczytu:w.zrodlo || 'reczny', pewnosc:w.pewnosc ?? null, tekst_surowy:w.tekst ? String(w.tekst).slice(0, 20000) : null,
        pola_niepewne:zostaje, pozycje:(w.pozycje || []).slice(0, 200).map(p => ({ nazwa:p.nazwa, ilosc:p.ilosc, cena:p.cena, wartosc:p.wartosc, ptu:p.ptu, zgodna:p.zgodna })) };
      const { data, error } = await sb.from('paragony').insert(wiersz).select().single();
      if (error){
        if (!F()){ await sb.from('pliki').delete().eq('id', pl.id); await sb.storage.from(SCHOWEK).remove([pl.sciezka]); }
        return ekranDaneDok(fid, null, bladPar(error), nw);
      }
      if (S.dok && S.dok.url) URL.revokeObjectURL(S.dok.url); S.dok = null;
      ekranParagony(fid, `Dokument zapisany: ${data.sklep} ${zl(data.kwota)}. ${data.sprawdzone ? 'Jest sprawdzony i liczy się do wydanych na materiały.' : F() ? 'Czeka na sprawdzenie przez Właściciela aplikacji.' : 'Jest „Do sprawdzenia”' + ((data.pola_niepewne || []).length ? ': ' + listaPol(data.pola_niepewne) : '') + '.'} Zdjęcie jest w Bibliotece › Paragony.`);
    };
  }

  async function wgrajDokument(fid, dane){
    const pdf = !!S.dok.pdf, blob = pdf ? S.dok.pdf : S.dok.blob;
    if (!blob) return { blad:'brak zdjęcia' };
    const uid = wlascicielId(fid), ext = pdf ? 'pdf' : 'jpg';
    const sciezka = `${uid}/${fid}/paragony/${crypto.randomUUID()}.${ext}`;
    const nazwa = `Paragon ${dane.sklep} ${dt(dane.data)}`.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 100) + '.' + ext;
    const up = await sb.storage.from(SCHOWEK).upload(sciezka, blob, { contentType:pdf ? 'application/pdf' : 'image/jpeg', upsert:false });
    if (up.error) return { blad:bladPliku(up.error) };
    const { data, error } = await sb.from('pliki').insert({ mieszkanie:fid, wlasciciel:uid, folder:'paragony', nazwa, sciezka, typ:pdf ? 'pdf' : 'zdjecie', rozmiar:blob.size }).select().single();
    if (error){ await sb.storage.from(SCHOWEK).remove([sciezka]); return { blad:bladPliku(error) }; }
    return { id:data.id, sciezka };
  }

  /* ---------- jeden dokument ---------- */
  async function ekranDok(fid, id, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję dokument…</p>';
    const { data, error } = await sb.from('paragony').select('*').eq('id', id);
    const r = (data || [])[0]; if (!r) return ekranParagony(fid, error ? bladPar(error) : 'Tego dokumentu już nie ma.', !error);
    const { pl, linki } = await linkiPlikow([r]); const p = pl[r.plik];
    const nazwy = await nazwyKto([r.dodal, r.sprawdzil]);
    const poz = r.pozycje || [];
    app.innerHTML = `<button class="btnT" id="wroc">← Paragony i materiały</button>
      <h1>${esc(r.sklep)} · ${kwotaPL(r.kwota)}</h1>
      <p class="intro">Zdjęcie dokumentu i dane z niego. Po kliknięciu zdjęcia otworzy się jego powiększenie. ${F() ? 'Dane poprawia i sprawdza Właściciel aplikacji.' : '„Popraw odczyt” otwiera dane do poprawy, „Usuń dokument” usuwa dokument razem ze zdjęciem (z pytaniem o potwierdzenie).'}</p>
      ${msg ? komunikat(msg, info) : ''}
      <div class="grid g2"><div>${p ? (p.typ === 'pdf' ? `<button class="btn full" id="pokaz">Otwórz plik PDF</button>` : `<img class="dok-mini" id="pokaz" src="${esc(linki[p.sciezka] || '')}" alt="Zdjęcie dokumentu" style="max-height:420px">`) : '<div class="card empty">Zdjęcie dokumentu zostało usunięte z Biblioteki.</div>'}</div>
      <div><div class="card">
        <div class="row"><span>Sklep</span><b>${esc(r.sklep)}</b></div>
        <div class="row"><span>Co kupiono</span><span style="text-align:right">${esc(r.co) || '–'}</span></div>
        <div class="row"><span>Kwota</span><b>${kwotaPL(r.kwota)}</b></div>
        <div class="row"><span>Data zakupu</span><span>${dt(r.data)}</span></div>
        <div class="row"><span>NIP sklepu</span><span>${esc(r.nip) || '–'}</span></div>
        <div class="row"><span>Kto zapłacił</span><span>${esc(zaplacil(r, f))}</span></div>
        <div class="row"><span>Dodał</span><span>${esc(nazwy[r.dodal] || 'Właściciel aplikacji')} · ${dataPL(r.utworzono)}</span></div>
        <div class="row"><span>Odczyt</span><span>${r.zrodlo_odczytu === 'reczny' ? 'dane przepisane ręcznie' : (r.zrodlo_odczytu === 'ai' ? 'odczyt AI' : 'odczyt ze zdjęcia w telefonie') + (r.pewnosc != null ? ` · pewność ${r.pewnosc}%` : '')}</span></div>
        <div class="row"><span>Stan</span>${r.sprawdzone ? `<b>✓ Sprawdzone przez ${esc(nazwy[r.sprawdzil] || 'Właściciel aplikacji')} · ${dataPL(r.sprawdzono)}</b>` : `<b class="late">Do sprawdzenia${r.pola_niepewne && r.pola_niepewne.length ? ': ' + esc(listaPol(r.pola_niepewne)) : ''}</b>`}</div>
      </div>
      ${poz.length ? `<div class="card"><b>Pozycje (${poz.length})</b>${poz.map(x => `<div class="poz"><span>${x.zgodna === false ? '<span class="ostrz">! </span>' : ''}${esc(x.nazwa)}</span><span>${String(x.ilosc).replace('.', ',')} × ${zl(x.cena)} = ${zl(x.wartosc)}${x.ptu ? ' ' + esc(x.ptu) : ''}</span></div>`).join('')}</div>` : ''}
      ${r.tekst_surowy ? `<div class="card"><details><summary>Tekst odczytany ze zdjęcia</summary><div class="surowy">${esc(r.tekst_surowy)}</div></details></div>` : ''}
      </div></div>
      <div class="acts">${F() ? '' : `${r.sprawdzone ? '<button class="btn2" id="odznacz">Odznacz</button>' : '<button class="btn" id="okDok">Sprawdzone, zgadza się</button>'}<button class="btn2" id="popraw">Popraw odczyt</button><button class="btn2" id="usunDok">Usuń dokument</button>`}
        <button class="btn2" id="wrocLista">Wróć do paragonów</button></div>`;
    $('#wroc').onclick = $('#wrocLista').onclick = () => ekranParagony(fid);
    const pk = $('#pokaz'); if (pk) pk.onclick = () => podglad({ nazwa:p.nazwa, sciezka:p.sciezka, typ:p.typ }, linki);
    if (!F()){
      const po = (fid2, m, ok) => ekranDok(fid2, id, m, ok);
      const ok = $('#okDok'); if (ok) ok.onclick = () => ustawSpr(fid, r, true, po);
      const od = $('#odznacz'); if (od) od.onclick = () => ustawSpr(fid, r, false, po);
      $('#popraw').onclick = () => ekranDaneDok(fid, id);
      $('#usunDok').onclick = () => ekranUsunDok(fid, r, p);
    }
  }

  function ekranUsunDok(fid, r, p, msg){
    app.innerHTML = `<div class="narrow" style="margin:auto"><h1>Usunąć dokument?</h1>
      <p class="intro">Dokument <b>${esc(r.sklep)} · ${kwotaPL(r.kwota)}</b> z dnia ${dt(r.data)} zniknie z Paragonów i z wydatków, a jego zdjęcie z Biblioteki › Paragony. Tego nie da się cofnąć. Po usunięciu otworzy się lista paragonów.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="acts"><button class="btn2" id="nie">Nie, wróć</button><button class="btn" id="tak">Tak, usuń na stałe</button></div></div>`;
    $('#nie').onclick = () => ekranDok(fid, r.id);
    $('#tak').onclick = async () => {
      $('#tak').disabled = true;
      const { error } = await sb.from('paragony').delete().eq('id', r.id);
      if (error) return ekranUsunDok(fid, r, p, bladPar(error));
      let dop = '';
      if (p){ const a = await sb.from('pliki').delete().eq('id', p.id); const b = a.error ? null : await sb.storage.from(SCHOWEK).remove([p.sciezka]);
        if (a.error || (b && b.error)) dop = ' Zdjęcia nie udało się usunąć z Biblioteki – można je usunąć w Bibliotece › Paragony.'; }
      ekranParagony(fid, `Dokument ${r.sklep} ${kwotaPL(r.kwota)} został usunięty.${dop}`, !dop);
    };
  }

  rejestrujModul({ k:'paragony', n:'Paragony i materiały', firma:true,
    etykieta:fid => 'Paragony i materiały' + (SUMY[fid] && SUMY[fid].doSpr ? ` – ${SUMY[fid].doSpr} do sprawdzenia` : ''),
    ekran:fid => ekranParagony(fid) });
})();
