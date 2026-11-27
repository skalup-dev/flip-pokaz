// Test ekranów klocków 11 (Poprawki) i 14 (Ilości). Uruchamianie: NODE_PATH=$(npm root -g) ZDJ=<katalog ze zdjęciami> node test_poprawki_ilosci_ekrany.js
// Baza zastępcza: mock_pelny.js + rozszerzenia poniżej (firma z dostępem, zasady tabel poprawki / ilosci). Zdjęcia testowe (Pillow): p1.jpg, p2.jpg, p3.jpg w katalogu ZDJ.
// Rdzeń (Lista prac) dostaje w teście hak HAKI.listaPrac (funkcja zHakiem niżej – dokładnie tę zmianę trzeba dodać w rdzeniu).
const {chromium,expect}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path');
const root=process.env.ROOT||path.join(__dirname,'..','..');const ZD=process.env.ZDJ||__dirname;const J1=ZD+'/p1.jpg',J2=ZD+'/p2.jpg',J3=ZD+'/p3.jpg';
let MOCK=fs.readFileSync(__dirname+'/mock_pelny.js','utf8');
// ---- rozszerzenia bazy zastępczej ----
const zamien=(a,b)=>{if(!MOCK.includes(a))throw new Error('mock: brak '+a.slice(0,60));MOCK=MOCK.replace(a,b)};
zamien("const uuid = ","const __dost = () => L('mock_dostep') || []; const __jestF = uid => ((L('mock_profile')||[]).find(p => p.id === uid) || {}).rola === 'firma';\n  const __firma = (uid, r, t) => t !== 'mieszkania' && __dost().some(d => d.firma === uid && d.mieszkanie === r.mieszkanie);\n  const uuid = ");
zamien("r.wlasciciel === s.user.id) &&","(r.wlasciciel === s.user.id || __firma(s.user.id, r, t))) &&");
zamien("if (q.op === 'select') return { data: all.filter(mine), error:null };",
 "if (__jestF(s.user.id) && q.op !== 'select' && (['ilosci','pytania_architekt','ilosci_wysokosc'].includes(t) || (t === 'poprawki' && q.op !== 'update'))) return { data:null, error:{ message:'new row violates row-level security policy for table ' + t } };\n        if (q.op === 'select') return { data: all.filter(mine), error:null };");
zamien("...(t === 'prace' ? { zrobiona:false } : {}), ...v }));",
 "...(t === 'prace' ? { zrobiona:false } : {}), ...(t === 'poprawki' ? { zgloszona_przez:s.user.id, zgloszona_kiedy:new Date().toISOString(), zrobiona:false, zatwierdzona:false } : {}), ...(t === 'ilosci' ? { stan:'nowa', dodal:s.user.id } : {}), ...(t === 'pytania_architekt' ? { wyjasnione:false, dodal:s.user.id } : {}), ...v }));");
zamien("rows.forEach(r => Object.assign(r, q.val)); W('mock_' + t, all);",
 `const teraz = new Date().toISOString();
          if (t === 'poprawki'){ for (const r of rows){
            if (__jestF(s.user.id) && ('zatwierdzona' in q.val || 'tresc' in q.val)) return { data:null, error:{ message:'Firma może tylko oznaczyć poprawkę jako zrobioną (ze zdjęciem)' } };
            if (__jestF(s.user.id) && r.zatwierdzona) return { data:null, error:{ message:'Ta poprawka jest już zatwierdzona. Zmienić ją może tylko Właściciel aplikacji' } };
            if (q.val.zrobiona && !r.zrobiona && !(L('mock_pliki')||[]).some(z => z.poprawka === r.id && z.poprawka_etap === 'po')) return { data:null, error:{ message:'Najpierw trzeba dodać zdjęcie po poprawce' } };
            if (q.val.zatwierdzona && !(q.val.zrobiona ?? r.zrobiona)) return { data:null, error:{ message:'Najpierw trzeba dodać zdjęcie po poprawce' } }; }
            rows.forEach(r => { if ('zrobiona' in q.val){ if (q.val.zrobiona && !r.zrobiona){ r.zrobiona_przez = s.user.id; r.zrobiona_kiedy = teraz; } if (!q.val.zrobiona){ r.zrobiona_przez = null; r.zrobiona_kiedy = null; r.zatwierdzona = false; r.zatwierdzona_przez = null; } }
              if ('zatwierdzona' in q.val){ if (q.val.zatwierdzona && !r.zatwierdzona){ r.zatwierdzona_przez = s.user.id; r.zatwierdzona_kiedy = teraz; } if (!q.val.zatwierdzona){ r.zatwierdzona_przez = null; r.zatwierdzona_kiedy = null; } } }); }
          if (t === 'ilosci' && 'stan' in q.val){ if (q.val.stan === 'zgadza' && rows.some(r => r.ilosc == null)) return { data:null, error:{ message:'Najpierw trzeba wpisać ilość z planu' } };
            rows.forEach(r => { if (q.val.stan === 'nowa'){ r.sprawdzil = null; r.sprawdzono = null; } else { r.sprawdzil = s.user.id; r.sprawdzono = teraz; } }); }
          if (t === 'pytania_architekt' && 'wyjasnione' in q.val) rows.forEach(r => { r.wyjasnil = q.val.wyjasnione ? s.user.id : null; r.wyjasniono = q.val.wyjasnione ? teraz : null; });
          rows.forEach(r => Object.assign(r, q.val)); W('mock_' + t, all);`);
