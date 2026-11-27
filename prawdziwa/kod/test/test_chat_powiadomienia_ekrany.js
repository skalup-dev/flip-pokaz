// Test ekranów klocków 12 (Chat) i 13 (Powiadomienia) na bazie zastępczej.
// Uruchamianie: NODE_PATH=$(npm root -g) node test_chat_powiadomienia_ekrany.js
// Baza zastępcza: mock_pelny.js + rozszerzenie poniżej (dostępy firm, chat, chat ogólny, zdarzenia, ustawienia – te same zasady co w SQL).
// Zdjęcia testowe robi sam test (canvas w przeglądarce). Dane zmyślone.
const {chromium,expect}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const root=process.env.ROOT||path.join(__dirname,'..','..');const PORT=8791;
const MOCK=fs.readFileSync(__dirname+'/mock_pelny.js','utf8');
const EXT=`
(function(){
  const L=k=>JSON.parse(localStorage.getItem(k)||'null'), W=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const uuid=()=>'u'+Math.random().toString(16).slice(2)+Date.now().toString(16);
  const teraz=()=>{ const t=new Date(Math.max(Date.now(), (window.__ost||0)+1)); window.__ost=t.getTime(); return t.toISOString(); };
  const orig=window.supabase.createClient;
  window.supabase.createClient=function(){
    const c=orig.apply(this,arguments);
    const uid=()=>L('mock_session');
    const prof=id=>(L('mock_profile')||[]).find(p=>p.id===id);
    const firmaKonto=u=>{ const p=prof(u); return !!p && p.rola==='firma'; };
    const dost=()=>L('mock_dostepy')||[];
    const aktywny=(m,f)=>dost().some(d=>d.mieszkanie===m&&d.firma===f&&d.aktywny);
    const wlM=m=>((L('mock_mieszkania')||[]).find(x=>x.id===m)||{}).wlasciciel;
    const wspol=(w,f)=>dost().some(d=>d.wlasciciel===w&&d.firma===f&&d.aktywny);
    const nazwa=u=>{ const p=prof(u); if(!p) return 'Właściciel aplikacji'; return (p.rola==='firma'?p.nazwa_firmy:p.imie)||(p.rola==='firma'?'Firma remontowa':'Właściciel aplikacji'); };
    const skrot=t=>t.length>80?t.slice(0,79)+'…':t;
    const zdarz=(odb,m,rodzaj,tresc,cel,cel_id)=>{ if(!odb||odb===uid()) return; const z=L('mock_zdarzenia')||[]; z.push({id:uuid(),odbiorca:odb,mieszkanie:m,rodzaj,tresc,cel,cel_id,autor:uid(),przeczytane:false,utworzono:teraz()}); W('mock_zdarzenia',z); };
    const RLS='new row violates row-level security policy';
    const REG={
      dostepy:{ widzi:(r,u)=>r.wlasciciel===u||r.firma===u, zmien:(r,u)=>r.wlasciciel===u, usun:(r,u)=>r.wlasciciel===u,
        wstaw:(v,u)=>wlM(v.mieszkanie)===u?{id:uuid(),wlasciciel:u,kod:uuid(),firma:null,aktywny:true,utworzono:teraz(),przyjeto:null,...v}:RLS },
      wiadomosci:{ widzi:(r,u)=>r.wlasciciel===u||(r.firma===u&&aktywny(r.mieszkanie,u)), zmien:()=>false, usun:()=>false,
        wstaw:(v,u)=>{ const w=wlM(v.mieszkanie); const n={id:uuid(),mieszkanie:v.mieszkanie,wlasciciel:w,autor:u,utworzono:teraz(),tresc:(v.tresc||'').trim()||null,plik:v.plik||null,zdjecie:null,firma:v.firma||null};
          if(u===w){ if(!n.firma){ const d=dost().find(x=>x.mieszkanie===n.mieszkanie&&x.aktywny&&x.firma); n.firma=d&&d.firma; if(!n.firma) return 'To mieszkanie nie ma jeszcze firmy z dostępem. Chat ruszy, gdy szef firmy przyjmie zaproszenie'; }
            else if(!aktywny(n.mieszkanie,n.firma)) return 'Ta firma nie ma teraz dostępu do mieszkania, więc nie można do niej pisać'; }
          else { n.firma=u; if(!aktywny(n.mieszkanie,u)) return RLS; }
          if(n.plik){ const p=(L('mock_pliki')||[]).find(x=>x.id===n.plik&&x.mieszkanie===n.mieszkanie&&x.folder==='postepy'&&x.dodal===u); if(!p) return 'To zdjęcie nie należy do tego mieszkania'; n.zdjecie=p.sciezka; }
          if(!n.tresc&&!n.plik) return 'Najpierw trzeba wpisać wiadomość albo dołączyć zdjęcie';
          return n; },
        po:n=>{ const t='Wiadomość od '+nazwa(n.autor)+': '+(n.tresc?'„'+skrot(n.tresc)+'”':'zdjęcie')+(n.tresc&&n.plik?' + zdjęcie':''); zdarz(n.autor===n.wlasciciel?n.firma:n.wlasciciel,n.mieszkanie,'wiadomosc',t,'chat',n.firma); } },
      wiadomosci_ogolne:{ widzi:(r,u)=>r.wlasciciel===u||(wspol(r.wlasciciel,u)&&(!r.firma||r.firma===u)), zmien:()=>false, usun:()=>false,
        wstaw:(v,u)=>{ const n={id:uuid(),wlasciciel:v.wlasciciel||u,autor:u,tresc:(v.tresc||'').trim(),utworzono:teraz()}; if(!n.tresc) return 'Najpierw trzeba wpisać wiadomość';
          n.firma=n.wlasciciel===u?null:u; if(n.firma?!wspol(n.wlasciciel,u):firmaKonto(u)) return RLS; return n; },
        po:n=>{ const t='Chat ogólny – '+nazwa(n.autor)+': „'+skrot(n.tresc)+'”'; if(!n.firma) [...new Set(dost().filter(d=>d.wlasciciel===n.wlasciciel&&d.aktywny&&d.firma).map(d=>d.firma))].forEach(f=>zdarz(f,null,'ogolny',t,'ogolny',n.wlasciciel)); else zdarz(n.wlasciciel,null,'ogolny',t,'ogolny',n.wlasciciel); } },
      zdarzenia:{ widzi:(r,u)=>r.odbiorca===u, zmien:(r,u)=>r.odbiorca===u, usun:()=>false, wstaw:()=>'permission denied for table zdarzenia' },
      ustawienia_powiadomien:{ widzi:(r,u)=>r.konto===u, zmien:(r,u)=>r.konto===u, usun:()=>false,
        wstaw:(v,u)=>v.konto&&v.konto!==u?RLS:{dzwonek:true,telefon:true,telegram:true,telegram_chat_id:null,...v,konto:u} },
      // firma: pliki, pomieszczenia, prace swojego mieszkania (jak w 06_szef_firmy.sql)
      pliki_f:{ tab:'pliki', widzi:(r,u)=>aktywny(r.mieszkanie,u)&&['plany','postepy','poprawki','zdjecia_po','zdjecia_przed','zdjecia_wiz','paragony'].includes(r.folder), zmien:()=>false, usun:()=>false,
        wstaw:(v,u)=>aktywny(v.mieszkanie,u)&&v.wlasciciel===wlM(v.mieszkanie)&&['postepy','poprawki','paragony'].includes(v.folder)?{id:uuid(),utworzono:teraz(),dodal:u,...v}:RLS },
      pomieszczenia_f:{ tab:'pomieszczenia', widzi:(r,u)=>aktywny(r.mieszkanie,u), zmien:()=>false, usun:()=>false, wstaw:()=>RLS },
      prace_f:{ tab:'prace', widzi:(r,u)=>aktywny(r.mieszkanie,u), zmien:(r,u)=>aktywny(r.mieszkanie,u), usun:()=>false, wstaw:()=>RLS }
    };
    function mojFrom(klucz){
      const R=REG[klucz], t=R.tab||klucz, q={op:'select',filt:[],inn:[],ord:null,lim:null,one:false};
      const b={ select(){return b}, insert(v){q.op='insert';q.val=v;return b}, update(v){q.op='update';q.val=v;return b}, delete(){q.op='delete';return b},
        eq(c,v){q.filt.push([c,v]);return b}, in(c,vs){q.inn.push([c,vs]);return b}, order(c,o){q.ord=[c,!(o&&o.ascending===false)];return b}, limit(n){q.lim=n;return b},
        single(){q.one=true;return b}, then(res,rej){return run().then(res,rej)} };
      async function run(){
        const u=uid(); if(!u) return {data:null,error:{message:'permission denied for table '+t}};
        let all=L('mock_'+t)||[];
        const pasuje=r=>R.widzi(r,u)&&q.filt.every(([c,v])=>r[c]===v)&&q.inn.every(([c,vs])=>vs.includes(r[c]));
        if(q.op==='select'){ let w=all.filter(pasuje); if(q.ord){const [c,a]=q.ord;w.sort((x,y)=>String(x[c]).localeCompare(String(y[c]))*(a?1:-1))} if(q.lim) w=w.slice(0,q.lim); return q.one?(w.length===1?{data:w[0],error:null}:{data:null,error:{message:'JSON object requested, multiple (or no) rows returned'}}):{data:w,error:null}; }
        if(q.op==='insert'){ const vs=Array.isArray(q.val)?q.val:[q.val]; const rows=[];
          for(const v of vs){ const n=R.wstaw(v,u); if(typeof n==='string') return {data:null,error:{message:n}}; rows.push(n); }
          all.push(...rows); W('mock_'+t,all); rows.forEach(n=>R.po&&R.po(n)); return {data:q.one?rows[0]:rows,error:null}; }
        if(q.op==='update'){ const w=all.filter(pasuje); if(w.some(r=>!R.zmien(r,u))) return {data:null,error:{message:'permission denied for table '+t}};
          w.forEach(r=>Object.assign(r,q.val)); W('mock_'+t,all); return {data:q.one?w[0]:w,error:null}; }
        if(q.op==='delete'){ const w=all.filter(pasuje); if(w.some(r=>!R.usun(r,u))) return {data:null,error:{message:'permission denied for table '+t}}; W('mock_'+t,all.filter(r=>!w.includes(r))); return {data:null,error:null}; }
      }
      return b;
    }
    const of=c.from;
    c.from=t=>{ if(REG[t]&&!REG[t].tab) return mojFrom(t); if(firmaKonto(uid())&&REG[t+'_f']) return mojFrom(t+'_f'); return of(t); };
    const orpc=c.rpc;
    c.rpc=async(n,a)=>{ const u=uid(); a=a||{};
      if(n==='zlecenia_firmy') return {data:(L('mock_mieszkania')||[]).filter(m=>aktywny(m.id,u)).map(m=>({id:m.id,ulica:m.ulica,miasto:m.miasto,metraz:m.metraz,data_startu:m.data_startu,termin_konca:m.termin_konca,firma_remontowa:m.firma_remontowa,wlasciciel:m.wlasciciel})),error:null};
      if(n==='kto_nazwy') return {data:(a.ids||[]).filter(id=>id===u||dost().some(d=>(d.wlasciciel===u&&d.firma===id)||(d.firma===u&&d.wlasciciel===id&&d.aktywny))).map(id=>({id,nazwa:nazwa(id)})),error:null};
      if(n==='sprawdz_opoznienia'){ window.__opoz=(window.__opoz||0)+1; return {data:0,error:null}; }
      return orpc(n,a); };
    return c;
  };
})();`;
const srv=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0].split('#')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});r.end(d)})}).listen(PORT);
const URL=`http://127.0.0.1:${PORT}/index.html`;let zle=0,ok=0;const spr=(w,t)=>{console.log((w?'OK   ':'ZLE  ')+t);w?ok++:zle++};
const TY=/\b(Kliknij|Możesz|możesz|Wpisz|Sprawdź|Odczekaj|wrócisz|Wybierz zdj|Zaznacz|Twoj\w*|Twój|zrobiłeś|dodałeś|wysłałeś|Ty|masz|Masz)\b/;
async function kontrola(p,gdzie,sel='#app h1,#app .intro,#app .msg,#app .empty,#app label,#app .card,#app .info2'){
  const t=await p.evaluate(s=>[...document.querySelectorAll(s)].map(e=>e.innerText).join(' | '),sel);const m=t.match(TY);
  const sz=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  spr(!m&&sz<=0&&await p.evaluate(()=>!!document.querySelector('.stopka b')),gdzie+': bez formy Ty, bez przewijania w bok, stopka'+(m?' (Ty: '+m[0]+')':'')+(sz>0?' (w bok '+sz+')':''))}
