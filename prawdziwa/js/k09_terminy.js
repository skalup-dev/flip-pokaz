/* ===== Klocek 9: Terminy – 7 etapów remontu przez całe mieszkanie, daty od–do, stan etapów, przewidywany koniec =====
   Udostępnia też wczytajEtapy(fid) – z niej korzysta klocek 10 (Płatności). */
(function(){
  const DZIEN = 86400000;
  const dni = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...a.split('-').map((x, i) => i === 1 ? x - 1 : +x))) / DZIEN);
  const plusDni = (d, n) => { const [y, m, x] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, x + n)).toISOString().slice(0, 10); };
  const ileDni = n => n + ' ' + (n === 1 ? 'dzień' : 'dni');
  const dzienLokalny = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const brakTabeli = e => /terminy/i.test((e && e.message) || '') && /find|exist|schema cache|relation/i.test((e && e.message) || '');
  let otwarty = null;

  /* Etapy mieszkania: 1–7 z listy prac (prace.etap) + etapy dodane przez Właściciela aplikacji.
     Etap 1–7 skończony = ma prace i wszystkie są odznaczone. Etap dodany skończony = odznaczony ręcznie (zrobiony). */
  async function wczytajEtapy(fid){
    const L = await wczytajPrace(fid);
    let r = await sb.from('terminy').select('*').eq('mieszkanie', fid);
    if (!r.error && !jestFirma()){
      const brak = [1, 2, 3, 4, 5, 6, 7].filter(n => !(r.data || []).some(t => t.nr === n));
      if (brak.length){ await sb.from('terminy').insert(brak.map(nr => ({ mieszkanie:fid, nr }))); r = await sb.from('terminy').select('*').eq('mieszkanie', fid); }
    }
    const wiersze = r.data || [], d = dzis();
    const stale = [1, 2, 3, 4, 5, 6, 7].map(nr => wiersze.find(t => t.nr === nr) || { id:null, nr, data_od:null, data_do:null, zrobiony:false });
    const dodane = wiersze.filter(t => t.nr == null).sort((a, b) => (a.data_od || '9999').localeCompare(b.data_od || '9999') || a.nazwa.localeCompare(b.nazwa, 'pl', { numeric:true }));
    const etapy = [...stale, ...dodane].map((t, i) => {
      const prace = t.nr ? L.prace.filter(x => x.etap === t.nr) : [];
      const pom = L.pom.map(p => { const w = prace.filter(x => x.pomieszczenie === p.id).sort(poNazwie); return { p, prace:w, z:w.filter(x => x.zrobiona).length }; }).filter(x => x.prace.length);
      const gotowe = pom.filter(x => x.z === x.prace.length).length;
      const zrobione = t.nr ? prace.length > 0 && prace.every(x => x.zrobiona) : !!t.zrobiony;
      const koniec = t.nr && zrobione ? prace.map(x => x.zrobiona_kiedy).filter(Boolean).map(dzienLokalny).sort().pop() || null : null;
      const spoznione = !zrobione && t.data_do && t.data_do < d ? dni(t.data_do, d) : 0;
      const poTerminie = zrobione && koniec && t.data_do && koniec > t.data_do ? dni(t.data_do, koniec) : 0;
      const stan = zrobione ? 'zrobione' : t.nr && !prace.length ? 'brak' : spoznione ? 'spoznione' : prace.some(x => x.zrobiona) ? 'trakcie' : 'czeka';
      return { ...t, lp:i + 1, nazwa:t.nr ? ETAPY[t.nr - 1] : t.nazwa, dodany:!t.nr, prace, pom, gotowe, zrobione, koniec, spoznione, poTerminie, stan,
        rozliczany:!!t.id && (!t.nr || prace.length > 0) };
    });
    return { blad:L.blad || r.error, brakTabeli:brakTabeli(r.error), etapy, prace:L.prace, pom:L.pom };
  }
  window.wczytajEtapy = wczytajEtapy;

  /* Przewidywany koniec: plan (później z: termin końca, najpóźniejsza data „do” etapu) + opóźnienie.
     Opóźnienie = największe z: dni po dacie „do” etapów, które jeszcze trwają, i dni, o które spóźnił się ostatnio skończony etap. */
  function prognoza(f, etapy){
    const d = dzis(), doZrob = etapy.filter(e => e.stan !== 'brak');
    if (doZrob.length && doZrob.every(e => e.zrobione)){
      const k = doZrob.map(e => e.koniec).filter(Boolean).sort().pop();
      return { skonczony:true, data:k || null };
    }
    const daty = [f.termin_konca, ...etapy.map(e => e.data_do)].filter(Boolean).sort();
    const plan = daty.pop() || null;
    if (!plan) return { data:null };
    const ostatni = etapy.filter(e => e.zrobione && e.koniec).sort((a, b) => a.koniec.localeCompare(b.koniec)).pop();
    const op = Math.max(0, ...etapy.map(e => e.spoznione), ostatni ? ostatni.poTerminie : 0);
    let p = plusDni(plan, op); if (p < d) p = d;
    return { data:p, opoznienie:op };
  }

  const stanHTML = e => e.stan === 'zrobione' ? '<b>✓ Zrobione</b>' : e.stan === 'spoznione' ? `<span class="late">Spóźnione ${ileDni(e.spoznione)}</span>`
    : e.stan === 'trakcie' ? '<span>W trakcie</span>' : e.stan === 'brak' ? '<span>Brak prac</span>' : '<span>Czeka</span>';
  const datyHTML = e => e.data_od || e.data_do ? `${dt(e.data_od)} – ${dt(e.data_do)}` : 'daty nie są wpisane';
  const gotoweHTML = e => e.dodany ? 'etap dodany, bez prac z listy prac' : e.pom.length ? `gotowe pomieszczenia: ${e.gotowe} z ${e.pom.length}` : 'w tym etapie nie ma prac';

  async function ekranTerminy(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję terminy…</p>';
    const E = await wczytajEtapy(fid), F = jestFirma(), d = dzis();
    const P = prognoza(f, E.etapy);
    const zostalo = f.termin_konca ? dni(d, f.termin_konca) : null;
    const pozno = P.data && f.termin_konca && !P.skonczony && P.data > f.termin_konca;
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Terminy – ${esc(f.ulica)}</h1>
      <p class="intro">${F ? `Tu ${esc(kto())} widzi, kiedy ma się skończyć remont i jak idą etapy prac. Remont idzie etapami przez całe mieszkanie. Po kliknięciu etapu rozwiną się pomieszczenia i prace tego etapu. To tylko podgląd – daty etapów ustala Właściciel aplikacji.`
        : `Remont idzie etapami przez całe mieszkanie. Przy każdym etapie widać daty od–do, ile pomieszczeń jest już gotowych i stan etapu. Po kliknięciu etapu rozwiną się pomieszczenia i prace. Gdy etap się spóźnia, widać to od razu, a przewidywany koniec liczy się sam. Daty zmienia przycisk „Zmień daty”, nowy etap dodaje „+ Dodaj etap”.`}</p>
      ${E.blad ? komunikat(E.brakTabeli ? 'Terminy nie są jeszcze włączone w bazie danych. Trzeba wgrać plik 09_terminy.sql w Supabase.' : blad(E.blad)) : ''}${msg ? komunikat(msg, info) : ''}
      <div class="grid g3" style="margin-bottom:6px">
        <div class="card kpi"><small>Koniec remontu</small><div id="tKoniec">${dt(f.termin_konca)}</div></div>
        <div class="card kpi"><small>${zostalo != null && zostalo < 0 ? 'Po terminie' : 'Zostało'}</small><div id="tZostalo">${zostalo == null ? '–' : zostalo < 0 ? `<span class="late">${ileDni(-zostalo)}</span>` : ileDni(zostalo)}</div></div>
        <div class="card kpi"><small>${P.skonczony ? 'Remont skończony' : 'Przewidywany koniec'}</small><div id="tPrognoza">${P.data ? (pozno ? `<span class="late">${dt(P.data)}</span>` : dt(P.data)) : '–'}</div></div>
      </div>
      <p class="info2" style="margin-bottom:12px">${f.termin_konca ? '' : (F ? 'Właściciel aplikacji nie wpisał jeszcze terminu końca remontu. ' : 'Termin końca remontu wpisuje się w „Zmień dane” mieszkania. ')}${P.skonczony ? 'Wszystkie etapy są skończone.' : P.data ? `Przewidywany koniec liczy się sam: termin końca (albo najpóźniejsza data etapu) plus opóźnienie etapów${P.opoznienie ? ` – teraz ${ileDni(P.opoznienie)}` : ' – teraz brak opóźnienia'}.` : 'Przewidywany koniec policzy się, gdy będzie wpisany termin końca albo daty etapów.'}</p>
      ${E.prace.length ? '' : `<div class="card empty"><b>To mieszkanie nie ma jeszcze listy prac.</b><br>Stan etapów liczy się z listy prac: etap jest zrobiony, gdy wszystkie jego prace są odznaczone. Daty etapów można wpisać już teraz.</div>`}
      <div id="etapy">${E.etapy.map((e, i) => `<div class="card" data-etap="${i}">
        <button class="zw" data-otworz="${i}" aria-expanded="${otwarty === i}"><span><b>${e.lp}. ${esc(e.nazwa)}</b><small style="display:block">${datyHTML(e)} · ${gotoweHTML(e)}</small></span>${stanHTML(e)}</button>
        ${otwarty === i ? (e.dodany ? `<p class="info2">Ten etap dodał Właściciel aplikacji. Nie ma w nim prac z listy prac – jest zrobiony, gdy Właściciel aplikacji go odznaczy.</p>
            ${F ? '' : `<div class="acts"><button class="${e.zrobiony ? 'btn2' : 'btn'}" data-zrobiony="${i}">${e.zrobiony ? 'Odznacz' : 'Oznacz jako zrobiony'}</button><button class="btn2" data-usun="${i}">Usuń etap</button></div>`}`
          : e.pom.length ? e.pom.map(x => `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--z)"><div class="zw"><b>${esc(x.p.nazwa)}</b><small>${x.z} z ${x.prace.length}</small></div>
              ${x.prace.map(w => `<div style="padding:3px 0 3px 4px">${w.zrobiona ? '✓' : '○'} ${esc(w.nazwa)}</div>`).join('')}</div>`).join('')
          : '<p class="info2">W tym etapie nie ma prac w żadnym pomieszczeniu.</p>')
          : `<div class="info2" style="color:var(--z)">Pokaż pomieszczenia ›</div>`}
        ${e.zrobione && e.poTerminie ? `<p class="info2">Skończony ${dt(e.koniec)} – ${ileDni(e.poTerminie)} po dacie „do”.</p>` : ''}</div>`).join('')}</div>
      ${F ? '' : '<div class="acts"><button class="btn" id="dodajEtap">+ Dodaj etap</button><button class="btn2" id="zmienDaty">Zmień daty</button></div>'}`;
    $('#wroc').onclick = () => { otwarty = null; ekranMieszkania(fid); };
    app.querySelectorAll('[data-otworz]').forEach(b => b.onclick = () => { const i = +b.dataset.otworz; otwarty = otwarty === i ? null : i; ekranTerminy(fid); });
    if (F) return;
    $('#dodajEtap').onclick = () => ekranDodajEtap(fid);
    $('#zmienDaty').onclick = () => ekranZmienDaty(fid, E.etapy);
    app.querySelectorAll('[data-zrobiony]').forEach(b => b.onclick = async () => {
      b.disabled = true; const e = E.etapy[+b.dataset.zrobiony];
      const { error } = await sb.from('terminy').update({ zrobiony:!e.zrobiony }).eq('id', e.id);
      ekranTerminy(fid, error ? blad(error) : e.zrobiony ? `Odznaczono: etap „${e.nazwa}” nie jest zrobiony.` : `Etap „${e.nazwa}” jest zrobiony.`, !error);
    });
    app.querySelectorAll('[data-usun]').forEach(b => b.onclick = () => ekranUsunEtap(fid, E.etapy[+b.dataset.usun]));
  }

  function sprawdzDaty(od, doo, nazwa){
    if (od && doo && doo < od) return `Etap „${nazwa}”: data „do” nie może być wcześniej niż data „od”.`;
    return null;
  }

  function ekranZmienDaty(fid, etapy, msg, wpis){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    const v = (e, i, k) => wpis ? wpis[i][k] : (e[k] || '');
    app.innerHTML = `<button class="btnT" id="wroc">← Terminy</button>
      <h1>Zmiana dat etapów</h1>
      <p class="intro">Tu ${esc(kto())} wpisuje daty od–do każdego etapu remontu mieszkania ${esc(f.ulica)}. Datę można zostawić pustą. Po kliknięciu „Zapisz daty” otworzą się znowu Terminy, a stan etapów i przewidywany koniec policzą się od nowa.</p>
      ${msg ? komunikat(msg) : ''}
      <form id="f" novalidate>${etapy.map((e, i) => `<div class="card">
        ${e.dodany ? `<label for="n-${i}">Nazwa etapu ${e.lp}</label><input id="n-${i}" maxlength="80" value="${esc(v(e, i, 'nazwa'))}">` : `<b>${e.lp}. ${esc(e.nazwa)}</b>`}
        <div class="grid g2"><div><label for="od-${i}">Od</label><input id="od-${i}" type="date" value="${esc(v(e, i, 'data_od'))}"></div>
        <div><label for="do-${i}">Do</label><input id="do-${i}" type="date" value="${esc(v(e, i, 'data_do'))}"></div></div></div>`).join('')}
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapisz">Zapisz daty</button></div></form>`;
    $('#wroc').onclick = $('#anuluj').onclick = () => ekranTerminy(fid);
    $('#f').onsubmit = async ev => {
      ev.preventDefault();
      const w = etapy.map((e, i) => ({ nazwa:e.dodany ? $('#n-' + i).value.trim() : e.nazwa, data_od:$('#od-' + i).value || '', data_do:$('#do-' + i).value || '' }));
      for (let i = 0; i < etapy.length; i++){
        if (etapy[i].dodany && !w[i].nazwa) return ekranZmienDaty(fid, etapy, `Etap ${etapy[i].lp} musi mieć nazwę.`, w);
        const b = sprawdzDaty(w[i].data_od, w[i].data_do, w[i].nazwa || etapy[i].nazwa); if (b) return ekranZmienDaty(fid, etapy, b, w);
      }
      $('#f').classList.add('load');
      let n = 0;
      for (let i = 0; i < etapy.length; i++){
        const e = etapy[i], z = { data_od:w[i].data_od || null, data_do:w[i].data_do || null };
        if (e.dodany) z.nazwa = w[i].nazwa;
        if ((e.data_od || null) === z.data_od && (e.data_do || null) === z.data_do && (!e.dodany || e.nazwa === z.nazwa)) continue;
        const r = e.id ? await sb.from('terminy').update(z).eq('id', e.id) : await sb.from('terminy').insert({ mieszkanie:fid, nr:e.nr, ...z });
        if (r.error) return ekranZmienDaty(fid, etapy, blad(r.error), w);
        n++;
      }
      ekranTerminy(fid, n ? `Daty zapisane (zmienione etapy: ${n}). Stan etapów i przewidywany koniec są policzone od nowa.` : 'Nic się nie zmieniło – daty zostały takie same.');
    };
  }

  function ekranDodajEtap(fid, msg, wpis){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    const v = wpis || {};
    app.innerHTML = `<button class="btnT" id="wroc">← Terminy</button>
      <div class="narrow"><h1>Nowy etap</h1>
      <p class="intro">Tu ${esc(kto())} dodaje własny etap remontu mieszkania ${esc(f.ulica)}, np. odbiór mieszkania. Wymagana jest tylko nazwa, daty można wpisać później. Taki etap nie ma prac z listy prac – jest zrobiony, gdy ${esc(kto())} go odznaczy. Po kliknięciu „Dodaj etap” otworzą się znowu Terminy.</p>
      ${msg ? komunikat(msg) : ''}
      <form id="f" novalidate><label for="nazwa">Nazwa etapu *</label><input id="nazwa" maxlength="80" value="${esc(v.nazwa || '')}" placeholder="np. Odbiór mieszkania">
        <div class="grid g2"><div><label for="od">Od</label><input id="od" type="date" value="${esc(v.data_od || '')}"></div><div><label for="do">Do</label><input id="do" type="date" value="${esc(v.data_do || '')}"></div></div>
        <div class="acts"><button type="button" class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapisz">Dodaj etap</button></div></form></div>`;
    $('#wroc').onclick = $('#anuluj').onclick = () => ekranTerminy(fid);
    $('#f').onsubmit = async ev => {
      ev.preventDefault();
      const w = { nazwa:$('#nazwa').value.trim(), data_od:$('#od').value || '', data_do:$('#do').value || '' };
      if (!w.nazwa) return ekranDodajEtap(fid, 'Trzeba wpisać nazwę etapu.', w);
      const b = sprawdzDaty(w.data_od, w.data_do, w.nazwa); if (b) return ekranDodajEtap(fid, b, w);
      $('#f').classList.add('load');
      const { error } = await sb.from('terminy').insert({ mieszkanie:fid, nazwa:w.nazwa, data_od:w.data_od || null, data_do:w.data_do || null });
      if (error) return ekranDodajEtap(fid, blad(error), w);
      ekranTerminy(fid, `Etap „${w.nazwa}” dodany. Jest na końcu listy etapów.`);
    };
  }

  function ekranUsunEtap(fid, e, msg){
    app.innerHTML = `<div class="narrow" style="margin:auto"><h1>Usunąć etap?</h1>
      <p class="intro">Etap <b>${esc(e.nazwa)}</b> zniknie z Terminów. Etapy 1–7 zostają zawsze. Po usunięciu otworzą się znowu Terminy.</p>
      ${msg ? komunikat(msg) : ''}
      <div class="acts"><button class="btn2" id="nie">Nie, wróć</button><button class="btn" id="tak">Tak, usuń etap</button></div></div>`;
    $('#nie').onclick = () => ekranTerminy(fid);
    $('#tak').onclick = async () => {
      $('#tak').disabled = true;
      const { error } = await sb.from('terminy').delete().eq('id', e.id);
      if (error) return ekranUsunEtap(fid, e, /płatności/.test(error.message || '') ? 'Ten etap jest w płatności. Najpierw trzeba go zdjąć z płatności w „Płatności” › „Ustal płatności”.' : blad(error));
      otwarty = null; ekranTerminy(fid, `Etap „${e.nazwa}” usunięty.`);
    };
  }

  rejestrujModul({ k:'terminy', n:'Terminy', firma:true, ekran:fid => { otwarty = null; ekranTerminy(fid); } });
})();
