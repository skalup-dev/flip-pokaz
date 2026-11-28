/* ===== Klocek 8: Pieniądze mieszkania (tylko Właściciel aplikacji – szef firmy tego nie widzi) =====
   Zakup = mieszkania.cena_zakupu. Umowa z firmą = cena_firmy_m2 × metraż. Budżet remontu = umowa + budzet_materialow.
   Wydane z budżetu = paragony „Sprawdzone” (klocek 7) + wydatki z innych klocków (WYDATKI_MIESZKANIA, np. Płatności).
   „Do sprawdzenia” nie liczy się do wydanych – pokazane osobno jako „czeka”. Mieszkanie kosztuje razem = zakup + wydane. */
(function(){
  // Inne klocki (np. Płatności) dopisują tu: async fid => ({ n:'Płatności dla firmy', kwota:12345 })
  window.WYDATKI_MIESZKANIA = window.WYDATKI_MIESZKANIA || [];
  const SUMY = {};   // mieszkanie -> { wyd, czeka, n }
  const num = v => v == null || v === '' ? null : Number(v);
  const r2 = v => Math.round(v * 100) / 100;
  const umowa = f => num(f.cena_firmy_m2) != null && num(f.metraz) != null ? r2(num(f.cena_firmy_m2) * num(f.metraz)) : null;
  const budzet = f => (num(f.cena_firmy_m2) == null && num(f.budzet_materialow) == null) ? num(f.budzet) : r2((umowa(f) || 0) + (num(f.budzet_materialow) || 0));
  const brakKolumn = e => /cena_zakupu|cena_firmy_m2|budzet_materialow/i.test((e && e.message) || '');

  async function wczytajSumy(){
    Object.keys(SUMY).forEach(k => delete SUMY[k]);
    if (jestFirma()) return;
    const { data, error } = await sb.from('paragony').select('mieszkanie,kwota,sprawdzone'); if (error) return;
    (data || []).forEach(x => { const t = SUMY[x.mieszkanie] || (SUMY[x.mieszkanie] = { wyd:0, czeka:0, n:0 }); t.n++; if (x.sprawdzone) t.wyd = r2(t.wyd + Number(x.kwota)); else t.czeka = r2(t.czeka + Number(x.kwota)); });
  }
  HAKI.poWczytaniu.push(wczytajSumy);
  window.odswiezPieniadze = wczytajSumy;   // klocek 7 woła to po każdej zmianie paragonów (napis na przycisku)
  if (!document.getElementById('styl-ostrz')){ const st = document.createElement('style'); st.id = 'styl-ostrz'; st.textContent = '.ostrz{color:#FF0000;font-weight:700}'; document.head.appendChild(st); }

  async function policz(fid){
    const f = mieszkanie(fid);
    const { data, error } = await sb.from('paragony').select('kwota,sprawdzone').eq('mieszkanie', fid);
    const l = data || [];
    const mat = r2(l.filter(x => x.sprawdzone).reduce((a, x) => a + Number(x.kwota), 0)), czeka = r2(l.filter(x => !x.sprawdzone).reduce((a, x) => a + Number(x.kwota), 0));
    const inne = [];
    for (const z of window.WYDATKI_MIESZKANIA){ try { const w = await z(fid); if (w && w.kwota != null) inne.push(w); } catch(e){} }
    const wyd = r2(mat + inne.reduce((a, x) => a + Number(x.kwota), 0));
    SUMY[fid] = { wyd, czeka, n:l.length };
    return { f, error, mat, czeka, inne, wyd, n:l.length, doSpr:l.filter(x => !x.sprawdzone).length };
  }

  async function ekranPieniadze(fid, msg, info = true){
    const f0 = mieszkanie(fid); if (!f0) return ekranListy();
    if (jestFirma()) return ekranMieszkania(fid);
    app.innerHTML = '<p>Wczytuję pieniądze…</p>';
    const P = await policz(fid), f = P.f;
    const zakup = num(f.cena_zakupu), um = umowa(f), bud = budzet(f), mat = num(f.budzet_materialow);
    const razem = zakup == null ? null : r2(zakup + P.wyd);
    const staryBudzet = num(f.cena_firmy_m2) == null && num(f.budzet_materialow) == null && num(f.budzet) != null;
    const brakuje = [zakup == null && 'cena zakupu', num(f.cena_firmy_m2) == null && 'cena dla firmy za m²', mat == null && 'budżet na materiały'].filter(Boolean);
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Pieniądze – ${esc(f.ulica)}</h1>
      <p class="intro">Tu ${esc(kto())} widzi, ile kosztuje to mieszkanie: cenę zakupu, ile z budżetu remontu jest już wydane i ile mieszkanie kosztuje razem. Budżet remontu to umowa z firmą (cena za m² × metraż) plus budżet na materiały. Do wydanych wchodzą tylko paragony sprawdzone; te „Do sprawdzenia” są pokazane osobno. Po kliknięciu „Zmień kwoty” można poprawić cenę zakupu, cenę dla firmy za m² i budżet na materiały. Szef firmy tych kwot nie widzi.</p>
      ${P.error && !/paragony/i.test(P.error.message || '') ? komunikat(blad(P.error)) : ''}${P.error && /paragony/i.test(P.error.message || '') ? komunikat('Paragony nie są jeszcze włączone w bazie danych, więc wydane pokazują 0 zł. Trzeba wgrać plik 07_paragony.sql w Supabase.', true) : ''}
      ${msg ? komunikat(msg, info) : ''}
      <div class="grid g3" style="margin-bottom:6px">
        <div class="card dark kpi"><small>Zakup</small><div id="kpiZakup">${zl(zakup)}</div></div>
        <div class="card dark kpi"><small>Remont: wydane z budżetu</small><div id="kpiWydane">${zl(P.wyd)} <span style="font-size:13px;font-weight:400">z ${zl(bud)}</span></div>${P.czeka ? `<small>czeka na sprawdzenie: ${zl(P.czeka)}</small>` : ''}</div>
        <div class="card dark kpi"><small>Mieszkanie kosztuje razem</small><div id="kpiRazem">${zl(razem)}</div></div></div>
      <p class="info2" id="liniaFirma" style="margin-bottom:12px">Firma: ${num(f.cena_firmy_m2) == null ? '– zł/m²' : zl(num(f.cena_firmy_m2)) + '/m²'}${um != null ? ' = ' + zl(um) : ''} · materiały: ${zl(mat)}</p>
      ${bud != null ? `<div class="card">${pasekP(Math.min(100, bud > 0 ? Math.round(P.wyd / bud * 100) : 100))}<div class="zw" style="margin-top:6px"><span>Wydane ${bud > 0 ? Math.round(P.wyd / bud * 100) : 0}% budżetu</span><b class="${P.wyd > bud ? 'ostrz' : ''}">${P.wyd > bud ? 'budżet przekroczony o ' + zl(r2(P.wyd - bud)) : 'zostało ' + zl(r2(bud - P.wyd))}</b></div></div>` : ''}
      <style>#skad .row>b{white-space:nowrap;text-align:right}#skad .row>span:first-child{min-width:0}</style><div class="card" id="skad"><b>Skąd te liczby</b>
        <div class="row"><span>Cena zakupu</span><b>${zl(zakup)}</b></div>
        <div class="row"><span>Umowa z firmą${num(f.cena_firmy_m2) != null && num(f.metraz) != null ? ` (${zl(num(f.cena_firmy_m2))} × ${m2(num(f.metraz))})` : ''}</span><b>${zl(um)}</b></div>
        <div class="row"><span>Budżet na materiały</span><b>${zl(mat)}</b></div>
        <div class="row"><span>Budżet remontu razem</span><b>${zl(bud)}${staryBudzet ? ' <small>(z danych mieszkania)</small>' : ''}</b></div>
        <div class="row"><span>Wydane na materiały (paragony sprawdzone)</span><b>${zl(P.mat)}</b></div>
        ${P.inne.map(x => `<div class="row"><span>${esc(x.n)}</span><b>${zl(x.kwota)}</b></div>`).join('')}
        ${P.doSpr ? `<div class="row"><span>Paragony do sprawdzenia (${P.doSpr}) – jeszcze nie liczone</span><b class="ostrz">czeka: ${zl(P.czeka)}</b></div>` : ''}
        ${window.WYDATKI_MIESZKANIA.length ? '' : '<div class="row"><span>Płatności dla firmy</span><span>dojdą razem z zakładką Płatności</span></div>'}
        <div class="row"><span><b>Mieszkanie kosztuje razem</b> (zakup + wydane)</span><b>${zl(razem)}</b></div></div>
      ${num(f.metraz) == null ? '<p class="info2 ostrz">Metraż nie jest wpisany, więc umowy z firmą nie da się policzyć. Metraż wpisuje się w „Zmień dane” mieszkania.</p>' : ''}
      ${brakuje.length ? `<p class="info2">Nie wpisano jeszcze: ${brakuje.join(', ')}. Wpisuje się to po kliknięciu „Zmień kwoty”.</p>` : ''}
      <div class="acts"><button class="btn" id="zmienKwoty">Zmień kwoty</button>${MODULY.some(m => m.k === 'paragony') ? '<button class="btn2" id="doParagonow">Paragony i materiały</button>' : ''}</div>`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    $('#zmienKwoty').onclick = () => ekranKwoty(fid);
    const dp = $('#doParagonow'); if (dp) dp.onclick = () => MODULY.find(m => m.k === 'paragony').ekran(fid);
  }

  function ekranKwoty(fid, msg, wpis){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    const v = wpis || { cena_zakupu:f.cena_zakupu, cena_firmy_m2:f.cena_firmy_m2, budzet_materialow:f.budzet_materialow };
    const pk = (id, et, extra = '') => `<label for="${id}">${et}</label><input id="${id}" inputmode="decimal" value="${esc(v[id] == null ? '' : String(v[id]).replace('.', ','))}" ${extra}>`;
    app.innerHTML = `<button class="btnT" id="wroc">← Pieniądze</button>
      <div class="narrow"><h1>Zmień kwoty · ${esc(f.ulica)}</h1>
      <p class="intro">Tu ${esc(kto())} wpisuje cenę zakupu mieszkania, cenę dla firmy za m² (brutto) i budżet na materiały. Na dole od razu widać, ile dostanie firma i ile wynosi budżet remontu. Puste pole oznacza „jeszcze nie wiadomo”. Po kliknięciu „Zapisz kwoty” otworzy się znowu ekran „Pieniądze” z nowymi liczbami.</p>
      ${msg ? komunikat(msg) : ''}
      <form id="f" novalidate>
        ${pk('cena_zakupu', 'Cena zakupu (zł)', 'placeholder="np. 230000"')}
        ${pk('cena_firmy_m2', 'Cena dla firmy za m² (brutto, zł)', 'placeholder="np. 900"')}
        ${pk('budzet_materialow', 'Budżet na materiały (zł)', 'placeholder="np. 55000"')}
        <div class="card dark" style="margin-top:12px" id="podsumowanie"></div>
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapiszKwoty">Zapisz kwoty</button></div>
      </form></div>`;
    const met = num(f.metraz);
    const licz = () => { const c = liczba($('#cena_firmy_m2').value), m = liczba($('#budzet_materialow').value);
      const cOk = c != null && !Number.isNaN(c), mOk = m == null || !Number.isNaN(m);
      const um = cOk && met != null ? r2(c * met) : null;
      $('#podsumowanie').innerHTML = `Firma dostanie: <b>${um != null ? zl(um) : '–'}</b>${cOk && met != null ? ` (${zl(c)} × ${m2(met)})` : met == null ? ' (brak metrażu – wpisuje się go w „Zmień dane” mieszkania)' : ''}<br>Budżet remontu razem: <b style="color:#B8924A">${(um != null || (m != null && mOk)) ? zl(r2((um || 0) + (mOk && m != null ? m : 0))) : '–'}</b>`; };
    ['cena_firmy_m2', 'budzet_materialow'].forEach(id => $('#' + id).oninput = licz); licz();
    $('#wroc').onclick = $('#anuluj').onclick = () => ekranPieniadze(fid);
    $('#f').onsubmit = async e => {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const raw = { cena_zakupu:$('#cena_zakupu').value, cena_firmy_m2:$('#cena_firmy_m2').value, budzet_materialow:$('#budzet_materialow').value };
      const w = {}, NAZWY = { cena_zakupu:'Cena zakupu', cena_firmy_m2:'Cena dla firmy za m²', budzet_materialow:'Budżet na materiały' }, MAX = { cena_zakupu:9999999999, cena_firmy_m2:99999999, budzet_materialow:9999999999 };
      for (const k of Object.keys(raw)){
        const n = liczba(raw[k]);
        if (Number.isNaN(n) || (n != null && n < 0)) return ekranKwoty(fid, `${NAZWY[k]} musi być liczbą równą lub większą od zera, np. ${k === 'cena_firmy_m2' ? '900' : '230000'}.`, raw);
        if (n != null && n > MAX[k]) return ekranKwoty(fid, `${NAZWY[k]} jest za duża.`, raw);
        w[k] = n == null ? null : r2(n);
      }
      $('#f').classList.add('load');
      const { data, error } = await sb.from('mieszkania').update(w).eq('id', fid).select().single();
      if (error) return ekranKwoty(fid, brakKolumn(error) ? 'Kwoty nie są jeszcze włączone w bazie danych. Trzeba wgrać plik 06_szef_firmy.sql w Supabase.' : blad(error), raw);
      Object.assign(f, data);
      ekranPieniadze(fid, `Kwoty zapisane. Zakup: ${zl(w.cena_zakupu)}, firma: ${w.cena_firmy_m2 == null ? '–' : zl(w.cena_firmy_m2) + '/m²'}, materiały: ${zl(w.budzet_materialow)}.`);
    };
  }

  rejestrujModul({ k:'pieniadze', n:'Pieniądze', firma:false,
    etykieta:fid => { const f = mieszkanie(fid), t = SUMY[fid]; const z = f && num(f.cena_zakupu); return 'Pieniądze' + (z != null ? ' – razem ' + zl(r2(z + ((t && t.wyd) || 0))) : ''); },
    ekran:fid => ekranPieniadze(fid) });
})();
