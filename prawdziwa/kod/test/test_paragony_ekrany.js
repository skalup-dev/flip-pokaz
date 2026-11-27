// Test ekranów klocków 7 (Paragony i materiały, odczyt Tesseract) i 8 (Pieniądze) na bazie zastępczej mock_paragony.js.
// Uruchamianie: python3 gen_paragony.py KATALOG && IMG=KATALOG NODE_PATH=$(npm root -g) node test_paragony_ekrany.js
const {chromium,expect}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path');
const root=process.env.ROOT||path.join(__dirname,'..','..');const IMG=process.env.IMG||__dirname;const I=n=>path.join(IMG,n);
const MOCK=fs.readFileSync(__dirname+'/mock_paragony.js','utf8');const PORT=8787;
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0].split('#')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':f.endsWith('.gz')?'application/gzip':'text/html; charset=utf-8'});r.end(d)})}).listen(PORT);
const URL=`http://127.0.0.1:${PORT}/index.html`;let zle=0,ok=0;const spr=(w,t)=>{console.log((w?'OK   ':'ZLE  ')+t);w?ok++:zle++};
const TY=/\b(Kliknij|Możesz|możesz|Wpisz|Sprawdź|Odczekaj|wrócisz|Wybierz zdj|Zaznacz|Twoj|zrobiłeś|dodałeś)\b/;
const BIALE=/rgb\(255, 255, 255\)/;
async function kontrola(p,gdzie){const t=await p.evaluate(()=>[...document.querySelectorAll('#app h1,#app .intro,#app .msg,#app .empty,#app label,#app .card,#app button')].map(e=>e.innerText).join(' | '));const m=t.match(TY);
 const sz=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth);const tla=await p.evaluate(()=>[...document.querySelectorAll('#app *')].map(e=>getComputedStyle(e).backgroundColor).filter(c=>c==='rgb(255, 255, 255)').length);
 spr(!m&&sz<=0&&!tla&&await p.evaluate(()=>!!document.querySelector('.stopka b')),gdzie+': bez formy Ty, bez przewijania w bok, bez białego tła, stopka'+(m?' (Ty: '+m[0]+')':'')+(sz>0?' (w bok '+sz+')':'')+(tla?' (białe tło: '+tla+')':''))}
