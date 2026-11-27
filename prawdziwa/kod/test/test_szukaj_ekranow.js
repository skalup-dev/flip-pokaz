// Test ekranów klocka 15 (Szukaj ekipy). Uruchamianie: NODE_PATH=$(npm root -g) node test_szukaj_ekranow.js
// Baza zastępcza: mock_pelny.js + rozszerzenie poniżej (zlecenia, zgłoszenia, pytania, konta firm – te same zasady co w 15_szukaj.sql).
// Dane zmyślone. Zdjęcia testowe (PNG) powstają w teście. ZRZUTY=<katalog> zapisuje zrzut każdego sprawdzanego ekranu.
const {chromium,expect}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=process.env.ROOT||path.join(__dirname,'..','..');const PORT=8795;const PW='Dobrehaslo1';
const ROZSZ=String.raw`
(function(){
  const L = k => JSON.parse(localStorage.getItem(k) || 'null'), W = (k,v) => localStorage.setItem(k, JSON.stringify(v));
  const uuid = () => 'u' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const ZAK = ['Drzwi wewnętrzne','Drzwi zewnętrzne','Elektryka','Hydraulika','Kuchnia','Łazienka','Okna','Podłogi','Ściany i sufity','Tapeta'];
  const orig = window.supabase.createClient;
  window.supabase.createClient = function(){
    const c = orig.apply(this, arguments), oFrom = c.from, oRpc = c.rpc;
    const uid = () => L('mock_session'); const prof = id => (L('mock_profile') || []).find(p => p.id === id) || {};
    const jestF = () => prof(uid()).rola === 'firma';
    const zl = id => (L('mock_zlecenia') || []).find(z => z.id === id) || {};
    const wyst = id => !!zl(id).wystawione;
    const zwiazana = (z, f) => (L('mock_zgloszenia') || []).some(g => g.zlecenie === z && g.firma === f) || (L('mock_pytania_zlecen') || []).some(p => p.zlecenie === z && p.firma === f && p.od === f);
    const widzi = { zlecenia:r => r.wlasciciel === uid(), zgloszenia:r => r.firma === uid() || zl(r.zlecenie).wlasciciel === uid(),
      pytania_zlecen:r => r.firma === uid() || zl(r.zlecenie).wlasciciel === uid(), dostepy:r => r.wlasciciel === uid() || r.firma === uid() };
    const zlOk = r => { if (!(r.zakres || []).every(k => ZAK.includes(k))) return 'violates check constraint "zlecenia_zakres_check"';
      if (r.terminy && (r.terminy.length !== 3 || new Set(r.terminy.map(t => String(t).slice(0,10))).size !== 3)) return 'violates check constraint "zlecenia_terminy_check"';
      if (r.wystawione && (!r.terminy || !(r.generalny || (r.zakres || []).length))) return 'violates check constraint "zlecenia_check"'; return null; };
    const RLS = { message:'new row violates row-level security policy' };
    c.from = t => {
      if (!widzi[t]) return oFrom(t);
      const q = { op:'select', filt:[], one:false, val:null };
      const b = { select(){ return b; }, insert(v){ q.op = 'insert'; q.val = v; return b; }, update(v){ q.op = 'update'; q.val = v; return b; }, delete(){ q.op = 'delete'; return b; },
        eq(k, v){ q.filt.push([k, v]); return b; }, order(){ return b; }, single(){ q.one = true; return b; }, then(a, e){ return run().then(a, e); } };
      async function run(){
        if (!uid()) return { data:null, error:{ message:'permission denied for table ' + t } };
        const all = L('mock_' + t) || []; const pas = r => widzi[t](r) && q.filt.every(([k, v]) => r[k] === v);
        if (q.op === 'select') return { data:all.filter(pas), error:null };
        if (q.op === 'insert'){
          const r = { id:uuid(), utworzono:new Date().toISOString(), ...q.val };
          if (t === 'zlecenia'){ r.wlasciciel = uid(); r.generalny = !!r.generalny; r.zakres = r.zakres || []; r.cena_m2 = r.cena_m2 ?? 900; r.wystawione = !!r.wystawione;
            if (!(L('mock_mieszkania') || []).some(m => m.id === r.mieszkanie && m.wlasciciel === uid())) return { data:null, error:RLS };
            if (all.some(x => x.mieszkanie === r.mieszkanie)) return { data:null, error:{ message:'duplicate key value violates unique constraint' } };
            const e = zlOk(r); if (e) return { data:null, error:{ message:e } }; }
          if (t === 'zgloszenia'){ r.firma = r.firma || uid(); r.wybor = null; r.zaden = false; r.adresy = r.adresy || []; r.zdjecia = r.zdjecia || [];
            if (r.firma !== uid() || !jestF() || !wyst(r.zlecenie)) return { data:null, error:RLS };
            if (all.some(x => x.zlecenie === r.zlecenie && x.firma === r.firma)) return { data:null, error:{ message:'duplicate key value violates unique constraint' } }; }
          if (t === 'pytania_zlecen'){ r.od = uid();
            const ok = (r.firma === uid() && jestF() && wyst(r.zlecenie)) || (zl(r.zlecenie).wlasciciel === uid() && zwiazana(r.zlecenie, r.firma));
            if (!ok) return { data:null, error:RLS }; }
          if (t === 'dostepy'){ r.wlasciciel = uid(); }
          all.push(r); W('mock_' + t, all); return { data:r, error:null };
        }
        if (q.op === 'update'){
          const rows = all.filter(r => pas(r) && (t !== 'zgloszenia' || r.firma === uid()));
          for (const r of rows){ const n = { ...r, ...q.val };
            if (t === 'zlecenia'){ const e = zlOk(n); if (e) return { data:null, error:{ message:e } }; }
            if (t === 'zgloszenia' && (!wyst(r.zlecenie) || (n.wybor != null && (n.wybor < 1 || n.wybor > 3)))) return { data:null, error:RLS }; }
          rows.forEach(r => { const zmTer = t === 'zlecenia' && 'terminy' in q.val && JSON.stringify(q.val.terminy) !== JSON.stringify(r.terminy); Object.assign(r, q.val);
            if (zmTer){ const g = L('mock_zgloszenia') || []; g.filter(x => x.zlecenie === r.id).forEach(x => { x.wybor = null; x.zaden = false; }); W('mock_zgloszenia', g); } });
          if (t === 'zlecenia'){ W('mock_' + t, all); } else { const g = t === 'zgloszenia' ? all : all; W('mock_' + t, g); }
          return { data:rows, error:null };
        }
        if (q.op === 'delete'){ if (t !== 'zgloszenia') return { data:null, error:{ message:'permission denied for table ' + t } };
          W('mock_' + t, all.filter(r => !(pas(r) && r.firma === uid()))); return { data:null, error:null }; }
      }
      return b;
    };
    c.rpc = async (n, a) => {
      const u = uid();
      if (n === 'nowe_mieszkania'){ if (!jestF()) return { data:[], error:null };
        const m = L('mock_mieszkania') || [], g = L('mock_zgloszenia') || [];
        return { data:(L('mock_zlecenia') || []).filter(z => z.wystawione).map(z => { const x = m.find(y => y.id === z.mieszkanie) || {}, my = g.find(y => y.zlecenie === z.id && y.firma === u);
          return { id:z.id, miasto:x.miasto || null, ulica:my && my.wybor ? x.ulica : null, metraz:x.metraz ?? null, generalny:z.generalny, zakres:z.zakres, dopisek:z.dopisek, termin:z.termin,
            cena_m2:z.cena_m2, terminy:z.terminy, wystawiono:z.wystawiono, zgloszenie:my ? my.id : null, adresy:my ? my.adresy : null, zdjecia:my ? my.zdjecia : null, wybor:my ? my.wybor : null, zaden:my ? my.zaden : null }; })
          .sort((p, q) => String(p.miasto).localeCompare(String(q.miasto), 'pl')), error:null }; }
      if (n === 'pliki_zlecenia'){ const z = zl(a.z); if (!jestF() || !z.wystawione) return { data:[], error:null };
        return { data:(L('mock_pliki') || []).filter(f => f.mieszkanie === z.mieszkanie && ['plany','zdjecia_przed','zdjecia_wiz'].includes(f.folder)).map(f => ({ sciezka:f.sciezka, folder:f.folder, typ:f.typ })), error:null }; }
      if (n === 'szukaj_firmy'){ if (zl(a.z).wlasciciel !== u) return { data:[], error:null };
        return { data:(L('mock_profile') || []).filter(p => zwiazana(a.z, p.id)).map(p => ({ firma:p.id, nazwa:(p.nazwa_firmy || p.imie || 'Firma remontowa') })), error:null }; }
      if (n === 'odwolaj_spotkanie'){ const g = L('mock_zgloszenia') || [], x = g.find(y => y.id === a.g && zl(y.zlecenie).wlasciciel === u);
        if (!x) return { data:null, error:{ message:'Nie ma takiej firmy przy zleceniu' } }; x.wybor = null; x.zaden = false; W('mock_zgloszenia', g); return { data:null, error:null }; }
      return oRpc(n, a || {});
    };
    return c;
  };
})();`;
const MOCK=fs.readFileSync(__dirname+'/mock_pelny.js','utf8')+'\n'+ROZSZ;
// małe zdjęcia PNG do testu
function crc(b){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}let x=0xffffffff;for(const v of b)x=t[(x^v)&255]^(x>>>8);return (x^0xffffffff)>>>0}
function png(r,g,bl){const w=60,h=40,raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=r;raw[o+1]=g;raw[o+2]=bl}}
 const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])};
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw)),ch('IEND',Buffer.alloc(0))])}
const Z1={name:'realizacja1.png',mimeType:'image/png',buffer:png(30,26,23)},Z2={name:'realizacja2.png',mimeType:'image/png',buffer:png(184,146,74)};
const srv=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0].split('#')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});r.end(d)})}).listen(PORT);
const URL=`http://127.0.0.1:${PORT}/index.html`;let zle=0,ok=0;const spr=(w,t)=>{console.log((w?'OK   ':'ZLE  ')+t);w?ok++:zle++};
const TY=/\b(Kliknij|Możesz|możesz|Wpisz|Sprawdź|Odczekaj|wrócisz|Wybierz|Zaznacz|Twoj\w*|Twój|zrobiłeś|dodałeś|Wziąłeś|wziąłeś|napisałeś|czekasz|zrezygnowałeś|masz)\b/;
let nrZ=0;async function kontrola(p,gdzie){if(process.env.ZRZUTY)await p.screenshot({path:path.join(process.env.ZRZUTY,String(++nrZ).padStart(2,'0')+' '+gdzie.replace(/[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ ()-]/g,'')+'.png'),fullPage:true});const t=await p.evaluate(()=>[...document.querySelectorAll('#app h1,#app .intro,#app .msg,#app .empty,#app label,#app .card,#app h2')].map(e=>e.innerText).join(' | '));const m=t.match(TY);
 const sz=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);const st=await p.evaluate(()=>!!document.querySelector('.stopka b'));
 const biale=await p.evaluate(()=>[...document.querySelectorAll('#app *')].some(e=>{const c=getComputedStyle(e).backgroundColor;return c==='rgb(255, 255, 255)'}));
 spr(!m&&sz<=0&&st&&!biale,gdzie+': bez formy Ty, bez przewijania w bok, stopka, bez białego tła'+(m?' (Ty: '+m[0]+')':'')+(sz>0?' (w bok '+sz+')':'')+(biale?' (BIAŁE TŁO)':''))}
