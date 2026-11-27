// Test ekranów klocków 9 (Terminy) i 10 (Płatności). Uruchamianie: NODE_PATH=$(npm root -g) node test_terminy_platnosci.js
// Baza zastępcza: mock_pelny.js + rozszerzenie poniżej (terminy, płatności, umowa, dostęp firmy – te same zasady co w 09_terminy.sql i 10_platnosci.sql).
const {chromium,expect}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path');
const root=process.env.ROOT||path.join(__dirname,'..','..');const PW='Dobrehaslo1';const PORT=8791;

const ROZSZERZENIE = `(function(){
  const L = k => JSON.parse(localStorage.getItem(k) || 'null'), W = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  const uuid = () => 'u' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const base = window.supabase.createClient;
  window.supabase = { createClient(...a){
    const c = base(...a), from0 = c.from, rpc0 = c.rpc;
    const uid = () => L('mock_session');
    const wl = m => ((L('mock_mieszkania') || []).find(x => x.id === m) || {}).wlasciciel;
    const firmaMa = m => (L('mock_dostepy') || []).some(d => d.mieszkanie === m && d.firma === uid() && d.aktywny);
    const dost = m => !!uid() && (wl(m) === uid() || firmaMa(m));
    const wlasc = m => !!uid() && wl(m) === uid();
    const WLASNE = ['terminy','platnosci','platnosci_etapy'], ODCZYT = ['prace','pomieszczenia','pliki'];
    const RLS = t => ({ data:null, error:{ message:'new row violates row-level security policy for table "' + t + '"' } });
    c.from = t => {
      if (!WLASNE.includes(t) && !ODCZYT.includes(t)) return from0(t);
      const q = { op:'select', filt:[], inn:[], one:false, val:null, calls:[] };
      const b = {};
      ['select','insert','update','delete','eq','in','order','single','like'].forEach(m => b[m] = (...x) => { q.calls.push([m, x]);
        if (m === 'insert' || m === 'update'){ q.op = m; q.val = x[0]; } if (m === 'delete') q.op = 'delete';
        if (m === 'eq') q.filt.push(x); if (m === 'in') q.inn.push(x); if (m === 'single') q.one = true; return b; });
      b.then = (res, rej) => run().then(res, rej);
      const pasuje = r => q.filt.every(([k, v]) => r[k] === v) && q.inn.every(([k, vs]) => vs.includes(r[k]));
      async function run(){
        if (!uid()) return { data:null, error:{ message:'permission denied for table ' + t } };
        if (ODCZYT.includes(t)){
          if (q.op !== 'select'){ let x = from0(t); for (const [m, a] of q.calls) x = x[m](...a); return x; }
          return { data:(L('mock_' + t) || []).filter(r => dost(r.mieszkanie) && pasuje(r)), error:null };
        }
        let all = L('mock_' + t) || [];
        if (q.op === 'select') return { data:all.filter(r => dost(r.mieszkanie) && pasuje(r)), error:null };
        if (t !== 'terminy' && q.op !== 'update') return { data:null, error:{ message:'permission denied for table ' + t } };
        const daty = r => r.data_od && r.data_do && r.data_do < r.data_od;
        if (q.op === 'insert'){
          const vs = Array.isArray(q.val) ? q.val : [q.val];
          for (const v of vs){
            if (!wlasc(v.mieszkanie)) return RLS(t);
            if (daty(v)) return { data:null, error:{ message:'new row for relation "terminy" violates check constraint "terminy_check"' } };
            if (v.nr == null && !(v.nazwa && v.nazwa.trim())) return { data:null, error:{ message:'violates check constraint "terminy_check1"' } };
            if (v.nr != null && all.some(r => r.mieszkanie === v.mieszkanie && r.nr === v.nr)) return { data:null, error:{ message:'duplicate key value violates unique constraint "terminy_mieszkanie_nr_key"' } };
          }
          const rows = vs.map(v => ({ id:uuid(), nr:null, nazwa:null, data_od:null, data_do:null, zrobiony:false, ...v }));
          all.push(...rows); W('mock_' + t, all); return { data:q.one ? rows[0] : rows, error:null };
        }
        if (q.op === 'update'){
          if (t === 'platnosci' && Object.keys(q.val).some(k => k !== 'zaplacona')) return { data:null, error:{ message:'permission denied for table platnosci' } };
          if (t === 'platnosci_etapy') return { data:null, error:{ message:'permission denied for table platnosci_etapy' } };
          const rows = all.filter(r => wlasc(r.mieszkanie) && pasuje(r));
          for (const r of rows){ const n = { ...r, ...q.val }; if (daty(n)) return { data:null, error:{ message:'new row for relation "terminy" violates check constraint "terminy_check"' } };
            if (t === 'terminy' && n.nr != null && n.zrobiony) return { data:null, error:{ message:'violates check constraint "terminy_check2"' } }; }
          rows.forEach(r => { if (t === 'platnosci'){ if (q.val.zaplacona && !r.zaplacona) r.zaplacona_kiedy = new Date().toISOString(); if (!q.val.zaplacona) r.zaplacona_kiedy = null; } Object.assign(r, q.val); });
          W('mock_' + t, all); return { data:q.one ? rows[0] : rows, error:null };
        }
        if (q.op === 'delete'){
          const usun = all.filter(r => wlasc(r.mieszkanie) && r.nr == null && pasuje(r));
          if (usun.some(r => (L('mock_platnosci_etapy') || []).some(e => e.termin === r.id))) return { data:null, error:{ message:'Ten etap jest w płatności. Najpierw trzeba go zdjąć z płatności w „Ustal płatności”' } };
          W('mock_' + t, all.filter(r => !usun.includes(r))); return { data:null, error:null };
        }
      }
      return b;
    };
    c.rpc = async (nazwa, a) => {
      const e = m => ({ data:null, error:{ message:m } });
      if (nazwa === 'umowa_mieszkania'){ const m = (L('mock_mieszkania') || []).find(x => x.id === a.m);
        if (!m || !dost(a.m)) return { data:[], error:null };
        return { data:[{ cena_firmy_m2:m.cena_firmy_m2 ?? null, metraz:m.metraz ?? null, kwota:m.cena_firmy_m2 != null && m.metraz != null ? Math.round(m.cena_firmy_m2 * m.metraz * 100) / 100 : null }], error:null }; }
      if (nazwa === 'zlecenia_firmy') return { data:(L('mock_mieszkania') || []).filter(m => firmaMa(m.id)).map(({ id, ulica, miasto, metraz, data_startu, termin_konca, firma_remontowa, wlasciciel }) => ({ id, ulica, miasto, metraz, data_startu, termin_konca, firma_remontowa, wlasciciel })), error:null };
      if (nazwa === 'zapisz_platnosci'){
        const m = a.m, dane = a.dane;
        if (!wlasc(m)) return e('Płatności ustala tylko Właściciel aplikacji tego mieszkania');
        if (!Array.isArray(dane) || !dane.length) return e('Trzeba dodać co najmniej jedną płatność');
        const ter = L('mock_terminy') || []; let pl = L('mock_platnosci') || [], pe = L('mock_platnosci_etapy') || [];
        const wsz = [], zost = [], zmien = [];
        for (const p of dane){
          if (!(p.kwota > 0)) return e('Każda płatność musi mieć kwotę większą od zera');
          const et = [...new Set(p.etapy || [])]; if (!et.length) return e('Każda płatność musi mieć zaznaczony co najmniej jeden etap');
          if (et.some(x => wsz.includes(x))) return e('Etap może być tylko w jednej płatności');
          if (et.some(x => !ter.some(y => y.id === x && y.mieszkanie === m))) return e('Etap nie należy do tego mieszkania');
          wsz.push(...et);
          const s = pl.find(x => x.id === p.id && x.mieszkanie === m);
          if (s){ zost.push(s.id); if (pe.filter(x => x.platnosc === s.id).map(x => x.termin).sort().join() !== [...et].sort().join() || Math.round(s.kwota * 100) !== Math.round(p.kwota * 100)) zmien.push(s.id); }
        }
        pl = pl.filter(x => x.mieszkanie !== m || zost.includes(x.id)); pe = pe.filter(x => pl.some(y => y.id === x.platnosc));
        dane.forEach((p, i) => {
          let s = pl.find(x => x.id === p.id && zost.includes(x.id));
          if (s){ s.nr = i + 1; s.kwota = p.kwota; if (zmien.includes(s.id)){ s.zaplacona = false; s.zaplacona_kiedy = null; } }
          else { s = { id:uuid(), mieszkanie:m, nr:i + 1, kwota:p.kwota, zaplacona:false, zaplacona_kiedy:null }; pl.push(s); }
          pe = pe.filter(x => !(x.platnosc === s.id && !p.etapy.includes(x.termin)) && !(p.etapy.includes(x.termin) && x.platnosc !== s.id));
          p.etapy.forEach(x => { if (!pe.some(y => y.termin === x)) pe.push({ termin:x, platnosc:s.id, mieszkanie:m }); });
        });
        W('mock_platnosci', pl); W('mock_platnosci_etapy', pe); return { data:null, error:null };
      }
      return rpc0(nazwa, a);
    };
    return c;
  } };
})();`;
const MOCK=fs.readFileSync(__dirname+'/mock_pelny.js','utf8')+'\n'+ROZSZERZENIE;
const srv=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0].split('#')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});r.end(d)})}).listen(PORT);
const URL=`http://127.0.0.1:${PORT}/index.html`;let zle=0,ok=0;const spr=(w,t)=>{console.log((w?'OK   ':'ZLE  ')+t);w?ok++:zle++};
const TY=/\b(Kliknij|Możesz|możesz|Wpisz|Sprawdź|Odczekaj|wrócisz|Zaznacz|Twoj\w*|zrobiłeś|dodałeś|zobaczysz|Dodaj co)\b/;
async function kontrola(p,gdzie){const t=await p.evaluate(()=>[...document.querySelectorAll('#app h1,#app .intro,#app .msg,#app .empty,#app label,#app .card,#app .info2')].map(e=>e.innerText).join(' | '));const m=t.match(TY);
 const sz=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);spr(!m&&sz<=0&&await p.evaluate(()=>!!document.querySelector('.stopka b')),gdzie+': bez formy Ty, bez przewijania w bok, stopka'+(m?' (Ty: '+m[0]+')':'')+(sz>0?' (w bok '+sz+')':''))}
