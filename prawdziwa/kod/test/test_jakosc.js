// Dobór i test progów jakości zdjęcia (js/k07_odczyt.js: ocenZdjecie) na obrazkach z gen_paragony.py.
// Uruchamianie: IMG=KATALOG NODE_PATH=$(npm root -g) node test_jakosc.js
const {chromium}=require('playwright/test');const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','..');const IMG=process.env.IMG||__dirname;const PORT=8788;
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=u.startsWith('/img/')?path.join(IMG,u.slice(5)):path.join(root,u);
 fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'application/javascript':f.endsWith('.html')?'text/html; charset=utf-8':'image/jpeg'});r.end(d)})}).listen(PORT);
const OCZ={'paragon1.jpg':null,'paragon2.jpg':null,'rozmyte.jpg':'nieostre','lekko_rozmyte.jpg':'nieostre','ciemne.jpg':'ciemne','przeswietlone.jpg':'jasne','uciete.jpg':'uciety','zdjecie.png':'tekst'};
let ok=0,zle=0;
(async()=>{const b=await chromium.launch();const p=await b.newPage();
 await p.route('**/pusta.html',r=>r.fulfill({body:'<!doctype html><meta charset="utf-8"><script src="/js/k07_odczyt.js"></script>',contentType:'text/html'}));
 await p.goto(`http://127.0.0.1:${PORT}/pusta.html`);
 for(const [f,ma] of Object.entries(OCZ)){
  const m=await p.evaluate(async f=>{const bl=await (await fetch('/img/'+f)).blob();const bmp=await createImageBitmap(bl);const s=Math.min(1,1500/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return OdczytParagonu.ocenZdjecie(c)},f);
  const w=m.powod===ma;w?ok++:zle++;
  console.log((w?'OK   ':'ZLE  ')+f.padEnd(20)+' powód: '+String(m.powod).padEnd(9)+'(oczekiwany '+ma+') | jasność '+m.jasnosc+', odchylenie '+m.odchylenie+', prześwietlone '+(m.przeswietlone*100).toFixed(1)+'%, krawędzie '+(m.krawedzie*100).toFixed(2)+'%, ostrość '+m.ostrosc+', brzeg jasny g/d/l/p '+[m.brzeg.gora,m.brzeg.dol,m.brzeg.lewo,m.brzeg.prawo].map(x=>Math.round(x*100)).join('/')+'%');
 }
 console.log(zle?'ZLE: '+zle:'WSZYSTKO OK ('+ok+')');await b.close();srv.close();process.exit(zle?1:0)})();