const KOLORY=async(p,gdzie)=>{const zle=await p.evaluate(()=>{const ok=['rgb(244, 241, 234)','rgb(30, 26, 23)','rgb(184, 146, 74)','rgba(0, 0, 0, 0)','rgba(30, 26, 23, 0.75)','rgba(30, 26, 23, 0.96)','rgb(255, 0, 0)'];const bad=new Set();
  document.querySelectorAll('#app *,.top *,#oknoPow *').forEach(e=>{const s=getComputedStyle(e);if(!ok.includes(s.backgroundColor))bad.add('tło '+s.backgroundColor);if(e.innerText&&e.children.length===0&&!ok.includes(s.color))bad.add('napis '+s.color)});return [...bad]});
  spr(!zle.length,gdzie+': tylko kolory aplikacji (kremowy, czerń, złoto)'+(zle.length?' ('+zle.join(', ')+')':''))};
const dzis=new Date().toLocaleDateString('pl-PL');
const W1='w1-wlasc',FA='fA-firma',FB='fB-firma',M1='m1-slon',M2='m2-ogr',P1='p1-salon';
function baza(){const t=n=>new Date(Date.now()-n*60000).toISOString();return {
  mock_users:[{id:W1,email:'pati@test.pl',password:'Dobrehaslo1',confirmed:true},{id:FA,email:'firmaa@test.pl',password:'Dobrehaslo1',confirmed:true},{id:FB,email:'firmab@test.pl',password:'Dobrehaslo1',confirmed:true}],
  mock_profile:[{id:W1,imie:'Pati',rola:'wlasciciel',nazwa_firmy:null},{id:FA,imie:'Jan',rola:'firma',nazwa_firmy:'Ekipa Próbna'},{id:FB,imie:'Olek',rola:'firma',nazwa_firmy:'Budowa Testowa'}],
  mock_mieszkania:[{id:M1,wlasciciel:W1,ulica:'Słoneczna 5',miasto:'Testowo',metraz:48,firma_remontowa:'Ekipa Próbna',utworzono:t(500)},{id:M2,wlasciciel:W1,ulica:'Ogrodowa 2',miasto:'Testowo',metraz:35,firma_remontowa:'Budowa Testowa',utworzono:t(400)}],
  mock_dostepy:[{id:'d1',mieszkanie:M1,wlasciciel:W1,kod:'k1',firma:FA,aktywny:true,utworzono:t(300),przyjeto:t(290)},{id:'d2',mieszkanie:M2,wlasciciel:W1,kod:'k2',firma:FB,aktywny:true,utworzono:t(300),przyjeto:t(290)}],
  mock_pomieszczenia:[{id:P1,mieszkanie:M1,wlasciciel:W1,rodzaj:'Salon',nazwa:'Salon'}],
  mock_prace:[{id:'r1',mieszkanie:M1,pomieszczenie:P1,wlasciciel:W1,etap:6,nazwa:'Panele',zrobiona:false,utworzono:t(280)}],
  mock_zdarzenia:[
    {id:'z1',odbiorca:W1,mieszkanie:M1,rodzaj:'praca',tresc:'Praca odznaczona: Salon, Malowanie (Ekipa Próbna)',cel:'listaPrac',cel_id:P1,przeczytane:false,utworzono:t(50)},
    {id:'z2',odbiorca:W1,mieszkanie:M1,rodzaj:'paragon',tresc:'Nowy paragon: paragon-sklep.jpg (Ekipa Próbna)',cel:'biblioteka',cel_id:'paragony',przeczytane:false,utworzono:t(40)},
    {id:'z3',odbiorca:W1,mieszkanie:M1,rodzaj:'etap',tresc:'Etap skończony: 1. Rozbiórki i przygotowanie',cel:'listaPrac',cel_id:null,przeczytane:false,utworzono:t(30)},
    {id:'z4',odbiorca:W1,mieszkanie:M2,rodzaj:'opoznienie',tresc:'Opóźnienie: termin końca przesunięty z 10.01.2030 na 20.01.2030',cel:'mieszkanie',cel_id:null,przeczytane:true,utworzono:t(20)}]}}