const D=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};const PL=s=>s.split('-').reverse().join('.');
const dzisPL=new Date().toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
// zmiana danych w bazie zastępczej (jak gdyby szef firmy odznaczył prace, a Właściciel aplikacji wpisał cenę w „Pieniądze”)
const zrob=(p,nazwy,pom)=>p.evaluate(([n,pom])=>{const pr=JSON.parse(localStorage.getItem('mock_prace'));const po=JSON.parse(localStorage.getItem('mock_pomieszczenia'));pr.forEach(r=>{const rp=po.find(x=>x.id===r.pomieszczenie);if(n.includes(r.nazwa)&&(!pom||rp.nazwa===pom)){r.zrobiona=true;r.zrobiona_kiedy=new Date().toISOString();r.zrobiona_przez=r.wlasciciel}});localStorage.setItem('mock_prace',JSON.stringify(pr))},[nazwy,pom]);
const ustawM=(p,v)=>p.evaluate(v=>{const m=JSON.parse(localStorage.getItem('mock_mieszkania'));Object.assign(m[0],v);localStorage.setItem('mock_mieszkania',JSON.stringify(m))},v);
const zrzut=(p,n,name)=>process.env.ZRZUTY?p.screenshot({path:path.join(process.env.ZRZUTY,n+'_'+name+'.png'),fullPage:true}):null;
const etap=(p,n)=>p.locator(`[data-etap="${n-1}"]`);

