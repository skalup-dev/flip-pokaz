/* ===== Klocek 15: Szukaj ekipy – zlecenie dla firm, terminy oglądania, „Nowe mieszkania” dla kont firm, pytania ===== */
(function(){
  const ZAK = ['Drzwi wewnętrzne','Drzwi zewnętrzne','Elektryka','Hydraulika','Kuchnia','Łazienka','Okna','Podłogi','Ściany i sufity','Tapeta'];
  const GEN = 'Generalny remont pod sprzedaż';
  const CENA_DOMYSLNA = 900;
  const DNI = ['nd','pon','wt','śr','czw','pt','sob'];
  const t16 = x => String(x || '').replace(' ', 'T').slice(0, 16);
  const fmtT = x => { if (!x) return '–'; const s = t16(x), d = new Date(s); return isNaN(d) ? s : `${DNI[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1} · ${s.slice(11, 16)}`; };
  const zakresTxt = z => { const lista = ZAK.filter(k => (z.zakres || []).includes(k)).map(k => k.toLowerCase()).join(', ');
    return z.generalny ? GEN + (lista ? ': ' + lista : '') : lista.charAt(0).toUpperCase() + lista.slice(1); };
  const opisZ = z => zakresTxt(z) + (z.dopisek ? '. ' + z.dopisek.trim().replace(/\.$/, '') : '') + (z.termin ? '. Termin: ' + z.termin.trim().replace(/\.$/, '') : '') + '.';
  const mapy = a => 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(a);
  const firmyTxt = n => `${n} ${pl(n, 'firma wzięła', 'firmy wzięły', 'firm wzięło')} zlecenie`;
  const razem = (c, m) => (c > 0 && m > 0) ? Math.round(c * m * 100) / 100 : null;
  const bladS = e => { const m = (e && e.message) || '';
    return /zlecenia|zgloszenia|pytania_zlecen|nowe_mieszkania|pliki_zlecenia|szukaj_firmy|odwolaj_spotkanie/i.test(m) && /find|exist|schema cache/i.test(m)
      ? 'Szukanie ekipy nie jest jeszcze włączone w bazie danych. Trzeba wgrać plik 15_szukaj.sql w Supabase.' : blad(e); };
  const linkiDo = async sc => { const l = {}; if (sc.length){ const { data } = await sb.storage.from(SCHOWEK).createSignedUrls(sc, 3600); (data || []).forEach(x => { if (x.signedUrl) l[x.path] = x.signedUrl; }); } return l; };
  const zPowiekszeniem = (sel, lista, linki, info) => app.querySelectorAll(sel).forEach(el => el.onclick = () => {
    const p = lista[+el.dataset.i]; podglad(p, linki); const i2 = $('#okno .info'); if (i2) i2.textContent = info;
  });

  /* wygląd klocka – te same kolory co cała aplikacja */
  const st = document.createElement('style');
  st.textContent = `
  .sz-kratki{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
  .sz-kr{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--z)}
  .sz-kr span{flex:1}
  .sz-kr.gen{border-bottom:2px solid var(--z);margin-bottom:4px;font-weight:700}
  .sz-chipy{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
  .sz-chip{border:1px solid var(--c);border-radius:999px;padding:6px 12px;font-weight:600;font-size:14px;background:transparent;color:var(--c)}
  button.sz-chip{cursor:pointer}
  .sz-pod{font-weight:700;font-size:14px;display:block;margin:12px 0 4px}
  .sz-ok{font-weight:700;margin:6px 0}
  .sz-ok::before{content:"✓ ";color:var(--z)}
  .sz-razem{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid var(--z)}
  .sz-adr{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--z)}
  .sz-adr:last-child{border-bottom:none}
  .sz-adr span{min-width:0;word-break:break-word}
  .sz-adr a{flex:none;text-decoration:none;padding:5px 12px;font-size:13px}
  .sz-wiad{border:1px solid var(--z);border-radius:10px;padding:8px 10px;margin:6px 0;max-width:85%;word-break:break-word;white-space:pre-wrap}
  .sz-wiad.ja{background:var(--c);color:var(--k);border-color:var(--c);margin-left:auto}
  .sz-wiad small{display:block;font-size:12px;margin-top:2px;white-space:normal}
  .sz-pisz{display:flex;gap:6px;margin-top:6px}
  .sz-pisz input{flex:1;min-width:0}
  .sz-pisz .btn{flex:none}
  .sz-cena{text-align:center;margin:10px 0}
  .sz-cena div{font-size:20px;font-weight:700;color:var(--z)}
  .sz-sekcja{border-top:1px solid var(--z);margin-top:12px;padding-top:10px}
  .sz-mini{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}
  .sz-mini img,.sz-mini .sz-pdf{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;border:1px solid var(--z);display:block;cursor:pointer}
  .sz-mini .sz-pdf{background:var(--c);color:var(--z);font-weight:700;display:flex;align-items:center;justify-content:center;padding:0}
  .sz-mini figure{margin:0}.sz-mini figcaption{font-size:12px;margin-top:2px}
  .sz-big{font-size:17px}
  @media (max-width:640px){.sz-kratki{grid-template-columns:1fr}.sz-mini{grid-template-columns:repeat(3,1fr)}}
  @media (max-width:420px){.sz-mini{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(st);

  /* ---------- skrót do listy mieszkań i przycisku ---------- */
  async function wczytajSkrot(){
    S.szukaj = {}; S.noweIle = null;
    if (jestFirma()){ const r = await sb.rpc('nowe_mieszkania'); if (!r.error) S.noweIle = (r.data || []).length; return; }
    const [a, b] = await Promise.all([sb.from('zlecenia').select('id,mieszkanie,wystawione'), sb.from('zgloszenia').select('zlecenie')]);
    (a.data || []).forEach(z => S.szukaj[z.mieszkanie] = { wystawione:z.wystawione, n:(b.data || []).filter(g => g.zlecenie === z.id).length });
  }
  HAKI.poWczytaniu.push(wczytajSkrot);

  // Folder „Nowe mieszkania” na liście „Moje zlecenia” (konto firmy) i napis „Szuka ekipy” na liście mieszkań
  function dopiszDoListy(){
    const h = app.querySelector('h1'); if (!h || !S.user) return;
    if (jestFirma() && h.textContent === 'Moje zlecenia' && !$('#szNowe')){
      const b = document.createElement('button'); b.className = 'card fold'; b.id = 'szNowe';
      b.innerHTML = `<span class="ik"></span><span class="tx"><b>Nowe mieszkania</b><small>${S.noweIle == null ? 'Zlecenia od Właścicieli aplikacji' : 'Zlecenia do wzięcia: ' + S.noweIle} · widać miejscowość, plan, opis i cenę</small></span><span class="str">›</span>`;
      b.onclick = () => ekranNowe();
      const l = $('#lista'); l ? l.parentNode.insertBefore(b, l) : app.appendChild(b);
    }
    if (!jestFirma() && h.textContent === 'Moje mieszkania' && S.szukaj) app.querySelectorAll('.flat[data-id]').forEach(c => {
      const z = S.szukaj[c.dataset.id]; if (!z || !z.wystawione || c.querySelector('.sz-szuka')) return;
      const d = document.createElement('div'); d.className = 'got sz-szuka'; d.innerHTML = `<b>Szuka ekipy</b> · ${firmyTxt(z.n)}`; c.appendChild(d);
    });
  }
  new MutationObserver(dopiszDoListy).observe(app, { childList:true });

  /* ---------- Właściciel aplikacji: Szukaj ekipy ---------- */
  async function ekranSzukaj(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję zlecenie…</p>';
    const [rz, rd] = await Promise.all([sb.from('zlecenia').select('*').eq('mieszkanie', fid), sb.from('dostepy').select('firma,aktywny').eq('mieszkanie', fid)]);
    const z = (rz.data || [])[0] || null;
    const maFirme = (rd.data || []).some(d => d.firma && d.aktywny);
    let zg = [], py = [], nazwy = {}, linki = {}, bl = rz.error;
    if (z){
      const [a, b, c] = await Promise.all([sb.from('zgloszenia').select('*').eq('zlecenie', z.id), sb.from('pytania_zlecen').select('*').eq('zlecenie', z.id), sb.rpc('szukaj_firmy', { z:z.id })]);
      zg = a.data || []; py = (b.data || []).sort((x, y) => String(x.utworzono).localeCompare(String(y.utworzono))); (c.data || []).forEach(x => nazwy[x.firma] = x.nazwa);
      bl = bl || a.error || b.error;
      linki = await linkiDo(zg.flatMap(g => g.zdjecia || []));
    }
    const nazwa = id => nazwy[id] || 'Firma remontowa';
    const cena = z ? Number(z.cena_m2) : (f.cena_firmy_m2 != null && Number(f.cena_firmy_m2) > 0 ? Number(f.cena_firmy_m2) : CENA_DOMYSLNA);
    const zak = z ? (z.zakres || []) : [], gen = z ? !!z.generalny : false;
    const ter = z && z.terminy ? z.terminy.map(t16) : null;
    const edT = !ter || !z.wystawione;
    const kratka = (k, cls = '') => `<div class="sz-kr ${cls}"><button class="box ${(k === GEN ? gen : zak.includes(k)) ? 'on' : ''}" data-z="${esc(k)}" aria-label="${esc(k)}">${(k === GEN ? gen : zak.includes(k)) ? '✓' : ''}</button><span>${esc(k)}</span></div>`;
    const wziete = zg.map(g => ({ ...g, n:nazwa(g.firma) })).sort((a, b) => a.n.localeCompare(b.n, 'pl'));
    const tylkoPyt = [...new Set(py.filter(p => p.od === p.firma).map(p => p.firma))].filter(id => !zg.some(g => g.firma === id)).map(id => ({ firma:id, n:nazwa(id) })).sort((a, b) => a.n.localeCompare(b.n, 'pl'));
    const rozmowa = id => { const w = py.filter(p => p.firma === id);
      return (w.length ? w.map(p => `<div class="sz-wiad ${p.od === S.user.id ? 'ja' : ''}">${esc(p.tresc)}<small>${p.od === S.user.id ? esc(kto()) : esc(nazwa(id))} · ${dataPL(p.utworzono)}</small></div>`).join('') : '<p class="info2">Brak pytań.</p>')
        + `<div class="sz-pisz"><input id="odp-${id}" placeholder="Odpowiedź dla: ${esc(nazwa(id))}" aria-label="Odpowiedź dla: ${esc(nazwa(id))}" maxlength="2000"><button class="btn" data-odp="${id}">Wyślij</button></div>`; };
    const zdjLista = [];
    const kartaFirmy = g => {
      const zd = (g.zdjecia || []).map(sc => { zdjLista.push({ nazwa:`Realizacja firmy ${g.n}`, sciezka:sc, typ:'zdjecie' }); return zdjLista.length - 1; });
      return `<div class="card" data-firma="${g.firma}"><div class="zw"><b class="sz-big">${esc(g.n)}</b><span>${zd.length} ${pl(zd.length, 'zdjęcie', 'zdjęcia', 'zdjęć')} realizacji</span></div>
        ${zd.length ? `<div class="sz-mini">${zd.map(i => `<img src="${esc(linki[zdjLista[i].sciezka] || '')}" alt="Realizacja firmy ${esc(g.n)}" data-i="${i}" class="sz-zoom">`).join('')}</div>` : ''}
        <span class="sz-pod">Realizacje do obejrzenia na żywo</span>
        ${(g.adresy || []).length ? g.adresy.map(a => `<div class="sz-adr"><span>${esc(a)}</span><a class="btn2" href="${esc(mapy(a))}" target="_blank" rel="noopener">Prowadź</a></div>`).join('') : '<p class="info2">Firma nie podała adresów.</p>'}
        <span class="sz-pod">Termin oglądania mieszkania</span>
        ${g.zaden ? `<p class="late" style="margin:4px 0">Firmie nie pasuje żaden z terminów. ${esc(kto())} wpisuje nowe przyciskiem „Zmień terminy” wyżej – wtedy każda firma wybiera jeszcze raz.</p>`
          : g.wybor ? `<div class="sz-ok">Firma wybrała termin: ${esc(fmtT(ter && ter[g.wybor - 1]))} · adres wysłany firmie</div><button class="btn2" data-odwolaj="${g.id}">Odznacz – odwołaj spotkanie</button>`
          : '<p style="margin:4px 0">Firma jeszcze nie wybrała terminu.</p>'}
        <div class="sz-sekcja"><span class="sz-pod" style="margin-top:0">Pytania od firmy (widzi je tylko ta firma)</span>${rozmowa(g.firma)}</div></div>`; };

    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Szukaj ekipy – ${esc(f.ulica)}</h1>
      <p class="intro">Tu ${esc(kto())} wystawia zlecenie na remont dla firm remontowych. Firmy widzą tylko miejscowość, plan, zdjęcia, opis i cenę – bez ulicy i numeru. Potrzebne są 3 terminy oglądania mieszkania, każdy w inny dzień. Firma, która weźmie zlecenie, wybiera jeden z nich i dopiero wtedy dostaje dokładny adres. Niżej pojawią się firmy, które wzięły zlecenie: ich zdjęcia realizacji, adresy, wybrany termin i pytania.</p>
      ${bl ? komunikat(bladS(bl)) : ''}${msg ? komunikat(msg, info) : ''}
      ${maFirme && !z ? `<div class="card"><b>To mieszkanie ma już firmę remontową</b><p class="info2">Szef firmy ma dostęp do tego mieszkania (zakładka „Firma”). Szukanie ekipy jest dla mieszkań bez firmy. Gdy ${esc(kto())} zabierze firmie dostęp w zakładce „Firma”, tutaj będzie można wystawić zlecenie.</p></div>` : `
      <div class="card" id="szZlecenie"><div class="zw"><b class="sz-big">Zlecenie</b></div>
        ${z && z.wystawione ? `<div class="sz-ok" id="szStan">Zlecenie wystawione w folderze „Nowe mieszkania” u wszystkich firm${z.wystawiono ? ' · od ' + dataPL(z.wystawiono) : ''}</div>` : `<p class="info2" id="szStan">Zlecenie nie jest wystawione – firmy go jeszcze nie widzą. Po kliknięciu „Wystaw zlecenie” pojawi się u wszystkich firm w folderze „Nowe mieszkania”.</p>`}
        <span class="sz-pod">Zakres prac (co najmniej jedna kratka)</span>
        ${kratka(GEN, 'gen')}
        <div class="sz-kratki">${ZAK.map(k => kratka(k)).join('')}</div>
        <label for="szDop">Dopisz od siebie</label><input id="szDop" maxlength="500" placeholder="np. okna nowe, zostają" value="${esc(z ? z.dopisek : '')}">
        <label for="szTer">Termin wykonania remontu</label><input id="szTer" maxlength="100" placeholder="np. 2,5 miesiąca" value="${esc(z ? z.termin : '')}">
        <label for="szCena">Cena stała za m² <small>(zł brutto, domyślnie ${CENA_DOMYSLNA})</small></label><input id="szCena" inputmode="decimal" value="${esc(String(cena).replace('.', ','))}">
        <div class="sz-razem"><span>Cena stała: <b id="szCenaM2">${zl(cena)} brutto/m²</b> × ${m2(f.metraz)}</span><b id="szRazem">${f.metraz ? zl(razem(cena, Number(f.metraz))) : 'brak metrażu'}</b></div>
        ${f.metraz ? '' : `<p class="info2">Mieszkanie nie ma wpisanego metrażu, więc firmy zobaczą tylko cenę za m². Metraż wpisuje się w „Zmień dane” mieszkania.</p>`}
        <span class="sz-pod">Terminy oglądania mieszkania</span>
        <p class="info2" style="margin-top:0">3 terminy, każdy w inny dzień. Firma wybiera jeden z nich.</p>
        <div id="szTerminyWidok" class="${edT ? 'hide' : ''}"><div class="sz-chipy">${(ter || []).map(t => `<span class="sz-chip">${esc(fmtT(t))}</span>`).join('')}</div>
          <button class="btn2" id="szZmienT">Zmień terminy</button></div>
        <div id="szTerminyEdycja" class="${edT ? '' : 'hide'}">${[0, 1, 2].map(k => `<label for="szT${k}">Termin ${k + 1}</label><input id="szT${k}" type="datetime-local" value="${esc(ter ? ter[k] : '')}">`).join('')}
          ${edT ? '' : `<p class="info2">Po kliknięciu „Zapisz terminy” każda firma wybiera termin jeszcze raz.</p><div class="acts"><button class="btn2" id="szAnulujT">Anuluj</button><button class="btn" id="szZapiszT">Zapisz terminy</button></div>`}</div>
        <div class="acts">${z && z.wystawione ? '<button class="btn" id="szZapisz">Zapisz zmiany</button><button class="btn2" id="szWycofaj">Odznacz – wycofaj zlecenie</button>' : '<button class="btn" id="szWystaw">Wystaw zlecenie</button>'}</div>
      </div>`}
      ${z ? `<h2>Firmy, które wzięły zlecenie (${wziete.length})</h2>
        ${wziete.length ? wziete.map(kartaFirmy).join('') : `<div class="card empty"><b>Jeszcze żadna firma nie wzięła zlecenia.</b><br>Gdy firma je weźmie, pojawią się tu jej zdjęcia realizacji, adresy do obejrzenia na żywo i wybrany termin oglądania.</div>`}
        ${tylkoPyt.length ? `<h2>Pytania od firm, które jeszcze nie wzięły zlecenia (${tylkoPyt.length})</h2>` + tylkoPyt.map(g => `<div class="card" data-firma="${g.firma}"><b class="sz-big">${esc(g.n)}</b><p class="info2">Firma zadała pytanie, ale jeszcze nie wzięła zlecenia. Rozmowę widzi tylko ta firma.</p>${rozmowa(g.firma)}</div>`).join('') : ''}` : ''}`;

    $('#wroc').onclick = () => ekranMieszkania(fid);
    zPowiekszeniem('.sz-zoom', zdjLista, linki, 'Zdjęcie realizacji firmy. „Zamknij” wraca do zlecenia.');
    app.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.textContent = on ? '✓' : ''; });
    const pc = $('#szCena'); if (pc) pc.oninput = () => { const c = liczba(pc.value); const ok = c > 0;
      $('#szCenaM2').textContent = ok ? zl(c) + ' brutto/m²' : '–'; $('#szRazem').textContent = f.metraz ? (ok ? zl(razem(c, Number(f.metraz))) : '–') : 'brak metrażu'; };
    const zbierz = () => ({ generalny:!!app.querySelector(`[data-z="${GEN}"].on`), zakres:ZAK.filter(k => app.querySelector(`[data-z="${k}"].on`)),
      dopisek:$('#szDop').value.trim() || null, termin:$('#szTer').value.trim() || null, cena_m2:liczba($('#szCena').value) });
    const sprawdz = (v, zTerm) => {
      if (!v.generalny && !v.zakres.length) return 'Trzeba zaznaczyć co najmniej jedną kratkę zakresu prac – inaczej firmy nie wiedzą, co jest do zrobienia.';
      if (v.cena_m2 == null || isNaN(v.cena_m2) || v.cena_m2 <= 0) return 'Cena za m² musi być liczbą większą od zera, np. 900.';
      if (zTerm) return sprawdzT(zTerm);
      return null; };
    const terminyZPol = () => [0, 1, 2].map(k => $('#szT' + k).value);
    const sprawdzT = t => {
      if (t.some(x => !x)) return 'Trzeba wpisać wszystkie 3 terminy oglądania (dzień i godzinę).';
      if (new Set(t.map(x => x.slice(0, 10))).size < 3) return 'Każdy termin oglądania musi być w inny dzień.';
      const teraz = new Date(); if (t.some(x => new Date(x) < teraz)) return 'Termin oglądania nie może być w przeszłości.';
      return null; };
    const pokazBlad = (m, pola) => { const st = $('#szStan'); const d = document.createElement('div'); d.innerHTML = komunikat(m);
      app.querySelectorAll('#app .msg').forEach(x => x.remove()); st.after(d.firstChild); (pola || st).scrollIntoView({ block:'center' }); };
    const zapiszCene = c => sb.from('mieszkania').update({ cena_firmy_m2:c }).eq('id', fid).then(r => { if (!r.error) f.cena_firmy_m2 = c; }, () => {});
    const odswiez = async (m, ok = true) => { await wczytajSkrot(); ekranSzukaj(fid, m, ok); };

    const bw = $('#szWystaw'); if (bw) bw.onclick = async () => {
      const v = zbierz(), t = terminyZPol(), e = sprawdz(v, t); if (e) return pokazBlad(e);
      bw.disabled = true; bw.textContent = 'Wystawiam…';
      const dane = { ...v, terminy:[...t].sort(), wystawione:true, wystawiono:new Date().toISOString() };
      const r = z ? await sb.from('zlecenia').update(dane).eq('id', z.id) : await sb.from('zlecenia').insert({ mieszkanie:fid, wlasciciel:S.user.id, ...dane });
      if (r.error){ bw.disabled = false; bw.textContent = 'Wystaw zlecenie'; return pokazBlad(bladS(r.error)); }
      await zapiszCene(v.cena_m2);
      odswiez('Zlecenie wystawione. Firmy widzą je w folderze „Nowe mieszkania” – bez ulicy i numeru. Gdy któraś je weźmie, pojawi się niżej w „Firmy, które wzięły zlecenie”.');
    };
    const bz = $('#szZapisz'); if (bz) bz.onclick = async () => {
      const v = zbierz(), e = sprawdz(v); if (e) return pokazBlad(e);
      bz.disabled = true; const r = await sb.from('zlecenia').update(v).eq('id', z.id);
      if (r.error){ bz.disabled = false; return pokazBlad(bladS(r.error)); }
      await zapiszCene(v.cena_m2); odswiez('Zmiany zapisane. Firmy widzą już nowy opis i cenę zlecenia.');
    };
    const bwy = $('#szWycofaj'); if (bwy) bwy.onclick = async () => {
      bwy.disabled = true; const r = await sb.from('zlecenia').update({ wystawione:false }).eq('id', z.id);
      odswiez(r.error ? bladS(r.error) : 'Odznaczono – zlecenie wycofane. Firmy już go nie widzą w „Nowe mieszkania”. Po kliknięciu „Wystaw zlecenie” wróci do nich.', !r.error);
    };
    const bzt = $('#szZmienT'); if (bzt) bzt.onclick = () => { $('#szTerminyWidok').classList.add('hide'); $('#szTerminyEdycja').classList.remove('hide'); $('#szT0').focus(); };
    const bat = $('#szAnulujT'); if (bat) bat.onclick = () => { [0, 1, 2].forEach(k => $('#szT' + k).value = ter[k]); app.querySelectorAll('#szZlecenie .msg').forEach(x => x.remove()); $('#szTerminyEdycja').classList.add('hide'); $('#szTerminyWidok').classList.remove('hide'); };
    const bst = $('#szZapiszT'); if (bst) bst.onclick = async () => {
      const t = terminyZPol(), e = sprawdzT(t); if (e) return pokazBlad(e, $('#szTerminyEdycja'));
      bst.disabled = true; const r = await sb.from('zlecenia').update({ terminy:[...t].sort() }).eq('id', z.id);
      if (r.error){ bst.disabled = false; return pokazBlad(bladS(r.error), $('#szTerminyEdycja')); }
      odswiez('Nowe terminy zapisane i wysłane do firm. Każda firma wybiera termin jeszcze raz.');
    };
    app.querySelectorAll('[data-odwolaj]').forEach(b => b.onclick = async () => {
      b.disabled = true; const g = zg.find(x => x.id === b.dataset.odwolaj);
      const r = await sb.rpc('odwolaj_spotkanie', { g:g.id });
      odswiez(r.error ? bladS(r.error) : `Odznaczono – spotkanie z firmą ${nazwa(g.firma)} odwołane. Firma wybierze termin jeszcze raz.`, !r.error);
    });
    app.querySelectorAll('[data-odp]').forEach(b => b.onclick = async () => {
      const id = b.dataset.odp, inp = $('#odp-' + id), t = inp.value.trim();
      if (!t){ inp.focus(); inp.placeholder = 'Najpierw trzeba wpisać odpowiedź'; return; }
      b.disabled = true; const r = await sb.from('pytania_zlecen').insert({ zlecenie:z.id, firma:id, tresc:t });
      ekranSzukaj(fid, r.error ? bladS(r.error) : `Odpowiedź wysłana do firmy ${nazwa(id)}. Widzi ją tylko ta firma.`, !r.error);
    });
  }

  /* ---------- Konto firmy: Nowe mieszkania ---------- */
  async function ekranNowe(msg, info = true){
    if (!jestFirma()) return ekranListy();
    app.innerHTML = '<p>Wczytuję nowe mieszkania…</p>';
    const [rn, rp] = await Promise.all([sb.rpc('nowe_mieszkania'), sb.from('pytania_zlecen').select('*')]);
    const lista = rn.data || [], py = (rp.data || []).sort((x, y) => String(x.utworzono).localeCompare(String(y.utworzono)));
    S.noweIle = rn.error ? S.noweIle : lista.length;
    const pliki = {}; await Promise.all(lista.map(async z => { const r = await sb.rpc('pliki_zlecenia', { z:z.id }); pliki[z.id] = r.data || []; }));
    const linki = await linkiDo(Object.values(pliki).flat().map(p => p.sciezka));
    const PODPIS = { plany:'Plan', zdjecia_przed:'Jak jest teraz', zdjecia_wiz:'Jak ma wyglądać' };
    const galLista = [];
    const karta = z => {
      const ter = (z.terminy || []).map(t16), c = Number(z.cena_m2), pl2 = pliki[z.id] || [];
      const gal = pl2.map(p => { galLista.push({ nazwa:`${PODPIS[p.folder] || 'Plik'} · ${z.miasto || 'Nowe mieszkanie'}`, sciezka:p.sciezka, typ:p.typ }); return { i:galLista.length - 1, p }; });
      const rozm = py.filter(p => p.zlecenie === z.id);
      const stan = !z.zgloszenie ? `<button class="btn full" data-biore="${z.id}">Biorę zlecenie</button>`
        : (z.zaden ? `<div class="sz-ok">Zlecenie wzięte · żaden termin nie pasuje</div><p class="info2">Właściciel aplikacji dostał informację i wpisze nowe terminy. Gdy je wpisze, tutaj pojawi się wybór terminu.</p><button class="btn2" data-zmien="${z.zgloszenie}" style="margin-top:8px">Odznacz – zmień termin</button>`
          : z.wybor ? `<div class="sz-ok">Termin oglądania: ${esc(fmtT(ter[z.wybor - 1]))}</div><div class="sz-adr"><span><b>Adres: ${esc(z.ulica || '')}${z.miasto ? ', ' + esc(z.miasto) : ''}</b></span><a class="btn2" href="${esc(mapy((z.ulica || '') + (z.miasto ? ', ' + z.miasto : '')))}" target="_blank" rel="noopener">Prowadź</a></div><button class="btn2" data-zmien="${z.zgloszenie}" style="margin-top:8px">Odznacz – zmień termin</button>`
          : `<div class="sz-ok">Zlecenie wzięte</div><span class="sz-pod">Termin oglądania do wyboru</span><div class="sz-chipy">${ter.map((t, k) => `<button class="sz-chip" data-wybor="${k + 1}" data-zg="${z.zgloszenie}">${esc(fmtT(t))}</button>`).join('')}</div><button class="btn2" data-zaden="${z.zgloszenie}">Żaden mi nie pasuje</button>`)
          + `<div><button class="btn2" data-rezygnuj="${z.zgloszenie}" style="margin-top:8px">Odznacz – rezygnuję</button></div>`;
      return `<div class="card" data-zl="${z.id}"><div class="zw"><b class="sz-big">${esc(z.miasto || 'Miejscowość nie podana')}</b><span>${m2(z.metraz)}</span></div>
        ${gal.length ? `<div class="sz-mini">${gal.map(({ i, p }) => `<figure>${p.typ === 'pdf' ? `<button class="sz-pdf sz-zoom" data-i="${i}" aria-label="${esc(PODPIS[p.folder])} – PDF">PDF</button>` : `<img class="sz-zoom" data-i="${i}" src="${esc(linki[p.sciezka] || '')}" alt="${esc(PODPIS[p.folder])}">`}<figcaption>${esc(PODPIS[p.folder] || '')}</figcaption></figure>`).join('')}</div>` : '<p class="info2">Plan i zdjęcia: Właściciel aplikacji jeszcze ich nie dodał.</p>'}
        <p style="margin:8px 0">${esc(opisZ(z))}</p>
        <div class="card dark sz-cena"><small>Cena stała</small><div>${zl(c)} brutto/m²${z.metraz ? ' · ' + zl(razem(c, Number(z.metraz))) : ''}</div></div>
        ${stan}
        <div class="sz-sekcja"><span class="sz-pod" style="margin-top:0">Zadaj pytanie</span><p class="info2" style="margin-top:0">Pytanie widzi tylko ${esc(kto())} i Właściciel aplikacji. Inne firmy go nie widzą.</p>
          ${rozm.map(p => `<div class="sz-wiad ${p.od === S.user.id ? 'ja' : ''}">${esc(p.tresc)}<small>${p.od === S.user.id ? esc(kto()) : 'Właściciel aplikacji'} · ${dataPL(p.utworzono)}</small></div>`).join('')}
          <div class="sz-pisz"><input id="pyt-${z.id}" maxlength="2000" placeholder="np. Czy okna zostają?" aria-label="Pytanie do Właściciela aplikacji"><button class="btn" data-pytaj="${z.id}">Wyślij</button></div></div></div>`; };
    app.innerHTML = `<button class="btnT" id="wroc">← Moje zlecenia</button>
      <h1>Nowe mieszkania</h1>
      <p class="intro">Tu są mieszkania, które Właściciele aplikacji chcą wyremontować. Widać tylko miejscowość, plan, zdjęcia, opis i cenę – bez ulicy i numeru. Po kliknięciu „Biorę zlecenie” ${esc(kto())} dodaje zdjęcia i adresy swoich realizacji, a potem wybiera jeden z 3 terminów oglądania. Dokładny adres pojawia się zaraz po wybraniu terminu.</p>
      ${rn.error ? komunikat(bladS(rn.error)) : ''}${msg ? komunikat(msg, info) : ''}
      ${lista.length ? lista.map(karta).join('') : `<div class="card empty"><b>Teraz nie ma nowych mieszkań.</b><br>Gdy Właściciel aplikacji wystawi zlecenie, pojawi się tutaj.</div>`}`;
    $('#wroc').onclick = () => ekranListy();
    zPowiekszeniem('.sz-zoom', galLista, linki, 'Plan i zdjęcia mieszkania ze zlecenia. „Zamknij” wraca do „Nowe mieszkania”.');
    const zz = id => lista.find(x => x.zgloszenie === id);
    app.querySelectorAll('[data-biore]').forEach(b => b.onclick = () => { S.szReal = null; ekranBiore(b.dataset.biore); });
    app.querySelectorAll('[data-wybor]').forEach(b => b.onclick = async () => {
      app.querySelectorAll('[data-wybor]').forEach(x => x.disabled = true); const z = zz(b.dataset.zg), k = +b.dataset.wybor;
      const r = await sb.from('zgloszenia').update({ wybor:k, zaden:false }).eq('id', z.zgloszenie);
      ekranNowe(r.error ? bladS(r.error) : `Termin oglądania wybrany: ${fmtT(z.terminy[k - 1])}. Dokładny adres jest niżej przy mieszkaniu. Właściciel aplikacji widzi wybrany termin.`, !r.error);
    });
    app.querySelectorAll('[data-zaden]').forEach(b => b.onclick = async () => {
      b.disabled = true; const r = await sb.from('zgloszenia').update({ wybor:null, zaden:true }).eq('id', b.dataset.zaden);
      ekranNowe(r.error ? bladS(r.error) : 'Zapisane: żaden termin nie pasuje. Właściciel aplikacji widzi to przy zleceniu i wpisze nowe terminy.', !r.error);
    });
    app.querySelectorAll('[data-zmien]').forEach(b => b.onclick = async () => {
      b.disabled = true; const r = await sb.from('zgloszenia').update({ wybor:null, zaden:false }).eq('id', b.dataset.zmien);
      ekranNowe(r.error ? bladS(r.error) : 'Odznaczono – termin oglądania zwolniony. Trzeba wybrać termin jeszcze raz.', !r.error);
    });
    app.querySelectorAll('[data-rezygnuj]').forEach(b => b.onclick = async () => {
      b.disabled = true; const z = zz(b.dataset.rezygnuj);
      const r = await sb.from('zgloszenia').delete().eq('id', z.zgloszenie);
      if (!r.error && (z.zdjecia || []).length) await sb.storage.from(SCHOWEK).remove(z.zdjecia);
      if (!r.error) S.noweIle = lista.length;
      ekranNowe(r.error ? bladS(r.error) : 'Odznaczono – rezygnacja ze zlecenia zapisana. Mieszkanie zostaje na liście; „Biorę zlecenie” pozwala wziąć je ponownie.', !r.error);
    });
    app.querySelectorAll('[data-pytaj]').forEach(b => b.onclick = async () => {
      const id = b.dataset.pytaj, inp = $('#pyt-' + id), t = inp.value.trim();
      if (!t){ inp.focus(); inp.placeholder = 'Najpierw trzeba wpisać pytanie'; return; }
      b.disabled = true; const r = await sb.from('pytania_zlecen').insert({ zlecenie:id, firma:S.user.id, tresc:t });
      ekranNowe(r.error ? bladS(r.error) : `Pytanie wysłane. Widzi je tylko ${kto()} i Właściciel aplikacji.`, !r.error);
    });
  }

  /* ---------- Konto firmy: Biorę zlecenie (zdjęcia i adresy realizacji) ---------- */
  async function ekranBiore(zid, msg){
    if (!S.szReal || S.szReal.zl !== zid) S.szReal = { zl:zid, lista:[], adr:'' };
    const R = S.szReal;
    app.innerHTML = '<p>Wczytuję…</p>';
    const rn = await sb.rpc('nowe_mieszkania'); const z = (rn.data || []).find(x => x.id === zid);
    if (!z) return ekranNowe(rn.error ? bladS(rn.error) : 'To zlecenie nie jest już wystawione.', false);
    if (z.zgloszenie) return ekranNowe();
    app.innerHTML = `<button class="btnT" id="wroc">← Nowe mieszkania</button>
      <h1>Biorę zlecenie – ${esc(z.miasto || 'nowe mieszkanie')}</h1>
      <p class="intro">Cena stała ${zl(Number(z.cena_m2))} brutto/m²${z.metraz ? ' · razem ' + zl(razem(Number(z.cena_m2), Number(z.metraz))) : ''}. Tu ${esc(kto())} dodaje zdjęcia swoich realizacji i adresy, pod którymi Właściciel aplikacji może obejrzeć je na żywo. Po kliknięciu „Wyślij” będzie wybór jednego z 3 terminów oglądania mieszkania, a po wyborze – dokładny adres.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="card">
        <span class="sz-pod" style="margin-top:0">Zdjęcia realizacji</span>
        <div class="fotki" id="szFotki">${R.lista.map((x, i) => `<figure><div class="ramka"><img src="${x.url}" alt="${esc(x.nazwa)}"><button class="btn2" data-usun="${i}">Usuń</button></div></figure>`).join('')}</div>
        <label class="btn2 wgraj" for="szReal" id="lReal">📷 Dodaj zdjęcia realizacji${R.lista.length ? ` (dodane: ${R.lista.length})` : ''}</label>
        <input type="file" id="szReal" class="hide" accept="image/*" multiple>
        <label for="szAdr">Adresy realizacji <small>(każdy w nowej linii)</small></label>
        <textarea id="szAdr" rows="3" placeholder="np. ul. Słoneczna 3, Testowo">${esc(R.adr)}</textarea>
        <div class="acts"><button class="btn2" id="szAnuluj">Anuluj</button><button class="btn" id="szWyslij">Wyślij</button></div>
      </div>`;
    $('#szAdr').oninput = e => R.adr = e.target.value;
    $('#wroc').onclick = $('#szAnuluj').onclick = () => { S.szReal = null; ekranNowe(); };
    app.querySelectorAll('[data-usun]').forEach(b => b.onclick = () => { const [x] = R.lista.splice(+b.dataset.usun, 1); URL.revokeObjectURL(x.url); ekranBiore(zid); });
    $('#szReal').onchange = async e => {
      $('#lReal').textContent = 'Przygotowuję zdjęcia…'; $('#lReal').classList.add('load'); $('#szWyslij').disabled = true;
      const { ok, bledy } = await przygotujZdjecia([...e.target.files]); R.lista.push(...ok);
      ekranBiore(zid, bledy.length ? 'Nie dodano: ' + bledy.join(' ') : undefined);
    };
    $('#szWyslij').onclick = async () => {
      const adresy = R.adr.split('\n').map(x => x.trim()).filter(Boolean);
      if (!adresy.length && !R.lista.length) return ekranBiore(zid, 'Trzeba dodać co najmniej jedno zdjęcie realizacji albo jeden adres – Właściciel aplikacji chce zobaczyć wcześniejsze prace firmy.');
      if (adresy.length > 20 || R.lista.length > 20) return ekranBiore(zid, 'Można dodać najwyżej 20 zdjęć i 20 adresów.');
      const b = $('#szWyslij'); b.disabled = true; b.textContent = 'Wysyłam…';
      const sc = [];
      for (const x of R.lista){
        const p = `${S.user.id}/realizacje/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from(SCHOWEK).upload(p, x.blob, { contentType:'image/jpeg', upsert:false });
        if (up.error){ if (sc.length) await sb.storage.from(SCHOWEK).remove(sc); return ekranBiore(zid, 'Nie udało się wgrać zdjęcia: ' + bladPliku(up.error)); }
        sc.push(p);
      }
      const r = await sb.from('zgloszenia').insert({ zlecenie:zid, firma:S.user.id, adresy, zdjecia:sc });
      if (r.error){ if (sc.length) await sb.storage.from(SCHOWEK).remove(sc); return ekranBiore(zid, bladS(r.error)); }
      R.lista.forEach(x => URL.revokeObjectURL(x.url)); S.szReal = null;
      ekranNowe('Zlecenie wzięte. Teraz trzeba wybrać jeden z 3 terminów oglądania mieszkania – zaraz po wyborze pojawi się dokładny adres.');
    };
  }

  rejestrujModul({ k:'szukaj', n:'Szukaj ekipy', firma:false, ekran:fid => ekranSzukaj(fid),
    etykieta:fid => { const z = S.szukaj && S.szukaj[fid]; return z && z.wystawione ? `Szukaj ekipy – wystawione · ${firmyTxt(z.n)}` : 'Szukaj ekipy'; } });
  window.ekranNoweMieszkania = ekranNowe;
})();
