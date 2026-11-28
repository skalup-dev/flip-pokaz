/* ===== Klocek 13: Powiadomienia – dzwonek w górnym pasku, lista zdarzeń, ustawienia ===== */
(function(){
  const st = document.createElement('style');
  st.textContent = `
.top .dzwonek{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:5px 9px}
.top .dzwonek svg{width:20px;height:20px;display:block}
.top .dzwonek b{position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--k);color:var(--c);border:1px solid var(--z);font-size:12px;line-height:18px;text-align:center}
.top .dzwonek b:empty{display:none}
.okno-pow{position:fixed;inset:0;z-index:60;background:rgba(30,26,23,.75);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}
.okno-pow .pudlo{background:var(--k);color:var(--c);border:1px solid var(--z);border-radius:14px;padding:16px;width:100%;max-width:560px;margin:auto 0}
.okno-pow h2{margin:0}
.okno-pow .gora{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
.okno-pow .gora .btn2{flex:none}
.zd{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--z);padding:10px 0;color:var(--c);cursor:pointer}
.zd .tx{flex:1;min-width:0;overflow-wrap:anywhere}
.zd small{display:block;font-size:12px;font-weight:400;margin-top:2px}
.zd .str{flex:none;color:var(--z);font-weight:700;font-size:20px}
.zd.nowe .tx{font-weight:700}
.zd.nowe .tx::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;border:2px solid var(--z);margin-right:7px;vertical-align:1px}
#powLista{margin:8px 0 12px}
.okno-pow .kr label{font-weight:400}
.okno-pow .btn2:disabled{border-style:dashed;cursor:default}`;
  document.head.appendChild(st);

  const DZWONEK = '<svg viewBox="0 0 24 24" fill="none" stroke="#B8924A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const P = window.POWIADOMIENIA = { lista:[], nowe:[], ust:null, bazaGotowa:true, odswiez, otworzOkno };
  let timer = null;

  function przycisk(){
    let b = $('#dzwonek');
    if (!b){
      b = document.createElement('button');
      b.id = 'dzwonek'; b.className = 'btn2 dzwonek hide'; b.type = 'button';
      b.innerHTML = DZWONEK + '<b id="dzwonekN"></b>';
      b.onclick = () => otworzOkno();
      $('#mojeDane').before(b);
    }
    return b;
  }
  function licznik(){
    const b = przycisk(), n = P.nowe.length, pokaz = !(P.ust && P.ust.dzwonek === false);
    $('#dzwonekN').textContent = n && pokaz ? (n > 99 ? '99+' : String(n)) : '';
    b.setAttribute('aria-label', 'Powiadomienia' + (n ? `: nowe ${n}` : ''));
    b.title = n ? `Powiadomienia – nowe: ${n}` : 'Powiadomienia';
    if (window.CHAT && CHAT.etykietaOgolny) CHAT.etykietaOgolny();
  }

  async function odswiez(){
    if (!S.user || !sb) return;
    const [z, u] = await Promise.all([
      sb.from('zdarzenia').select('*').order('utworzono', { ascending:false }).limit(100),
      sb.from('ustawienia_powiadomien').select('*') ]);
    P.bazaGotowa = !z.error;
    P.czytane = P.czytane || new Set();
    P.lista = (z.data || []).sort((a, b) => String(b.utworzono).localeCompare(String(a.utworzono)));
    P.lista.forEach(x => { if (P.czytane.has(x.id)) x.przeczytane = true; });
    P.nowe = P.lista.filter(x => !x.przeczytane);
    P.ust = (u.data && u.data[0]) || null;
    licznik();
    const o = $('#oknoPow'); if (o) rysuj();
  }

  function zamknij(){ const o = $('#oknoPow'); if (o){ o.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', klawisz); } }
  function klawisz(e){ if (e.key === 'Escape') zamknij(); }

  function otworzOkno(){
    if (!S.user) return;
    zamknij();
    const o = document.createElement('div'); o.className = 'okno-pow'; o.id = 'oknoPow';
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'powTytul');
    o.onclick = e => { if (e.target === o) zamknij(); };
    document.body.appendChild(o); document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', klawisz);
    rysuj(); odswiez();
  }

  const ulica = fid => { const f = fid && mieszkanie(fid); return f ? f.ulica : ''; };
  function rysuj(msg){
    const o = $('#oknoPow'); if (!o) return;
    const u = P.ust || { dzwonek:true, telefon:true, telegram:true };
    const n = P.nowe.length;
    o.innerHTML = `<div class="pudlo">
      <div class="gora"><h2 id="powTytul">Powiadomienia${n ? ` (nowe: ${n})` : ''}</h2><button class="btn2" id="powZamknij">Zamknij</button></div>
      <p class="intro">Tu są zdarzenia ze wszystkich mieszkań, najnowsze na górze: skończony etap, paragon albo faktura, wiadomość, odznaczona praca, poprawka i opóźnienie. Nowe są pogrubione. Po kliknięciu zdarzenia otworzy się właściwe miejsce w aplikacji, a zdarzenie stanie się przeczytane.</p>
      ${!P.bazaGotowa ? komunikat('Powiadomienia nie są jeszcze włączone w bazie danych. Trzeba wgrać plik 06_reszta.sql w Supabase.') : ''}${msg ? komunikat(msg, true) : ''}
      <button class="btn2 full" id="powWszystkie" ${n ? '' : 'disabled'}>Oznacz wszystkie jako przeczytane</button>
      <div id="powLista">${P.lista.length ? P.lista.map(z => `<button class="zd ${z.przeczytane ? '' : 'nowe'}" data-zd="${esc(z.id)}">
          <span class="tx">${esc(z.tresc)}<small>${ulica(z.mieszkanie) ? esc(ulica(z.mieszkanie)) + ' · ' : z.rodzaj === 'ogolny' ? 'Chat ogólny · ' : ''}${czas(z.utworzono)}</small></span><span class="str">›</span></button>`).join('')
        : '<div class="card empty"><b>Nie ma jeszcze żadnych powiadomień.</b><br>Gdy coś się wydarzy w mieszkaniu (wiadomość, odznaczona praca, paragon, skończony etap), pojawi się tutaj, a na dzwonku pokaże się liczba nowych.</div>'}</div>
      <div class="card"><b>Ustawienia powiadomień</b>
        <div class="kr"><input type="checkbox" id="ustDzwonek" ${u.dzwonek ? 'checked' : ''}><label for="ustDzwonek">Dzwonek w aplikacji – wszystkie zdarzenia (liczba nowych na dzwonku)</label></div>
        <div class="kr"><input type="checkbox" id="ustTelefon" ${u.telefon ? 'checked' : ''}><label for="ustTelefon">Telefon – powiadomienie z dźwiękiem, wszystkie zdarzenia</label></div>
        <div class="kr"><input type="checkbox" id="ustTelegram" ${u.telegram ? 'checked' : ''}><label for="ustTelegram">Telegram – tylko „Etap skończony”</label></div>
        <p class="info2">Zmiana zapisuje się od razu po kliknięciu. Powiadomienia na telefon i na Telegram zaczną przychodzić, gdy zostaną podłączone – to osobny krok. Do tego czasu wszystkie zdarzenia są tutaj, w dzwonku.</p></div>
      <button class="btn full" id="powZamknij2">Zamknij</button></div>`;
    $('#powZamknij').onclick = zamknij; $('#powZamknij2').onclick = zamknij;
    $('#powWszystkie').onclick = async () => {
      const b = $('#powWszystkie'); b.disabled = true;
      const { error } = await sb.from('zdarzenia').update({ przeczytane:true }).eq('przeczytane', false);
      if (error) return rysuj(blad(error));
      P.lista.forEach(x => { x.przeczytane = true; (P.czytane = P.czytane || new Set()).add(x.id); }); P.nowe = []; licznik();
      rysuj('Wszystkie powiadomienia są przeczytane.');
    };
    o.querySelectorAll('[data-zd]').forEach(b => b.onclick = async () => {
      const z = P.lista.find(x => String(x.id) === b.dataset.zd); if (!z) return;
      if (!z.przeczytane){ z.przeczytane = true; (P.czytane = P.czytane || new Set()).add(z.id); P.nowe = P.lista.filter(x => !x.przeczytane); licznik(); sb.from('zdarzenia').update({ przeczytane:true }).eq('id', z.id).then(() => {}, () => {}); }
      zamknij();
      const cel = () => otworz(z);
      S.wyjscieZDanych ? S.wyjscieZDanych(cel) : cel();
    });
    [['ustDzwonek', 'dzwonek'], ['ustTelefon', 'telefon'], ['ustTelegram', 'telegram']].forEach(([id, pole]) => $('#' + id).onchange = async e => {
      const v = e.target.checked, nowy = { ...(P.ust || { dzwonek:true, telefon:true, telegram:true }), [pole]:v };
      const r = P.ust ? await sb.from('ustawienia_powiadomien').update({ [pole]:v }).eq('konto', S.user.id)
                      : await sb.from('ustawienia_powiadomien').insert({ konto:S.user.id, dzwonek:nowy.dzwonek, telefon:nowy.telefon, telegram:nowy.telegram });
      if (r.error) return rysuj('Ustawienie nie zostało zapisane: ' + blad(r.error));
      P.ust = { ...nowy, konto:S.user.id }; licznik();
      const opis = { dzwonek:'Dzwonek w aplikacji', telefon:'Powiadomienia na telefon', telegram:'Telegram („Etap skończony”)' }[pole];
      rysuj(`Zapisano: ${opis} – ${v ? 'włączone' : 'wyłączone'}.`);
    });
  }

  // Otwiera miejsce, którego dotyczy zdarzenie
  function otworz(z){
    const fid = z.mieszkanie;
    if (z.cel === 'ogolny') return window.CHAT ? CHAT.ekranOgolny(null, true, z.cel_id) : ekranListy();
    if (!fid) return ekranListy();
    if (!mieszkanie(fid)) return ekranListy('To mieszkanie nie jest już dostępne na tym koncie.');
    const F = jestFirma(), mod = k => MODULY.find(m => m.k === k && (F ? m.firma : m.wlasciciel !== false));
    switch (z.cel){
      case 'chat': return window.CHAT ? CHAT.ekranChat(fid, null, true, z.cel_id) : ekranMieszkania(fid);
      case 'listaPrac': return z.cel_id ? ekranPomieszczenia(fid, z.cel_id) : ekranListaPrac(fid);
      case 'biblioteka': return z.cel_id && LISCIE[z.cel_id] && !(F && z.cel_id.startsWith('faktury')) ? ekranFolderu(fid, z.cel_id) : ekranBiblioteki(fid);
      case 'mieszkanie': return ekranMieszkania(fid);
    }
    const m = mod(z.cel); if (m) return m.ekran(fid);
    if (z.cel === 'paragony' || z.cel === 'poprawki') return ekranFolderu(fid, z.cel);
    return ekranMieszkania(fid);
  }

  HAKI.pasek.push(() => {
    const b = przycisk(), widac = !!S.user && !S.recovery;
    b.classList.toggle('hide', !widac);
    if (!widac){ P.lista = []; P.nowe = []; P.ust = null; $('#dzwonekN').textContent = ''; zamknij(); clearInterval(timer); timer = null; }
  });
  HAKI.poWczytaniu.push(async () => {
    try { await sb.rpc('sprawdz_opoznienia'); } catch(e){}
    await odswiez();
    clearInterval(timer);
    timer = setInterval(() => { if (S.user && document.visibilityState === 'visible') odswiez().catch(() => {}); }, 60000);
  });
})();
