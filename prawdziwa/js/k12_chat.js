/* ===== Klocek 12: Chat z firmą (osobny dla każdego mieszkania) i Chat ogólny z firmami ===== */
(function(){
  const st = document.createElement('style');
  st.textContent = `
.rozmowa{display:flex;flex-direction:column;gap:8px}
.dymek{max-width:80%;padding:9px 12px;border-radius:12px;word-wrap:break-word;overflow-wrap:anywhere}
.dymek.moj{margin-left:auto;background:var(--c);color:var(--k);border:1px solid var(--c)}
.dymek.inny{margin-right:auto;border:1px solid var(--z)}
.dymek .tr{white-space:pre-wrap}
.dymek img{display:block;width:100%;max-width:260px;aspect-ratio:4/3;object-fit:cover;border-radius:8px;border:1px solid var(--z);margin-top:6px;cursor:pointer}
.dymek small{display:block;font-size:12px;margin-top:4px}
.dymek.moj small{color:var(--z)}
.rozmowa .pusto{margin:0;text-align:center;padding:14px 0}
.zalacznik{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
.zalacznik img{width:84px;height:63px;object-fit:cover;border-radius:8px;border:1px solid var(--z)}
.zalacznik span{flex:1;min-width:120px;font-size:13px;word-break:break-word}
.zalacznik .btn2{padding:6px 10px;font-size:13px}
.chips button.on{border:2px solid var(--z)}
#pisz textarea{resize:vertical;min-height:64px}
@media (max-width:640px){.dymek{max-width:90%}}`;
  document.head.appendChild(st);

  const S12 = { fid:null, firma:null, zdj:null, tekst:'', ogolny:null, ogTekst:'', timer:null };
  const ileNowych = (cel, fid, cid) => ((window.POWIADOMIENIA && POWIADOMIENIA.nowe) || []).filter(z => z.cel === cel && (!fid || z.mieszkanie === fid) && (!cid || z.cel_id === cid)).length;
  const bladChatu = e => {
    const m = (e && (e.message || e.error)) || String(e);
    if (/wiadomosci/i.test(m) && /find|exist|schema cache/i.test(m)) return 'Chat nie jest jeszcze włączony w bazie danych. Trzeba wgrać plik 06_reszta.sql w Supabase.';
    if (/Najpierw trzeba|nie ma jeszcze firmy|nie ma teraz dostępu|nie należy do tego mieszkania|zalogować/.test(m)) return m.replace(/^.*?: (?=[A-ZŁŚŻ])/, '') + (/[.!?]$/.test(m) ? '' : '.');
    return blad(e);
  };
  const poCzasie = (a, b) => String(a.utworzono).localeCompare(String(b.utworzono));
  const unikalne = a => [...new Set(a.filter(Boolean))];
  const lista3 = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' i ' + a[a.length - 1] : (a[0] || '');

  function dymki(lista, nazwy, linki){
    if (!lista.length) return '<p class="info2 pusto">Nie ma jeszcze wiadomości. Pierwsza wiadomość pojawi się tutaj.</p>';
    return lista.map(m => `<div class="dymek ${m.autor === S.user.id ? 'moj' : 'inny'}" data-wiad="${esc(m.id)}">
      ${m.tresc ? `<div class="tr">${esc(m.tresc)}</div>` : ''}
      ${m.zdjecie ? (m.plik && linki[m.zdjecie] ? `<img src="${esc(linki[m.zdjecie])}" alt="Zdjęcie z chatu" data-pow="${esc(m.id)}">` : '<div class="info2">Zdjęcie zostało usunięte z Biblioteki.</div>') : ''}
      <small>${esc(nazwy[m.autor] || 'Właściciel aplikacji')} · ${czas(m.utworzono)}</small></div>`).join('');
  }
  async function linkiZdjec(lista){
    const sc = lista.filter(m => m.zdjecie && m.plik).map(m => m.zdjecie); const l = {};
    if (sc.length){ const { data } = await sb.storage.from(SCHOWEK).createSignedUrls(sc, 3600); (data || []).forEach(x => { if (x.signedUrl) l[x.path] = x.signedUrl; }); }
    return l;
  }
  function powiekszenia(lista, linki, nazwy){
    app.querySelectorAll('.dymek [data-pow]').forEach(im => im.onclick = () => {
      const m = lista.find(x => String(x.id) === im.dataset.pow); if (!m) return;
      podglad({ nazwa:'Zdjęcie z chatu', sciezka:m.zdjecie, typ:'zdjecie' }, linki);
      const i = $('#okno .info'); if (i) i.textContent = `Zdjęcie wysłane przez: ${nazwy[m.autor] || 'Właściciel aplikacji'} · ${czas(m.utworzono)}. Jest też w Bibliotece › Postępy prac. „Zamknij” wraca do chatu.`;
    });
  }
  async function przeczytane(cel, fid, cid){
    try {
      let q = sb.from('zdarzenia').update({ przeczytane:true }).eq('cel', cel).eq('przeczytane', false);
      if (fid) q = q.eq('mieszkanie', fid); if (cid) q = q.eq('cel_id', cid);
      const r = await q; if (!r.error && window.POWIADOMIENIA) POWIADOMIENIA.odswiez();
    } catch(e){}
  }
  // Odświeżanie otwartej rozmowy co 15 sekund (nowe wiadomości drugiej strony)
  function sledz(klucz, pobierz){
    clearInterval(S12.timer);
    S12.timer = setInterval(async () => {
      const r = $('#rozmowa');
      if (!r || r.dataset.klucz !== klucz){ clearInterval(S12.timer); return; }
      if (document.visibilityState !== 'visible' || $('#okno')) return;
      try { await pobierz(r); } catch(e){}
    }, 15000);
  }

  /* ---------- Chat przy mieszkaniu ---------- */
  async function wczytajChat(fid, cur){
    const w = await sb.from('wiadomosci').select('*').eq('mieszkanie', fid).order('utworzono', { ascending:true });
    const lista = (w.data || []).filter(m => jestFirma() || m.firma === cur).sort(poCzasie);
    return { blad:w.error, lista };
  }

  async function ekranChat(fid, msg, info = true, firmaWybrana){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    const F = jestFirma();
    if (S12.fid !== fid){ S12.fid = fid; S12.firma = null; S12.zdj = null; S12.tekst = ''; }
    app.innerHTML = '<p>Wczytuję chat…</p>';
    let firmy = [], bladD = null;
    if (!F){
      const d = await sb.from('dostepy').select('firma,aktywny,przyjeto').eq('mieszkanie', fid);
      bladD = d.error && !/dostepy/i.test(d.error.message || '') ? d.error : null;
      (d.data || []).filter(x => x.firma).forEach(x => { const b = firmy.find(y => y.id === x.firma); if (b) b.aktywny = b.aktywny || x.aktywny; else firmy.push({ id:x.firma, aktywny:!!x.aktywny }); });
    }
    const wszystkie = await sb.from('wiadomosci').select('*').eq('mieszkanie', fid).order('utworzono', { ascending:true });
    if (!F) unikalne((wszystkie.data || []).map(m => m.firma)).forEach(id => { if (!firmy.some(x => x.id === id)) firmy.push({ id, aktywny:false }); });
    const nazwy = await nazwyKto([...firmy.map(x => x.id), ...(wszystkie.data || []).map(m => m.autor), f.wlasciciel, S.user.id]);
    firmy.sort((a, b) => (nazwy[a.id] || '').localeCompare(nazwy[b.id] || '', 'pl'));
    let cur = null;
    if (!F){
      const chce = firmaWybrana || S12.firma;
      cur = (firmy.find(x => x.id === chce) || firmy.find(x => x.aktywny) || firmy[0] || {}).id || null;
      S12.firma = cur;
    }
    const lista = (wszystkie.data || []).filter(m => F || m.firma === cur).sort(poCzasie);
    const linki = await linkiZdjec(lista);
    const firmaCur = firmy.find(x => x.id === cur);
    const mozna = F || (firmaCur && firmaCur.aktywny);
    const druga = F ? (nazwy[f.wlasciciel] || 'Właściciel aplikacji') : (cur ? nazwy[cur] || 'firma remontowa' : ((f.firma_remontowa && f.firma_remontowa.trim()) || 'firma remontowa'));
    const blad1 = wszystkie.error || bladD;
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Chat – ${esc(f.ulica)}</h1>
      <p class="intro">${F
        ? `Tu ${esc(kto())} rozmawia z ${esc(druga)} o tym mieszkaniu. Każda wiadomość ma podpis: kto ją napisał i kiedy. Do wiadomości można dołączyć zdjęcie – trafi ono też do Biblioteki › Postępy prac. Po kliknięciu „Wyślij” wiadomość pojawi się na dole rozmowy, a ${esc(druga)} dostanie powiadomienie w dzwonku.`
        : `Tu ${esc(kto())} rozmawia z szefem firmy ${esc(druga)} o tym mieszkaniu. Rozmowa jest osobna dla każdego mieszkania. Każda wiadomość ma podpis: kto ją napisał i kiedy. Do wiadomości można dołączyć zdjęcie – trafi ono też do Biblioteki › Postępy prac. Po kliknięciu „Wyślij” wiadomość pojawi się na dole rozmowy, a firma dostanie powiadomienie w dzwonku.`}</p>
      ${blad1 ? komunikat(bladChatu(blad1)) : ''}${msg ? komunikat(msg, info) : ''}
      ${!F && firmy.length > 1 ? `<p class="info2">To mieszkanie ma rozmowy z kilkoma firmami. Po kliknięciu nazwy firmy otworzy się rozmowa z nią.</p>
        <div class="chips" id="firmyChat" style="margin-bottom:10px">${firmy.map(x => `<button data-firma="${esc(x.id)}" class="${x.id === cur ? 'on' : ''}">${esc(nazwy[x.id] || 'Firma remontowa')}${x.aktywny ? '' : ' (dostęp zabrany)'}</button>`).join('')}</div>` : ''}
      ${!F && !cur ? `<div class="card empty"><b>To mieszkanie nie ma jeszcze firmy z dostępem.</b><br>Chat ruszy, gdy szef firmy przyjmie zaproszenie. Zaproszenie tworzy się w zakładce „Firma”.<div class="acts"><button class="btn" id="doFirmy">Otwórz zakładkę Firma</button></div></div>`
      : `<div class="card rozmowa" id="rozmowa" data-klucz="${esc(fid + ':' + (cur || S.user.id))}">${dymki(lista, nazwy, linki)}</div>
        ${mozna ? `<div class="card" id="pisz"><label for="chTekst">Nowa wiadomość do: ${esc(druga)}</label>
          <textarea id="chTekst" rows="2" maxlength="2000" placeholder="Treść wiadomości">${esc(S12.tekst)}</textarea>
          ${S12.zdj ? `<div class="zalacznik"><img src="${S12.zdj.url}" alt="Dołączone zdjęcie"><span>Dołączone zdjęcie: ${esc(S12.zdj.nazwa)}</span><button class="btn2" id="chUsunZdj">Usuń zdjęcie</button></div>` : ''}
          <div class="acts"><label class="btn2 wgraj" for="chZdj" id="lChZdj">📷 ${S12.zdj ? 'Zmień zdjęcie' : 'Dołącz zdjęcie'}</label><button class="btn" id="chWyslij">Wyślij</button></div>
          <input type="file" id="chZdj" class="hide" accept="image/*">
          <p class="info2">Można wysłać sam tekst, samo zdjęcie albo jedno i drugie. Zdjęcie z chatu trafi też do Biblioteki › Postępy prac.</p></div>`
        : `<div class="card"><b>Dostęp tej firmy jest zabrany.</b><br>Rozmowa zostaje do wglądu, ale nie można do niej pisać. Dostęp przywraca się w zakładce „Firma”.</div>`}`}`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    const df = $('#doFirmy'); if (df){ const m = MODULY.find(x => x.k === 'firma'); df.onclick = () => m ? m.ekran(fid) : ekranMieszkania(fid); }
    app.querySelectorAll('[data-firma]').forEach(b => b.onclick = () => { S12.zdj = null; S12.tekst = ''; ekranChat(fid, null, true, b.dataset.firma); });
    powiekszenia(lista, linki, nazwy);
    if (lista.length) setTimeout(() => { const r = $('#rozmowa'); if (r && r.lastElementChild) r.lastElementChild.scrollIntoView({ block:'nearest' }); }, 0);
    if (cur || F) przeczytane('chat', fid, F ? S.user.id : cur);
    const r0 = $('#rozmowa');
    if (r0) sledz(r0.dataset.klucz, async r => {
      const n = await wczytajChat(fid, cur); if (n.blad || n.lista.length === lista.length) return;
      const nz = await nazwyKto(n.lista.map(m => m.autor)), nl = await linkiZdjec(n.lista);
      lista.splice(0, lista.length, ...n.lista); Object.assign(nazwy, nz); Object.assign(linki, nl);
      r.innerHTML = dymki(lista, nazwy, linki); powiekszenia(lista, linki, nazwy); przeczytane('chat', fid, F ? S.user.id : cur);
    });
    if (!mozna || (!F && !cur)) return;
    const t = $('#chTekst');
    t.oninput = () => { S12.tekst = t.value; };
    t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)){ e.preventDefault(); $('#chWyslij').click(); } };
    const uz = $('#chUsunZdj'); if (uz) uz.onclick = () => { URL.revokeObjectURL(S12.zdj.url); S12.zdj = null; ekranChat(fid, null, true, cur); };
    $('#chZdj').onchange = async e => {
      const pl = [...e.target.files]; if (!pl.length) return;
      const w = $('#chWyslij'); w.disabled = true; w.classList.add('load'); w.textContent = 'Przygotowuję zdjęcie…';
      const { ok, bledy } = await przygotujZdjecia(pl.slice(0, 1));
      if (ok.length){ if (S12.zdj) URL.revokeObjectURL(S12.zdj.url); S12.zdj = ok[0]; }
      ekranChat(fid, bledy.length ? 'Nie dołączono: ' + bledy.join(' ') : null, !bledy.length, cur);
    };
    $('#chWyslij').onclick = async () => {
      const tekst = t.value.trim();
      if (!tekst && !S12.zdj) return ekranChat(fid, 'Najpierw trzeba wpisać wiadomość albo dołączyć zdjęcie.', false, cur);
      const w = $('#chWyslij'); if (w.disabled) return; w.disabled = true; w.classList.add('load'); w.textContent = 'Wysyłam…';
      let plik = null;
      if (S12.zdj){
        const uid = wlascicielId(fid), sciezka = `${uid}/${fid}/postepy/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from(SCHOWEK).upload(sciezka, S12.zdj.blob, { contentType:'image/jpeg', upsert:false });
        if (up.error) return ekranChat(fid, 'Nie udało się wysłać zdjęcia: ' + bladPliku(up.error), false, cur);
        const p = await sb.from('pliki').insert({ mieszkanie:fid, wlasciciel:uid, folder:'postepy', nazwa:S12.zdj.nazwa, sciezka, typ:'zdjecie', rozmiar:S12.zdj.blob.size }).select().single();
        if (p.error){ await sb.storage.from(SCHOWEK).remove([sciezka]); return ekranChat(fid, 'Nie udało się wysłać zdjęcia: ' + bladPliku(p.error), false, cur); }
        plik = p.data.id;
      }
      const r = await sb.from('wiadomosci').insert({ mieszkanie:fid, tresc:tekst || null, plik, ...(F ? {} : { firma:cur }) });
      if (r.error) return ekranChat(fid, (plik ? 'Zdjęcie jest już w Bibliotece › Postępy prac, ale wiadomość nie została wysłana: ' : 'Wiadomość nie została wysłana: ') + bladChatu(r.error), false, cur);
      if (S12.zdj) URL.revokeObjectURL(S12.zdj.url);
      S12.zdj = null; S12.tekst = '';
      ekranChat(fid, `Wiadomość wysłana. ${druga} dostanie powiadomienie w dzwonku.${plik ? ' Zdjęcie jest też w Bibliotece › Postępy prac.' : ''}`, true, cur);
    };
  }

  /* ---------- Chat ogólny z firmami ---------- */
  async function ekranOgolny(msg, info = true, wlWybrany){
    if (!S.user) return ekranLogowania();
    const F = jestFirma();
    app.innerHTML = '<p>Wczytuję chat ogólny…</p>';
    const d = F ? await sb.from('dostepy').select('wlasciciel,aktywny').eq('firma', S.user.id) : await sb.from('dostepy').select('firma,aktywny').eq('wlasciciel', S.user.id);
    const aktywne = (d.data || []).filter(x => x.aktywny);
    const firmy = F ? [] : unikalne(aktywne.map(x => x.firma));
    const szefowie = F ? unikalne(aktywne.map(x => x.wlasciciel)) : [];
    const nazwy0 = await nazwyKto([...firmy, ...szefowie]);
    firmy.sort((a, b) => (nazwy0[a] || '').localeCompare(nazwy0[b] || '', 'pl'));
    szefowie.sort((a, b) => (nazwy0[a] || '').localeCompare(nazwy0[b] || '', 'pl'));
    const wl = F ? (szefowie.includes(wlWybrany) ? wlWybrany : szefowie.includes(S12.ogolny) ? S12.ogolny : szefowie[0]) : S.user.id;
    if (F && wl !== S12.ogolny){ S12.ogolny = wl; }
    const w = wl ? await sb.from('wiadomosci_ogolne').select('*').eq('wlasciciel', wl).order('utworzono', { ascending:true }) : { data:[], error:null };
    const lista = (w.data || []).sort(poCzasie);
    const nazwy = Object.assign(nazwy0, await nazwyKto(lista.map(m => m.autor)));
    const szef = wl ? (nazwy[wl] || 'Właściciel aplikacji') : 'Właściciel aplikacji';
    const fNazwy = firmy.map(id => nazwy[id] || 'Firma remontowa');
    const blad1 = w.error || (d.error && !/dostepy/i.test(d.error.message || '') ? d.error : null);
    const mozna = F ? !!wl : firmy.length > 0;
    app.innerHTML = `<button class="btnT" id="wroc">← ${F ? 'Moje zlecenia' : 'Moje mieszkania'}</button>
      <h1>Chat ogólny z firmami</h1>
      <p class="intro">${F
        ? `Tu są ogłoszenia ${esc(szef)} dla wszystkich firm. ${esc(kto())} może na nie odpisać – odpowiedź zobaczy tylko ${esc(szef)}, inne firmy jej nie widzą. Pytanie o konkretne mieszkanie najlepiej zadać w chacie tego mieszkania. Po kliknięciu „Wyślij” ${esc(szef)} dostanie powiadomienie w dzwonku.`
        : `Tu ${esc(kto())} pisze jedną wiadomość do wszystkich swoich firm naraz${firmy.length ? ` (firmy z aktywnym dostępem: ${esc(lista3(fNazwy))})` : ''}. Każda firma widzi wiadomości ${esc(kto())} i tylko swoje odpowiedzi – odpowiedzi innych firm nie widzi. Rozmowy o konkretnym mieszkaniu zostają w jego chacie. Po kliknięciu „Wyślij do wszystkich firm” każda firma dostanie powiadomienie w dzwonku.`}</p>
      ${blad1 ? komunikat(bladChatu(blad1)) : ''}${msg ? komunikat(msg, info) : ''}
      ${F && szefowie.length > 1 ? `<p class="info2">${esc(kto())} pracuje dla kilku Właścicieli aplikacji. Po kliknięciu nazwy otworzy się chat ogólny z tą osobą.</p>
        <div class="chips" style="margin-bottom:10px">${szefowie.map(id => `<button data-wl="${esc(id)}" class="${id === wl ? 'on' : ''}">${esc(nazwy[id] || 'Właściciel aplikacji')}</button>`).join('')}</div>` : ''}
      ${!mozna && !lista.length ? `<div class="card empty"><b>${F ? 'Nie ma jeszcze żadnego zlecenia z dostępem.' : 'Nie ma jeszcze firmy z aktywnym dostępem.'}</b><br>${F ? 'Chat ogólny ruszy, gdy Właściciel aplikacji da dostęp do mieszkania.' : 'Chat ogólny ruszy, gdy szef firmy przyjmie zaproszenie do któregoś mieszkania (zakładka „Firma” przy mieszkaniu).'}</div>`
      : `<div class="card rozmowa" id="rozmowa" data-klucz="${esc('ogolny:' + (wl || ''))}">${dymki(lista, nazwy, {})}</div>`}
      ${mozna ? `<div class="card" id="pisz"><label for="ogTekst">${F ? 'Odpowiedź do: ' + esc(szef) : 'Wiadomość do wszystkich firm'}</label>
        <textarea id="ogTekst" rows="2" maxlength="2000" placeholder="Treść wiadomości">${esc(S12.ogTekst)}</textarea>
        <div class="acts"><button class="btn" id="ogWyslij">${F ? 'Wyślij' : 'Wyślij do wszystkich firm'}</button></div></div>` : ''}`;
    $('#wroc').onclick = () => ekranListy();
    app.querySelectorAll('[data-wl]').forEach(b => b.onclick = () => { S12.ogTekst = ''; ekranOgolny(null, true, b.dataset.wl); });
    if (lista.length) setTimeout(() => { const r = $('#rozmowa'); if (r && r.lastElementChild) r.lastElementChild.scrollIntoView({ block:'nearest' }); }, 0);
    if (wl) przeczytane('ogolny', null, wl);
    const r0 = $('#rozmowa');
    if (r0 && wl) sledz(r0.dataset.klucz, async r => {
      const n = await sb.from('wiadomosci_ogolne').select('*').eq('wlasciciel', wl).order('utworzono', { ascending:true });
      if (n.error || (n.data || []).length === lista.length) return;
      lista.splice(0, lista.length, ...(n.data || []).sort(poCzasie)); Object.assign(nazwy, await nazwyKto(lista.map(m => m.autor)));
      r.innerHTML = dymki(lista, nazwy, {}); przeczytane('ogolny', null, wl);
    });
    if (!mozna) return;
    const t = $('#ogTekst');
    t.oninput = () => { S12.ogTekst = t.value; };
    t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)){ e.preventDefault(); $('#ogWyslij').click(); } };
    $('#ogWyslij').onclick = async () => {
      const tekst = t.value.trim();
      if (!tekst) return ekranOgolny('Najpierw trzeba wpisać wiadomość.', false, wl);
      const b = $('#ogWyslij'); if (b.disabled) return; b.disabled = true; b.classList.add('load'); b.textContent = 'Wysyłam…';
      const r = await sb.from('wiadomosci_ogolne').insert(F ? { wlasciciel:wl, tresc:tekst } : { tresc:tekst });
      if (r.error) return ekranOgolny('Wiadomość nie została wysłana: ' + bladChatu(r.error), false, wl);
      S12.ogTekst = '';
      ekranOgolny(F ? `Odpowiedź wysłana. ${szef} dostanie powiadomienie w dzwonku.` : `Wiadomość wysłana do wszystkich firm (${firmy.length}). Każda firma dostanie powiadomienie w dzwonku.`, true, wl);
    };
  }

  /* Przycisk „Chat ogólny” na liście mieszkań. Rdzeń nie ma haka listy, więc ekranListy jest owinięty (bez zmiany rdzenia). */
  function przyciskOgolny(){
    if (!S.user || S.recovery || !$('#kpiN') || $('#chatOgolny')) return;
    const b = document.createElement('button');
    b.id = 'chatOgolny'; b.className = 'btn2 full'; b.style.marginBottom = '14px';
    b.onclick = () => ekranOgolny();
    const dodaj = $('#dodaj'), siatka = app.querySelector('.grid');
    if (dodaj) dodaj.after(b); else if (siatka) siatka.after(b); else return;
    etykietaOgolny();
  }
  function etykietaOgolny(){
    const b = $('#chatOgolny'); if (!b) return;
    const n = ileNowych('ogolny');
    b.textContent = (jestFirma() ? 'Chat ogólny' : 'Chat ogólny z firmami') + (n ? ` – nowe: ${n}` : '');
  }
  const staraLista = window.ekranListy;
  window.ekranListy = function(){ const w = staraLista.apply(this, arguments); try { przyciskOgolny(); } catch(e){} return w; };

  window.CHAT = { ekranChat, ekranOgolny, etykietaOgolny };
  rejestrujModul({ k:'chat', n:'Chat', firma:true, wlasciciel:true,
    etykieta:fid => { const n = ileNowych('chat', fid); return (jestFirma() ? 'Chat z Właścicielem aplikacji' : 'Chat z firmą') + (n ? ` – nowe: ${n}` : ''); },
    ekran:fid => ekranChat(fid) });
})();