async function zaloguj(p,email){await p.fill('#email',email);await p.fill('#haslo','Dobrehaslo1');await p.click('#wyslij');await expect(p.locator('h1')).toHaveText(/Moje (mieszkania|zlecenia)/);await p.waitForTimeout(300)}
async function wyloguj(p){await p.click('#wyloguj');await expect(p.locator('h1')).toHaveText('Logowanie')}
const bazaT=(p,t)=>p.evaluate(t=>JSON.parse(localStorage.getItem('mock_'+t)||'[]'),t);
async function zdjecia(b,dir){const p=await b.newPage();for(const [n,k] of [['chat1.jpg','#1E1A17'],['chat2.jpg','#B8924A']]){const d=await p.evaluate(k=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');x.fillStyle='#f4f1ea';x.fillRect(0,0,1600,1200);x.fillStyle=k;x.fillRect(200,200,1200,800);return c.toDataURL('image/jpeg',0.8)},k);fs.writeFileSync(path.join(dir,n),Buffer.from(d.split(',')[1],'base64'))}await p.close()}
(async()=>{const b=await chromium.launch();const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chat-'));await zdjecia(b,dir);const J1=path.join(dir,'chat1.jpg'),J2=path.join(dir,'chat2.jpg');
for(const [name,vp] of [['pc',{width:1280,height:900}],['tel',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp,locale:'pl-PL'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(20000);
 await p.route('**/supabase.js',r=>r.fulfill({body:MOCK+EXT,contentType:'application/javascript'}));await p.route('**/config.js',r=>r.fulfill({body:'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};',contentType:'application/javascript'}));
 await p.goto(URL);await p.evaluate(d=>{localStorage.clear();for(const k in d)localStorage.setItem(k,JSON.stringify(d[k]))},baza());await p.reload();await expect(p.locator('h1')).toHaveText('Logowanie');
 spr(await p.locator('#dzwonek').isHidden(),name+' przed zalogowaniem dzwonka nie ma');
 // ===== WŁAŚCICIEL: dzwonek =====
 await zaloguj(p,'pati@test.pl');
 await expect(p.locator('#dzwonek')).toBeVisible();await expect(p.locator('#dzwonekN')).toHaveText('3');
 const kol=await p.evaluate(()=>[...document.querySelector('.top').children].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.id||e.className));
 spr(kol.join(',')==='logo,sp,who,dzwonek,mojeDane,wyloguj'||kol.join(',')==='logo,sp,dzwonek,mojeDane,wyloguj',name+' dzwonek w górnym pasku przed „Moje dane” ('+kol.join(',')+')');
 spr(await p.evaluate(()=>window.__opoz>=1),name+' po wczytaniu aplikacja sprawdza opóźnienia (sprawdz_opoznienia)');
 await expect(p.locator('#chatOgolny')).toHaveText('Chat ogólny z firmami');spr(true,name+' lista mieszkań: przycisk „Chat ogólny z firmami” pod „+ Dodaj mieszkanie”');
 await kontrola(p,name+' lista mieszkań z dzwonkiem');await KOLORY(p,name+' lista mieszkań');
 await p.click('#dzwonek');await expect(p.locator('#oknoPow')).toBeVisible();
 const zd=await p.$$eval('#powLista .zd',e=>e.map(x=>(x.classList.contains('nowe')?'N ':'- ')+x.querySelector('.tx').childNodes[0].textContent.trim()));
 spr(zd.length===4&&zd[0]==='- Opóźnienie: termin końca przesunięty z 10.01.2030 na 20.01.2030'&&zd[1].startsWith('N Etap skończony')&&zd[3].startsWith('N Praca odznaczona'),name+' lista zdarzeń: najnowsze na górze, nowe pogrubione ('+zd.length+')');
 await expect(p.locator('#powLista .zd').first().locator('small')).toContainText('Ogrodowa 2 · ');
 spr(await p.locator('#ustDzwonek').isChecked()&&await p.locator('#ustTelefon').isChecked()&&await p.locator('#ustTelegram').isChecked(),name+' ustawienia pod dzwonkiem: dzwonek, telefon, Telegram (tylko „Etap skończony”) włączone');
 await kontrola(p,name+' okno powiadomień','#oknoPow h2,#oknoPow .intro,#oknoPow .card,#oknoPow .zd');await KOLORY(p,name+' okno powiadomień');
 const okn=await p.evaluate(()=>{const r=document.querySelector('#oknoPow .pudlo').getBoundingClientRect();return [r.left>=0,r.right<=innerWidth]});spr(okn.every(Boolean),name+' okno powiadomień mieści się na szerokość');
 if(name==='pc')await p.screenshot({path:path.join(dir,'pow_pc.png')});else await p.screenshot({path:path.join(dir,'pow_tel.png')});
 // kliknięcie zdarzenia otwiera miejsce
 await p.locator('#powLista .zd',{hasText:'Praca odznaczona'}).click();await expect(p.locator('#oknoPow')).toHaveCount(0);await expect(p.locator('h1')).toHaveText('Salon · 0 z 1');await expect(p.locator('#dzwonekN')).toHaveText('2');
 spr((await bazaT(p,'zdarzenia')).find(z=>z.id==='z1').przeczytane===true,name+' kliknięcie „Praca odznaczona” otwiera pomieszczenie Salon, zdarzenie przeczytane, dzwonek 2');
 await p.click('#dzwonek');await p.locator('#powLista .zd',{hasText:'Nowy paragon'}).click();await expect(p.locator('h1')).toHaveText('Paragony');spr(true,name+' kliknięcie „Nowy paragon” otwiera Bibliotekę › Paragony');
 // oznacz wszystkie
 await p.click('#dzwonek');await p.click('#powWszystkie');await expect(p.locator('#oknoPow .msg')).toContainText('Wszystkie powiadomienia są przeczytane.');await expect(p.locator('#dzwonekN')).toHaveText('');
 spr(await p.locator('#powLista .zd.nowe').count()===0&&(await bazaT(p,'zdarzenia')).every(z=>z.przeczytane)&&await p.locator('#powWszystkie').isDisabled(),name+' „Oznacz wszystkie jako przeczytane”: dzwonek bez liczby, nic pogrubione, w bazie przeczytane');
 // ustawienia
 await p.locator('#ustTelefon').uncheck();await expect(p.locator('#oknoPow .msg')).toContainText('Zapisano: Powiadomienia na telefon – wyłączone.');
 const u1=(await bazaT(p,'ustawienia_powiadomien'))[0];spr(u1&&u1.konto===W1&&u1.dzwonek&&!u1.telefon&&u1.telegram,name+' ustawienie zapisane w bazie (telefon wyłączony)');
 await p.click('#powZamknij');await p.click('#dzwonek');spr(!(await p.locator('#ustTelefon').isChecked()),name+' po ponownym otwarciu telefon nadal wyłączony');await p.keyboard.press('Escape');await expect(p.locator('#oknoPow')).toHaveCount(0);
 // ===== WŁAŚCICIEL: chat przy mieszkaniu =====
 await p.click('#logo');await p.click('.flat:has-text("Słoneczna 5")');
 const mods=await p.$$eval('.moduly button',e=>e.map(x=>x.textContent));spr(mods.join('|')==='Biblioteka – zdjęcia i pliki PDF|Chat z firmą|Firma|Lista prac – 0 z 1 (0%)',name+' przyciski mieszkania od A do Z, jest „Chat z firmą” ('+mods.join(', ')+')');
 spr(!(await p.locator('#app').innerText()).includes('Chat z firmą Ekipa'),name+' „Co będzie dalej” nie zapowiada już chatu');
 await p.click('#m-chat');await expect(p.locator('h1')).toHaveText('Chat – Słoneczna 5');await expect(p.locator('#rozmowa .pusto')).toBeVisible();await expect(p.locator('label[for=chTekst]')).toHaveText('Nowa wiadomość do: Ekipa Próbna');
 await kontrola(p,name+' chat (pusty)');
 await p.click('#chWyslij');await expect(p.locator('.msg')).toHaveText('Najpierw trzeba wpisać wiadomość albo dołączyć zdjęcie.');spr((await bazaT(p,'wiadomosci')).length===0,name+' pusta wiadomość odrzucona (komunikat, nic w bazie)');
 await p.fill('#chTekst','   ');await p.click('#chWyslij');await expect(p.locator('.msg')).toHaveText('Najpierw trzeba wpisać wiadomość albo dołączyć zdjęcie.');spr((await bazaT(p,'wiadomosci')).length===0,name+' wiadomość z samych spacji odrzucona');
 await p.fill('#chTekst','Jutro wchodzą tynki?');await p.click('#chWyslij');await expect(p.locator('.msg')).toContainText('Wiadomość wysłana. Ekipa Próbna dostanie powiadomienie w dzwonku.');
 await expect(p.locator('#rozmowa .dymek.moj')).toHaveCount(1);await expect(p.locator('#rozmowa .dymek.moj .tr')).toHaveText('Jutro wchodzą tynki?');await expect(p.locator('#rozmowa .dymek.moj small')).toContainText('Pati · '+dzis);
 spr((await bazaT(p,'zdarzenia')).some(z=>z.odbiorca===FA&&z.tresc==='Wiadomość od Pati: „Jutro wchodzą tynki?”'&&z.cel==='chat'),name+' wiadomość wysłana: dymek z podpisem „Pati · '+dzis+'”, firma A dostała zdarzenie');
 await p.setInputFiles('#chZdj',[J1]);await expect(p.locator('.zalacznik img')).toBeVisible();await expect(p.locator('#lChZdj')).toContainText('Zmień zdjęcie');
 await p.click('#chUsunZdj');await expect(p.locator('.zalacznik')).toHaveCount(0);await p.setInputFiles('#chZdj',[J1]);await expect(p.locator('.zalacznik img')).toBeVisible();
 await p.click('#chWyslij');await expect(p.locator('.msg')).toContainText('Zdjęcie jest też w Bibliotece › Postępy prac.');await expect(p.locator('#rozmowa .dymek')).toHaveCount(2);
 await p.waitForFunction(()=>{const i=document.querySelector('#rozmowa .dymek:last-child img');return i&&i.complete&&i.naturalWidth>0});
 const pl1=(await bazaT(p,'pliki')).filter(x=>x.folder==='postepy');const w1=(await bazaT(p,'wiadomosci'));
 spr(pl1.length===1&&pl1[0].sciezka.startsWith(W1+'/'+M1+'/postepy/')&&pl1[0].wlasciciel===W1&&w1[1].plik===pl1[0].id&&w1[1].zdjecie===pl1[0].sciezka&&!w1[1].tresc,name+' zdjęcie w chacie: wiadomość ze zdjęciem, plik w Bibliotece › Postępy prac ('+(pl1[0]&&pl1[0].sciezka.split('/').slice(0,3).join('/'))+')');
 await p.locator('#rozmowa .dymek:last-child img').click();await expect(p.locator('#okno .info')).toContainText('Zdjęcie wysłane przez: Pati');await p.click('#zamknij');spr(true,name+' kliknięcie zdjęcia w chacie: powiększenie z podpisem');
 await kontrola(p,name+' chat z wiadomościami');await KOLORY(p,name+' chat');
 if(name==='pc')await p.screenshot({path:path.join(dir,'chat_pc.png'),fullPage:true});else await p.screenshot({path:path.join(dir,'chat_tel.png'),fullPage:true});
 await p.click('#wroc');await p.click('#biblioteka');await expect(p.locator('.fold:has(b:text-is("Postępy prac")) small')).toContainText('1 plik');spr(true,name+' Biblioteka › Postępy prac: 1 plik (zdjęcie z chatu)');
 // ===== WŁAŚCICIEL: chat ogólny =====
 await p.click('#logo');await p.click('#chatOgolny');await expect(p.locator('h1')).toHaveText('Chat ogólny z firmami');await expect(p.locator('.intro')).toContainText('firmy z aktywnym dostępem: Budowa Testowa i Ekipa Próbna');
 await p.click('#ogWyslij');await expect(p.locator('.msg')).toHaveText('Najpierw trzeba wpisać wiadomość.');
 await p.fill('#ogTekst','Mamy kolejne mieszkanie, szczegóły w środę');await p.click('#ogWyslij');await expect(p.locator('.msg')).toContainText('Wiadomość wysłana do wszystkich firm (2).');await expect(p.locator('#rozmowa .dymek.moj')).toHaveCount(1);
 const zo=(await bazaT(p,'zdarzenia')).filter(z=>z.rodzaj==='ogolny').map(z=>z.odbiorca).sort();spr(zo.join(',')===[FA,FB].sort().join(','),name+' chat ogólny: jedna wiadomość, zdarzenie dla obu firm');
 await kontrola(p,name+' chat ogólny');await KOLORY(p,name+' chat ogólny');
 if(name==='pc')await p.screenshot({path:path.join(dir,'ogolny_pc.png'),fullPage:true});else await p.screenshot({path:path.join(dir,'ogolny_tel.png'),fullPage:true});
 await p.click('#wroc');await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 // ===== FIRMA A =====
 await wyloguj(p);await zaloguj(p,'firmaa@test.pl');await expect(p.locator('h1')).toHaveText('Moje zlecenia');await expect(p.locator('#dzwonekN')).toHaveText('3');
 await expect(p.locator('#chatOgolny')).toHaveText('Chat ogólny – nowe: 1');spr(true,name+' firma A: dzwonek 3 (2 wiadomości, chat ogólny), przycisk „Chat ogólny – nowe: 1”');
 await kontrola(p,name+' firma A lista zleceń');
 await p.click('#dzwonek');await p.locator('#powLista .zd',{hasText:'Wiadomość od Pati'}).first().click();await expect(p.locator('h1')).toHaveText('Chat – Słoneczna 5');
 await expect(p.locator('#rozmowa .dymek.inny')).toHaveCount(2);await expect(p.locator('#rozmowa .dymek.inny small').first()).toContainText('Pati · ');
 await p.waitForFunction(()=>{const i=document.querySelector('#rozmowa .dymek img');return i&&i.complete&&i.naturalWidth>0});
 spr(true,name+' firma A: kliknięcie „Wiadomość od Pati” otwiera chat mieszkania, widzi 2 wiadomości i zdjęcie');
 await expect(p.locator('#dzwonekN')).toHaveText('1');
 await kontrola(p,name+' firma A chat');
 await p.fill('#chTekst','Tak, od 8:00. Zdjęcie skuwania w załączniku');await p.setInputFiles('#chZdj',[J2]);await expect(p.locator('#chTekst')).toHaveValue('Tak, od 8:00. Zdjęcie skuwania w załączniku');
 await p.click('#chWyslij');await expect(p.locator('.msg')).toContainText('Wiadomość wysłana. Pati dostanie powiadomienie w dzwonku.');await expect(p.locator('#rozmowa .dymek.moj')).toHaveCount(1);await expect(p.locator('#rozmowa .dymek.moj small')).toContainText('Ekipa Próbna · ');
 const pl2=(await bazaT(p,'pliki')).filter(x=>x.dodal===FA);spr(pl2.length===1&&pl2[0].folder==='postepy'&&pl2[0].wlasciciel===W1&&pl2[0].sciezka.startsWith(W1+'/'+M1+'/postepy/'),name+' firma A: zdjęcie w chacie trafia do Postępów prac Właściciela aplikacji');
 await p.click('#logo');await p.click('#chatOgolny');await expect(p.locator('#rozmowa .dymek.inny')).toHaveCount(1);await expect(p.locator('.intro')).toContainText('Tu są ogłoszenia Pati dla wszystkich firm.');
 await p.fill('#ogTekst','Biorę, pasuje środa');await p.click('#ogWyslij');await expect(p.locator('.msg')).toContainText('Odpowiedź wysłana. Pati dostanie powiadomienie w dzwonku.');await expect(p.locator('#rozmowa .dymek')).toHaveCount(2);
 await expect(p.locator('#dzwonekN')).toHaveText('');spr(true,name+' firma A: chat ogólny – odpowiedź, dzwonek bez nowych');
 await kontrola(p,name+' firma A chat ogólny');
 // ===== FIRMA B =====
 await wyloguj(p);await zaloguj(p,'firmab@test.pl');await expect(p.locator('#dzwonekN')).toHaveText('1');
 await p.click('#chatOgolny');await expect(p.locator('#rozmowa .dymek')).toHaveCount(1);spr(!(await p.locator('#rozmowa').innerText()).includes('Biorę'),name+' firma B: widzi tylko wiadomość Pati, nie widzi odpowiedzi firmy A');
 const wb=await p.evaluate(async()=>{const r=await sb.from('wiadomosci').select('*');const z=await sb.from('zdarzenia').select('*');return [r.data.length,z.data.length]});
 spr(wb[0]===0&&wb[1]===1,name+' firma B: nie widzi rozmowy firmy A (wiadomości: '+wb[0]+'), ma tylko swoje zdarzenie ('+wb[1]+')');
 const wb2=await p.evaluate(async()=>{const r=await sb.from('wiadomosci').insert({mieszkanie:'m1-slon',tresc:'Wchodzę'});return r.error&&r.error.message});spr(!!wb2,name+' firma B nie napisze w chacie mieszkania firmy A ('+wb2+')');
 // ===== WŁAŚCICIEL: odpowiedzi firm =====
 await wyloguj(p);await zaloguj(p,'pati@test.pl');await expect(p.locator('#dzwonekN')).toHaveText('2');await expect(p.locator('#chatOgolny')).toHaveText('Chat ogólny z firmami – nowe: 1');
 await p.click('.flat:has-text("Słoneczna 5")');await expect(p.locator('#m-chat')).toHaveText('Chat z firmą – nowe: 1');spr(true,name+' Pati: przycisk „Chat z firmą – nowe: 1”, dzwonek 2');
 await p.click('#dzwonek');await p.locator('#powLista .zd',{hasText:'Wiadomość od Ekipa Próbna'}).click();await expect(p.locator('#rozmowa .dymek')).toHaveCount(3);
 await expect(p.locator('#rozmowa .dymek.inny small')).toContainText('Ekipa Próbna · '+dzis);await expect(p.locator('#rozmowa .dymek.inny .tr')).toHaveText('Tak, od 8:00. Zdjęcie skuwania w załączniku');await expect(p.locator('#rozmowa .dymek.inny img')).toHaveCount(1);
 spr(true,name+' Pati: odpowiedź firmy z nazwą firmy, datą i zdjęciem');
 await p.click('#logo');await p.click('#chatOgolny');await expect(p.locator('#rozmowa .dymek')).toHaveCount(2);await expect(p.locator('#rozmowa .dymek.inny small')).toContainText('Ekipa Próbna');await expect(p.locator('#dzwonekN')).toHaveText('');
 spr(true,name+' Pati: chat ogólny z odpowiedzią firmy A, dzwonek bez nowych');
 // mieszkanie bez firmy
 await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('mock_dostepy'));d.forEach(x=>{if(x.mieszkanie==='m2-ogr')x.aktywny=false});localStorage.setItem('mock_dostepy',JSON.stringify(d))});
 await p.click('#wroc');await p.click('.flat:has-text("Ogrodowa 2")');await p.click('#m-chat');await expect(p.locator('.card').last()).toContainText('Dostęp tej firmy jest zabrany.');await expect(p.locator('#chTekst')).toHaveCount(0);spr(true,name+' firma z zabranym dostępem: rozmowa do wglądu, bez pisania');
 await kontrola(p,name+' chat z zabranym dostępem');
 spr(!errs.length,name+' brak błędów na stronie '+errs.join(';'));await ctx.close()}
console.log('Zrzuty: '+dir);console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close()})().catch(e=>{console.log('BLAD:',e.message.split('\n').slice(0,10).join('\n'));process.exit(1)});
