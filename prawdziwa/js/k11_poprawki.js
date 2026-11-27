/* ===== Klocek 11: Poprawki – zgłoszenie ze zdjęciem, zdjęcie po poprawce od firmy, zatwierdzenie ===== */
(function(){
  const CZ = '#C0392B', ZI = '#2E8B57';   // jedyny wyjątek kolorów: status poprawki (niezrobiona / zrobiona)
  const st = document.createElement('style');
  st.textContent = `.pop.open{border-color:${CZ}}.pop.done{border-color:${ZI}}
    .st-open{color:${CZ};font-weight:700;white-space:nowrap}.st-done{color:${ZI};font-weight:700;white-space:nowrap}
    .pop .gdzie{display:block;font-size:13px;margin-top:4px}
    .pop .stan{font-size:14px;font-weight:600;margin-top:6px}
    .pop .male{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.pop .male .btn,.pop .male .btn2{padding:7px 12px;font-size:14px}
    .etapP{display:block;width:100%;text-align:left;background:transparent;color:var(--c);cursor:pointer;border:none;padding:0;font:inherit}
    .etapP .pok{font-size:13px;color:var(--z);margin-top:4px}
    .pomP{margin-top:10px;padding-top:8px;border-top:1px solid var(--z)}
    .prP{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:5px 0 5px 4px}
    .prP .btn2{padding:5px 10px;font-size:13px;white-space:nowrap;flex:none}
    .prP small{display:block}
    .liczP{margin:0 0 10px}
    select.pole{width:100%;padding:10px;border:1px solid var(--c);border-radius:8px;background:var(--k);color:var(--c);font:inherit}
    @media (max-width:480px){.prP{flex-wrap:wrap}.prP .btn2{margin-left:auto}}`;
  document.head.appendChild(st);

  const ZDJ = 'id,poprawka,poprawka_etap,sciezka,nazwa,dodal,utworzono';
  const ile = n => n + ' ' + pl(n, 'poprawka', 'poprawki', 'poprawek');
  const wlasc = fid => !jestFirma() && wlascicielId(fid) === S.user.id;
  const doKiedy = t => t ? 'do ' + dt(t) : 'bez terminu';
  const bladP = e => /poprawki|poprawka/i.test((e && e.message) || '') && /find|exist|column|relation/i.test((e && e.message) || '')
    ? 'Poprawki nie są jeszcze włączone w bazie danych. Trzeba wgrać plik 11_poprawki.sql w Supabase.' : blad(e);
  const bladZm = e => { const m = (e && e.message) || '';
    if (/zdjęcie po poprawce/i.test(m)) return 'Najpierw trzeba dodać zdjęcie po poprawce.';
    if (/już zatwierdzona/i.test(m)) return 'Ta poprawka jest już zatwierdzona. Zmienić ją może tylko Właściciel aplikacji.';
    return bladP(e); };

  /* licznik na przycisku: ile niezrobionych poprawek w każdym mieszkaniu */
  async function liczniki(){
    const { data, error } = await sb.from('poprawki').select('mieszkanie,zatwierdzona');
    if (error){ S.popStat = null; return; }
    S.popStat = {}; (data || []).forEach(x => { if (!x.zatwierdzona) S.popStat[x.mieszkanie] = (S.popStat[x.mieszkanie] || 0) + 1; });
  }
  HAKI.poWczytaniu.push(liczniki);

  async function wczytajPoprawki(fid){
    const [a, b] = await Promise.all([
      sb.from('poprawki').select('*').eq('mieszkanie', fid),
      sb.from('pliki').select(ZDJ).eq('mieszkanie', fid).eq('folder', 'poprawki') ]);
    const lista = (a.data || []).sort((x, y) => (x.zatwierdzona ? 1 : 0) - (y.zatwierdzona ? 1 : 0)
      || (x.termin || '9999').localeCompare(y.termin || '9999') || x.tresc.localeCompare(y.tresc, 'pl'));
    const t = S.popStat || (S.popStat = {}); const n = lista.filter(x => !x.zatwierdzona).length; if (n) t[fid] = n; else delete t[fid];
    return { blad:a.error, lista, zdj:(b.data || []).filter(z => z.poprawka) };
  }
  async function linkiDo(zdj){
    const linki = {}; if (!zdj.length) return linki;
    const { data } = await sb.storage.from(SCHOWEK).createSignedUrls(zdj.map(z => z.sciezka), 3600);
    (data || []).forEach(z => { if (z.signedUrl) linki[z.path] = z.signedUrl; }); return linki;
  }
  async function wgrajZdjeciePoprawki(fid, popId, etap, blob, nazwa){
    const sciezka = `${wlascicielId(fid)}/${fid}/poprawki/${crypto.randomUUID()}.jpg`;
    const up = await sb.storage.from(SCHOWEK).upload(sciezka, blob, { contentType:'image/jpeg', upsert:false });
    if (up.error) return bladPliku(up.error);
    const { error } = await sb.from('pliki').insert({ mieszkanie:fid, wlasciciel:wlascicielId(fid), folder:'poprawki', nazwa, sciezka, typ:'zdjecie', rozmiar:blob.size, poprawka:popId, poprawka_etap:etap });
    if (error){ await sb.storage.from(SCHOWEK).remove([sciezka]); return bladPliku(error); }
    return null;
  }

  /* ---------- ekran główny ---------- */
  async function ekranPoprawki(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję poprawki…</p>';
    const W = wlasc(fid), F = jestFirma();
    const [P, L] = await Promise.all([wczytajPoprawki(fid), wczytajPrace(fid)]);
    const nazwyPom = {}, nazwyPracy = {}; L.pom.forEach(r => nazwyPom[r.id] = r.nazwa); L.prace.forEach(x => nazwyPracy[x.id] = x.nazwa);
    const kto2 = await nazwyKto(P.lista.flatMap(x => [x.zgloszona_przez, x.zrobiona_przez, x.zatwierdzona_przez]));
    const o = P.lista.filter(x => !x.zatwierdzona).length, d = P.lista.length - o;
    const ileZ = id => P.zdj.filter(z => z.poprawka === id).length;
    const karta = x => {
      const n = ileZ(x.id), gdzie = [x.pomieszczenie ? nazwyPom[x.pomieszczenie] || 'Pomieszczenie' : 'Całe mieszkanie', x.praca && nazwyPracy[x.praca] ? 'praca: ' + nazwyPracy[x.praca] : '', doKiedy(x.termin)].filter(Boolean).join(' · ');
      const stan = x.zatwierdzona ? '' : x.zrobiona ? 'Zdjęcie po poprawce wysłane – czeka na zatwierdzenie' : 'Czeka na zdjęcie po poprawce od firmy';
      let przyciski = n ? `<button class="btn2" data-zdj="${x.id}">📷 Zobacz zdjęcia (${n})</button>` : '';
      if (F){
        if (!x.zrobiona) przyciski = `<button class="btn" data-po="${x.id}">📷 Zrobione – wyślij zdjęcie</button>` + przyciski;
        else if (!x.zatwierdzona) przyciski += `<button class="btn2" data-cofnij="${x.id}">Odznacz</button>`;
      } else if (W){
        if (!x.zrobiona) przyciski += `<button class="btn2" data-po="${x.id}">Zrobione – dodaj zdjęcie</button><button class="btn2" data-usun="${x.id}">Usuń</button>`;
        else if (!x.zatwierdzona) przyciski = `<button class="btn" data-zatw="${x.id}">Zatwierdź</button>` + przyciski + `<button class="btn2" data-cofnij="${x.id}">Odznacz</button>`;
        else przyciski += `<button class="btn2" data-odzatw="${x.id}">Odznacz</button>`;
      }
      return `<div class="card pop ${x.zatwierdzona ? 'done' : 'open'}" data-pop="${x.id}">
        <div class="zw"><b>${esc(x.tresc)}</b><span class="${x.zatwierdzona ? 'st-done' : 'st-open'}">${x.zatwierdzona ? '✓ Zrobiona' : '! Niezrobiona'}</span></div>
        <span class="gdzie">${esc(gdzie)}</span>
        <span class="kto">Zgłoszone przez: ${esc(kto2[x.zgloszona_przez] || 'Właściciel aplikacji')} · ${dataPL(x.zgloszona_kiedy || x.utworzono)}</span>
        ${x.zrobiona ? `<span class="kto">Zdjęcie dodane przez: ${esc(kto2[x.zrobiona_przez] || 'Firma remontowa')} · ${dataPL(x.zrobiona_kiedy)}</span>` : ''}
        ${x.zatwierdzona ? `<span class="kto">Zatwierdzone przez: ${esc(kto2[x.zatwierdzona_przez] || 'Właściciel aplikacji')} · ${dataPL(x.zatwierdzona_kiedy)}</span>` : ''}
        ${stan ? `<div class="stan">${stan}</div>` : ''}
        ${przyciski ? `<div class="male">${przyciski}</div>` : ''}</div>`;
    };
    const intro = F
      ? `Tu są poprawki od Właściciela aplikacji. Gdy ${esc(kto())} zrobi poprawkę, klika „Zrobione – wyślij zdjęcie” i dodaje zdjęcie po poprawce. Potem Właściciel aplikacji ją zatwierdza i poprawka zmienia się na zieloną „Zrobiona”. „Odznacz” cofa wysłanie zdjęcia, dopóki poprawka nie jest zatwierdzona.`
      : `Tu ${esc(kto())} zgłasza poprawki dla firmy remontowej. Na górze są zgłoszone poprawki: czerwone są jeszcze niezrobione, zielone są zrobione i zatwierdzone. Firma widzi poprawki w swojej aplikacji i po poprawieniu wysyła zdjęcie. Wtedy ${esc(kto())} klika „Zatwierdź” albo „Odznacz” (cofa). Niżej są wszystkie prace firmy – przy zrobionej pracy jest „Zgłoś poprawkę”. Zdjęcia poprawek trafiają do Biblioteki › Poprawki.`;
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Poprawki – ${esc(f.ulica)}</h1>
      <p class="intro">${intro}</p>
      ${P.blad ? komunikat(bladP(P.blad)) : ''}${msg ? komunikat(msg, info) : ''}
      ${P.lista.length ? `<p class="liczP"><b class="st-open">${o} ${pl(o, 'niezrobiona', 'niezrobione', 'niezrobionych')}</b> · <b class="st-done">${d} ${pl(d, 'zrobiona', 'zrobione', 'zrobionych')}</b></p>` : ''}
      <div id="poprawki">${P.lista.length ? P.lista.map(karta).join('') : `<div class="card empty"><b>Nie ma jeszcze żadnej poprawki.</b><br>${W ? 'Po kliknięciu „+ Dodaj poprawkę” można zgłosić pierwszą. Firma zobaczy ją od razu w zakładce Poprawki.' : 'Gdy Właściciel aplikacji zgłosi poprawkę, pojawi się tutaj.'}</div>`}</div>
      ${W ? '<button class="btn full" id="dodajPop" style="margin-bottom:6px">+ Dodaj poprawkę</button>' : ''}
      ${W ? sekcjaPrac(L, P.lista) : ''}`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    const d1 = $('#dodajPop'); if (d1) d1.onclick = () => { S.nowaPop = null; ekranDodaj(fid, {}); };
    app.querySelectorAll('[data-zdj]').forEach(b => b.onclick = () => ekranZdjec(fid, b.dataset.zdj));
    app.querySelectorAll('[data-po]').forEach(b => b.onclick = () => { S.zdjPo = null; ekranZdjeciePo(fid, b.dataset.po); });
    app.querySelectorAll('[data-usun]').forEach(b => b.onclick = () => ekranUsun(fid, P.lista.find(x => x.id === b.dataset.usun)));
    const zmien = (sel, val, txt) => app.querySelectorAll(sel).forEach(b => b.onclick = async () => {
      b.disabled = true; const id = b.getAttribute(sel.slice(1, -1)); const x = P.lista.find(y => y.id === id);
      const { error } = await sb.from('poprawki').update(val).eq('id', id);
      ekranPoprawki(fid, error ? bladZm(error) : txt(x), !error);
    });
    zmien('[data-zatw]', { zatwierdzona:true }, x => `Poprawka „${x.tresc}” jest zatwierdzona i zrobiona. Zatwierdzone przez: ${kto()} · ${dataPL(new Date())}.`);
    zmien('[data-odzatw]', { zatwierdzona:false }, x => `Odznaczono: poprawka „${x.tresc}” znowu czeka na zatwierdzenie. Zdjęcie po poprawce zostaje.`);
    zmien('[data-cofnij]', { zrobiona:false }, x => `Odznaczono: poprawka „${x.tresc}” jest znowu niezrobiona. Zdjęcia zostają w Bibliotece › Poprawki.`);
    app.querySelectorAll('[data-etap]').forEach(b => b.onclick = () => { const i = +b.dataset.etap; S.popEtap = S.popEtap === i ? null : i; ekranPoprawki(fid); });
    app.querySelectorAll('[data-zglos]').forEach(b => b.onclick = () => { const x = L.prace.find(y => y.id === b.dataset.zglos); S.nowaPop = null; ekranDodaj(fid, { praca:x.id, pomieszczenie:x.pomieszczenie }); });
  }

  function sekcjaPrac(L, lista){
    const naglowek = `<h2 style="margin-top:18px">Wszystkie prace firmy</h2><p class="intro">Po kliknięciu etapu widać każdą pracę w każdym pomieszczeniu. ✓ znaczy, że praca jest zrobiona. Przy zrobionej pracy jest „Zgłoś poprawkę” – praca i pomieszczenie wpiszą się same.</p>`;
    if (L.blad) return naglowek + komunikat(blad(L.blad));
    if (!L.prace.length) return naglowek + '<div class="card empty"><b>To mieszkanie nie ma jeszcze listy prac.</b><br>Lista prac powstaje w krokach 3 i 4 przy dodawaniu mieszkania. Poprawkę można zgłosić przyciskiem „+ Dodaj poprawkę”.</div>';
    const otwarta = id => lista.find(p => p.praca === id && !p.zatwierdzona), ostatnia = id => lista.find(p => p.praca === id);
    return naglowek + ETAPY.map((e, i) => {
      const w = L.prace.filter(x => x.etap === i + 1); if (!w.length) return '';
      const z = w.filter(x => x.zrobiona).length, fx = lista.filter(p => w.some(x => x.id === p.praca)), fo = fx.filter(p => !p.zatwierdzona).length;
      const otw = S.popEtap === i;
      return `<div class="card"><button class="etapP" data-etap="${i}" aria-expanded="${otw}"><div class="zw"><span><b>${i + 1}. ${esc(e)}</b><br><small>zrobione prace: ${z} z ${w.length}</small></span>${fo ? `<span class="st-open">${ile(fo)}</span>` : fx.length ? '<span class="st-done">✓ poprawione</span>' : ''}</div>
        ${otw ? '' : '<div class="pok">Pokaż prace ›</div>'}</button>
        ${otw ? L.pom.map(r => { const g = w.filter(x => x.pomieszczenie === r.id).sort(poNazwie); if (!g.length) return '';
          return `<div class="pomP"><b>${esc(r.nazwa)}</b>${g.map(x => { const p = otwarta(x.id) || ostatnia(x.id);
            return `<div class="prP" data-praca="${x.id}"><span>${x.zrobiona ? '✓' : '○'} ${esc(x.nazwa)}${p ? `<small class="${p.zatwierdzona ? 'st-done' : 'st-open'}">${p.zatwierdzona ? '✓ Poprawka zrobiona: ' : '! Poprawka: '}${esc(p.tresc)}</small>` : ''}</span>
              ${x.zrobiona && !otwarta(x.id) ? `<button class="btn2" data-zglos="${x.id}">Zgłoś poprawkę</button>` : !x.zrobiona ? '<small>jeszcze nie zrobione</small>' : ''}</div>`; }).join('')}</div>`; }).join('') : ''}</div>`;
    }).join('');
  }

  /* ---------- dodawanie poprawki ---------- */
  async function ekranDodaj(fid, wst, msg){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    if (!S.nowaPop || S.nowaPop.fid !== fid) S.nowaPop = { fid, praca:wst.praca || null, pomieszczenie:wst.pomieszczenie || '', tresc:'', termin:'', zdj:[] };
    const N = S.nowaPop;
    app.innerHTML = '<p>Wczytuję…</p>';
    const [r1, r2] = await Promise.all([sb.from('pomieszczenia').select('id,nazwa').eq('mieszkanie', fid), N.praca ? sb.from('prace').select('id,nazwa').eq('id', N.praca) : Promise.resolve({ data:[] })]);
    const pom = (r1.data || []).sort(poNazwie), praca = (r2.data || [])[0];
    const nazwaPom = (pom.find(r => r.id === N.pomieszczenie) || {}).nazwa;
    app.innerHTML = `<button class="btnT" id="wroc">← Poprawki</button>
      <h1>Dodaj poprawkę</h1>
      <p class="intro">${praca ? `<b>Praca: ${esc(praca.nazwa)}${nazwaPom ? ' · ' + esc(nazwaPom) : ''}.</b> ` : ''}${esc(kto())} robi zdjęcie miejsca do poprawy (albo wybiera je z galerii), opisuje, co poprawić, wybiera pomieszczenie i termin. Po kliknięciu „Zapisz poprawkę” poprawka pojawi się na czerwono w zakładce Poprawki, a firma zobaczy ją u siebie. Zdjęcie trafi też do Biblioteki › Poprawki.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="dwa"><label class="btn wgraj" for="aparat" id="lAparat">📷 Zrób zdjęcie</label><label class="btn2 wgraj" for="galeria" id="lGaleria">Wybierz z galerii</label></div>
      <input type="file" id="aparat" class="hide" accept="image/*" capture="environment"><input type="file" id="galeria" class="hide" accept="image/*" multiple>
      ${N.zdj.length ? `<div class="fotki">${N.zdj.map((z, i) => `<figure><div class="ramka"><img src="${z.url}" alt="${esc(z.nazwa)}"><button class="btn2" data-usunz="${i}">Usuń</button></div><figcaption>Zdjęcie dodane przez: ${esc(kto())} · ${dataPL(new Date())}</figcaption></figure>`).join('')}</div>` : '<p class="info2">Zdjęcie nie jest konieczne, ale firmie łatwiej znaleźć miejsce do poprawy.</p>'}
      <form id="fp" novalidate>
        <label for="pT">Co poprawić</label><input id="pT" maxlength="300" value="${esc(N.tresc)}">
        <label for="pR">Pomieszczenie</label><select id="pR" class="pole">${pom.map(r => `<option value="${r.id}" ${r.id === N.pomieszczenie ? 'selected' : ''}>${esc(r.nazwa)}</option>`).join('')}<option value="" ${!N.pomieszczenie ? 'selected' : ''}>Inne – całe mieszkanie</option></select>
        <label for="pD">Do kiedy <small>(nie trzeba)</small></label><input id="pD" type="date" value="${esc(N.termin)}" min="${dzis()}">
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapiszPop">Zapisz poprawkę</button></div>
      </form>`;
    const czytaj = () => { N.tresc = $('#pT').value; N.pomieszczenie = $('#pR').value; N.termin = $('#pD').value; };
    const wroc = () => { (S.nowaPop ? S.nowaPop.zdj : []).forEach(z => URL.revokeObjectURL(z.url)); S.nowaPop = null; ekranPoprawki(fid); };
    $('#wroc').onclick = wroc; $('#anuluj').onclick = wroc;
    const dodaj = async e => { const pliki = [...e.target.files]; if (!pliki.length) return; czytaj();
      N.trwa = true; const z = $('#zapiszPop'); z.disabled = true; z.textContent = 'Przygotowuję zdjęcie…';
      const { ok, bledy } = await przygotujZdjecia(pliki); N.zdj.push(...ok); N.trwa = false;
      ekranDodaj(fid, wst, bledy.length ? 'Nie dodano: ' + bledy.join(' ') : null); };
    $('#aparat').onchange = dodaj; $('#galeria').onchange = dodaj;
    app.querySelectorAll('[data-usunz]').forEach(b => b.onclick = () => { czytaj(); const [z] = N.zdj.splice(+b.dataset.usunz, 1); URL.revokeObjectURL(z.url); ekranDodaj(fid, wst); });
    $('#fp').onsubmit = async e => {
      e.preventDefault(); if (N.trwa || S.nowaPop !== N) return; czytaj();
      if (!N.tresc.trim()) return ekranDodaj(fid, wst, 'Trzeba napisać, co poprawić.');
      if (N.termin && N.termin < dzis()) return ekranDodaj(fid, wst, 'Termin nie może być wcześniejszy niż dzisiaj.');
      const btn = $('#zapiszPop'); btn.disabled = true; btn.classList.add('load'); btn.textContent = 'Zapisuję…';
      const { data, error } = await sb.from('poprawki').insert({ mieszkanie:fid, wlasciciel:wlascicielId(fid), tresc:N.tresc.trim(), pomieszczenie:N.pomieszczenie || null, praca:N.praca, termin:N.termin || null }).select().single();
      if (error) return ekranDodaj(fid, wst, bladP(error));
      const bledy = [];
      for (let i = 0; i < N.zdj.length; i++){ btn.textContent = `Wgrywam zdjęcie ${i + 1} z ${N.zdj.length}…`;
        const err = await wgrajZdjeciePoprawki(fid, data.id, 'przed', N.zdj[i].blob, N.zdj[i].nazwa); if (err) bledy.push(N.zdj[i].nazwa + ': ' + err); URL.revokeObjectURL(N.zdj[i].url); }
      S.nowaPop = null;
      ekranPoprawki(fid, `Poprawka „${data.tresc}” zapisana. Firma widzi ją w zakładce Poprawki. Zgłoszone przez: ${kto()} · ${dataPL(new Date())}.` + (bledy.length ? ' Nie wgrano zdjęć: ' + bledy.join(' ') : ''), !bledy.length);
    };
  }

  /* ---------- zdjęcie po poprawce (firma, albo Właściciel aplikacji bez firmy) ---------- */
  async function ekranZdjeciePo(fid, popId, msg){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    if (!S.zdjPo || S.zdjPo.id !== popId) S.zdjPo = { id:popId, lista:[] };
    app.innerHTML = '<p>Wczytuję…</p>';
    const P = await wczytajPoprawki(fid); const x = P.lista.find(y => y.id === popId);
    if (!x){ S.zdjPo = null; return ekranPoprawki(fid, 'Tej poprawki już nie ma.', false); }
    if (x.zrobiona){ S.zdjPo = null; return ekranPoprawki(fid, `Poprawka „${x.tresc}” ma już zdjęcie po poprawce.`); }
    const stare = P.zdj.filter(z => z.poprawka === popId), linki = await linkiDo(stare), kto2 = await nazwyKto(stare.map(z => z.dodal));
    const nowe = S.zdjPo.lista, poStare = stare.filter(z => z.poprawka_etap === 'po');
    const ileZ = poStare.length + nowe.length;
    const fig = z => `<figure><div class="ramka"><img src="${esc(linki[z.sciezka] || '')}" alt="${esc(z.nazwa)}"></div><figcaption>${z.poprawka_etap === 'po' ? 'Po poprawce' : 'Przed poprawką'}. Zdjęcie dodane przez: ${esc(kto2[z.dodal] || 'Właściciel aplikacji')} · ${dataPL(z.utworzono)}</figcaption></figure>`;
    app.innerHTML = `<button class="btnT" id="wroc">← Poprawki</button>
      <h1>Zrobione – zdjęcie po poprawce</h1>
      <p class="intro"><b>${esc(x.tresc)}.</b> ${esc(kto())} robi zdjęcie poprawionego miejsca albo wybiera je z galerii. Potrzebne jest co najmniej jedno zdjęcie. Po kliknięciu „Wyślij zdjęcie” poprawka czeka na zatwierdzenie przez Właściciela aplikacji, a zdjęcie trafi do Biblioteki › Poprawki.</p>
      ${msg ? komunikat(msg) : ''}
      ${stare.filter(z => z.poprawka_etap === 'przed').length ? `<div class="card"><b>Zdjęcie zgłoszenia</b><div class="fotki">${stare.filter(z => z.poprawka_etap === 'przed').map(fig).join('')}</div></div>` : ''}
      <div class="dwa"><label class="btn wgraj" for="aparat" id="lAparat">📷 Zrób zdjęcie</label><label class="btn2 wgraj" for="galeria" id="lGaleria">Wybierz z galerii</label></div>
      <input type="file" id="aparat" class="hide" accept="image/*" capture="environment"><input type="file" id="galeria" class="hide" accept="image/*" multiple>
      <div class="card"><b>Zdjęcia po poprawce (${ileZ})</b>
        ${ileZ ? `<div class="fotki">${poStare.map(fig).join('')}${nowe.map((z, i) => `<figure><div class="ramka"><img src="${z.url}" alt="${esc(z.nazwa)}"><button class="btn2" data-usunz="${i}">Usuń</button></div><figcaption>Po poprawce. Zdjęcie dodane przez: ${esc(kto())} · ${dataPL(new Date())}</figcaption></figure>`).join('')}</div>`
        : '<p class="info2">Nie ma jeszcze zdjęcia po poprawce. Bez zdjęcia przycisk „Wyślij zdjęcie” pokaże komunikat: „Najpierw trzeba dodać zdjęcie po poprawce”.</p>'}</div>
      <div class="acts"><button class="btn2" id="anuluj">Anuluj</button><button class="btn" id="wyslij">Wyślij zdjęcie</button></div>`;
    const wroc = () => { (S.zdjPo ? S.zdjPo.lista : []).forEach(z => URL.revokeObjectURL(z.url)); S.zdjPo = null; ekranPoprawki(fid); };
    $('#wroc').onclick = wroc; $('#anuluj').onclick = wroc;
    const dodaj = async e => { const pliki = [...e.target.files]; if (!pliki.length) return;
      S.zdjPo.trwa = true; const b = $('#wyslij'); b.disabled = true; b.textContent = 'Przygotowuję zdjęcie…';
      const { ok, bledy } = await przygotujZdjecia(pliki); S.zdjPo.lista.push(...ok); S.zdjPo.trwa = false;
      ekranZdjeciePo(fid, popId, bledy.length ? 'Nie dodano: ' + bledy.join(' ') : null); };
    $('#aparat').onchange = dodaj; $('#galeria').onchange = dodaj;
    app.querySelectorAll('[data-usunz]').forEach(b => b.onclick = () => { const [z] = S.zdjPo.lista.splice(+b.dataset.usunz, 1); URL.revokeObjectURL(z.url); ekranZdjeciePo(fid, popId); });
    $('#wyslij').onclick = async () => {
      if (!S.zdjPo || S.zdjPo.id !== popId || S.zdjPo.trwa) return;
      const nowe = S.zdjPo.lista;
      if (!(poStare.length + nowe.length)) return ekranZdjeciePo(fid, popId, 'Najpierw trzeba dodać zdjęcie po poprawce.');
      const btn = $('#wyslij'); btn.disabled = true; btn.classList.add('load');
      for (let i = 0; i < nowe.length; i++){
        btn.textContent = `Wgrywam zdjęcie ${i + 1} z ${nowe.length}…`;
        const err = await wgrajZdjeciePoprawki(fid, popId, 'po', nowe[i].blob, nowe[i].nazwa);
        if (err){ S.zdjPo.lista = nowe.slice(i); return ekranZdjeciePo(fid, popId, 'Nie udało się wgrać zdjęcia: ' + err); }
        URL.revokeObjectURL(nowe[i].url);
      }
      S.zdjPo = null;
      const { error } = await sb.from('poprawki').update({ zrobiona:true }).eq('id', popId);
      if (error) return ekranZdjeciePo(fid, popId, bladZm(error));
      ekranPoprawki(fid, `Zdjęcie po poprawce „${x.tresc}” wysłane. Zdjęcie dodane przez: ${kto()} · ${dataPL(new Date())}. Teraz Właściciel aplikacji zatwierdza poprawkę.`);
    };
  }

  /* ---------- zdjęcia poprawki ---------- */
  async function ekranZdjec(fid, popId){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję zdjęcia…</p>';
    const P = await wczytajPoprawki(fid); const x = P.lista.find(y => y.id === popId); if (!x) return ekranPoprawki(fid);
    const zdj = P.zdj.filter(z => z.poprawka === popId).sort((a, b) => (a.poprawka_etap === 'przed' ? 0 : 1) - (b.poprawka_etap === 'przed' ? 0 : 1) || a.utworzono.localeCompare(b.utworzono));
    const linki = await linkiDo(zdj), kto2 = await nazwyKto(zdj.map(z => z.dodal));
    const podpis = z => `${z.poprawka_etap === 'po' ? 'Po poprawce' : 'Przed poprawką'}. Zdjęcie dodane przez: ${kto2[z.dodal] || 'Właściciel aplikacji'} · ${dataPL(z.utworzono)}`;
    app.innerHTML = `<button class="btnT" id="wroc">← Poprawki</button>
      <h1>Zdjęcia poprawki</h1>
      <p class="intro"><b>${esc(x.tresc)}</b> <span class="${x.zatwierdzona ? 'st-done' : 'st-open'}">${x.zatwierdzona ? '✓ Zrobiona' : '! Niezrobiona'}</span><br>Najpierw zdjęcia ze zgłoszenia, potem zdjęcia po poprawce. Pod każdym zdjęciem widać, kto je dodał i kiedy. Po kliknięciu zdjęcia otworzy się jego powiększenie. „Wróć do poprawek” otwiera znowu listę poprawek.</p>
      <div class="fotki">${zdj.map((z, i) => `<figure><img src="${esc(linki[z.sciezka] || '')}" alt="${esc(z.nazwa)}" data-pow="${i}"><figcaption>${esc(podpis(z))}</figcaption></figure>`).join('')}</div>
      <div class="acts"><button class="btn" id="wrocP">Wróć do poprawek</button></div>`;
    $('#wroc').onclick = () => ekranPoprawki(fid); $('#wrocP').onclick = () => ekranPoprawki(fid);
    app.querySelectorAll('[data-pow]').forEach(im => im.onclick = () => {
      const i = +im.dataset.pow, z = zdj[i];
      podglad({ nazwa:`Zdjęcie ${i + 1} z ${zdj.length} · ${x.tresc}`, sciezka:z.sciezka, typ:'zdjecie' }, linki);
      const inf = $('#okno .info'); if (inf) inf.textContent = podpis(z) + '. „Zamknij” wraca do zdjęć poprawki.';
    });
  }

  /* ---------- usuwanie poprawki ---------- */
  function ekranUsun(fid, x, msg){
    app.innerHTML = `<div class="narrow" style="margin:auto"><h1>Usunąć poprawkę?</h1>
      <p class="intro">Poprawka <b>${esc(x.tresc)}</b> zniknie z listy poprawek i firma przestanie ją widzieć. Zdjęcia zostaną w Bibliotece › Poprawki. Tego nie da się cofnąć. Po usunięciu otworzy się znowu lista poprawek.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="acts"><button class="btn2" id="nie">Nie, wróć</button><button class="btn" id="tak">Tak, usuń poprawkę</button></div></div>`;
    $('#nie').onclick = () => ekranPoprawki(fid);
    $('#tak').onclick = async () => { $('#tak').disabled = true;
      const { error } = await sb.from('poprawki').delete().eq('id', x.id);
      if (error) return ekranUsun(fid, x, bladP(error));
      ekranPoprawki(fid, `Poprawka „${x.tresc}” została usunięta. Zdjęcia zostały w Bibliotece › Poprawki.`); };
  }

  rejestrujModul({ k:'poprawki', n:'Poprawki', firma:true,
    etykieta:fid => 'Poprawki' + (S.popStat && S.popStat[fid] ? ` – ${S.popStat[fid]} ${pl(S.popStat[fid], 'niezrobiona', 'niezrobione', 'niezrobionych')}` : ''),
    ekran:fid => { S.popEtap = null; ekranPoprawki(fid); } });
})();