(async()=>{const b=await chromium.launch();
for(const [name,vp] of [['pc',{width:1280,height:900}],['tel',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp,locale:'pl-PL'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(15000);
 await p.route('**/supabase.js',r=>r.fulfill({body:MOCK,contentType:'application/javascript'}));await p.route('**/config.js',r=>r.fulfill({body:'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};',contentType:'application/javascript'}));
 await p.goto(URL);await expect(p.locator('h1')).toHaveText('Logowanie');
 await p.click('text=Nie masz konta? Załóż konto');await p.fill('#imie','Ola');await p.fill('#email','ola@test.pl');await p.fill('#haslo',PW);await p.fill('#haslo2',PW);await p.click('#wyslij');
 await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 // mieszkanie: Łazienka (Płytki ścienne, Wywóz gruzu), Salon (Gniazda, Panele, Wywóz gruzu); 50 m², termin końca za 30 dni
 await p.click('#dodaj');await p.fill('#ulica','Próbna 7');await p.fill('#metraz','50');await p.fill('#termin_konca',D(30));await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('zapisane');await p.click('#dalej');
 await p.click('[data-rodzaj="Łazienka"]');await p.click('[data-rodzaj="Salon"]');await p.click('#dalej');
 for(const t of ['Płytki ścienne','Wywóz gruzu'])await p.locator('.kr',{hasText:t}).locator('input').check();
 await p.click('[data-otworz]:has-text("Salon")');for(const t of ['Gniazda','Panele','Wywóz gruzu'])await p.locator('.kr',{hasText:t}).locator('input').check();
 await p.click('#zatwierdz');await expect(p.locator('.msg')).toContainText('5 prac w 2 pomieszczeniach');
 const przyc=await p.$$eval('.moduly button',e=>e.map(x=>x.textContent.replace(/ –.*/,'')));
 spr(przyc.includes('Terminy')&&przyc.includes('Płatności')&&JSON.stringify(przyc)===JSON.stringify([...przyc].sort((a,c)=>a.localeCompare(c,'pl'))),name+' ekran mieszkania: przyciski „Płatności” i „Terminy”, A–Z ('+przyc.join(', ')+')');
 const dalej=await p.locator('#app').innerText();spr(!/dojdą tu:[^\n]*(Terminy|Płatności)/.test(dalej),name+' „Co będzie dalej” nie wymienia już Terminów ani Płatności');

 // ===== TERMINY: puste daty =====
 await p.click('#m-terminy');await expect(p.locator('h1')).toHaveText('Terminy – Próbna 7');
 await expect(p.locator('#etapy > .card')).toHaveCount(7);
 const nazwy=await p.$$eval('#etapy > .card b:first-child',e=>e.map(x=>x.textContent));spr(nazwy[0]==='1. Rozbiórki i przygotowanie'&&nazwy[6]==='7. Kuchnia, lampy i sprzątanie',name+' Terminy: 7 etapów w kolejności ('+nazwy.join(' | ')+')');
 const wiersze=await p.evaluate(()=>JSON.parse(localStorage.getItem('mock_terminy')).length);spr(wiersze===7,name+' etapy 1–7 założone w bazie ('+wiersze+')');
 await expect(etap(p,1)).toContainText('daty nie są wpisane · gotowe pomieszczenia: 0 z 2');await expect(etap(p,1).locator('button.zw > :last-child')).toHaveText('Czeka');
 await expect(etap(p,3).locator('button.zw > :last-child')).toHaveText('Brak prac');await expect(etap(p,3)).toContainText('w tym etapie nie ma prac');
 await expect(p.locator('#tKoniec')).toHaveText(PL(D(30)));await expect(p.locator('#tZostalo')).toHaveText('30 dni');await expect(p.locator('#tPrognoza')).toHaveText(PL(D(30)));
 spr(true,name+' Terminy puste daty: Czeka / Brak prac, koniec '+PL(D(30))+', zostało 30 dni, przewidywany = termin');
 await kontrola(p,name+' Terminy (puste daty)');
 // W trakcie i rozwinięcie
 await zrob(p,['Wywóz gruzu'],'Łazienka');await p.click('#wroc');await p.click('#m-terminy');
 await expect(etap(p,1).locator('button.zw > :last-child')).toHaveText('W trakcie');await expect(etap(p,1)).toContainText('gotowe pomieszczenia: 1 z 2');
 await etap(p,1).locator('button.zw').click();await expect(etap(p,1)).toContainText('Łazienka1 z 1');
 const roz=await etap(p,1).innerText();spr(/Łazienka\s*1 z 1\s*✓ Wywóz gruzu\s*Salon\s*0 z 1\s*○ Wywóz gruzu/.test(roz),name+' kliknięcie etapu rozwija pomieszczenia A–Z i prace ✓/○');
 await etap(p,1).locator('button.zw').click();await expect(etap(p,1)).toContainText('Pokaż pomieszczenia');
 // ===== Zmień daty: zły zakres, potem dobre =====
 await p.click('#zmienDaty');await expect(p.locator('h1')).toHaveText('Zmiana dat etapów');await kontrola(p,name+' Zmiana dat');
 await p.fill('#od-0',D(-30));await p.fill('#do-0',D(-3));await p.fill('#od-1',D(-20));await p.fill('#do-1',D(-5));await p.fill('#od-3',D(10));await p.fill('#do-3',D(2));
 await p.click('#zapisz');await expect(p.locator('.msg')).toHaveText('Etap „Ściany i sufity”: data „do” nie może być wcześniej niż data „od”.');
 spr(await p.inputValue('#od-0')===D(-30),name+' zły zakres dat: komunikat, wpisane daty zostają');
 const odrz=await p.evaluate(async()=>{const {data}=await sb.from('terminy').select('*');const t=data.find(x=>x.nr===4);const r=await sb.from('terminy').update({data_od:'2027-03-10',data_do:'2027-03-01'}).eq('id',t.id);return r.error?r.error.message:'ZAPISANO'});
 spr(/check/.test(odrz),name+' zły zakres dat odrzucony też przez bazę');
 await p.fill('#do-3',D(14));await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('Daty zapisane (zmienione etapy: 3)');
 // etap spóźniony
 await expect(etap(p,2).locator('.late')).toHaveText('Spóźnione 5 dni');await expect(etap(p,2)).toContainText(PL(D(-20))+' – '+PL(D(-5)));
 await expect(p.locator('#tPrognoza .late')).toHaveText(PL(D(35)));await expect(p.locator('#tZostalo')).toHaveText('30 dni');
 const st=await etap(p,2).locator('.late').evaluate(e=>[getComputedStyle(e).fontWeight,getComputedStyle(e).color,getComputedStyle(e,'::before').content]);
 spr(st[0]==='700'&&st[1]==='rgb(30, 26, 23)'&&st[2].includes('!'),name+' spóźnienie: pogrubiona czerń z wykrzyknikiem ('+st.join(', ')+')');
 await etap(p,1).locator('button.zw').click();await zrzut(p,'terminy',name);await etap(p,1).locator('button.zw').click();
 spr(true,name+' etap spóźniony 5 dni: przewidywany koniec '+PL(D(35))+' (termin + 5 dni)');await kontrola(p,name+' Terminy (spóźnienie)');
 // ===== + Dodaj etap =====
 await p.click('#dodajEtap');await expect(p.locator('h1')).toHaveText('Nowy etap');await kontrola(p,name+' Nowy etap');
 await p.click('#zapisz');await expect(p.locator('.msg')).toHaveText('Trzeba wpisać nazwę etapu.');
 await p.fill('#nazwa','Odbiór mieszkania');await p.fill('#od',D(33));await p.fill('#do',D(31));await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('data „do” nie może być wcześniej');
 await p.fill('#do',D(33));await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('Etap „Odbiór mieszkania” dodany');
 await expect(p.locator('#etapy > .card')).toHaveCount(8);await expect(etap(p,8)).toContainText('8. Odbiór mieszkania');await expect(p.locator('#tPrognoza')).toHaveText(PL(D(38)));
 spr(true,name+' „+ Dodaj etap”: 8. Odbiór mieszkania, przewidywany koniec przesunięty na '+PL(D(38)));
 await etap(p,8).locator('button.zw').click();await etap(p,8).locator('[data-zrobiony]').click();await expect(p.locator('.msg')).toContainText('jest zrobiony');await expect(etap(p,8).locator('button.zw > :last-child')).toHaveText('✓ Zrobione');
 await expect(etap(p,8).locator('[data-zrobiony]')).toHaveText('Odznacz');await etap(p,8).locator('[data-zrobiony]').click();await expect(p.locator('.msg')).toContainText('Odznaczono');
 spr(true,name+' etap dodany: „Oznacz jako zrobiony” i „Odznacz”');

 // ===== PŁATNOŚCI: brak ceny =====
 await p.click('#wroc');await p.click('#m-platnosci');await expect(p.locator('h1')).toHaveText('Płatności dla firmy – Próbna 7');
 await expect(p.locator('.msg')).toContainText('brakuje ceny firmy za m²');await expect(p.locator('.msg')).toContainText('„Pieniądze” albo „Zmień dane”');await expect(p.locator('#kUmowa')).toHaveText('–');
 spr(true,name+' Płatności bez ceny za m²: komunikat i umowa „–”');await kontrola(p,name+' Płatności (bez ceny)');
 await ustawM(p,{cena_firmy_m2:1000});await p.click('#wroc');await p.click('#m-platnosci');
 await expect(p.locator('#kUmowa')).toHaveText('50 000 zł');await expect(p.locator('#umowa')).toHaveText('1000 zł za m² × 50 m² = 50 000 zł');
 spr(true,name+' umowa = 1000 zł × 50 m² = 50 000 zł');
 // Ustal płatności: walidacja
 await p.click('#ustal');await expect(p.locator('h1')).toHaveText('Ustal płatności – Próbna 7');await kontrola(p,name+' Ustal płatności');
 const et=await p.$$eval('[data-robocza="0"] .pr .tx',e=>e.map(x=>x.textContent));spr(et.join('|')==='Rozbiórki i przygotowanie|Elektryka|Łazienka – płytki i biały montaż|Podłogi i drzwi|Odbiór mieszkania',name+' do płatności tylko etapy z pracami i dodane ('+et.join(', ')+')');
 await p.click('#zapiszP');await expect(p.locator('.msg')).toContainText('Płatność 1: kwota musi być liczbą większą od zera');
 await p.fill('#etK-0','20 000');await p.click('#zapiszP');await expect(p.locator('.msg')).toContainText('Płatność 1: trzeba zaznaczyć co najmniej jeden etap');
 await p.click('[data-robocza="0"] .pr:has-text("Rozbiórki") .box');await p.click('[data-robocza="0"] .pr:has-text("Elektryka") .box');
 await expect(p.locator('#etS')).toContainText('Brakuje 30 000 zł');spr(await p.inputValue('#etK-0')==='20 000',name+' kwota zostaje po zaznaczeniu etapu, podsumowanie „Brakuje 30 000 zł”');
 await p.click('#zapiszP');await expect(p.locator('.msg')).toContainText('Płatności zapisane (1)');
 await expect(p.locator('#porownanie .late')).toHaveText('Brakuje 30 000 zł');await expect(p.locator('#bez')).toHaveText('Etapy bez płatności: Łazienka – płytki i biały montaż, Podłogi i drzwi, Odbiór mieszkania');
 await expect(p.locator('[data-platnosc="1"]')).toContainText('Czeka na koniec: Rozbiórki i przygotowanie, Elektryka');
 spr(true,name+' suma ≠ umowa: „Brakuje 30 000 zł” i „Etapy bez płatności”');await kontrola(p,name+' Płatności (brakuje)');
 // druga płatność, etap w dwóch płatnościach odrzucony
 await p.click('#ustal');await p.click('#dodajP');await expect(p.locator('[data-robocza]')).toHaveCount(2);
 const zabl=p.locator('[data-robocza="1"] .pr:has-text("Rozbiórki") .box');await expect(zabl).toBeDisabled();await expect(p.locator('[data-robocza="1"] .pr:has-text("Rozbiórki")')).toContainText('(w płatności 1)');
 const dwa=await p.evaluate(async()=>{const f=S.flats[0].id;const {data}=await sb.from('terminy').select('*').eq('mieszkanie',f);const t1=data.find(x=>x.nr===1).id;const r=await sb.rpc('zapisz_platnosci',{m:f,dane:[{kwota:1,etapy:[t1]},{kwota:2,etapy:[t1]}]});return r.error?r.error.message:'ZAPISANO'});
 spr(dwa==='Etap może być tylko w jednej płatności',name+' etap w dwóch płatnościach: kratka zablokowana „(w płatności 1)”, baza odrzuca ('+dwa+')');
 await p.fill('#etK-1','35000');for(const t of ['Łazienka','Podłogi','Odbiór'])await p.click(`[data-robocza="1"] .pr:has-text("${t}") .box`);
 await expect(p.locator('#etS')).toContainText('Za dużo o 5000 zł');await expect(p.locator('#etS')).toContainText('✓ Wszystkie etapy mają płatność');
 await zrzut(p,'ustal',name);await p.click('#zapiszP');await expect(p.locator('#porownanie .late')).toHaveText('Za dużo o 5000 zł');spr(await p.locator('#bez').count()===0,name+' „Za dużo o 5000 zł”, wszystkie etapy mają płatność');
 await p.click('#ustal');await p.fill('#etK-1','30000');await expect(p.locator('#etS')).toContainText('✓ Zgadza się');await p.click('#zapiszP');await expect(p.locator('#porownanie')).toHaveText('✓ Zgadza się');
 spr(true,name+' suma = umowa: „✓ Zgadza się”');await zrzut(p,'platnosci',name);
 // usunięcie etapu, który jest w płatności – zablokowane
 await p.click('#wroc');await p.click('#m-terminy');await etap(p,8).locator('button.zw').click();await etap(p,8).locator('[data-usun]').click();await expect(p.locator('h1')).toHaveText('Usunąć etap?');await kontrola(p,name+' Usunąć etap');
 await p.click('#tak');await expect(p.locator('.msg')).toContainText('Ten etap jest w płatności');await p.click('#nie');spr(true,name+' etapu z płatności nie da się usunąć');
 // etapy skończone → czeka na zapłatę
 await zrob(p,['Wywóz gruzu','Gniazda']);await p.click('#wroc');await p.click('#m-terminy');
 await expect(etap(p,1).locator('button.zw > :last-child')).toHaveText('✓ Zrobione');await expect(etap(p,2).locator('button.zw > :last-child')).toHaveText('✓ Zrobione');
 await expect(etap(p,2)).toContainText('5 dni po dacie „do”');await expect(p.locator('#tPrognoza')).toHaveText(PL(D(38)));
 spr(true,name+' etap skończony po terminie: „✓ Zrobione”, „5 dni po dacie do”, przewidywany koniec dalej +5 dni');
 await p.click('#wroc');await p.click('#m-platnosci');const p1=p.locator('[data-platnosc="1"]');
 await expect(p1).toContainText('Wszystkie etapy skończone – czeka na zapłatę');await expect(p.locator('[data-platnosc="2"]')).toContainText('Czeka na koniec:');
 await p1.locator('[data-zaplac]').click();await expect(p.locator('.msg')).toContainText('Płatność 1 (20 000 zł) oznaczona jako zapłacona');
 await expect(p1).toContainText('✓ Zapłacone '+dzisPL);await expect(p.locator('#kZapl')).toHaveText('20 000 zł');await expect(p.locator('#kZost')).toHaveText('30 000 zł');
 spr(true,name+' „Oznacz jako zapłacone”: ✓ Zapłacone '+dzisPL+', zapłacone 20 000 zł, zostało 30 000 zł');await kontrola(p,name+' Płatności (zapłacone)');
 await p1.locator('[data-odznacz]').click();await expect(p.locator('.msg')).toContainText('Odznaczono – płatność 1 nie jest zapłacona');await expect(p1.locator('[data-zaplac]')).toBeVisible();await expect(p.locator('#kZapl')).toHaveText('0 zł');
 spr(true,name+' „Odznacz”: płatność wraca do „czeka na zapłatę”');
 // zmiana zapłaconej płatności zdejmuje „zapłacone”
 await p1.locator('[data-zaplac]').click();await expect(p1).toContainText('✓ Zapłacone');
 await p.click('#ustal');await expect(p.locator('[data-robocza="0"]')).toContainText('Ta płatność jest zapłacona');await p.fill('#etK-0','21000');await p.fill('#etK-1','29000');await p.click('#zapiszP');
 await expect(p.locator('.msg')).toContainText('Płatność 1 przestała być zapłacona');await expect(p1.locator('[data-zaplac]')).toBeVisible();await expect(p.locator('#porownanie')).toHaveText('✓ Zgadza się');
 spr(true,name+' zmiana kwoty zapłaconej płatności zdejmuje „zapłacone”');
 await p1.locator('[data-zaplac]').click();await expect(p1).toContainText('✓ Zapłacone');
 // brak płatności w ogóle → nie da się zapisać pustych
 await p.click('#ustal');await p.click('[data-usunp="1"]');await p.click('[data-usunp="0"]');await p.click('#zapiszP');await expect(p.locator('.msg')).toHaveText('Trzeba dodać co najmniej jedną płatność.');await p.click('#anuluj');
 await expect(p.locator('[data-platnosc]')).toHaveCount(2);spr(true,name+' pusta lista płatności odrzucona, „Anuluj” nic nie zmienia');

 // ===== SZEF FIRMY: tylko podgląd =====
 await p.evaluate(()=>{const us=JSON.parse(localStorage.getItem('mock_users'));us.push({id:'firma1',email:'firma@test.pl',password:'Dobrehaslo1',confirmed:true});localStorage.setItem('mock_users',JSON.stringify(us));
   const pr=JSON.parse(localStorage.getItem('mock_profile'));pr.push({id:'firma1',imie:'Jan',rola:'firma',nazwa_firmy:'Ekipa Próbna'});localStorage.setItem('mock_profile',JSON.stringify(pr));
   localStorage.setItem('mock_dostepy',JSON.stringify([{id:'d1',mieszkanie:JSON.parse(localStorage.getItem('mock_mieszkania'))[0].id,firma:'firma1',aktywny:true,wlasciciel:JSON.parse(localStorage.getItem('mock_mieszkania'))[0].wlasciciel}]))});
 await p.click('#wyloguj');await expect(p.locator('h1')).toHaveText('Zakładanie konta');await p.click('[data-t="logowanie"]');await expect(p.locator('h1')).toHaveText('Logowanie');await p.fill('#email','firma@test.pl');await p.fill('#haslo',PW);await p.click('#wyslij');
 await expect(p.locator('h1')).toHaveText('Moje zlecenia');
 // UWAGA: rdzeń (ekranListy) nie pokazuje szefowi firmy listy mieszkań (lista jest tylko w gałęzi Właściciela aplikacji) – mieszkanie otwieramy wprost
 if(await p.locator('.flat:has-text("Próbna 7")').count())await p.click('.flat:has-text("Próbna 7")');else{console.log('UWAGA '+name+' rdzeń: brak listy zleceń u szefa firmy – mieszkanie otwarte wprost');await p.evaluate(()=>ekranMieszkania(S.flats[0].id))}
 const przF=await p.$$eval('.moduly button',e=>e.map(x=>x.textContent.replace(/ –.*/,'')));spr(przF.includes('Terminy')&&przF.includes('Płatności')&&!przF.includes('Firma'),name+' firma: przyciski '+przF.join(', '));
 await p.click('#m-terminy');await expect(p.locator('#etapy > .card')).toHaveCount(8);
 spr(await p.locator('#dodajEtap,#zmienDaty').count()===0,name+' firma: Terminy bez „+ Dodaj etap” i „Zmień daty”');
 await expect(etap(p,2).locator('button.zw > :last-child')).toHaveText('✓ Zrobione');await expect(p.locator('#tPrognoza')).toHaveText(PL(D(38)));
 await etap(p,8).locator('button.zw').click();spr(await etap(p,8).locator('button:not(.zw)').count()===0,name+' firma: etap dodany bez przycisków');
 await etap(p,1).locator('button.zw').click();await expect(etap(p,1)).toContainText('✓ Wywóz gruzu');await kontrola(p,name+' firma Terminy');
 const zmF=await p.evaluate(async()=>{const {data}=await sb.from('terminy').select('*');const r=await sb.from('terminy').update({data_do:'2030-01-01'}).eq('id',data[0].id).select();const r2=await sb.from('terminy').insert({mieszkanie:data[0].mieszkanie,nazwa:'X'});const r3=await sb.rpc('zapisz_platnosci',{m:data[0].mieszkanie,dane:[{kwota:1,etapy:[data[0].id]}]});return [r.data.length,!!r2.error,r3.error&&r3.error.message]});
 spr(zmF[0]===0&&zmF[1]&&/Właściciel/.test(zmF[2]),name+' firma nie zmienia terminów ani płatności w bazie ('+zmF.join(', ')+')');
 await p.click('#wroc');await p.click('#m-platnosci');await expect(p.locator('h1')).toHaveText('Płatności – Próbna 7');
 await expect(p.locator('#dostali')).toHaveText('21 000 zł');await expect(p.locator('.card.dark')).toContainText('z 50 000 zł za całą robotę');await expect(p.locator('#zostaloF')).toHaveText('29 000 zł');
 await expect(p.locator('#umowa')).toHaveText('1000 zł za m² × 50 m² = 50 000 zł');
 await expect(p.locator('[data-platnosc="1"]')).toContainText('Rozbiórki i przygotowanie + Elektryka');await expect(p.locator('[data-platnosc="1"]')).toContainText('✓ 21 000 zł');
 await expect(p.locator('[data-platnosc="2"]')).toContainText('Łazienka – płytki i biały montaż + Podłogi i drzwi + Odbiór mieszkania');
 const txtF=await p.locator('#app').innerText();
 spr(await p.locator('#app button:not(#wroc)').count()===0&&!/zakup|Budżet|budżet/.test(txtF),name+' firma: „Dostaliście 21 000 zł z 50 000 zł”, co wchodzi w płatności, bez przycisków, bez ceny zakupu i budżetu');
 await kontrola(p,name+' firma Płatności');
 if(process.env.ZRZUTY)await p.screenshot({path:path.join(process.env.ZRZUTY,`firma_platnosci_${name}.png`),fullPage:true});
 spr(!errs.length,name+' brak błędów na stronie '+errs.join(';'));await ctx.close()}
console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close()})().catch(e=>{console.log('BLAD:',e.message.split('\n').slice(0,8).join('\n'));process.exit(1)});
