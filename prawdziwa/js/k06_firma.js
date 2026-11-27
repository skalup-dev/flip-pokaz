/* ===== Klocek 6: Firma – zaproszenie szefa firmy linkiem, dostęp, Zabierz / Przywróć dostęp ===== */
(function(){
  const linkZapr = kod => location.origin + location.pathname + '?zaproszenie=' + kod;

  async function ekranFirma(fid, msg, info = true){
    const f = mieszkanie(fid); if (!f) return ekranListy();
    app.innerHTML = '<p>Wczytuję…</p>';
    const { data, error } = await sb.from('dostepy').select('*').eq('mieszkanie', fid).order('utworzono', { ascending:true });
    const d = data || [];
    const nazwy = await nazwyKto(d.map(x => x.firma).filter(Boolean));
    const firma = (f.firma_remontowa && f.firma_remontowa.trim()) || 'firma remontowa';
    app.innerHTML = `<button class="btnT" id="wroc">← ${esc(f.ulica)}</button>
      <h1>Firma – ${esc(f.ulica)}</h1>
      <p class="intro">Tu ${esc(kto())} daje szefowi firmy remontowej dostęp do tego mieszkania. Po kliknięciu „Utwórz link zaproszenia” pojawi się link do skopiowania – trzeba go wysłać szefowi firmy SMS-em, mailem albo komunikatorem. Szef firmy otwiera link, zakłada konto (albo się loguje) i od razu widzi to mieszkanie. Dostęp można w każdej chwili zabrać i przywrócić.</p>
      ${error ? komunikat(/dostepy|find|exist/i.test(error.message || '') ? 'Dostęp dla firmy nie jest jeszcze włączony w bazie danych. Trzeba wgrać plik 06_reszta.sql w Supabase.' : blad(error)) : ''}${msg ? komunikat(msg, info) : ''}
      <div class="card"><div class="row"><span>Firma remontowa</span><b>${esc(f.firma_remontowa) || '–'}</b></div>
        ${f.firma_remontowa ? '' : '<p class="info2">Nazwę firmy wpisuje się w „Zmień dane” mieszkania. Szef firmy może ją też wpisać sam w „Moje dane”.</p>'}</div>
      ${d.map(x => `<div class="card" data-dostep="${x.id}">
        ${!x.firma ? `<b>Zaproszenie czeka na przyjęcie</b><p class="info2">Utworzone ${dataPL(x.utworzono)}. Link do wysłania szefowi firmy:</p><div class="link-zapr" id="l-${x.id}">${esc(linkZapr(x.kod))}</div>
            <div class="acts"><button class="btn" data-kopiuj="${x.id}">Kopiuj link</button><button class="btn2" data-usunz="${x.id}">Usuń zaproszenie</button></div>`
        : x.aktywny ? `<div class="zw"><b>Dostęp aktywny: ${esc(nazwy[x.firma] || 'Firma remontowa')}</b></div><p class="info2">Szef firmy przyjął zaproszenie ${dataPL(x.przyjeto)}. Widzi to mieszkanie i odznacza prace.</p>
            <div class="acts"><button class="btn2" data-zabierz="${x.id}">Zabierz dostęp</button></div>`
        : `<div class="zw"><b>Dostęp zabrany: ${esc(nazwy[x.firma] || 'Firma remontowa')}</b></div><p class="info2">Szef firmy nie widzi teraz tego mieszkania. Po kliknięciu „Przywróć dostęp” znowu je zobaczy.</p>
            <div class="acts"><button class="btn" data-przywroc="${x.id}">Przywróć dostęp</button></div>`}</div>`).join('')}
      ${d.some(x => !x.firma) ? '' : `<button class="btn full" id="nowyLink" style="margin-bottom:12px">Utwórz link zaproszenia</button>`}
      <div class="grid g2"><div class="card"><b>Co widzi szef firmy</b><div class="info2">Biblioteka bez faktur (plany, postępy prac, poprawki, zdjęcia, paragony)<br>Chat z Właścicielem aplikacji<br>Dane mieszkania bez zakupu, budżetu i opisu<br>Lista prac – odznacza prace ze zdjęciem, podpis to nazwa firmy<br>Płatności, Poprawki, Terminy</div></div>
        <div class="card"><b>Czego nie widzi</b><div class="info2">Budżetu i ceny zakupu<br>Faktur (firma remontowa, materiały, notariusz, pośrednicy, inne)<br>Innych mieszkań Właściciela aplikacji<br>Notariusza i pośredników</div></div></div>`;
    $('#wroc').onclick = () => ekranMieszkania(fid);
    const nl = $('#nowyLink'); if (nl) nl.onclick = async () => {
      nl.disabled = true; const r = await sb.from('dostepy').insert({ mieszkanie:fid }).select().single();
      ekranFirma(fid, r.error ? blad(r.error) : `Link zaproszenia jest gotowy. Po kliknięciu „Kopiuj link” można go wkleić w SMS-a albo maila do szefa firmy ${firma}.`, !r.error);
    };
    app.querySelectorAll('[data-kopiuj]').forEach(b => b.onclick = async () => {
      const t = $('#l-' + b.dataset.kopiuj).textContent;
      try { await navigator.clipboard.writeText(t); b.textContent = 'Skopiowano ✓'; } catch(e){ const r = document.createRange(); r.selectNodeContents($('#l-' + b.dataset.kopiuj)); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = 'Link zaznaczony – trzeba go skopiować'; }
    });
    app.querySelectorAll('[data-usunz]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await sb.from('dostepy').delete().eq('id', b.dataset.usunz); ekranFirma(fid, r.error ? blad(r.error) : 'Zaproszenie usunięte. Link przestał działać.', !r.error); });
    app.querySelectorAll('[data-zabierz]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await sb.from('dostepy').update({ aktywny:false }).eq('id', b.dataset.zabierz); ekranFirma(fid, r.error ? blad(r.error) : 'Dostęp zabrany. Szef firmy nie widzi już tego mieszkania.', !r.error); });
    app.querySelectorAll('[data-przywroc]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await sb.from('dostepy').update({ aktywny:true }).eq('id', b.dataset.przywroc); ekranFirma(fid, r.error ? blad(r.error) : 'Dostęp przywrócony. Szef firmy znowu widzi to mieszkanie.', !r.error); });
  }

  rejestrujModul({ k:'firma', n:'Firma', firma:false, ekran:fid => ekranFirma(fid) });
})();
