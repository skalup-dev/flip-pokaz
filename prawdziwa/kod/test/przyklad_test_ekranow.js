// Przykład testu ekranów (klocek 5). Uruchamianie: NODE_PATH=$(npm root -g) node przyklad_test_ekranow.js  (baza zastępcza mock_pelny.js)
// Zdjęcia testowe praca1.jpg, praca2.jpg, praca3.jpg trzeba wygenerować obok (np. Pillow).
// Test klocka 5: Lista prac. TRYB=mock albo TRYB=real
const {chromium,expect}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path');
const REAL=process.env.TRYB==='real';const root=process.env.ROOT||path.join(__dirname,'..','..');
const EMAIL=process.env.EMAIL||'pati@test.pl';const PW=REAL?fs.readFileSync(process.env.PWFILE,'utf8').trim():'Dobrehaslo1';
const MOCK=fs.readFileSync(__dirname+'/mock_pelny.js','utf8');const PORT=8783;const J1=__dirname+'/praca1.jpg',J2=__dirname+'/praca2.jpg',J3=__dirname+'/praca3.jpg';
const srv=http.createServer((q,r)=>{const f=path.join(root,q.url.split('?')[0].split('#')[0]);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':'text/html; charset=utf-8'});r.end(d)})}).listen(PORT);
const URL=process.env.URL||`http://127.0.0.1:${PORT}/index.html`;let zle=0,ok=0;const spr=(w,t)=>{console.log((w?'OK   ':'ZLE  ')+t);w?ok++:zle++};
const TY=/\b(Kliknij|Możesz|możesz|Wpisz|Sprawdź|Odczekaj|wrócisz|Wybierz zdj|Zaznacz|Twoj|zrobiłeś|dodałeś)\b/;
async function kontrola(p,gdzie){const t=await p.evaluate(()=>[...document.querySelectorAll('#app h1,#app .intro,#app .msg,#app .empty,#app label,#app .card')].map(e=>e.innerText).join(' | '));const m=t.match(TY);
 const sz=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);spr(!m&&sz<=0&&await p.evaluate(()=>!!document.querySelector('.stopka b')),gdzie+': bez formy Ty, bez przewijania w bok, stopka'+(m?' (Ty: '+m[0]+')':'')+(sz>0?' (w bok '+sz+')':''))}
async function sprzataj(p){await p.evaluate(async()=>{const {data:f}=await sb.from('mieszkania').select('id').like('ulica','TEST-FLIP%');for(const m of f||[]){await sb.from('prace').update({zrobiona:false}).eq('mieszkanie',m.id);const {data:pl}=await sb.from('pliki').select('id,sciezka').eq('mieszkanie',m.id);if(pl&&pl.length){await sb.storage.from('biblioteka').remove(pl.map(x=>x.sciezka));await sb.from('pliki').delete().eq('mieszkanie',m.id)}await sb.from('mieszkania').delete().eq('id',m.id)}})}
const dzis=new Date().toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
(async()=>{const b=await chromium.launch();
for(const [name,vp] of [['pc',{width:1280,height:900}],['tel',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp,locale:'pl-PL'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(30000);
 if(!REAL){await p.route('**/supabase.js',r=>r.fulfill({body:MOCK,contentType:'application/javascript'}));await p.route('**/config.js',r=>r.fulfill({body:'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};',contentType:'application/javascript'}))}
 await p.goto(URL);await expect(p.locator('h1')).toHaveText('Logowanie');
 if(REAL){await p.fill('#email',EMAIL);await p.fill('#haslo',PW);await p.click('#wyslij')}else{await p.click('text=Nie masz konta? Załóż konto');await p.fill('#imie','Pati');await p.fill('#email',EMAIL);await p.fill('#haslo',PW);await p.fill('#haslo2',PW);await p.click('#wyslij')}
 await expect(p.locator('h1')).toHaveText('Moje mieszkania');await p.waitForTimeout(1500);if(REAL){await sprzataj(p);await p.reload();await expect(p.locator('h1')).toHaveText('Moje mieszkania');await p.waitForTimeout(1500)}
 const imie=REAL?'Test Flip':'Pati';
 // mieszkanie krokami: Łazienka (3 prace) i Salon (2 prace)
 await p.click('#dodaj');await p.fill('#ulica','TEST-FLIP Lista 1');await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('zapisane');await p.click('#dalej');
 await p.click('[data-rodzaj="Łazienka"]');await p.click('[data-rodzaj="Salon"]');await p.click('#dalej');
 for(const t of ['Płytki ścienne','Prysznic','Wywóz gruzu'])await p.locator('.kr',{hasText:t}).locator('input').check();
 await p.click('[data-otworz]:has-text("Salon")');for(const t of ['Panele','Malowanie ścian'])await p.locator('.kr',{hasText:t}).locator('input').check();
 await p.click('#zatwierdz');await expect(p.locator('.msg')).toContainText('Lista prac zapisana: 5 prac w 2 pomieszczeniach.');
 await expect(p.locator('#listaPrac')).toHaveText('Lista prac – 0 z 5 (0%)');await expect(p.locator('.row:has-text("Gotowość") b')).toHaveText('0% (0 z 5 prac)');spr(true,name+' ekran mieszkania: przycisk „Lista prac – 0 z 5 (0%)” i gotowość');
 await p.click('#wroc');await expect(p.locator('.flat:has-text("TEST-FLIP Lista 1") .got')).toContainText('Gotowość: 0% (0 z 5 prac)');spr(true,name+' lista mieszkań: gotowość 0%');await kontrola(p,name+' lista mieszkań');
 await p.click('.flat:has-text("TEST-FLIP Lista 1")');await p.click('#listaPrac');await expect(p.locator('h1')).toHaveText('Lista prac – TEST-FLIP Lista 1');
 await expect(p.locator('#razemP')).toHaveText('0 z 5 prac · 0%');const pom=await p.$$eval('[data-pom] .zw',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));spr(pom.join('|')==='Łazienka 0 z 3 ›|Salon 0 z 2 ›',name+' Lista prac: pomieszczenia A–Z z postępem ('+pom.join(', ')+')');await kontrola(p,name+' Lista prac');
 await p.click('[data-pom]:has-text("Łazienka")');await expect(p.locator('h1')).toHaveText('Łazienka · 0 z 3');
 const et=await p.$$eval('#doZrobienia .etap',e=>e.map(x=>x.textContent));spr(et.join('|')==='1. Rozbiórki i przygotowanie|5. Łazienka – płytki i biały montaż',name+' pomieszczenie: „Do zrobienia” po etapach ('+et.join(', ')+')');
 await expect(p.locator('#zrobione')).toContainText('Jeszcze nic.');await kontrola(p,name+' pomieszczenie');
 // odznaczenie bez zdjęcia
 await p.click('[data-praca] .box[aria-label*="Płytki ścienne"]');await expect(p.locator('h1')).toHaveText('Odznaczenie pracy');await expect(p.locator('.intro')).toContainText(`„Odznaczone przez: ${imie}”`);await kontrola(p,name+' odznaczenie');
 await p.click('#zapiszZrob');await expect(p.locator('.msg')).toContainText('Najpierw trzeba dodać co najmniej jedno zdjęcie.');
 const bezZdj=await p.evaluate(async()=>{const {data}=await sb.from('prace').select('id').eq('nazwa','Płytki ścienne');const r=await sb.from('prace').update({zrobiona:true}).eq('id',data[0].id).select();return r.error?r.error.message:'ZROBIONA'});
 spr(bezZdj.includes('co najmniej jedno zdjęcie'),name+' bez zdjęcia: ekran i baza odrzucają odznaczenie ('+bezZdj+')');
 // kilka zdjęć
 await p.setInputFiles('#galeria',[J1,J2]);await expect(p.locator('.fotki figure')).toHaveCount(2);await p.locator('[data-usunz]').first().click();await expect(p.locator('.fotki figure')).toHaveCount(1);
 await p.setInputFiles('#aparat',[J1]);await expect(p.locator('.fotki figure')).toHaveCount(2);await expect(p.locator('.fotki figcaption').first()).toContainText(`Zdjęcie dodane przez: ${imie} · ${dzis}`);
 spr(true,name+' kilka zdjęć: galeria (2), „Usuń” (1), aparat (2), podpis przy zdjęciu');
 await p.click('#zapiszZrob');await expect(p.locator('.msg')).toContainText(`Praca „Płytki ścienne” jest zrobiona. Odznaczone przez: ${imie} · ${dzis}.`,{timeout:60000});
 const prz=p.locator('#zrobione .pr',{hasText:'Płytki ścienne'});await expect(prz.locator('.kto')).toHaveText(`Odznaczone przez: ${imie} · ${dzis}`);await expect(prz.locator('[data-zdjecia]')).toHaveText('📷 Zobacz zdjęcia (2)');
 await expect(p.locator('h1')).toHaveText('Łazienka · 1 z 3');spr(true,name+' zapis jako zrobiona: „Zrobione (1)”, „Odznaczone przez: '+imie+' · '+dzis+'”, „Zobacz zdjęcia (2)”');
 // zdjęcia pracy
 await prz.locator('[data-zdjecia]').click();await expect(p.locator('h1')).toHaveText('Zdjęcia pracy');await expect(p.locator('.fotki figure')).toHaveCount(2);await expect(p.locator('.intro .kto')).toContainText(`Odznaczone przez: ${imie} · ${dzis} · zdjęć: 2`);await kontrola(p,name+' zdjęcia pracy');
 await p.locator('[data-pow="0"]').click();await expect(p.locator('#okno')).toBeVisible();await p.waitForFunction(()=>{const i=document.querySelector('#okno img');return i&&i.complete&&i.naturalWidth>0});
 const ok1=await p.evaluate(()=>[document.querySelector('#okno .gora b').textContent,document.querySelector('#okno .info').textContent,Math.max(document.querySelector('#okno img').naturalWidth,document.querySelector('#okno img').naturalHeight)]);
 spr(ok1[0]==='Powiększenie zdjęcia 1 z 2 · Płytki ścienne'&&ok1[1].includes(`Zdjęcie dodane przez: ${imie}`)&&ok1[2]<=2000,name+' powiększenie: tytuł, kto dodał, zdjęcie zmniejszone ('+ok1[2]+' px)');await p.click('#zamknij');
 await p.setInputFiles('#dodajZdj',[J2]);await expect(p.locator('.msg')).toContainText('Dodano: 1 zdjęcie.',{timeout:60000});await expect(p.locator('.fotki figure')).toHaveCount(3);spr(true,name+' „+ Dodaj zdjęcie”: 3 zdjęcia');
 await p.click('#wrocPom');
 // Odznacz i ponowne odznaczenie ze starymi zdjęciami
 await p.locator('#zrobione .pr',{hasText:'Płytki ścienne'}).locator('[data-cofnij]').click();await expect(p.locator('.msg')).toContainText('Odznaczono: „Płytki ścienne” wraca do „Do zrobienia”.');await expect(p.locator('h1')).toHaveText('Łazienka · 0 z 3');
 const po=await p.evaluate(async()=>(await sb.from('prace').select('zrobiona,zrobiona_przez,zrobiona_kiedy').eq('nazwa','Płytki ścienne')).data[0]);spr(po.zrobiona===false&&!po.zrobiona_przez&&!po.zrobiona_kiedy,name+' „Odznacz”: praca wraca do „Do zrobienia”, w bazie bez „kto i kiedy”');
 await p.click('[data-praca] .box[aria-label*="Płytki ścienne"]');await expect(p.locator('.fotki figure')).toHaveCount(3);await p.click('#zapiszZrob');await expect(p.locator('.msg')).toContainText('jest zrobiona');spr(true,name+' ponowne odznaczenie z 3 zdjęciami, które już są');
 await p.click('[data-praca] .box[aria-label*="Wywóz gruzu"]');await p.setInputFiles('#aparat',[J3]);await p.click('#zapiszZrob');await expect(p.locator('.msg')).toContainText('„Wywóz gruzu” jest zrobiona',{timeout:60000});
 // procent gotowości
 await p.click('#wroc');await expect(p.locator('#razemP')).toHaveText('2 z 5 prac · 40%');const pom2=await p.$$eval('[data-pom] .zw',e=>e.map(x=>x.innerText.replace(/\s+/g,' ')));
 await p.click('#wroc');await expect(p.locator('#listaPrac')).toHaveText('Lista prac – 2 z 5 (40%)');await p.click('#wroc');await expect(p.locator('.flat:has-text("TEST-FLIP Lista 1") .got')).toContainText('Gotowość: 40% (2 z 5 prac)');
 spr(pom2.join('|')==='Łazienka 2 z 3 ›|Salon 0 z 2 ›',name+' gotowość: 40% w liście prac, na ekranie mieszkania i na liście mieszkań ('+pom2.join(', ')+')');
 // Biblioteka › Postępy prac
 await p.click('.flat:has-text("TEST-FLIP Lista 1")');await p.click('#biblioteka');await expect(p.locator('.fold:has(b:text-is("Postępy prac")) small')).toContainText('4 pliki');await p.click('.fold:has(b:text-is("Postępy prac"))');await expect(p.locator('.plik')).toHaveCount(4);spr(true,name+' Biblioteka › Postępy prac: 4 zdjęcia prac');
 // ostatnie zdjęcie zrobionej pracy chronione
 const wy=await p.evaluate(async()=>{const pr=(await sb.from('prace').select('id').eq('nazwa','Wywóz gruzu')).data[0].id;return (await sb.from('pliki').select('nazwa').eq('praca',pr)).data[0].nazwa});
 const plWy=p.locator('.plik').filter({hasText:wy});const ileWy=await plWy.count();
 let ostatnie;if(ileWy===1){await plWy.locator('button:text-is("Usuń")').click();await p.click('#tak');await expect(p.locator('.msg')).toContainText('To ostatnie zdjęcie zrobionej pracy');ostatnie=true;await p.click('#nie')}
 spr(ostatnie,name+' Biblioteka: ostatniego zdjęcia zrobionej pracy nie da się usunąć');
 await p.locator('.plik').filter({hasText:'praca1.jpg'}).first().locator('button:text-is("Usuń")').click();await p.click('#tak');await expect(p.locator('.msg')).toContainText('został usunięty');await expect(p.locator('.plik')).toHaveCount(3);spr(true,name+' Biblioteka: zdjęcie pracy, która ma inne zdjęcia, usuwa się normalnie');
 await p.click('#wrocBib');await p.click('#wroc');
 // mieszkanie bez listy prac
 await p.click('#wroc');await p.click('#dodaj');await p.fill('#ulica','TEST-FLIP Lista 2');await p.click('#zapisz');await expect(p.locator('.msg')).toContainText('zapisane');await p.click('#dalej');await p.click('#dalej');await p.click('#zatwierdz');
 await expect(p.locator('#listaPrac')).toHaveText('Lista prac');await expect(p.locator('.row:has-text("Gotowość") b')).toHaveText('brak listy prac');await p.click('#listaPrac');await expect(p.locator('.empty')).toContainText('To mieszkanie nie ma jeszcze listy prac.');
 await p.click('#wroc');await p.click('#wroc');await expect(p.locator('.flat:has-text("TEST-FLIP Lista 2") .got')).toHaveText('Gotowość: brak listy prac');spr(true,name+' mieszkanie bez listy prac: „brak listy prac” i pusta lista z wyjaśnieniem');
 if(name==='pc'||name==='tel'){}
 if(REAL){await sprzataj(p);const k=await p.evaluate(async()=>[(await sb.from('mieszkania').select('id')).data.length,(await sb.from('prace').select('id')).data.length,(await sb.from('pliki').select('id')).data.length]);spr(k.every(x=>x===0),name+' sprzątnięte: mieszkań, prac, plików = '+k.join(', '))}
 spr(!errs.length,name+' brak błędów na stronie '+errs.join(';'));await ctx.close()}
console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close()})().catch(e=>{console.log('BLAD:',e.message.split('\n').slice(0,8).join('\n'));process.exit(1)});