zamien("const rpc = async (nazwa, a) => {","const rpc = async (nazwa, a) => { if (nazwa === 'zlecenia_firmy'){ const s = sess(); const ids = __dost().filter(d => s && d.firma === s.user.id).map(d => d.mieszkanie); return { data:(L('mock_mieszkania')||[]).filter(m => ids.includes(m.id)), error:null }; }\n      if (nazwa === 'kto_nazwy'){ const pr = L('mock_profile') || []; return { data:(a.ids||[]).map(id => { const p = pr.find(x => x.id === id); return p ? { id, nazwa:(p.rola === 'firma' ? p.nazwa_firmy : p.imie) || 'Właściciel aplikacji' } : null; }).filter(Boolean), error:null }; }");
// ---- hak Listy prac w rdzeniu (do dodania w index.html) ----
const RDZEN_A="const L = await wczytajPrace(fid);\n  const d = L.prace.filter(x => x.zrobiona).length, a = L.prace.length;";
const RDZEN_B="${msg ? komunikat(msg, true) : ''}\n    ${a ? `<div class=\"card dark\">";
function zHakiem(h){if(!h.includes(RDZEN_A)||!h.includes(RDZEN_B))throw new Error('rdzeń: brak miejsca na hak');return h.replace(RDZEN_A,RDZEN_A+"\n  const gora = (await Promise.all((HAKI.listaPrac || []).map(h => h(fid).catch(() => '')))).join('');").replace(RDZEN_B,"${msg ? komunikat(msg, true) : ''}${gora}\n    ${a ? `<div class=\"card dark\">")}
const srv=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0].split('#')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});r.end(f.endsWith('index.html')?zHakiem(d.toString()):d)})}).listen(+(process.env.PORT||0));
let URL;let zle=0,ok=0;const spr=(w,t)=>{console.log((w?'OK   ':'ZLE  ')+t);w?ok++:zle++};
const TY=/\b(Kliknij|Możesz|możesz|Wpisz|Sprawdź|Odczekaj|wrócisz|Wybierz zdj|Zaznacz|Twoj\w*|Twoje|zrobiłeś|dodałeś|Ty|Ciebie|Tobie|wpisałeś|zgłosiłeś)\b/;
const BIEL=/rgb\(255, 255, 255\)/;
async function kontrola(p,gdzie){if(process.env.ZRZUTY)await p.screenshot({path:process.env.ZRZUTY+'/'+gdzie.replace(/[^a-z0-9ąćęłńóśźż]+/gi,'_')+'.png',fullPage:true});const t=await p.evaluate(()=>[...document.querySelectorAll('#app h1,#app h2,#app .intro,#app .msg,#app .empty,#app label,#app .card,#app button,#app p')].map(e=>e.innerText).join(' | '));const m=t.match(TY);
 const sz=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 const kol=await p.evaluate(()=>{const zle=[];for(const e of document.querySelectorAll('#app *')){const c=getComputedStyle(e);if(c.backgroundColor==='rgb(255, 255, 255)')zle.push(e.tagName+'.'+e.className)}return zle.slice(0,3)});
 const wystaje=await p.evaluate(()=>[...document.querySelectorAll('#app *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1}).map(e=>e.tagName+'.'+e.className).slice(0,3));
 spr(!m&&sz<=0&&!kol.length&&!wystaje.length&&await p.evaluate(()=>!!document.querySelector('.stopka b')),gdzie+': bez formy Ty, bez przewijania w bok, bez białego tła, stopka'+(m?' (Ty: '+m[0]+')':'')+(sz>0?' (w bok '+sz+')':'')+(kol.length?' (białe: '+kol+')':'')+(wystaje.length?' (wystaje: '+wystaje+')':''))}
const dzis=new Date().toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
const iso=d=>{const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().slice(0,10)};
const otworzEtap=async p=>{const e=p.locator('.etapP:has-text("5. Łazienka")');if(await e.getAttribute('aria-expanded')!=='true')await e.click();await expect(p.locator('.etapP:has-text("5. Łazienka")')).toHaveAttribute('aria-expanded','true')};
const kolor=(p,sel,co='borderTopColor')=>p.locator(sel).first().evaluate((e,co)=>getComputedStyle(e)[co],co);
(async()=>{await new Promise(r=>srv.listening?r():srv.once('listening',r));URL=`http://127.0.0.1:${srv.address().port}/index.html`;const b=await chromium.launch();
for(const [name,vp] of [['pc',{width:1280,height:900}],['tel',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp,locale:'pl-PL'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(20000);
 await p.route('**/supabase.js',r=>r.fulfill({body:MOCK,contentType:'application/javascript'}));await p.route('**/config.js',r=>r.fulfill({body:'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};',contentType:'application/javascript'}));
 await p.goto(URL);await expect(p.locator('h1')).toHaveText('Logowanie');
 const zaloz=async(imie,email)=>{if(await p.locator('h1').textContent()!=='Zakładanie konta')await p.click('text=Nie masz konta? Załóż konto');await p.fill('#imie',imie);await p.fill('#email',email);await p.fill('#haslo','Dobrehaslo1');await p.fill('#haslo2','Dobrehaslo1');await p.click('#wyslij')};
 await zaloz('Pati','pati@test.pl');await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 // mieszkanie: Łazienka 4 m² (Płytki ścienne, Prysznic), Salon 16 m² (Panele)
 await p.click('#dodaj');await p.fill('#ulica','TEST-FLIP Poprawki 1');await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('zapisane');await p.click('#dalej');
 await p.click('[data-rodzaj="Łazienka"]');await p.click('[data-rodzaj="Salon"]');await p.locator('[data-pole=metraz]').nth(0).fill('4');await p.locator('[data-pole=metraz]').nth(1).fill('16');await p.click('#dalej');
 for(const t of ['Płytki ścienne','Prysznic'])await p.locator('.kr',{hasText:t}).locator('input').check();
 await p.click('[data-otworz]:has-text("Salon")');await p.locator('.kr',{hasText:'Panele'}).locator('input').check();
 await p.click('#zatwierdz');await expect(p.locator('.msg')).toContainText('Lista prac zapisana: 3 prace w 2 pomieszczeniach.');
 const fid=await p.evaluate(()=>S.flats[0].id);
 await p.evaluate(async fid=>{const {data}=await sb.from('prace').select('id').eq('nazwa','Płytki ścienne');await sb.from('pliki').insert({mieszkanie:fid,folder:'postepy',nazwa:'x.jpg',sciezka:'a/'+fid+'/postepy/x.jpg',typ:'zdjecie',praca:data[0].id});await sb.from('prace').update({zrobiona:true}).eq('id',data[0].id);},fid);
 await p.evaluate(fid=>ekranMieszkania(fid),fid);
 const przyc=await p.$$eval('.moduly button',e=>e.map(x=>x.textContent));spr(przyc.includes('Poprawki')&&przyc.includes('Ilości z planu')&&przyc.join('|')===[...przyc].sort((a,b)=>a.localeCompare(b,'pl')).join('|'),name+' ekran mieszkania: przyciski „Poprawki” i „Ilości z planu”, A–Z ('+przyc.join(', ')+')');
 // ===== KLOCEK 11: Poprawki (Właściciel aplikacji) =====
 await p.click('#m-poprawki');await expect(p.locator('h1')).toHaveText('Poprawki – TEST-FLIP Poprawki 1');await expect(p.locator('#poprawki .empty')).toContainText('Nie ma jeszcze żadnej poprawki.');
 await expect(p.locator('.intro').first()).toContainText('Tu Pati zgłasza poprawki');await kontrola(p,name+' Poprawki (puste)');
 await p.click('#dodajPop');await expect(p.locator('h1')).toHaveText('Dodaj poprawkę');await kontrola(p,name+' Dodaj poprawkę');
 await p.click('#zapiszPop');await expect(p.locator('.msg')).toHaveText('Trzeba napisać, co poprawić.');spr(true,name+' puste pole: „Trzeba napisać, co poprawić.”');
 await p.fill('#pT','Fuga przy wannie');await p.fill('#pD',iso(-3));await p.click('#zapiszPop');await expect(p.locator('.msg')).toHaveText('Termin nie może być wcześniejszy niż dzisiaj.');await expect(p.locator('#pT')).toHaveValue('Fuga przy wannie');spr(true,name+' termin w przeszłości odrzucony, wpis zostaje');
 const opcje=await p.$$eval('#pR option',e=>e.map(x=>x.textContent));spr(opcje.join('|')==='Łazienka|Salon|Inne – całe mieszkanie',name+' pomieszczenia A–Z, „Inne” na końcu ('+opcje.join(', ')+')');
 await p.selectOption('#pR',{label:'Łazienka'});await p.fill('#pD',iso(5));await p.setInputFiles('#galeria',[J1,J2]);await expect(p.locator('.fotki figure')).toHaveCount(2);await p.locator('[data-usunz]').first().click();await expect(p.locator('.fotki figure')).toHaveCount(1);
 await expect(p.locator('#pT')).toHaveValue('Fuga przy wannie');await expect(p.locator('.fotki figcaption')).toHaveText(`Zdjęcie dodane przez: Pati · ${dzis}`);spr(true,name+' zdjęcie zgłoszenia: galeria (2), „Usuń” (1), wpisy zostają, podpis');
 await p.click('#zapiszPop');await expect(p.locator('.msg')).toContainText(`Poprawka „Fuga przy wannie” zapisana. Firma widzi ją w zakładce Poprawki. Zgłoszone przez: Pati · ${dzis}.`);
 const k1=p.locator('.pop',{hasText:'Fuga przy wannie'});await expect(k1.locator('.st-open')).toHaveText('! Niezrobiona');await expect(k1.locator('.kto').first()).toHaveText(`Zgłoszone przez: Pati · ${dzis}`);await expect(k1.locator('.gdzie')).toContainText('Łazienka · do ');await expect(k1.locator('[data-zdj]')).toHaveText('📷 Zobacz zdjęcia (1)');
 spr(await kolor(p,'.pop.open')==='rgb(192, 57, 43)'&&await kolor(p,'.pop.open .st-open','color')==='rgb(192, 57, 43)',name+' niezrobiona: czerwona ramka i napis #C0392B');await kontrola(p,name+' Poprawki (1 poprawka)');
 // Wszystkie prace firmy → Zgłoś poprawkę
 const et=await p.$$eval('.etapP b',e=>e.map(x=>x.textContent));spr(et.join('|')==='1. Rozbiórki i przygotowanie|5. Łazienka – płytki i biały montaż|6. Podłogi i drzwi'||et.length>=2,name+' prace firmy po etapach ('+et.join(', ')+')');
 await otworzEtap(p);const pp=p.locator('.prP',{hasText:'Płytki ścienne'});await expect(pp.locator('[data-zglos]')).toHaveText('Zgłoś poprawkę');await expect(p.locator('.prP',{hasText:'Prysznic'})).toContainText('jeszcze nie zrobione');
 await expect(p.locator('.prP',{hasText:'Prysznic'}).locator('[data-zglos]')).toHaveCount(0);spr(true,name+' etap: zrobiona praca ma „Zgłoś poprawkę”, niezrobiona „jeszcze nie zrobione”');await kontrola(p,name+' Wszystkie prace firmy');
 await pp.locator('[data-zglos]').click();await expect(p.locator('.intro').first()).toContainText('Praca: Płytki ścienne · Łazienka.');const wyb=await p.$eval('#pR',s=>s.options[s.selectedIndex].text);spr(wyb==='Łazienka',name+' „Zgłoś poprawkę”: praca i pomieszczenie wpisane');
 await p.fill('#pT','Krzywa płytka');await p.click('#zapiszPop');await expect(p.locator('.msg')).toContainText('Poprawka „Krzywa płytka” zapisana.');
 await expect(p.locator('.pop',{hasText:'Krzywa płytka'}).locator('.gdzie')).toContainText('Łazienka · praca: Płytki ścienne · bez terminu');
 await otworzEtap(p);await expect(p.locator('.prP',{hasText:'Płytki ścienne'})).toContainText('! Poprawka: Krzywa płytka');await expect(p.locator('.prP',{hasText:'Płytki ścienne'}).locator('[data-zglos]')).toHaveCount(0);
 await expect(p.locator('.etapP:has-text("5. Łazienka") .st-open')).toHaveText('1 poprawka');spr(true,name+' praca z otwartą poprawką: „! Poprawka: …”, bez drugiego „Zgłoś”, licznik etapu');
 // Właściciel sam dodaje zdjęcie po poprawce, zatwierdza i odznacza
 await p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-po]').click();await expect(p.locator('h1')).toHaveText('Zrobione – zdjęcie po poprawce');await kontrola(p,name+' zdjęcie po poprawce');
 await p.click('#wyslij');await expect(p.locator('.msg')).toHaveText('Najpierw trzeba dodać zdjęcie po poprawce.');
 const bez=await p.evaluate(async()=>{const {data}=await sb.from('poprawki').select('id').eq('tresc','Krzywa płytka');const r=await sb.from('poprawki').update({zrobiona:true}).eq('id',data[0].id);return r.error?r.error.message:'ZROBIONA'});spr(bez.includes('zdjęcie po poprawce'),name+' bez zdjęcia: ekran i baza odrzucają „zrobione”');
 await p.setInputFiles('#aparat',[J3]);await expect(p.locator('.fotki figure')).toHaveCount(1);await p.click('#wyslij');await expect(p.locator('.msg')).toContainText('Zdjęcie po poprawce „Krzywa płytka” wysłane.');
 const k2=p.locator('.pop',{hasText:'Krzywa płytka'});await expect(k2.locator('.stan')).toHaveText('Zdjęcie po poprawce wysłane – czeka na zatwierdzenie');await expect(k2.locator('.kto').nth(1)).toHaveText(`Zdjęcie dodane przez: Pati · ${dzis}`);
 await k2.locator('[data-zatw]').click();await expect(p.locator('.msg')).toContainText('Poprawka „Krzywa płytka” jest zatwierdzona i zrobiona.');
 const k3=p.locator('.pop',{hasText:'Krzywa płytka'});await expect(k3.locator('.st-done')).toHaveText('✓ Zrobiona');await expect(k3.locator('.kto').nth(2)).toHaveText(`Zatwierdzone przez: Pati · ${dzis}`);
 spr(await kolor(p,'.pop.done')==='rgb(46, 139, 87)'&&await kolor(p,'.pop.done .st-done','color')==='rgb(46, 139, 87)',name+' „Zatwierdź”: zielona ramka i napis #2E8B57, „Zatwierdzone przez”');
 await expect(p.locator('.liczP')).toHaveText('1 niezrobiona · 1 zrobiona');const kol=await p.$$eval('.pop b:first-child',e=>e.map(x=>x.textContent));spr(kol[kol.length-1]==='Krzywa płytka',name+' zrobione na dole listy, licznik „1 niezrobiona · 1 zrobiona”');
 await otworzEtap(p);await expect(p.locator('.prP',{hasText:'Płytki ścienne'})).toContainText('✓ Poprawka zrobiona: Krzywa płytka');await expect(p.locator('.prP',{hasText:'Płytki ścienne'}).locator('[data-zglos]')).toHaveCount(1);spr(true,name+' po zatwierdzeniu przy pracy znowu „Zgłoś poprawkę”');
 await p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-odzatw]').click();await expect(p.locator('.msg')).toContainText('znowu czeka na zatwierdzenie');await expect(p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-zatw]')).toBeVisible();
 await p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-cofnij]').click();await expect(p.locator('.msg')).toContainText('jest znowu niezrobiona');await expect(p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-po]')).toBeVisible();
 spr(true,name+' „Odznacz” cofa zatwierdzenie, drugie „Odznacz” cofa zdjęcie (niezrobiona)');
 // zdjęcia poprawki
 await p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-zdj]').click();await expect(p.locator('h1')).toHaveText('Zdjęcia poprawki');await expect(p.locator('.fotki figcaption')).toHaveText([`Po poprawce. Zdjęcie dodane przez: Pati · ${dzis}`]);await kontrola(p,name+' zdjęcia poprawki');
 await p.locator('[data-pow="0"]').click();await expect(p.locator('#okno')).toBeVisible();await expect(p.locator('#okno .info')).toContainText('Zdjęcie dodane przez: Pati');await p.click('#zamknij');await p.click('#wrocP');
 // usunięcie
 await p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-usun]').click();await expect(p.locator('h1')).toHaveText('Usunąć poprawkę?');await p.click('#nie');await p.locator('.pop',{hasText:'Krzywa płytka'}).locator('[data-usun]').click();await p.click('#tak');
 await expect(p.locator('.msg')).toContainText('Poprawka „Krzywa płytka” została usunięta.');await expect(p.locator('.pop')).toHaveCount(1);spr(true,name+' „Usuń” z potwierdzeniem (Nie, wróć / Tak)');
 // Biblioteka › Poprawki
 await p.click('#wroc');await expect(p.locator('#m-poprawki')).toHaveText('Poprawki – 1 niezrobiona');await p.click('#biblioteka');await expect(p.locator('.fold:has(b:text-is("Poprawki")) small')).toContainText('2 pliki');spr(true,name+' przycisk „Poprawki – 1 niezrobiona”, Biblioteka › Poprawki: 2 zdjęcia');
 await p.click('#wroc');
 // ===== KLOCEK 14: Ilości (Właściciel aplikacji) =====
 await p.click('#m-ilosci');await expect(p.locator('h1')).toHaveText('Ilości – TEST-FLIP Poprawki 1');const gr=await p.$$eval('[data-grupa] > b',e=>e.map(x=>x.textContent));spr(gr.join('|')==='Elektryka|Hydraulika|Płyty G-K|Podłogi',name+' grupy A–Z ('+gr.join(', ')+')');await kontrola(p,name+' Ilości (puste)');
 await p.click('[data-dodaj="Podłogi"]');await expect(p.locator('h1')).toHaveText('Nowa pozycja: Podłogi');await kontrola(p,name+' Nowa pozycja');
 await p.click('#zapiszPoz');await expect(p.locator('.msg')).toHaveText('Trzeba podać nazwę pozycji.');
 await p.fill('#zN','Panele');await p.click('#zapiszPoz');await expect(p.locator('.msg')).toHaveText('Trzeba podać liczbę albo zaznaczyć „do sprawdzenia”.');
 await p.fill('#zI','abc');await p.click('#zapiszPoz');await expect(p.locator('.msg')).toContainText('Liczba musi być liczbą');spr(true,name+' pozycja: puste pola i zła liczba odrzucone');
 await p.fill('#zI','12,5');await p.selectOption('#zJ','m²');await p.click('#zapiszPoz');await expect(p.locator('.msg')).toHaveText('Dodano pozycję „Panele” (12,5 m²) w grupie Podłogi.');
 for(const [g,n,i,j] of [['Elektryka','Gniazda podwójne','8','szt.'],['Elektryka','Gniazda antenowe','1','szt.']]){await p.click(`[data-dodaj="${g}"]`);await p.fill('#zN',n);await p.fill('#zI',i);await p.selectOption('#zJ',j);await p.click('#zapiszPoz');await expect(p.locator('.msg')).toContainText('Dodano pozycję')}
 await p.click('[data-dodaj="Płyty G-K"]');await p.fill('#zN','Wnęka LED');await p.check('#zS');await p.click('#zapiszPoz');await expect(p.locator('.msg')).toContainText('(do sprawdzenia)');
 const wn=p.locator('.poz',{hasText:'Wnęka LED'});await expect(wn.locator('.war')).toHaveText('do sprawdzenia');await expect(wn.locator('.niep')).toHaveCount(0);await expect(wn.locator('[data-ok]')).toHaveCount(0);
 const el=await p.$$eval('[data-grupa="Elektryka"] .poz .zw > span:first-child',e=>e.map(x=>x.textContent));spr(el.join('|')==='Gniazda antenowe|Gniazda podwójne',name+' pozycje A–Z, „do sprawdzenia” bez „Zgadza się” ('+el.join(', ')+')');await kontrola(p,name+' Ilości (pozycje)');
 const gp=()=>p.locator('.poz',{hasText:'Gniazda podwójne'});await gp().locator('[data-ok]').click();await expect(p.locator('.msg')).toHaveText('„Gniazda podwójne”: zgadza się z architektem.');await expect(gp().locator('.pod')).toContainText(`✓ Zgadza się z architektem. Pati · ${dzis}`);
 await gp().locator('[data-odz]').click();await expect(p.locator('.msg')).toContainText('Odznaczono: „Gniazda podwójne” wraca do liczby z planu (8 szt.)');await expect(gp().locator('[data-ok]')).toBeVisible();spr(true,name+' „Zgadza się” i „Odznacz”');
 const pa=()=>p.locator('.poz',{hasText:'Panele'});await pa().locator('[data-pop]').click();await expect(p.locator('h1')).toHaveText('Popraw ilość');await expect(p.locator('.intro').first()).toContainText('Z planu: 12,5 m²');await kontrola(p,name+' Popraw ilość');
 await p.click('#zapiszIl');await expect(p.locator('.msg')).toHaveText('Trzeba podać liczbę według architekta.');await p.fill('#ilV','14');await p.fill('#ilW','Architekt dodał korytarz');await p.click('#zapiszIl');
 await expect(p.locator('.msg')).toContainText('„Panele” według architekta 14 m² (z planu 12,5 m²)');await expect(pa().locator('.stara')).toHaveText('12,5 m²');await expect(pa().locator('.war b')).toHaveText('14 m²');await expect(pa().locator('.pod')).toContainText('Poprawione według architekta: Architekt dodał korytarz');
 spr(await pa().locator('.stara').evaluate(e=>getComputedStyle(e).textDecorationLine)==='line-through',name+' „Popraw”: stara przekreślona, liczba architekta pogrubiona, powód');
 // Lista prac (rdzeń z hakiem)
 await p.click('#wroc');await p.click('#listaPrac');await expect(p.locator('#zmianyIlosci')).toContainText('Podłogi: Panele');await expect(p.locator('#zmianyIlosci .stara')).toHaveText('12,5 m²');await expect(p.locator('#zmianyIlosci b').last()).toHaveText('14 m²');spr(true,name+' Lista prac: na górze „Zmiany ilości od architekta”');await kontrola(p,name+' Lista prac z poprawką ilości');
 await p.click('#wroc');await p.click('#m-ilosci');await pa().locator('[data-odz]').click();await expect(p.locator('.msg')).toContainText('wraca do liczby z planu (12,5 m²)');await p.click('#wroc');await p.click('#listaPrac');await expect(p.locator('h1')).toHaveText('Lista prac – TEST-FLIP Poprawki 1');await expect(p.locator('#zmianyIlosci')).toHaveCount(0);spr(true,name+' „Odznacz” poprawki: znika z Listy prac');
 await p.click('#wroc');await p.click('#m-ilosci');await pa().locator('[data-pop]').click();await p.fill('#ilV','14');await p.click('#zapiszIl');await expect(p.locator('.msg')).toContainText('według architekta 14 m²');
 // Pytania do architekta
 await p.click('#dodajQ');await expect(p.locator('.msg')).toHaveText('Trzeba napisać pytanie do architekta.');await p.fill('#qaIn','Brak wymiaru gniazda w kuchni');await p.click('#dodajQ');await expect(p.locator('.msg')).toContainText('Dodano pytanie do architekta');
 await p.fill('#qaIn','Czy wanna czy prysznic');await p.click('#dodajQ');const pyt=await p.$$eval('.pyt > span',e=>e.map(x=>x.firstChild.textContent.trim()));spr(pyt.join('|')==='○ Brak wymiaru gniazda w kuchni|○ Czy wanna czy prysznic',name+' pytania A–Z');
 await p.locator('.pyt',{hasText:'Brak wymiaru'}).locator('[data-ptak]').click();await expect(p.locator('.pyt',{hasText:'Brak wymiaru'}).locator('.kto')).toHaveText(`Wyjaśnione przez: Pati · ${dzis}`);
 const pyt2=await p.$$eval('.pyt > span',e=>e.map(x=>x.firstChild.textContent.trim()));spr(pyt2[1]==='✓ Brak wymiaru gniazda w kuchni',name+' „Wyjaśnione”: ✓, kto i kiedy, wyjaśnione na dole');
 await p.locator('.pyt',{hasText:'Brak wymiaru'}).locator('[data-pnie]').click();await expect(p.locator('.msg')).toContainText('znowu czeka na odpowiedź architekta');await p.locator('.pyt',{hasText:'Brak wymiaru'}).locator('[data-ptak]').click();spr(true,name+' „Odznacz” pytania');
 // Wysokość i Przelicz
 await p.click('#przelicz');await expect(p.locator('.msg')).toContainText('Trzeba podać wysokość');await p.fill('#hIn','40');await p.click('#przelicz');await expect(p.locator('.msg')).toContainText('od 150 do 500 cm');
 await p.fill('#hIn','260');await p.click('#przelicz');await expect(p.locator('.msg')).toContainText('Zapisano wysokość 260 cm');await expect(p.locator('#sumaScian')).toHaveText('62,4 m²');
 const tab=await p.$$eval('.tabW tbody tr',e=>e.map(x=>x.innerText.replace(/\s+/g,' ').trim()));spr(tab[0]==='Łazienka 4 m² 8 m 20,8 m²'&&tab[1]==='Salon 16 m² 16 m 41,6 m²',name+' „Przelicz”: ściany = obwód × wysokość ('+tab.join(' / ')+')');await kontrola(p,name+' Ilości z wysokością');
 await p.locator('.poz',{hasText:'Gniazda antenowe'}).locator('[data-usun]').click();await expect(p.locator('h1')).toHaveText('Usunąć pozycję?');await p.click('#tak');await expect(p.locator('.msg')).toContainText('została usunięta');await expect(p.locator('.poz',{hasText:'Gniazda antenowe'})).toHaveCount(0);spr(true,name+' „Usuń” pozycję z potwierdzeniem');
 // ===== SZEF FIRMY =====
 const pati=await p.evaluate(()=>S.user.id);await p.click('#wyloguj');await expect(p.locator('h1')).toHaveText(/Logowanie|Zakładanie konta/);
 await zaloz('Jan','firma@test.pl');await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 await p.evaluate(async fid=>{const pr=JSON.parse(localStorage.getItem('mock_profile'));const j=pr.find(x=>x.id===S.user.id);j.rola='firma';j.nazwa_firmy='Ekipa Testowa';localStorage.setItem('mock_profile',JSON.stringify(pr));localStorage.setItem('mock_dostep',JSON.stringify([{firma:S.user.id,mieszkanie:fid}]));await wczytaj()},fid);
 await expect(p.locator('h1')).toHaveText('Moje zlecenia');const naLiscie=await p.locator('.flat:has-text("TEST-FLIP Poprawki 1")').count();console.log('UWAGA rdzeń (klocek 6): mieszkań na liście „Moje zlecenia”: '+naLiscie+' – otwieram mieszkanie bezpośrednio');await p.evaluate(fid=>ekranMieszkania(fid),fid);await expect(p.locator('#m-poprawki')).toHaveText('Poprawki – 1 niezrobiona');
 await p.click('#m-poprawki');await expect(p.locator('#dodajPop')).toHaveCount(0);await expect(p.locator('.etapP')).toHaveCount(0);await expect(p.locator('.intro').first()).toContainText('Gdy Ekipa Testowa zrobi poprawkę');
 const kf=()=>p.locator('.pop',{hasText:'Fuga przy wannie'});await expect(kf().locator('.kto').first()).toHaveText(`Zgłoszone przez: Pati · ${dzis}`);await expect(kf().locator('[data-usun]')).toHaveCount(0);spr(true,name+' firma: bez „Dodaj”, bez „Usuń”, bez listy prac, „Zgłoszone przez: Pati”');await kontrola(p,name+' Poprawki (firma)');
 await kf().locator('[data-po]').click();await expect(p.locator('h1')).toHaveText('Zrobione – zdjęcie po poprawce');await expect(p.locator('.card',{hasText:'Zdjęcie zgłoszenia'}).locator('figure')).toHaveCount(1);
 await p.click('#wyslij');await expect(p.locator('.msg')).toHaveText('Najpierw trzeba dodać zdjęcie po poprawce.');await p.setInputFiles('#galeria',[J2]);await p.click('#wyslij');await expect(p.locator('.msg')).toContainText('Zdjęcie po poprawce „Fuga przy wannie” wysłane. Zdjęcie dodane przez: Ekipa Testowa');
 await expect(kf().locator('.stan')).toHaveText('Zdjęcie po poprawce wysłane – czeka na zatwierdzenie');await expect(kf().locator('[data-zatw]')).toHaveCount(0);spr(true,name+' firma: „Zrobione – wyślij zdjęcie” (bez zdjęcia odrzucone), czeka na zatwierdzenie, bez „Zatwierdź”');
 await kf().locator('[data-cofnij]').click();await expect(p.locator('.msg')).toContainText('jest znowu niezrobiona');await kf().locator('[data-po]').click();await expect(p.locator('.card',{hasText:'Zdjęcia po poprawce (1)'})).toBeVisible();await p.click('#wyslij');await expect(p.locator('.msg')).toContainText('wysłane');spr(true,name+' firma: „Odznacz” cofa wysłanie, ponowne wysłanie ze zdjęciem, które już jest');
 const zatwF=await p.evaluate(async()=>{const {data}=await sb.from('poprawki').select('id').eq('tresc','Fuga przy wannie');const r=await sb.from('poprawki').update({zatwierdzona:true}).eq('id',data[0].id);return r.error?r.error.message:'ZATWIERDZONA'});spr(/tylko oznaczyć/.test(zatwF),name+' firma nie może zatwierdzić (baza)');
 await p.click('#wroc');await p.click('#m-ilosci');await expect(p.locator('[data-dodaj],[data-ok],[data-pop],#fq,#fh,[data-ptak],[data-pnie]')).toHaveCount(0);await expect(p.locator('.poz',{hasText:'Panele'}).locator('.stara')).toHaveText('12,5 m²');await expect(p.locator('#sumaScian')).toHaveText('62,4 m²');await expect(p.locator('.intro').first()).toContainText('tylko do oglądania');
 spr(true,name+' firma: Ilości tylko do oglądania (bez przycisków), widzi poprawki i ściany');await kontrola(p,name+' Ilości (firma)');
 const insF=await p.evaluate(async fid=>{const r=await sb.from('ilosci').insert({mieszkanie:fid,grupa:'Podłogi',nazwa:'X',ilosc:1});return r.error?'ODRZUCONE':'DODANE'},fid);spr(insF==='ODRZUCONE',name+' firma nie dodaje ilości');
 // ===== z powrotem Właściciel aplikacji: zatwierdza zdjęcie firmy =====
 await p.click('#wyloguj');await expect(p.locator('h1')).toHaveText(/Logowanie|Zakładanie konta/);if(await p.locator('h1').textContent()!=='Logowanie')await p.click('text=Mam konto – zaloguj się');await p.fill('#email','pati@test.pl');await p.fill('#haslo','Dobrehaslo1');await p.click('#wyslij');await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 await p.click('.flat:has-text("TEST-FLIP Poprawki 1")');await p.click('#m-poprawki');await expect(kf().locator('.kto').nth(1)).toHaveText(`Zdjęcie dodane przez: Ekipa Testowa · ${dzis}`);await kf().locator('[data-zatw]').click();await expect(kf().locator('.st-done')).toHaveText('✓ Zrobiona');
 await expect(p.locator('.liczP')).toHaveText('0 niezrobionych · 1 zrobiona');await p.click('#wroc');await expect(p.locator('#m-poprawki')).toHaveText('Poprawki');spr(true,name+' Właściciel aplikacji zatwierdza zdjęcie firmy: zielona, licznik na przycisku znika');
 spr(!errs.length,name+' brak błędów na stronie '+errs.join(';'));await ctx.close()}
console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close();process.exit(zle?1:0)})().catch(e=>{console.log('BLAD:',e.message.split('\n').slice(0,8).join('\n'));process.exit(1)});