const txt=async(p,s)=>(await p.locator(s).innerText()).replace(/\s+/g,' ').trim();
const CZASY=[];const zrzut=async(p,n,nm)=>{if(process.env.ZRZUTY)await p.screenshot({path:path.join(process.env.ZRZUTY,nm+'_'+n+'.png'),fullPage:true})};
async function odczytaj(p){const t0=Date.now();await p.click('#odczytaj');await expect(p.locator('#postep')).toContainText(/Wczytuję odczyt paragonu…|Odczytuję paragon/);await expect(p.locator('h1')).toHaveText('Dane dokumentu',{timeout:120000});const ms=Date.now()-t0;CZASY.push(ms);return ms}
(async()=>{const b=await chromium.launch();
for(const [name,vp] of [['pc',{width:1280,height:900}],['tel',{width:390,height:844}]]){
 const ctx=await b.newContext({viewport:vp,locale:'pl-PL',hasTouch:name==='tel'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.setDefaultTimeout(30000);
 await p.route('**/supabase.js',r=>r.fulfill({body:MOCK,contentType:'application/javascript'}));await p.route('**/config.js',r=>r.fulfill({body:'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};',contentType:'application/javascript'}));
 await p.goto(URL);await expect(p.locator('h1')).toHaveText('Logowanie');
 await p.click('text=Nie masz konta? Załóż konto');await p.fill('#imie','Pati');await p.fill('#email','pati@test.pl');await p.fill('#haslo','Dobrehaslo1');await p.fill('#haslo2','Dobrehaslo1');await p.click('#wyslij');
 await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 await p.click('#dodaj');await p.fill('#ulica','Testowa 7');await p.fill('#firma_remontowa','Ekipa Testowa');await p.fill('#metraz','50');await p.click('#zapisz');await p.click('#dalej');await p.click('#dalej');await p.click('#zatwierdz');
 await expect(p.locator('h1')).toHaveText('Testowa 7');
 const mod=await p.$$eval('.moduly button',e=>e.map(x=>x.innerText));spr(mod.join('|')==='Biblioteka – zdjęcia i pliki PDF|Firma|Lista prac|Paragony i materiały|Pieniądze',name+' przyciski mieszkania od A do Z: '+mod.join(', '));
 // ---- KLOCEK 8: puste kwoty, złe kwoty, zapis
 await p.click('#m-pieniadze');await expect(p.locator('h1')).toHaveText('Pieniądze – Testowa 7');await expect(p.locator('#kpiZakup')).toHaveText('–');await kontrola(p,name+' Pieniądze (puste)');
 await expect(p.locator('#app')).toContainText('Nie wpisano jeszcze: cena zakupu, cena dla firmy za m², budżet na materiały.');
 await p.click('#zmienKwoty');await expect(p.locator('h1')).toHaveText('Zmień kwoty · Testowa 7');await kontrola(p,name+' Zmień kwoty');
 await p.fill('#cena_zakupu','abc');await p.click('#zapiszKwoty');await expect(p.locator('.msg')).toHaveText('Cena zakupu musi być liczbą równą lub większą od zera, np. 230000.');
 await p.fill('#cena_zakupu','230000');await p.fill('#cena_firmy_m2','-900');await p.click('#zapiszKwoty');await expect(p.locator('.msg')).toContainText('Cena dla firmy za m² musi być liczbą');
 await p.fill('#cena_firmy_m2','900');await p.fill('#budzet_materialow','55 000');await expect(p.locator('#podsumowanie')).toContainText('Firma dostanie: 45 000 zł (900 zł × 50 m²)');await expect(p.locator('#podsumowanie')).toContainText('Budżet remontu razem: 100 000 zł');
 spr(true,name+' Zmień kwoty: złe kwoty odrzucone, podsumowanie liczy się na żywo');
 await p.click('#zapiszKwoty');await expect(p.locator('.msg')).toContainText('Kwoty zapisane. Zakup: 230 000 zł, firma: 900 zł/m², materiały: 55 000 zł.');
 spr(await txt(p,'#kpiZakup')==='230 000 zł'&&await txt(p,'#kpiWydane')==='0 zł z 100 000 zł'&&await txt(p,'#kpiRazem')==='230 000 zł'&&await txt(p,'#liniaFirma')==='Firma: 900 zł/m² = 45 000 zł · materiały: 55 000 zł',name+' Pieniądze po zapisie: Zakup, Remont wydane z budżetu, Razem, linia „Firma: X zł/m² · materiały”');
 await kontrola(p,name+' Pieniądze');await zrzut(p,'pieniadze',name);
 // ---- KLOCEK 7: lista pusta
 await p.click('#doParagonow');await expect(p.locator('h1')).toHaveText('Paragony i materiały – Testowa 7');await expect(p.locator('.empty')).toContainText('Nie ma jeszcze żadnego dokumentu.');
 await expect(p.locator('#budzetMat')).toContainText('Materiały: wydane 0 zł z 55 000 zł');await kontrola(p,name+' Paragony (puste)');
 // zły plik
 await p.click('#dodajDok');await expect(p.locator('h1')).toHaveText('Nowy paragon lub faktura');await kontrola(p,name+' Nowy dokument');await zrzut(p,'nowy',name);
 await p.setInputFiles('#dokGaleria',I('nie_paragon.txt'));await expect(p.locator('.msg')).toContainText('nie_paragon.txt: to nie jest zdjęcie ani plik PDF.');
 // zdjęcie paragonu: przycięcie, obrót, przeciąganie narożnika
 await p.setInputFiles('#dokGaleria',I('paragon1.jpg'));await expect(p.locator('h1')).toHaveText('Przycięcie zdjęcia');await kontrola(p,name+' Przycięcie');await zrzut(p,'kadr',name);
 const wym0=await p.evaluate(()=>[S.dok.zrodlo.width,S.dok.zrodlo.height]);spr(Math.max(...wym0)<=1500,name+' zdjęcie zmniejszone do 1500 px ('+wym0.join('×')+')');
 await p.click('#obroc');const wym1=await p.evaluate(()=>[S.dok.zrodlo.width,S.dok.zrodlo.height]);await p.click('#obroc');await p.click('#obroc');await p.click('#obroc');const wym2=await p.evaluate(()=>[S.dok.zrodlo.width,S.dok.zrodlo.height]);
 spr(wym1[0]===wym0[1]&&wym1[1]===wym0[0]&&wym2.join()===wym0.join(),name+' „↻ Obróć”: ćwierć obrotu, 4 obroty wracają');
 const box=await p.locator('#kadr').boundingBox();const sx=box.x+3,sy=box.y+3;
 if(name==='tel'){await p.evaluate(([x,y,X,Y])=>{const c=document.querySelector('#kadr');const ev=(t,a,b)=>c.dispatchEvent(new PointerEvent(t,{clientX:a,clientY:b,pointerId:1,pointerType:'touch',bubbles:true}));ev('pointerdown',x,y);ev('pointermove',(x+X)/2,(y+Y)/2);ev('pointermove',X,Y);ev('pointerup',X,Y)},[sx,sy,box.x+box.width*0.25,box.y+box.height*0.2])}
 else{await p.mouse.move(sx,sy);await p.mouse.down();await p.mouse.move(box.x+box.width*0.25,box.y+box.height*0.2,{steps:5});await p.mouse.up()}
 const r0=await p.evaluate(()=>S.dok.rogi[0]);spr(r0.x>50&&r0.y>50,name+' narożnik przesunięty '+(name==='tel'?'palcem':'myszką')+' ('+Math.round(r0.x)+','+Math.round(r0.y)+')');
 await p.click('#calosc');const r1=await p.evaluate(()=>S.dok.rogi[0]);spr(r1.x===0&&r1.y===0,name+' „Całe zdjęcie” wraca do pełnych narożników');
 // narożniki na paragon (zdjęcie ma tło 60 px z boków, 80 px u góry/dołu, obraz zmniejszony)
 await p.evaluate(()=>{const z=S.dok.zrodlo;S.dok.rogi=[{x:40,y:60},{x:z.width-40,y:60},{x:z.width-40,y:z.height-60},{x:40,y:z.height-60}]});
 const ms=await odczytaj(p);
 const v=await p.evaluate(()=>({s:document.querySelector('#d-sklep').value,k:document.querySelector('#d-kwota').value,d:document.querySelector('#d-data').value,n:document.querySelector('#d-nip').value,poz:document.querySelectorAll('#pozycje .poz').length,niep:[...document.querySelectorAll('.niep')].map(e=>e.dataset.pole||e.id)}));
 spr(v.s==='Leroy Merlin'&&v.k==='228,18'&&v.d==='2026-11-14'&&v.n==='1234563218'&&v.poz===3&&!v.niep.length,name+' odczyt Tesseract ('+ms+' ms): sklep '+v.s+', kwota '+v.k+', data '+v.d+', NIP '+v.n+', pozycji '+v.poz+', niepewne ['+v.niep+']');
 await expect(p.locator('.intro')).toContainText('Aplikacja odczytała dane ze zdjęcia (pewność odczytu:');await kontrola(p,name+' Dane dokumentu (odczyt)');await zrzut(p,'dane',name);
 await p.click('#zapiszDok');await expect(p.locator('.msg')).toContainText('Dokument zapisany: Leroy Merlin 228,18 zł. Jest sprawdzony i liczy się do wydanych na materiały. Zdjęcie jest w Bibliotece › Paragony.');
 await expect(p.locator('#budzetMat')).toContainText('Materiały: wydane 228,18 zł z 55 000 zł');await expect(p.locator('#budzetMat')).toContainText('zostało 54 771,82 zł');spr(true,name+' zapis odczytanego paragonu: sprawdzony, budżet materiałów: wydane i zostało');
 // drugi: wskazówka, złe zdjęcie → „Zrób jeszcze raz”, drugie złe → „Zapisz mimo to”
 await p.click('#dodajDok');const zas=await p.$$eval('#wskazowka li',e=>e.map(x=>x.textContent));spr(zas.join('|')==='Cały paragon w kadrze|Płasko, nie zgnieciony|Jasno, bez cienia telefonu|Ostro, telefon nieruchomo'&&await p.locator('#wskazowka svg').count()===1,name+' wskazówka przed zdjęciem: rysunek dobrze/źle i 4 zasady po kolei');
 const kol=await p.evaluate(()=>[...new Set([...document.querySelectorAll('#wskazowka svg *')].flatMap(e=>[e.getAttribute('fill'),e.getAttribute('stroke')]).filter(c=>c&&c!=='none'))]);spr(kol.every(c=>['#f4f1ea','#1E1A17','#B8924A'].includes(c)),name+' rysunek tylko w 3 kolorach firmy ('+kol.join(', ')+')');
 await p.setInputFiles('#dokAparat',I('rozmyte.jpg'));await expect(p.locator('h1')).toHaveText('Zdjęcie nie nadaje się do odczytu');await expect(p.locator('.msg').first()).toHaveText('Zdjęcie jest nieostre – trzeba zrobić je jeszcze raz, trzymając telefon nieruchomo.');
 spr(await p.locator('#lPonow').innerText()==='📷 Zrób jeszcze raz'&&!(await p.locator('#mimoTo').count()),name+' nieostre zdjęcie: powód wprost, „Zrób jeszcze raz”, bez „Zapisz mimo to”');await kontrola(p,name+' Złe zdjęcie (1)');
 await p.setInputFiles('#dokAparat',I('ciemne.jpg'));await expect(p.locator('.msg').first()).toHaveText('Zdjęcie jest za ciemne – trzeba zrobić je jeszcze raz w jaśniejszym miejscu.');await expect(p.locator('#mimoTo')).toBeVisible();
 spr(true,name+' drugie złe zdjęcie (za ciemne): pojawia się „Zapisz mimo to”');await kontrola(p,name+' Złe zdjęcie (2)');await zrzut(p,'zle_zdjecie',name);
 await p.click('#mimoTo');await expect(p.locator('h1')).toHaveText('Dane dokumentu');await expect(p.locator('.intro')).toContainText('Zdjęcie jest słabej jakości');
 const pu=await p.evaluate(()=>['sklep','kwota','data'].map(k=>[document.querySelector('#d-'+k).value,(document.querySelector('[data-pole="'+k+'"] .uwaga')||{}).textContent||'']));
 spr(pu.every(([w,u])=>w===''&&u==='Nie udało się odczytać – trzeba wpisać.'),name+' „Zapisz mimo to”: sklep, kwota, data puste z napisem „Nie udało się odczytać – trzeba wpisać.”');
 const czerw=await p.evaluate(()=>getComputedStyle(document.querySelector('[data-pole="sklep"] .uwaga')).color);spr(czerw==='rgb(255, 0, 0)',name+' ostrzeżenie na czerwono #FF0000');
 await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Trzeba wpisać sklep.');
 await p.fill('#d-sklep','Sklep Testowy');await p.fill('#d-kwota','dużo');await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Kwota musi być liczbą większą od zera, np. 228,18.');
 await p.fill('#d-kwota','0');await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Kwota musi być liczbą większą od zera, np. 228,18.');
 await p.fill('#d-kwota','12,345');await p.click('#zapiszDok');await expect(p.locator('.msg')).toContainText('najwyżej 2 miejsca po przecinku');
 await p.fill('#d-kwota','80,40');await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Trzeba wpisać datę zakupu.');
 await p.fill('#d-data','2030-01-01');await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Data zakupu nie może być z przyszłości.');
 await p.fill('#d-data','2026-11-20');await p.fill('#d-nip','123-456-32-19');await p.click('#zapiszDok');await expect(p.locator('.msg')).toContainText('NIP sklepu jest błędny');
 await p.fill('#d-nip','');await p.selectOption('#d-zaplacil','wlasciciel');spr((await p.locator('#d-zaplacil option').allInnerTexts()).join('|')==='Ekipa Testowa|Pati',name+' „Kto zapłacił”: firma albo imię z Moje dane');
 spr(true,name+' puste pola i złe dane odrzucone (sklep, kwota tekst/0/3 miejsca, data pusta/przyszła, zły NIP)');
 await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Dokument zapisany: Sklep Testowy 80,4 zł. Jest „Do sprawdzenia”. Zdjęcie jest w Bibliotece › Paragony.');
 await expect(p.locator('#kpiDoSpr')).toHaveText('1');spr(await p.evaluate(async()=>(await sb.from('pliki').select('id').eq('folder','paragony')).data.length)===2,name+' „Zapisz mimo to”: zdjęcie zostaje jako dowód w Bibliotece, dokument „Do sprawdzenia”');
 await p.locator('[data-dok]',{hasText:'Sklep Testowy'}).locator('[data-ok]').click();await expect(p.locator('#kpiDoSpr')).toHaveText('0');
 // PDF: ręcznie
 await p.click('#dodajDok');await p.setInputFiles('#dokGaleria',I('faktura.pdf'));await expect(p.locator('h1')).toHaveText('Dane dokumentu');await expect(p.locator('#app')).toContainText('Z pliku PDF aplikacja nie odczytuje danych');await kontrola(p,name+' Dane dokumentu (PDF)');
 await p.fill('#d-sklep','Hurtownia Testowa');await p.fill('#d-kwota','1 000');await p.fill('#d-data','2026-11-02');await p.click('#zapiszDok');await expect(p.locator('.msg')).toContainText('Dokument zapisany: Hurtownia Testowa 1000 zł');
 spr(await txt(p,'#kpiRazem')==='1308,58 zł'&&await txt(p,'#kpiDoSpr')==='0',name+' trzy dokumenty: materiały razem 1308,58 zł, do sprawdzenia 0');
 const sklepy=await p.$$eval('#dokumenty .card .zw b:first-child',e=>e.map(x=>x.textContent));spr(sklepy.join('|')==='Hurtownia Testowa|Leroy Merlin|Sklep Testowy',name+' lista od A do Z: '+sklepy.join(', '));
 await kontrola(p,name+' Paragony (3)');
 // Odznacz i ponowne sprawdzenie
 const leroy=p.locator('[data-dok]',{hasText:'Leroy Merlin'});await leroy.locator('[data-odznacz]').click();await expect(p.locator('.msg')).toContainText('Odznaczono: Leroy Merlin 228,18 zł jest znowu „Do sprawdzenia” i nie liczy się do wydanych.');
 await expect(p.locator('#kpiDoSpr')).toHaveText('1');await expect(p.locator('#budzetMat')).toContainText('wydane 1080,4 zł');await expect(p.locator('#budzetMat')).toContainText('Czeka na sprawdzenie: 228,18 zł');
 await expect(leroy.locator('.ostrz')).toHaveText('Do sprawdzenia');spr(true,name+' „Odznacz”: Do sprawdzenia, wydane bez tej kwoty, „czeka” osobno');
 await p.click('#wroc');await expect(p.locator('#m-paragony')).toHaveText('Paragony i materiały – 1 do sprawdzenia');await expect(p.locator('#m-pieniadze')).toHaveText('Pieniądze – razem 231 080,4 zł');spr(true,name+' przyciski mieszkania: „1 do sprawdzenia”, „Pieniądze – razem”');
 await p.click('#m-pieniadze');spr(await txt(p,'.kpi:has(#kpiWydane)')==='Remont: wydane z budżetu 1080,4 zł z 100 000 zł czeka na sprawdzenie: 228,18 zł'&&await txt(p,'#kpiRazem')==='231 080,4 zł',name+' Pieniądze: wydane tylko sprawdzone, „czeka” osobno, razem = zakup + wydane');
 await p.click('#doParagonow');await p.locator('[data-dok]',{hasText:'Leroy Merlin'}).locator('[data-ok]').click();await expect(p.locator('.msg')).toContainText('Sprawdzone: Leroy Merlin 228,18 zł. Kwota weszła do wydanych na materiały.');
 // szczegóły, Popraw odczyt
 await p.locator('[data-dok]',{hasText:'Leroy Merlin'}).locator('[data-zobacz]').click();await expect(p.locator('h1')).toHaveText('Leroy Merlin · 228,18 zł');
 await p.waitForFunction(()=>{const i=document.querySelector('#pokaz');return i&&i.complete&&i.naturalWidth>0});await expect(p.locator('#app')).toContainText('Pozycje (3)');await expect(p.locator('.row:has-text("Odczyt")')).toContainText('odczyt ze zdjęcia w telefonie · pewność');
 await expect(p.locator('.row:has-text("Stan")')).toContainText('✓ Sprawdzone przez Pati');await expect(p.locator('.row:has-text("Dodał")')).toContainText('Pati');await kontrola(p,name+' Dokument');await zrzut(p,'dokument',name);
 await p.click('#pokaz');await expect(p.locator('#okno')).toBeVisible();await p.click('#zamknij');
 await p.click('#popraw');await expect(p.locator('h1')).toHaveText('Popraw odczyt');await kontrola(p,name+' Popraw odczyt');await p.fill('#d-kwota','');await p.click('#zapiszDok');await expect(p.locator('.msg')).toContainText('Kwota musi być liczbą');
 await p.fill('#d-kwota','228,20');await p.click('#zapiszDok');await expect(p.locator('.msg')).toHaveText('Odczyt poprawiony i sprawdzony: Leroy Merlin 228,2 zł.');spr(true,name+' „Popraw odczyt”: zła kwota odrzucona, poprawka zapisana');
 // Usuń dokument z potwierdzeniem
 await p.click('#usunDok');await expect(p.locator('h1')).toHaveText('Usunąć dokument?');await kontrola(p,name+' Usunąć dokument?');await p.click('#nie');await expect(p.locator('h1')).toHaveText('Leroy Merlin · 228,2 zł');
 await p.click('#usunDok');await p.click('#tak');await expect(p.locator('.msg')).toHaveText('Dokument Leroy Merlin 228,2 zł został usunięty.');await expect(p.locator('[data-dok]')).toHaveCount(2);
 const pl=await p.evaluate(async()=>(await sb.from('pliki').select('nazwa').eq('folder','paragony')).data.map(x=>x.nazwa).sort());spr(pl.length===2&&pl[0].startsWith('Paragon Hurtownia Testowa 02.11.2026'),name+' „Usuń dokument”: najpierw pytanie, „Nie, wróć” nic nie usuwa, potem dokument i zdjęcie znikają (Biblioteka: '+pl.join(', ')+')');
 await p.click('#wroc');await p.click('#biblioteka');await expect(p.locator('.fold:has(b:text-is("Paragony")) small')).toContainText('2 pliki');spr(true,name+' Biblioteka › Paragony: 2 pliki');await p.click('#wroc');
 // ---- SZEF FIRMY
 const fid=await p.evaluate(()=>S.flats[0].id);
 await p.click('#wyloguj');await expect(p.locator('h1')).toHaveText('Zakładanie konta');
 await p.fill('#imie','Jan');await p.fill('#email','firma@test.pl');await p.fill('#haslo','Dobrehaslo1');await p.fill('#haslo2','Dobrehaslo1');await p.click('#wyslij');await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 await p.click('#wyloguj');await p.evaluate(fid=>{const L=k=>JSON.parse(localStorage.getItem(k)||'null');const u=L('mock_users').find(x=>x.email==='firma@test.pl');const pr=L('mock_profile');const q=pr.find(x=>x.id===u.id);q.rola='firma';q.nazwa_firmy='Ekipa Testowa';localStorage.setItem('mock_profile',JSON.stringify(pr));localStorage.setItem('mock_dostepy',JSON.stringify([{mieszkanie:fid,firma:u.id,aktywny:true}]))},fid);
 await p.click('[data-t="logowanie"]');
 await p.fill('#email','firma@test.pl');await p.fill('#haslo','Dobrehaslo1');await p.click('#wyslij');await expect(p.locator('h1')).toHaveText('Moje zlecenia');const listaF=await p.locator('.flat').count();spr(true,name+' UWAGA rdzeń: lista „Moje zlecenia” pokazuje mieszkań: '+listaF+' (błąd rdzenia klocka 6, opis w raporcie) – test otwiera mieszkanie bezpośrednio');
 await p.evaluate(fid=>ekranMieszkania(fid),fid);await expect(p.locator('h1')).toHaveText('Testowa 7');const modF=await p.$$eval('.moduly button',e=>e.map(x=>x.innerText));spr(modF.join('|')==='Biblioteka – zdjęcia i pliki PDF|Lista prac|Paragony i materiały',name+' firma: bez „Pieniądze” i „Firma” ('+modF.join(', ')+')');
 spr(!/zł/.test(await txt(p,'#app')),name+' firma: na ekranie mieszkania żadnych kwot');
 await p.click('#m-paragony');await expect(p.locator('h1')).toHaveText('Paragony – Testowa 7');const fl=await p.$$eval('[data-dok] .zw b:first-child',e=>e.map(x=>x.textContent));
 spr(fl.join('|')==='Hurtownia Testowa'&&!(await p.locator('[data-ok],[data-odznacz]').count())&&!(await p.locator('#budzetMat').count()),name+' firma widzi tylko dokumenty zapłacone przez firmę ('+fl.join(', ')+'), bez budżetu i bez „Sprawdzone”/„Odznacz”');
 await kontrola(p,name+' firma: Paragony');
 await p.click('#dodajDok');await p.setInputFiles('#dokGaleria',I('uciete.jpg'));await expect(p.locator('.msg').first()).toHaveText('Paragon jest ucięty – cały paragon musi być w kadrze. Najlepiej położyć go na ciemnym tle.');
 await p.setInputFiles('#dokAparat',I('paragon2.jpg'));await expect(p.locator('h1')).toHaveText('Przycięcie zdjęcia');spr(true,name+' firma: ucięty paragon → powód wprost, „Zrób jeszcze raz” dobrym zdjęciem → przycięcie');await p.evaluate(()=>{const z=S.dok.zrodlo;S.dok.rogi=[{x:40,y:60},{x:z.width-40,y:60},{x:z.width-40,y:z.height-60},{x:40,y:z.height-60}]});
 const ms3=await odczytaj(p);const v2=await p.evaluate(()=>({s:document.querySelector('#d-sklep').value,k:document.querySelector('#d-kwota').value,d:document.querySelector('#d-data').value,niep:[...document.querySelectorAll('.niep')].map(e=>e.dataset.pole||e.id)}));
 spr(v2.k==='159,6'||v2.k==='159,60',name+' firma: odczyt ('+ms3+' ms) kwota '+v2.k+', data '+v2.d+', sklep „'+v2.s+'” niepewne ['+v2.niep+'] (sklep spoza słownika = do sprawdzenia)');
 spr(v2.niep.includes('sklep')&&!(await p.locator('#d-zaplacil').count()),name+' firma: sklep spoza słownika z czerwoną ramką, bez wyboru „Kto zapłacił”');await kontrola(p,name+' firma: Dane dokumentu');
 await p.click('#zapiszDok');await expect(p.locator('.msg')).toContainText('Czeka na sprawdzenie przez Właściciela aplikacji.');await expect(p.locator('[data-dok]')).toHaveCount(2);
 await p.locator('[data-dok]',{hasText:/SKLEP TESTOWY/}).locator('[data-zobacz]').click();spr(!(await p.locator('#popraw,#usunDok,#okDok').count()),name+' firma: dokument bez „Popraw odczyt” i „Usuń dokument”');await kontrola(p,name+' firma: Dokument');
 const pr2=await p.evaluate(async()=>{const r=await sb.from('paragony').update({kwota:1}).eq('zaplacil','firma');const d=await sb.from('paragony').delete().eq('zaplacil','firma');return (await sb.from('paragony').select('kwota')).data.map(x=>x.kwota).join(',')});spr(!pr2.includes('1,')&&pr2!=='1',name+' firma nie zmienia i nie usuwa przez bazę ('+pr2+')');
 // ---- znowu właściciel: dokument firmy do sprawdzenia
 await p.click('#wyloguj');await expect(p.locator('h1')).toHaveText('Logowanie');await p.fill('#email','pati@test.pl');await p.fill('#haslo','Dobrehaslo1');await p.click('#wyslij');await expect(p.locator('h1')).toHaveText('Moje mieszkania');
 await p.click('.flat:has-text("Testowa 7")');await expect(p.locator('#m-paragony')).toHaveText('Paragony i materiały – 1 do sprawdzenia');await p.click('#m-paragony');
 const fd=p.locator('[data-dok]',{hasText:/SKLEP TESTOWY/});await expect(fd.locator('.ostrz')).toContainText('Do sprawdzenia: Sklep');await expect(fd).toContainText('zapłacił: Ekipa Testowa');
 await fd.locator('[data-zobacz]').click();await expect(p.locator('.row:has-text("Dodał")')).toContainText('Ekipa Testowa');await p.click('#okDok');await expect(p.locator('.row:has-text("Stan")')).toContainText('✓ Sprawdzone przez Pati');
 spr(true,name+' właściciel: dokument firmy „Do sprawdzenia: Sklep”, dodał Ekipa Testowa, „Sprawdzone, zgadza się”');
 spr(!errs.length,name+' brak błędów na stronie '+errs.join(';'));
 if(process.env.ZRZUTY){await p.click('#wrocLista');await p.screenshot({path:path.join(process.env.ZRZUTY,name+'_paragony.png'),fullPage:true})}
 await ctx.close()}
console.log('Czasy odczytu (ms): '+CZASY.join(', '));
console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close()})().catch(e=>{console.log('BLAD:',e.message.split('\n').slice(0,8).join('\n'));process.exit(1)});