const h1=p=>p.locator('#app h1');
async function wyloguj(p){await p.click('#wyloguj');await expect(h1(p)).toHaveText(/Logowanie|Zakładanie konta/)}
async function zaloz(p,imie,email){await wyloguj(p);if(await p.locator('[data-t="rejestracja"]').count())await p.click('[data-t="rejestracja"]');await p.fill('#imie',imie);await p.fill('#email',email);await p.fill('#haslo',PW);await p.fill('#haslo2',PW);await p.click('#wyslij');await expect(h1(p)).toHaveText('Moje mieszkania')}
async function zaloguj(p,email,h){await wyloguj(p);if(await p.locator('[data-t="logowanie"]').count())await p.click('[data-t="logowanie"]');await p.fill('#email',email);await p.fill('#haslo',PW);await p.click('#wyslij');await expect(h1(p)).toHaveText(h)}
async function naFirme(p,nazwa){await p.evaluate(n=>{const pr=JSON.parse(localStorage.getItem('mock_profile'));const me=pr.find(x=>x.id===localStorage.getItem('mock_session').replace(/"/g,''));me.rola='firma';me.nazwa_firmy=n;localStorage.setItem('mock_profile',JSON.stringify(pr));return wczytaj()},nazwa);await expect(h1(p)).toHaveText('Moje zlecenia')}
const msg=p=>p.locator('#app .msg').first();
(async()=>{const b=await chromium.launch();
for(const [name,vp] of [['pc',{width:1280,height:900}],['tel',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp,locale:'pl-PL'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(20000);
 await p.route('**/supabase.js',r=>r.fulfill({body:MOCK,contentType:'application/javascript'}));await p.route('**/config.js',r=>r.fulfill({body:'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};',contentType:'application/javascript'}));
 await p.goto(URL);await expect(h1(p)).toHaveText('Logowanie');
 await p.click('text=Nie masz konta? Załóż konto');await p.fill('#imie','Pati');await p.fill('#email','pati@test.pl');await p.fill('#haslo',PW);await p.fill('#haslo2',PW);await p.click('#wyslij');await expect(h1(p)).toHaveText('Moje mieszkania');
 // mieszkania testowe (zmyślone) + plan mieszkania + drugie mieszkanie z firmą
 await p.evaluate(async()=>{const m=(await sb.from('mieszkania').insert({ulica:'Zmyślona 5/2',miasto:'Testowo',metraz:50}).select().single()).data;
  const m2=(await sb.from('mieszkania').insert({ulica:'Próbna 1',miasto:'Testowo',metraz:40}).select().single()).data;
  await sb.from('dostepy').insert({mieszkanie:m2.id,firma:'firma-x',aktywny:true});
  const c=document.createElement('canvas');c.width=80;c.height=60;const x=c.getContext('2d');x.fillStyle='#B8924A';x.fillRect(0,0,80,60);const bl=await new Promise(r=>c.toBlob(r,'image/jpeg'));
  const sc=S.user.id+'/'+m.id+'/plany/plan.jpg';await sb.storage.from('biblioteka').upload(sc,bl);await sb.from('pliki').insert({mieszkanie:m.id,folder:'plany',nazwa:'Zmyslona 5 plan.jpg',sciezka:sc,typ:'zdjecie'});
  await wczytaj()});
 await expect(p.locator('.flat')).toHaveCount(2);
 await p.click('.flat:has-text("Zmyślona 5/2")');await expect(p.locator('#m-szukaj')).toHaveText('Szukaj ekipy');
 const mods=await p.$$eval('.moduly button',e=>e.map(x=>x.textContent.split(' – ')[0]));spr(mods.join('|')===[...mods].sort((a,b)=>a.localeCompare(b,'pl')).join('|'),name+' przyciski mieszkania A–Z ('+mods.join(', ')+')');
 await p.click('#m-szukaj');await expect(h1(p)).toHaveText('Szukaj ekipy – Zmyślona 5/2');
 await expect(p.locator('#szRazem')).toHaveText('45 000 zł');await expect(p.locator('#szCena')).toHaveValue('900');spr(true,name+' cena domyślna 900 zł/m² × 50 m² = 45 000 zł');
 const kr=await p.$$eval('.sz-kratki [data-z]',e=>e.map(x=>x.dataset.z));spr(kr.join('|')==='Drzwi wewnętrzne|Drzwi zewnętrzne|Elektryka|Hydraulika|Kuchnia|Łazienka|Okna|Podłogi|Ściany i sufity|Tapeta',name+' kratki zakresu A–Z, „Generalny remont” osobno na górze');
 await kontrola(p,name+' Szukaj ekipy (nowe)');
 // wystaw bez zakresu
 await p.fill('#szT0','2030-03-04T16:00');await p.fill('#szT1','2030-03-05T17:00');await p.fill('#szT2','2030-03-06T10:00');
 await p.click('#szWystaw');await expect(msg(p)).toContainText('co najmniej jedną kratkę');spr(true,name+' wystaw bez zakresu: odrzucone');
 await p.click('[data-z="Generalny remont pod sprzedaż"]');await p.click('[data-z="Elektryka"]');await p.click('[data-z="Łazienka"]');
 // terminy w ten sam dzień
 await p.fill('#szT1','2030-03-04T18:00');await p.click('#szWystaw');await expect(msg(p)).toContainText('Każdy termin oglądania musi być w inny dzień.');spr(true,name+' terminy w ten sam dzień: odrzucone');
 await p.fill('#szT1','2030-03-05T17:00');await p.fill('#szDop','Okna zostają');await p.fill('#szTer','2,5 miesiąca');
 await p.fill('#szCena','1000');await expect(p.locator('#szRazem')).toHaveText('50 000 zł');await p.fill('#szCena','900');
 await p.click('#szWystaw');await expect(msg(p)).toContainText('Zlecenie wystawione.');
 await expect(p.locator('#szStan')).toContainText('Zlecenie wystawione w folderze „Nowe mieszkania” u wszystkich firm');
 const chipy=await p.$$eval('#szTerminyWidok .sz-chip',e=>e.map(x=>x.textContent));spr(chipy.join('|')==='pon 4.3 · 16:00|wt 5.3 · 17:00|śr 6.3 · 10:00',name+' wystawione: 3 terminy ('+chipy.join(', ')+')');
 await expect(p.locator('h2').first()).toHaveText('Firmy, które wzięły zlecenie (0)');await kontrola(p,name+' Szukaj ekipy (wystawione)');
 const db=await p.evaluate(async()=>(await sb.from('zlecenia').select('*')).data[0]);spr(db.wystawione&&db.generalny&&db.zakres.join()==='Elektryka,Łazienka'&&db.cena_m2===900,name+' zlecenie zapisane w bazie');
 await p.click('#wroc');await expect(p.locator('#m-szukaj')).toHaveText('Szukaj ekipy – wystawione · 0 firm wzięło zlecenie');await p.click('#wroc');await expect(p.locator('.flat:has-text("Zmyślona") .sz-szuka')).toContainText('Szuka ekipy');spr(true,name+' lista mieszkań: „Szuka ekipy”, przycisk ze stanem');
 await p.click('.flat:has-text("Próbna 1")');await p.click('#m-szukaj');await expect(p.locator('#app .card').first()).toContainText('To mieszkanie ma już firmę remontową');await expect(p.locator('#szWystaw')).toHaveCount(0);spr(true,name+' mieszkanie z firmą: zlecenia nie da się wystawić, jest wyjaśnienie');
 // FIRMA 1
 await zaloz(p,'Jan','firma1@test.pl');await naFirme(p,'Zielona Ekipa');
 await expect(p.locator('#szNowe')).toContainText('Zlecenia do wzięcia: 1');await kontrola(p,name+' Moje zlecenia (firma)');
 await p.click('#szNowe');await expect(h1(p)).toHaveText('Nowe mieszkania');const karta=p.locator('[data-zl]');await expect(karta).toHaveCount(1);
 const txt=await p.locator('#app').innerText();spr(!txt.includes('Zmyślona')&&!txt.includes('Zmyslona')&&txt.includes('Testowo'),name+' firma widzi tylko miejscowość (bez ulicy i nazwy pliku)');
 await expect(karta).toContainText('Generalny remont pod sprzedaż: elektryka, łazienka. Okna zostają. Termin: 2,5 miesiąca.');await expect(karta.locator('.sz-cena')).toContainText('900 zł brutto/m² · 45 000 zł');
 await p.waitForFunction(()=>{const i=document.querySelector('[data-zl] .sz-mini img');return i&&i.complete&&i.naturalWidth>0});await expect(karta.locator('figcaption')).toHaveText('Plan');spr(true,name+' firma: opis, cena, plan widoczny');
 await kontrola(p,name+' Nowe mieszkania');
 await karta.locator('input[id^="pyt-"]').fill('Czy okna zostają?');await karta.locator('[data-pytaj]').click();await expect(msg(p)).toContainText('Pytanie wysłane. Widzi je tylko Zielona Ekipa i Właściciel aplikacji.');await expect(p.locator('.sz-wiad')).toHaveText(/Czy okna zostają\?/);spr(true,name+' firma: pytanie wysłane prywatnie');
 await p.click('[data-biore]');await expect(h1(p)).toHaveText('Biorę zlecenie – Testowo');await kontrola(p,name+' Biorę zlecenie');
 await p.click('#szWyslij');await expect(msg(p)).toContainText('co najmniej jedno zdjęcie realizacji albo jeden adres');spr(true,name+' Biorę zlecenie bez zdjęć i adresów: odrzucone');
 await p.setInputFiles('#szReal',[Z1,Z2]);await expect(p.locator('#szFotki figure')).toHaveCount(2);await p.fill('#szAdr','ul. Wzorowa 1, Testowo\nul. Polna 2, Testowo');
 await p.click('#szWyslij');await expect(msg(p)).toContainText('Zlecenie wzięte.');await expect(p.locator('[data-wybor]')).toHaveCount(3);spr(true,name+' firma wzięła zlecenie (2 zdjęcia, 2 adresy), widzi 3 terminy');await kontrola(p,name+' wybór terminu');
 await p.click('[data-wybor="2"]');await expect(msg(p)).toContainText('Termin oglądania wybrany: wt 5.3 · 17:00');await expect(karta).toContainText('Adres: Zmyślona 5/2, Testowo');
 const href=await karta.locator('.sz-adr a').getAttribute('href');spr(href.startsWith('https://www.google.com/maps/dir/?api=1&destination=')&&href.includes(encodeURIComponent('Zmyślona 5/2')),name+' po wyborze terminu: pełny adres i „Prowadź”');await kontrola(p,name+' termin wybrany');
 await p.click('[data-zmien]');await expect(msg(p)).toContainText('Odznaczono – termin oglądania zwolniony.');await expect(karta).not.toContainText('Zmyślona');spr(true,name+' „Odznacz – zmień termin”: adres znowu ukryty');
 await p.click('[data-zaden]');await expect(msg(p)).toContainText('żaden termin nie pasuje');await expect(karta.locator('.sz-ok')).toHaveText('Zlecenie wzięte · żaden termin nie pasuje');spr(true,name+' „Żaden mi nie pasuje” zapisane');
 // FIRMA 2: nie widzi pytań firmy 1, bierze, rezygnuje, bierze jeszcze raz
 await zaloz(p,'Ola','firma2@test.pl');await naFirme(p,'Bud-Test');await p.click('#szNowe');await expect(h1(p)).toHaveText('Nowe mieszkania');
 await expect(p.locator('.sz-wiad')).toHaveCount(0);await expect(p.locator('[data-biore]')).toHaveCount(1);spr(true,name+' druga firma nie widzi pytań ani wyboru pierwszej');
 await p.click('[data-biore]');await p.fill('#szAdr','ul. Testowa 9, Testowo');await p.click('#szWyslij');await expect(msg(p)).toContainText('Zlecenie wzięte.');
 await p.click('[data-wybor="1"]');await expect(msg(p)).toContainText('pon 4.3 · 16:00');
 await p.click('[data-rezygnuj]');await expect(msg(p)).toContainText('Odznaczono – rezygnacja ze zlecenia zapisana.');await expect(p.locator('[data-biore]')).toHaveCount(1);
 const zgl2=await p.evaluate(async()=>(await sb.from('zgloszenia').select('*')).data.length);spr(zgl2===0,name+' „Odznacz – rezygnuję”: zgłoszenie usunięte');
 await p.click('[data-biore]');await p.fill('#szAdr','ul. Testowa 9, Testowo');await p.click('#szWyslij');await expect(msg(p)).toContainText('Zlecenie wzięte.');await p.click('[data-wybor="3"]');await expect(msg(p)).toContainText('śr 6.3 · 10:00');
 // WŁAŚCICIEL: firmy A–Z, realizacje, Prowadź, pytania, odwołanie, nowe terminy
 await zaloguj(p,'pati@test.pl','Moje mieszkania');await p.click('.flat:has-text("Zmyślona 5/2")');await expect(p.locator('#m-szukaj')).toHaveText('Szukaj ekipy – wystawione · 2 firmy wzięły zlecenie');await p.click('#m-szukaj');
 await expect(p.locator('h2').first()).toHaveText('Firmy, które wzięły zlecenie (2)');const fn=await p.$$eval('[data-firma] .sz-big',e=>e.map(x=>x.textContent));spr(fn.join('|')==='Bud-Test|Zielona Ekipa',name+' firmy A–Z ('+fn.join(', ')+')');
 const zi=p.locator('[data-firma]',{hasText:'Zielona Ekipa'}),bu=p.locator('[data-firma]',{hasText:'Bud-Test'});
 await expect(zi.locator('.zw span')).toHaveText('2 zdjęcia realizacji');await p.waitForFunction(()=>[...document.querySelectorAll('.sz-zoom')].length===2&&[...document.querySelectorAll('.sz-zoom')].every(i=>i.complete&&i.naturalWidth>0));
 const hr=await zi.locator('.sz-adr a').evaluateAll(e=>e.map(a=>a.href+'|'+a.target));spr(hr.length===2&&hr[0].includes('destination=ul.%20Wzorowa%201%2C%20Testowo')&&hr[0].endsWith('|_blank'),name+' realizacje: 2 zdjęcia, 2 adresy z „Prowadź” (mapy w nowej karcie)');
 await expect(zi.locator('.late')).toContainText('Firmie nie pasuje żaden z terminów');await expect(bu.locator('.sz-ok')).toHaveText('Firma wybrała termin: śr 6.3 · 10:00 · adres wysłany firmie');spr(true,name+' właściciel widzi: „nie pasuje żaden” i wybrany termin');
 await expect(zi.locator('.sz-wiad')).toContainText('Czy okna zostają?');await expect(bu.locator('.sz-wiad')).toHaveCount(0);spr(true,name+' pytanie widać tylko przy firmie, która je zadała');
 await zi.locator('.sz-zoom').first().click();await expect(p.locator('#okno')).toBeVisible();await p.click('#zamknij');
 await kontrola(p,name+' Szukaj ekipy (firmy)');
 await zi.locator('input[id^="odp-"]').fill('Tak, okna zostają.');await zi.locator('[data-odp]').click();await expect(msg(p)).toContainText('Odpowiedź wysłana do firmy Zielona Ekipa.');await expect(zi.locator('.sz-wiad.ja')).toContainText('Tak, okna zostają.');
 await bu.locator('[data-odwolaj]').click();await expect(msg(p)).toContainText('Odznaczono – spotkanie z firmą Bud-Test odwołane.');await expect(bu).toContainText('Firma jeszcze nie wybrała terminu.');spr(true,name+' „Odznacz – odwołaj spotkanie”');
 await p.click('#szZmienT');await p.fill('#szT0','2030-04-01T10:00');await p.fill('#szT1','2030-04-01T12:00');await p.fill('#szT2','2030-04-03T10:00');await p.click('#szZapiszT');await expect(msg(p)).toContainText('Każdy termin oglądania musi być w inny dzień.');
 await p.fill('#szT1','2030-04-02T12:00');await p.click('#szZapiszT');await expect(msg(p)).toContainText('Nowe terminy zapisane');await expect(zi).toContainText('Firma jeszcze nie wybrała terminu.');spr(true,name+' „Zmień terminy”: ten sam dzień odrzucony, nowe terminy zerują wybór firm');
 await p.click('[data-z="Okna"]');await p.click('#szZapisz');await expect(msg(p)).toContainText('Zmiany zapisane.');const zk=await p.evaluate(async()=>(await sb.from('zlecenia').select('zakres')).data[0].zakres.join());spr(zk==='Elektryka,Łazienka,Okna',name+' „Zapisz zmiany”: zakres w bazie ('+zk+')');
 // FIRMA 1 widzi odpowiedź i nowe terminy
 await zaloguj(p,'firma1@test.pl','Moje zlecenia');await p.click('#szNowe');await expect(p.locator('.sz-wiad')).toHaveCount(2);await expect(p.locator('.sz-wiad').nth(1)).toContainText('Tak, okna zostają.Właściciel aplikacji');
 const ch2=await p.$$eval('[data-wybor]',e=>e.map(x=>x.textContent));spr(ch2.join('|')==='pon 1.4 · 10:00|wt 2.4 · 12:00|śr 3.4 · 10:00',name+' firma: odpowiedź Właściciela aplikacji i nowe terminy do wyboru');
 // WŁAŚCICIEL wycofuje
 await zaloguj(p,'pati@test.pl','Moje mieszkania');await p.click('.flat:has-text("Zmyślona 5/2")');await p.click('#m-szukaj');await p.click('#szWycofaj');await expect(msg(p)).toContainText('Odznaczono – zlecenie wycofane.');await expect(p.locator('#szWystaw')).toBeVisible();spr(true,name+' „Odznacz – wycofaj zlecenie”');
 await zaloguj(p,'firma1@test.pl','Moje zlecenia');await expect(p.locator('#szNowe')).toContainText('Zlecenia do wzięcia: 0');await p.click('#szNowe');await expect(p.locator('.empty')).toContainText('Teraz nie ma nowych mieszkań.');spr(true,name+' po wycofaniu firma nie widzi zlecenia');await kontrola(p,name+' Nowe mieszkania (puste)');
 // BRAT: zwykłe konto bez firmy
 await zaloz(p,'Brat','brat@test.pl');await expect(p.locator('#szNowe')).toHaveCount(0);const br=await p.evaluate(async()=>[(await sb.rpc('nowe_mieszkania')).data.length,(await sb.from('zlecenia').select('*')).data.length,(await sb.from('zgloszenia').select('*')).data.length]);
 spr(br.every(x=>x===0),name+' brat (konto bez firmy): nie widzi zleceń ('+br.join(', ')+')');
 spr(!errs.length,name+' brak błędów na stronie '+errs.join(';'));await ctx.close()}
console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close()})().catch(e=>{console.log('BLAD:',e.message.split('\n').slice(0,10).join('\n'));process.exit(1)});
