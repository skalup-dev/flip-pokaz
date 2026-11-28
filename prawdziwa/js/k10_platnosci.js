/* ===== Klocek 10: Płatności dla firmy – umowa (cena za m² × metraż), płatności z etapów, czeka na zapłatę, zapłacone =====
   Korzysta z wczytajEtapy(fid) z klocka 9 (Terminy). */
(function(){
  const gr = n => Math.round(Number(n) * 100);
  const brakTabeli = e => /platnosc|umowa_mieszkania|terminy/i.test((e && e.message) || '') && /find|exist|schema cache|relation|function/i.test((e && e.message) || '');
  const tekstBledu = e => { const m = (e && e.message) || ''; return /^(Etap|Każda|Trzeba|Płatności ustala|Ta sama)/.test(m) ? m + '.' : blad(e); };
  let robocze = null;

  async function wczytaj(fid){
    const [E, u, p, pe] = await Promise.all([ wczytajEtapy(fid), sb.rpc('umowa_mieszkania', { m:fid }),
      sb.from('platnosci').select('*').eq('mieszkanie', fid), sb.from('platnosci_etapy').select('*').eq('mieszkanie', fid) ]);
    const um = (u.data && u.data[0]) || null;
    const etapy = E.etapy, poId = id => etapy.find(e => e.id === id);
    const platnosci = (p.data || []).sort((a, b) => a.nr - b.nr).map((x, i) => {
      const st = (pe.data || []).filter(y => y.platnosc === x.id).map(y => poId(y.termin)).filter(Boolean).sort((a, b) => a.lp - b.lp);
      const stan = x.zaplacona ? 'z' : st.length && st.every(e => e.zrobione) ? 'c' : 'p';
      return { ...x, lp:i + 1, st, stan };
    });
    const blad1 = u.error || p.error || pe.error || E.blad;
    return { blad:blad1, brakTabeli:brakTabeli(blad1) || E.brakTabeli, etapy, platnosci,
      umowa:um && um.kwota != null ? Number(um.kwota) : null, cena:um ? um.cena_firmy_m2 : null, metraz:um ? um.metraz : null };
  }

  const nazwyEt = st => st.map(e => esc(e.nazwa)).join(' + ');
  const umowaTxt = D => D.umowa != null ? `${zl(D.cena)} za m² × ${m2(D.metraz)} = ${zl(D.umowa)}` : '–';
  function brakUmowy(D, F){
    if (D.umowa != null) return '';
    const co = D.cena == null && D.metraz == null ? 'ceny firmy za m² i metrażu' : D.cena == null ? 'ceny firmy za m²' : 'metrażu';
    return komunikat(F ? `Umowa nie jest jeszcze policzona: Właściciel aplikacji nie wpisał ${co}.`
      : `Umowa z firmą nie jest jeszcze policzona: brakuje ${co}. ${D.cena == null ? 'Cenę firmy za m² wpisuje się w „Pieniądze” albo „Zmień dane” mieszkania' : 'Metraż wpisuje się w „Zmień dane” mieszkania'}. Płatności można ustalić już teraz.`, true);
  }
  function porownanie(suma, umowa){
    if (umowa == null) return { ok:false, html:'<span>Umowa nie jest policzona</span>', txt:'Umowa nie jest policzona – nie da się porównać sumy.' };
    const r = gr(umowa) - gr(suma);
    if (!r) return { ok:true, html:'<b>✓ Zgadza się</b>', txt:'✓ Zgadza się' };
    const t = r > 0 ? 'Brakuje ' + zl(r / 100) : 'Za dużo o ' + zl(-r / 100);
    return { ok:false, html:`<span class="late">${t}</span>`, txt:t };
  }

  async function ekranPlatnosci(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję płatności…</p>';
    robocze = null;
    const D = await wczytaj(fid), F = jestFirma();
    const zaplacono = D.platnosci.filter(p => p.zaplacona).reduce((s, p) => s + gr(p.kwota), 0) / 100;
    const bladTxt = D.blad ? komunikat(D.brakTabeli ? 'Płatności nie są jeszcze włączone w bazie danych. Trzeba wgrać pliki 09_terminy.sql i 10_platnosci.sql w Supabase.' : blad(D.blad)) : '';
    const wroc = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>`;
    if (F){
      const proc = D.umowa ? Math.min(100, Math.round(zaplacono / D.umowa * 100)) : 0;
      app.innerHTML = `${wroc}<h1>Płatności – ${esc(f.ulica)}</h1>
        <p class="intro">Tu widać, ile pieniędzy firma remontowa ${esc(kto())} dostała już za całą robotę i za które etapy prac. Płatność czeka na zapłatę, gdy wszystkie jej etapy są skończone. To tylko podgląd – płatności ustala i oznacza jako zapłacone Właściciel aplikacji.</p>
        ${bladTxt}${msg ? komunikat(msg, info) : ''}${brakUmowy(D, true)}
        <div class="card dark"><small>Zapłacone firmie</small><div style="font-size:24px;font-weight:700;color:var(--z)" id="dostali">${zl(zaplacono)}</div>
          <div>z ${D.umowa != null ? zl(D.umowa) : '–'} za całą robotę</div>${pasekP(proc)}<div style="margin-top:6px">Zostało: <b id="zostaloF">${D.umowa != null ? zl((gr(D.umowa) - gr(zaplacono)) / 100) : '–'}</b></div></div>
        <div class="card"><div class="row"><span>Umowa</span><b id="umowa">${umowaTxt(D)}</b></div></div>
        <div class="card" id="lista">${D.platnosci.length ? D.platnosci.map(p => `<div class="row" data-platnosc="${p.lp}"><span><b>Płatność ${p.lp}</b><br><small>${nazwyEt(p.st) || 'bez etapów'}</small></span>
          ${p.stan === 'z' ? `<span style="text-align:right">✓ ${zl(p.kwota)}<br><small>zapłacone ${dataPL(p.zaplacona_kiedy)}</small></span>` : p.stan === 'c' ? `<b style="text-align:right">czeka ${zl(p.kwota)}</b>` : `<span>${zl(p.kwota)}</span>`}</div>`).join('')
          : '<p style="margin:0">Właściciel aplikacji nie ustalił jeszcze płatności. Gdy je ustali, pojawią się tutaj.</p>'}</div>`;
      $('#wroc').onclick = () => ekranMieszkania(fid);
      return;
    }
    const suma = D.platnosci.reduce((s, p) => s + gr(p.kwota), 0) / 100;
    const por = porownanie(suma, D.umowa);
    const bez = D.etapy.filter(e => e.rozliczany && !D.platnosci.some(p => p.st.includes(e)));
    const firma = f.firma_remontowa && f.firma_remontowa.trim() ? ' ' + esc(f.firma_remontowa.trim()) : '';
    app.innerHTML = `${wroc}<h1>Płatności dla firmy – ${esc(f.ulica)}</h1>
      <p class="intro">Tu ${esc(kto())} rozlicza się z firmą remontową${firma}. Umowa to cena firmy za m² razy metraż. Jak rozlicza się z firmą, ${esc(kto())} ustala sam w „Ustal płatności”: łączy etapy prac w płatności i wpisuje kwotę każdej. Płatność sama zaczyna czekać na zapłatę, gdy wszystkie jej etapy są skończone (wszystkie prace odznaczone). Po przelewie trzeba kliknąć „Oznacz jako zapłacone”.</p>
      ${bladTxt}${msg ? komunikat(msg, info) : ''}${brakUmowy(D, false)}
      <div class="grid g3" style="margin-bottom:12px">
        <div class="card dark kpi"><small>Umowa z firmą</small><div id="kUmowa">${D.umowa != null ? zl(D.umowa) : '–'}</div></div>
        <div class="card dark kpi"><small>Zapłacone</small><div id="kZapl">${zl(zaplacono)}</div></div>
        <div class="card dark kpi"><small>Zostało</small><div id="kZost">${D.umowa != null ? zl((gr(D.umowa) - gr(zaplacono)) / 100) : '–'}</div></div>
      </div>
      <div class="card"><div class="row"><span>Umowa</span><b id="umowa">${umowaTxt(D)}</b></div>
        <div class="row"><span>Suma płatności: <b id="suma">${zl(suma)}</b> z umowy ${D.umowa != null ? zl(D.umowa) : '–'}</span><span id="porownanie">${D.platnosci.length ? por.html : ''}</span></div>
        ${bez.length ? `<div class="late" id="bez" style="margin-top:6px">Etapy bez płatności: ${bez.map(e => esc(e.nazwa)).join(', ')}</div>` : ''}
        <button class="btn" style="margin-top:10px" id="ustal">Ustal płatności</button></div>
      ${D.platnosci.length ? D.platnosci.map(p => { const zost = p.st.filter(e => !e.zrobione).map(e => esc(e.nazwa));
        return `<div class="card" data-platnosc="${p.lp}"><div class="zw"><b>Płatność ${p.lp}</b><b>${zl(p.kwota)}</b></div>
          <div style="font-size:14px;margin:6px 0">${p.st.map(e => (e.zrobione ? '✓ ' : '○ ') + esc(e.nazwa)).join('<br>')}</div>
          ${p.stan === 'z' ? `<div><b>✓ Zapłacone ${dataPL(p.zaplacona_kiedy)}</b></div><button class="btn2" style="margin-top:8px" data-odznacz="${p.id}">Odznacz – to nie jest zapłacone</button>`
          : p.stan === 'c' ? `<div><b>Wszystkie etapy skończone – czeka na zapłatę</b></div><button class="btn" style="margin-top:8px" data-zaplac="${p.id}">Oznacz jako zapłacone</button>`
          : `<div>Czeka na koniec: ${zost.join(', ') || '–'}</div>`}</div>`; }).join('')
        : `<div class="card empty"><b>Nie ma jeszcze płatności.</b><br>Po kliknięciu „Ustal płatności” ${esc(kto())} połączy etapy prac w płatności i wpisze kwoty. Firma zobaczy je od razu.</div>`}
      <p class="info2">Aplikacja sama nie wykonuje przelewów.</p>`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    $('#ustal').onclick = () => { robocze = D.platnosci.map(p => ({ id:p.id, k:String(p.kwota).replace('.', ','), st:p.st.map(e => e.id), z:p.zaplacona, kw0:gr(p.kwota), st0:p.st.map(e => e.id).sort().join() })); if (!robocze.length) robocze.push({ id:null, k:'', st:[] }); ekranUstal(fid, D); };
    const zmien = (b, tak) => async () => {
      b.disabled = true; const p = D.platnosci.find(x => x.id === (tak ? b.dataset.zaplac : b.dataset.odznacz));
      const { error } = await sb.from('platnosci').update({ zaplacona:tak }).eq('id', p.id);
      ekranPlatnosci(fid, error ? blad(error) : tak ? `Płatność ${p.lp} (${zl(p.kwota)}) oznaczona jako zapłacona. Firma widzi to w Płatnościach.` : `Odznaczono – płatność ${p.lp} nie jest zapłacona.`, !error);
    };
    app.querySelectorAll('[data-zaplac]').forEach(b => b.onclick = zmien(b, true));
    app.querySelectorAll('[data-odznacz]').forEach(b => b.onclick = zmien(b, false));
  }

  function podsumowanie(D){
    const suma = robocze.reduce((s, r) => { const n = liczba(r.k); return s + (n > 0 ? gr(n) : 0); }, 0) / 100;
    const por = porownanie(suma, D.umowa);
    const bez = D.etapy.filter(e => e.rozliczany && !robocze.some(r => r.st.includes(e.id)));
    return `Suma płatności: <b>${zl(suma)}</b> z umowy ${D.umowa != null ? zl(D.umowa) : '–'}<br><b>${esc(por.txt)}</b><br>${bez.length ? 'Etapy bez płatności: ' + bez.map(e => esc(e.nazwa)).join(', ') : '✓ Wszystkie etapy mają płatność'}`;
  }
  function czytaj(){ robocze.forEach((r, i) => { const el = $('#etK-' + i); if (el) r.k = el.value; }); }

  function ekranUstal(fid, D, msg){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    const lista = D.etapy.filter(e => e.rozliczany || robocze.some(r => r.st.includes(e.id)));
    app.innerHTML = `<button class="btnT" id="wroc">← Płatności</button>
      <h1>Ustal płatności – ${esc(f.ulica)}</h1>
      <p class="intro">Tu ${esc(kto())} ustala, jak rozlicza się z firmą: przy każdej płatności zaznacza etapy prac, które do niej wchodzą, i wpisuje kwotę. Etap może być tylko w jednej płatności. Płatność czeka na zapłatę, gdy wszystkie jej etapy są skończone. Zmiana kwoty albo etapów płatności zapłaconej zdejmuje „zapłacone”. Po kliknięciu „Zapisz płatności” otworzą się znowu Płatności, a firma od razu je zobaczy.</p>
      ${msg ? komunikat(msg) : ''}
      ${lista.length ? '' : komunikat('To mieszkanie nie ma jeszcze etapów z pracami. Etapy biorą się z listy prac (krok 4 przy dodawaniu mieszkania) albo z „+ Dodaj etap” w Terminach.', true)}
      <div id="etL">${robocze.map((r, i) => `<div class="card" data-robocza="${i}"><div class="zw"><b>Płatność ${i + 1}</b><button class="btn2" style="padding:6px 12px" data-usunp="${i}">Usuń</button></div>
        ${r.z ? '<p class="info2">Ta płatność jest zapłacona. Zmiana kwoty albo etapów zdejmie „zapłacone”.</p>' : ''}
        <label for="etK-${i}">Kwota (zł)</label><input id="etK-${i}" inputmode="decimal" value="${esc(r.k)}" placeholder="np. 15000">
        <label>Etapy prac w tej płatności</label>
        ${lista.map(e => { const inna = robocze.findIndex((q, k) => k !== i && q.st.includes(e.id)), on = r.st.includes(e.id);
          return `<div class="pr" style="${inna >= 0 ? 'opacity:.45' : ''}"><button class="box${on ? ' on' : ''}" data-tog="${i}:${e.id}" ${inna >= 0 ? 'disabled' : ''} aria-label="${on ? 'Odznacz' : 'Zaznacz'} etap ${esc(e.nazwa)} w płatności ${i + 1}">${on ? '✓' : ''}</button>
            <div class="tx">${esc(e.nazwa)}${inna >= 0 ? ` <small>(w płatności ${inna + 1})</small>` : ''}</div></div>`; }).join('')}</div>`).join('')}</div>
      <button class="btn2 full" id="dodajP">+ Dodaj płatność</button>
      <div class="card dark" style="margin-top:10px" id="etS">${podsumowanie(D)}</div>
      <div class="acts"><button class="btn2" id="anuluj">Anuluj</button><button class="btn" id="zapiszP">Zapisz płatności</button></div>`;
    $('#wroc').onclick = $('#anuluj').onclick = () => ekranPlatnosci(fid);
    app.querySelectorAll('[id^="etK-"]').forEach(el => el.oninput = () => { czytaj(); $('#etS').innerHTML = podsumowanie(D); });
    app.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => {
      czytaj(); const [i, id] = b.dataset.tog.split(':'); const r = robocze[+i];
      if (robocze.some((q, k) => k !== +i && q.st.includes(id))) return ekranUstal(fid, D, 'Ten etap jest już w innej płatności. Etap może być tylko w jednej płatności.');
      r.st = r.st.includes(id) ? r.st.filter(x => x !== id) : [...r.st, id]; ekranUstal(fid, D);
    });
    app.querySelectorAll('[data-usunp]').forEach(b => b.onclick = () => { czytaj(); robocze.splice(+b.dataset.usunp, 1); ekranUstal(fid, D); });
    $('#dodajP').onclick = () => { czytaj(); robocze.push({ id:null, k:'', st:[] }); ekranUstal(fid, D); };
    $('#zapiszP').onclick = async () => {
      czytaj();
      if (!robocze.length) return ekranUstal(fid, D, 'Trzeba dodać co najmniej jedną płatność.');
      for (let i = 0; i < robocze.length; i++){
        const n = liczba(robocze[i].k);
        if (n == null || Number.isNaN(n) || n <= 0) return ekranUstal(fid, D, `Płatność ${i + 1}: kwota musi być liczbą większą od zera, np. 15000 albo 12 500,50.`);
        if (!robocze[i].st.length) return ekranUstal(fid, D, `Płatność ${i + 1}: trzeba zaznaczyć co najmniej jeden etap.`);
      }
      const wszystkie = robocze.flatMap(r => r.st);
      const dwa = wszystkie.find((id, i) => wszystkie.indexOf(id) !== i);
      if (dwa){ const e = D.etapy.find(x => x.id === dwa); return ekranUstal(fid, D, `Etap „${e ? e.nazwa : ''}” jest w dwóch płatnościach. Etap może być tylko w jednej płatności.`); }
      const dane = robocze.map(r => ({ id:r.id, kwota:Math.round(liczba(r.k) * 100) / 100, etapy:r.st }));
      const zdjete = robocze.map((r, i) => r.z && (gr(liczba(r.k)) !== r.kw0 || [...r.st].sort().join() !== r.st0) ? i + 1 : 0).filter(Boolean);
      $('#zapiszP').disabled = true;
      const { error } = await sb.rpc('zapisz_platnosci', { m:fid, dane });
      if (error) return ekranUstal(fid, D, tekstBledu(error));
      ekranPlatnosci(fid, `Płatności zapisane (${robocze.length}). Firma widzi je w Płatnościach.` + (zdjete.length ? ` ${zdjete.length > 1 ? 'Płatności ' + zdjete.join(', ') + ' przestały być zapłacone' : 'Płatność ' + zdjete[0] + ' przestała być zapłacona'}, bo zmieniła się kwota albo etapy.` : ''));
    };
  }

  rejestrujModul({ k:'platnosci', n:'Płatności', firma:true, ekran:fid => ekranPlatnosci(fid) });
  // Klocek 8 (Pieniądze): zapłacone płatności dla firmy wchodzą do „wydane z budżetu”
  window.WYDATKI_MIESZKANIA = window.WYDATKI_MIESZKANIA || [];
  window.WYDATKI_MIESZKANIA.push(async fid => {
    const { data, error } = await sb.from('platnosci').select('kwota,zaplacona').eq('mieszkanie', fid);
    if (error || !data || !data.length) return null;
    const kw = Math.round(data.filter(p => p.zaplacona).reduce((a, p) => a + Number(p.kwota) * 100, 0)) / 100;
    return { n:'Płatności dla firmy (zapłacone)', kwota:kw };
  });
})();
