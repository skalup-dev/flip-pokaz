/* ===== Klocek 14: Ilości z planu – wpisywane ręcznie, „Zgadza się” / „Popraw”, pytania do architekta, wysokość ===== */
(function(){
  const st = document.createElement('style');
  st.textContent = `.poz{padding:8px 0;border-bottom:1px solid var(--z)}.poz:last-of-type{border-bottom:none}
    .poz .zw{align-items:flex-start}.poz .war{text-align:right;white-space:nowrap}
    .poz .pod{font-size:13px;margin-top:4px}
    .poz .male{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.poz .male .btn2{padding:4px 10px;font-size:13px}
    .niep{display:inline-block;border:1px solid var(--c);border-radius:999px;padding:1px 8px;font-size:12px;font-weight:700;margin-left:6px;white-space:nowrap}
    .stara{text-decoration:line-through;font-weight:400}
    .pyt{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--z)}
    .pyt .btn2{padding:4px 10px;font-size:13px;white-space:nowrap;flex:none}
    .dopisz{display:flex;gap:8px;margin-top:10px}.dopisz .btn{flex:none}
    .tabW{width:100%;border-collapse:collapse;font-size:14px;margin-top:10px}
    .tabW th,.tabW td{padding:6px 4px;border-bottom:1px solid var(--z);text-align:right}
    .tabW th:first-child,.tabW td:first-child{text-align:left}
    .wiersz2{display:grid;grid-template-columns:1fr 140px;gap:8px}
    .chk{display:flex;align-items:center;gap:10px;margin-top:12px}.chk input{width:20px;height:20px;flex:none;accent-color:#1E1A17;padding:0}.chk label{margin:0;font-weight:400}
    @media (max-width:480px){.pyt{flex-wrap:wrap}.pyt .btn2{margin-left:auto}.tabW{font-size:13px}}`;
  document.head.appendChild(st);

  const GRUPY = ['Elektryka','Hydraulika','Płyty G-K','Podłogi'].sort((a, b) => a.localeCompare(b, 'pl'));
  const JEDN = ['cm','kpl.','m²','mb','szt.'].sort((a, b) => a.localeCompare(b, 'pl'));
  const lb = n => new Intl.NumberFormat('pl-PL', { maximumFractionDigits:2 }).format(n).replace(/ /g, ' ');
  const war = (n, j) => n == null ? 'do sprawdzenia' : lb(n) + (j ? ' ' + j : '');
  const wlasc = fid => !jestFirma() && wlascicielId(fid) === S.user.id;
  const bladI = e => /ilosci|pytania_architekt|ilosci_wysokosc/i.test((e && e.message) || '') && /find|exist|column|relation/i.test((e && e.message) || '')
    ? 'Ilości nie są jeszcze włączone w bazie danych. Trzeba wgrać plik 14_ilosci.sql w Supabase.' : blad(e);
  const sciany = (metraz, hcm) => { const obw = 4 * Math.sqrt(metraz); return { obw, m2:obw * hcm / 100 }; };

  async function wczytaj(fid){
    const [a, b, c, d] = await Promise.all([
      sb.from('ilosci').select('*').eq('mieszkanie', fid),
      sb.from('pytania_architekt').select('*').eq('mieszkanie', fid),
      sb.from('ilosci_wysokosc').select('*').eq('mieszkanie', fid),
      sb.from('pomieszczenia').select('id,nazwa,metraz').eq('mieszkanie', fid) ]);
    return { blad:a.error || b.error || c.error, poz:(a.data || []).sort(poNazwie), pyt:(b.data || []).sort((x, y) => (x.wyjasnione ? 1 : 0) - (y.wyjasnione ? 1 : 0) || x.tresc.localeCompare(y.tresc, 'pl')),
      wys:(c.data || [])[0] || null, pom:(d.data || []).sort(poNazwie) };
  }

  async function ekranIlosci(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję ilości…</p>';
    const W = wlasc(fid), D = await wczytaj(fid);
    const kto2 = await nazwyKto([...D.poz.map(x => x.sprawdzil), ...D.pyt.flatMap(q => [q.dodal, q.wyjasnil])]);
    const pozycja = x => {
      const sprawdzona = x.stan !== 'nowa';
      const wart = x.stan === 'poprawiona' ? `<span class="stara">${esc(war(x.ilosc, x.jednostka))}</span> <b>${esc(war(x.ilosc_architekt, x.jednostka))}</b>` : `<b>${esc(war(x.ilosc, x.jednostka))}</b>`;
      let pod = '';
      if (x.stan === 'poprawiona') pod = `<div class="pod">Poprawione według architekta${x.powod ? ': ' + esc(x.powod) : ''}. <span class="kto" style="display:inline">${esc(kto2[x.sprawdzil] || 'Właściciel aplikacji')} · ${dataPL(x.sprawdzono)}</span></div>`;
      else if (x.stan === 'zgadza') pod = `<div class="pod">✓ Zgadza się z architektem. <span class="kto" style="display:inline">${esc(kto2[x.sprawdzil] || 'Właściciel aplikacji')} · ${dataPL(x.sprawdzono)}</span></div>`;
      let btn = '';
      if (W) btn = sprawdzona ? `<button class="btn2" data-odz="${x.id}">Odznacz</button>`
        : `${x.ilosc != null ? `<button class="btn2" data-ok="${x.id}">Zgadza się</button>` : ''}<button class="btn2" data-pop="${x.id}">Popraw</button><button class="btn2" data-usun="${x.id}">Usuń</button>`;
      return `<div class="poz" data-poz="${x.id}"><div class="zw"><span>${esc(x.nazwa)}${x.do_sprawdzenia && !sprawdzona && x.ilosc != null ? '<span class="niep">do sprawdzenia</span>' : ''}</span><span class="war">${wart}</span></div>${pod}${btn ? `<div class="male">${btn}</div>` : ''}</div>`;
    };
    const h = D.wys && Number(D.wys.wysokosc_cm);
    const zM = D.pom.filter(r => Number(r.metraz) > 0), bezM = D.pom.filter(r => !(Number(r.metraz) > 0));
    const suma = h ? zM.reduce((s, r) => s + sciany(Number(r.metraz), h).m2, 0) : 0;
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Ilości – ${esc(f.ulica)}</h1>
      <p class="intro">${W ? `Tu ${esc(kto())} wpisuje ilości z planów architekta, w grupach od A do Z. Pozycję dodaje się przyciskiem „+ Dodaj pozycję” w grupie. Niepewne ilości mają znaczek „do sprawdzenia”. Przy każdej pozycji ${esc(kto())} klika „Zgadza się” albo „Popraw” – liczba od architekta zawsze wygrywa, a stara zostaje przekreślona. „Odznacz” cofa sprawdzenie. Poprawki widać też na górze Listy prac. Niżej są pytania do architekta i wysokość pomieszczeń do przeliczenia ścian.`
        : `Tu ${esc(kto())} widzi ilości z planów architekta, w grupach od A do Z, oraz pytania do architekta. Ilości wpisuje i poprawia Właściciel aplikacji – liczba od architekta zawsze wygrywa, a stara jest przekreślona. Ten ekran jest tylko do oglądania.`}</p>
      ${D.blad ? komunikat(bladI(D.blad)) : ''}${msg ? komunikat(msg, info) : ''}
      ${GRUPY.map(g => { const w = D.poz.filter(x => x.grupa === g);
        return `<div class="card" data-grupa="${esc(g)}"><b>${esc(g)}</b>${w.length ? w.map(pozycja).join('') : '<p class="info2">Nie ma jeszcze pozycji w tej grupie.</p>'}
          ${W ? `<button class="btn2 full" style="margin-top:10px" data-dodaj="${esc(g)}">+ Dodaj pozycję: ${esc(g)}</button>` : ''}</div>`; }).join('')}
      <div class="card" id="pytania"><b>Pytania do architekta</b><p class="info2">Rzeczy do wyjaśnienia z architektem. ${W ? `Gdy architekt odpowie, ${esc(kto())} klika „Wyjaśnione”. „Odznacz” cofa.` : 'Pytania dopisuje Właściciel aplikacji.'}</p>
        ${D.pyt.length ? D.pyt.map(q => `<div class="pyt" data-pyt="${q.id}"><span>${q.wyjasnione ? '✓' : '○'} ${esc(q.tresc)}<span class="kto">${q.wyjasnione ? `Wyjaśnione przez: ${esc(kto2[q.wyjasnil] || 'Właściciel aplikacji')} · ${dataPL(q.wyjasniono)}` : `Dodane przez: ${esc(kto2[q.dodal] || 'Właściciel aplikacji')} · ${dataPL(q.utworzono)}`}</span></span>
          ${W ? `<button class="btn2" data-${q.wyjasnione ? 'pnie' : 'ptak'}="${q.id}">${q.wyjasnione ? 'Odznacz' : 'Wyjaśnione'}</button>` : ''}</div>`).join('') : '<p class="info2">Nie ma jeszcze pytań.</p>'}
        ${W ? '<form class="dopisz" id="fq" novalidate><input id="qaIn" maxlength="300" aria-label="Nowe pytanie do architekta" placeholder="Nowe pytanie do architekta"><button class="btn" id="dodajQ">Dodaj</button></form>' : ''}</div>
      <div class="card" id="wysokosc"><b>Wysokość pomieszczeń</b>
        <p class="info2">Na planach zwykle nie ma wysokości. ${W ? `${esc(kto())} mierzy ją na miejscu, wpisuje w centymetrach i klika „Przelicz” – wtedy policzą się m² ścian każdego pomieszczenia.` : 'Wysokość wpisuje Właściciel aplikacji.'} Założenie: obwód liczony jest tak, jakby pomieszczenie było kwadratem (4 × pierwiastek z metrażu), a okien i drzwi się nie odejmuje. To szacunek – prawdziwe ściany mogą być trochę dłuższe.</p>
        ${W ? `<form class="dopisz" id="fh" novalidate><input id="hIn" inputmode="decimal" aria-label="Wysokość w centymetrach" placeholder="np. 260 cm" value="${h ? esc(lb(h)) : ''}"><button class="btn" id="przelicz">Przelicz</button></form>` : ''}
        ${h ? `<p style="margin:10px 0 0"><b>Wysokość: ${lb(h)} cm</b></p>
          ${zM.length ? `<table class="tabW"><thead><tr><th>Pomieszczenie</th><th>Podłoga</th><th>Obwód</th><th>Ściany</th></tr></thead><tbody>
            ${zM.map(r => { const s = sciany(Number(r.metraz), h); return `<tr><td>${esc(r.nazwa)}</td><td>${m2(Number(r.metraz))}</td><td>${lb(Math.round(s.obw * 100) / 100)} m</td><td><b>${m2(Math.round(s.m2 * 100) / 100)}</b></td></tr>`; }).join('')}
            <tr><td><b>Razem</b></td><td>${m2(Math.round(zM.reduce((s, r) => s + Number(r.metraz), 0) * 100) / 100)}</td><td></td><td id="sumaScian"><b>${m2(Math.round(suma * 100) / 100)}</b></td></tr></tbody></table>` : ''}
          ${bezM.length ? `<p class="info2">Bez metrażu (nie da się policzyć ścian): ${bezM.map(r => esc(r.nazwa)).join(', ')}. Metraż pomieszczeń wpisuje się w kroku 3 przy dodawaniu mieszkania.</p>` : ''}
          ${!D.pom.length ? '<p class="info2">To mieszkanie nie ma jeszcze pomieszczeń z metrażem, więc ścian nie da się policzyć.</p>' : ''}` : ''}
      </div>`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    if (!W) return;
    app.querySelectorAll('[data-dodaj]').forEach(b => b.onclick = () => ekranPozycja(fid, { grupa:b.dataset.dodaj }));
    app.querySelectorAll('[data-pop]').forEach(b => b.onclick = () => ekranPopraw(fid, D.poz.find(x => x.id === b.dataset.pop)));
    app.querySelectorAll('[data-usun]').forEach(b => b.onclick = () => ekranUsunPoz(fid, D.poz.find(x => x.id === b.dataset.usun)));
    const zmiana = (sel, tab, val, txt) => app.querySelectorAll(sel).forEach(b => b.onclick = async () => {
      b.disabled = true; const id = b.getAttribute(sel.slice(1, -1));
      const { error } = await sb.from(tab).update(val).eq('id', id);
      ekranIlosci(fid, error ? bladI(error) : txt((tab === 'ilosci' ? D.poz : D.pyt).find(x => x.id === id)), !error);
    });
    zmiana('[data-ok]', 'ilosci', { stan:'zgadza' }, x => `„${x.nazwa}”: zgadza się z architektem.`);
    zmiana('[data-odz]', 'ilosci', { stan:'nowa', ilosc_architekt:null, powod:null }, x => `Odznaczono: „${x.nazwa}” wraca do liczby z planu (${war(x.ilosc, x.jednostka)}) i czeka na sprawdzenie.`);
    zmiana('[data-ptak]', 'pytania_architekt', { wyjasnione:true }, x => `Pytanie wyjaśnione: „${x.tresc}”.`);
    zmiana('[data-pnie]', 'pytania_architekt', { wyjasnione:false }, x => `Odznaczono: pytanie „${x.tresc}” znowu czeka na odpowiedź architekta.`);
    $('#fq').onsubmit = async e => { e.preventDefault(); const t = $('#qaIn').value.trim();
      if (!t) return ekranIlosci(fid, 'Trzeba napisać pytanie do architekta.', false);
      $('#dodajQ').disabled = true; const { error } = await sb.from('pytania_architekt').insert({ mieszkanie:fid, wlasciciel:wlascicielId(fid), tresc:t });
      ekranIlosci(fid, error ? bladI(error) : `Dodano pytanie do architekta: „${t}”.`, !error); };
    $('#fh').onsubmit = async e => { e.preventDefault(); const v = liczba($('#hIn').value.replace(/cm/i, ''));
      if (v == null) return ekranIlosci(fid, 'Trzeba podać wysokość pomieszczeń w centymetrach, np. 260.', false);
      if (isNaN(v) || v < 150 || v > 500) return ekranIlosci(fid, 'Wysokość musi być liczbą od 150 do 500 cm, np. 260.', false);
      $('#przelicz').disabled = true;
      const r = D.wys ? await sb.from('ilosci_wysokosc').update({ wysokosc_cm:v }).eq('mieszkanie', fid) : await sb.from('ilosci_wysokosc').insert({ mieszkanie:fid, wlasciciel:wlascicielId(fid), wysokosc_cm:v });
      ekranIlosci(fid, r.error ? bladI(r.error) : `Zapisano wysokość ${lb(v)} cm. Ściany są przeliczone – wynik jest w karcie „Wysokość pomieszczeń”.`, !r.error); };
  }

  function ekranPozycja(fid, wpis, msg){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    const v = { grupa:GRUPY[0], nazwa:'', ilosc:'', jednostka:'szt.', niep:false, ...wpis };
    app.innerHTML = `<button class="btnT" id="wroc">← Ilości</button>
      <h1>Nowa pozycja: ${esc(v.grupa)}</h1>
      <p class="intro">${esc(kto())} wpisuje pozycję z planu architekta: nazwę, liczbę i jednostkę. Gdy liczba jest niepewna albo jej nie ma na planie, trzeba zaznaczyć „do sprawdzenia” – wtedy liczbę można zostawić pustą. Po kliknięciu „Zapisz pozycję” pozycja pojawi się w grupie ${esc(v.grupa)} z przyciskami „Zgadza się” i „Popraw”.</p>
      ${msg ? komunikat(msg) : ''}
      <form id="fz" novalidate>
        <label for="zG">Grupa</label><select id="zG" class="pole" style="width:100%;padding:10px;border:1px solid var(--c);border-radius:8px;background:var(--k);color:var(--c);font:inherit">${GRUPY.map(g => `<option ${g === v.grupa ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <label for="zN">Nazwa pozycji</label><input id="zN" maxlength="120" value="${esc(v.nazwa)}" placeholder="np. Gniazda podwójne">
        <div class="wiersz2"><div><label for="zI">Liczba</label><input id="zI" inputmode="decimal" value="${esc(v.ilosc)}" placeholder="np. 8"></div>
          <div><label for="zJ">Jednostka</label><select id="zJ" style="width:100%;padding:10px;border:1px solid var(--c);border-radius:8px;background:var(--k);color:var(--c);font:inherit">${JEDN.map(j => `<option ${j === v.jednostka ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select></div></div>
        <div class="chk"><input type="checkbox" id="zS" ${v.niep ? 'checked' : ''}><label for="zS">do sprawdzenia (niepewna liczba)</label></div>
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapiszPoz">Zapisz pozycję</button></div>
      </form>`;
    $('#wroc').onclick = () => ekranIlosci(fid); $('#anuluj').onclick = () => ekranIlosci(fid);
    $('#fz').onsubmit = async e => { e.preventDefault();
      const w = { grupa:$('#zG').value, nazwa:$('#zN').value, ilosc:$('#zI').value, jednostka:$('#zJ').value, niep:$('#zS').checked };
      const n = liczba(w.ilosc);
      if (!w.nazwa.trim()) return ekranPozycja(fid, w, 'Trzeba podać nazwę pozycji.');
      if (n == null && !w.niep) return ekranPozycja(fid, w, 'Trzeba podać liczbę albo zaznaczyć „do sprawdzenia”.');
      if (n != null && (isNaN(n) || n < 0)) return ekranPozycja(fid, w, 'Liczba musi być liczbą 0 albo większą, np. 8 albo 12,5.');
      $('#zapiszPoz').disabled = true;
      const { error } = await sb.from('ilosci').insert({ mieszkanie:fid, wlasciciel:wlascicielId(fid), grupa:w.grupa, nazwa:w.nazwa.trim(), ilosc:n, jednostka:w.jednostka, do_sprawdzenia:w.niep });
      if (error) return ekranPozycja(fid, w, bladI(error));
      ekranIlosci(fid, `Dodano pozycję „${w.nazwa.trim()}” (${war(n, w.jednostka)}) w grupie ${w.grupa}.`); };
  }

  function ekranPopraw(fid, x, msg, wpis){
    const v = wpis || { nowa:'', powod:'' };
    app.innerHTML = `<button class="btnT" id="wroc">← Ilości</button>
      <h1>Popraw ilość</h1>
      <p class="intro"><b>${esc(x.grupa)} · ${esc(x.nazwa)}</b><br>Z planu: <b>${esc(war(x.ilosc, x.jednostka))}</b>. ${esc(kto())} wpisuje liczbę od architekta i krótko powód. Liczba od architekta wygrywa: stara zostanie przekreślona, a poprawka pokaże się też na górze Listy prac. Po kliknięciu „Zapisz” wróci ekran Ilości.</p>
      ${msg ? komunikat(msg) : ''}
      <form id="fp" novalidate>
        <label for="ilV">Liczba według architekta <small>(${esc(x.jednostka || 'bez jednostki')})</small></label><input id="ilV" inputmode="decimal" value="${esc(v.nowa)}" placeholder="np. 9">
        <label for="ilW">Powód <small>(krótko, nie trzeba)</small></label><input id="ilW" maxlength="200" value="${esc(v.powod)}" placeholder="np. architekt dodał gniazdo przy biurku">
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapiszIl">Zapisz</button></div>
      </form>`;
    $('#wroc').onclick = () => ekranIlosci(fid); $('#anuluj').onclick = () => ekranIlosci(fid);
    $('#fp').onsubmit = async e => { e.preventDefault();
      const w = { nowa:$('#ilV').value, powod:$('#ilW').value }, n = liczba(w.nowa);
      if (n == null) return ekranPopraw(fid, x, 'Trzeba podać liczbę według architekta.', w);
      if (isNaN(n) || n < 0) return ekranPopraw(fid, x, 'Liczba musi być liczbą 0 albo większą, np. 9 albo 12,5.', w);
      $('#zapiszIl').disabled = true;
      const { error } = await sb.from('ilosci').update({ stan:'poprawiona', ilosc_architekt:n, powod:w.powod.trim() || null }).eq('id', x.id);
      if (error) return ekranPopraw(fid, x, bladI(error), w);
      ekranIlosci(fid, `Zapisano: „${x.nazwa}” według architekta ${war(n, x.jednostka)} (z planu ${war(x.ilosc, x.jednostka)}). Poprawkę widać też na górze Listy prac.`); };
  }

  function ekranUsunPoz(fid, x, msg){
    app.innerHTML = `<div class="narrow" style="margin:auto"><h1>Usunąć pozycję?</h1>
      <p class="intro">Pozycja <b>${esc(x.nazwa)}</b> (${esc(war(x.ilosc, x.jednostka))}) zniknie z grupy ${esc(x.grupa)}. Tego nie da się cofnąć. Po usunięciu wróci ekran Ilości.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="acts"><button class="btn2" id="nie">Nie, wróć</button><button class="btn" id="tak">Tak, usuń pozycję</button></div></div>`;
    $('#nie').onclick = () => ekranIlosci(fid);
    $('#tak').onclick = async () => { $('#tak').disabled = true; const { error } = await sb.from('ilosci').delete().eq('id', x.id);
      if (error) return ekranUsunPoz(fid, x, bladI(error)); ekranIlosci(fid, `Pozycja „${x.nazwa}” została usunięta.`); };
  }

  /* Hak dla Listy prac (rdzeń): karta „Zmiany ilości od architekta” na górze. Rdzeń musi wywołać HAKI.listaPrac w ekranListaPrac (zmiana rdzenia do dodania: patrz test_poprawki_ilosci_ekrany.js, funkcja zHakiem). */
  (HAKI.listaPrac || (HAKI.listaPrac = [])).push(async fid => {
    const { data, error } = await sb.from('ilosci').select('grupa,nazwa,ilosc,jednostka,ilosc_architekt,powod,stan').eq('mieszkanie', fid).eq('stan', 'poprawiona');
    const w = (error ? [] : data || []).sort((a, b) => a.grupa.localeCompare(b.grupa, 'pl') || a.nazwa.localeCompare(b.nazwa, 'pl'));
    if (!w.length) return '';
    return `<div class="card" id="zmianyIlosci"><b>Zmiany ilości od architekta</b><p class="info2">Te liczby różnią się od planu. Liczba od architekta (pogrubiona) jest ważna, stara jest przekreślona. Szczegóły są w zakładce Ilości.</p>
      ${w.map(x => `<div class="row"><span>${esc(x.grupa)}: ${esc(x.nazwa)}${x.powod ? `<span class="kto">${esc(x.powod)}</span>` : ''}</span><span style="white-space:nowrap"><span class="stara" style="text-decoration:line-through">${esc(war(x.ilosc, x.jednostka))}</span> <b>${esc(war(x.ilosc_architekt, x.jednostka))}</b></span></div>`).join('')}</div>`;
  });

  rejestrujModul({ k:'ilosci', n:'Ilości', firma:true, etykieta:() => 'Ilości z planu', ekran:fid => ekranIlosci(fid) });
})();
