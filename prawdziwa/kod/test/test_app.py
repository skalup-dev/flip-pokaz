import asyncio, json, threading, http.server, functools, sys
from playwright.async_api import async_playwright, expect

ROOT = '/home/claude/flip-app'
MOCK = open(ROOT + '/test/mock_supabase.js').read()
CFG = 'window.FLIP_CFG={url:"https://test.supabase.co",key:"test"};'
PORT = 8765
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/index.html'
wyniki = []
def ok(nazwa): wyniki.append(nazwa); print('OK', nazwa)

async def nowa(b, vp, cfg=True):
    ctx = await b.new_context(viewport=vp)
    errs = []
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    await pg.route('**/supabase.js', lambda r: r.fulfill(body=MOCK, content_type='application/javascript'))
    await pg.route('**/config.js', lambda r: r.fulfill(body=CFG if cfg else 'window.FLIP_CFG={url:"",key:""};', content_type='application/javascript'))
    return ctx, pg, errs

async def dodaj(pg, **v):
    await pg.click('#dodaj')
    for k, x in v.items():
        await pg.fill('#' + k, x)
    await pg.click('#zapisz')
    await expect(pg.locator('.msg')).to_contain_text('zapisane'); await pg.click('#wroc')

async def scen(b, name, vp):
    shot = lambda n: f'{ROOT}/test/shot_{name}_{n}.png'
    # 1. bez konfiguracji
    ctx, pg, errs = await nowa(b, vp, cfg=False)
    await pg.goto(URL); await expect(pg.locator('h1')).to_have_text('Aplikacja nie jest jeszcze podłączona'); ok(name+' bez podłączenia')
    await ctx.close()

    ctx, pg, errs = await nowa(b, vp)
    await pg.goto(URL)
    await pg.evaluate("localStorage.setItem('mock_confirm','true')")
    await pg.reload()
    await expect(pg.locator('h1')).to_have_text('Logowanie'); await pg.screenshot(path=shot('1logowanie')); ok(name+' ekran logowania')
    # 2. rejestracja – błędy
    await pg.click('text=Nie masz konta? Załóż konto')
    await pg.fill('#email', 'zly-mail'); await pg.click('#wyslij')
    await expect(pg.locator('.msg')).to_contain_text('poprawny e-mail')
    await pg.fill('#imie','Pati'); await pg.fill('#email','pati@test.pl'); await pg.fill('#haslo','krotkie'); await pg.fill('#haslo2','krotkie'); await pg.click('#wyslij')
    await expect(pg.locator('.msg')).to_contain_text('co najmniej 8'); await expect(pg.locator('#email')).to_have_value('pati@test.pl'); await expect(pg.locator('#imie')).to_have_value('Pati')
    await pg.fill('#haslo','Dobrehaslo1'); await pg.fill('#haslo2','Inne123456'); await pg.click('#wyslij')
    await expect(pg.locator('.msg')).to_contain_text('nie są takie same'); ok(name+' rejestracja błędy')
    await pg.fill('#haslo','Dobrehaslo1'); await pg.fill('#haslo2','Dobrehaslo1'); await pg.screenshot(path=shot('2rejestracja')); await pg.click('#wyslij')
    await expect(pg.locator('.msg')).to_contain_text('Na skrzynkę pati@test.pl przyszedł mail'); ok(name+' rejestracja z potwierdzeniem')
    # ponowna rejestracja tego samego maila
    await pg.click('text=Nie masz konta? Załóż konto'); await pg.fill('#email','pati@test.pl'); await pg.fill('#haslo','Dobrehaslo1'); await pg.fill('#haslo2','Dobrehaslo1'); await pg.click('#wyslij')
    await expect(pg.locator('.msg')).to_contain_text('już istnieje'); await pg.click('text=Mam konto – zaloguj się')
    # 3. logowanie przed potwierdzeniem / złe hasło
    await pg.fill('#email','pati@test.pl'); await pg.fill('#haslo','Dobrehaslo1'); await pg.click('#wyslij')
    await expect(pg.locator('.msg')).to_contain_text('nie jest jeszcze potwierdzone')
    await pg.evaluate("const u=JSON.parse(localStorage.mock_users);u.forEach(x=>x.confirmed=true);localStorage.mock_users=JSON.stringify(u)")
    await pg.fill('#haslo','zlehaslo'); await pg.click('#wyslij'); await expect(pg.locator('.msg')).to_contain_text('Zły e-mail albo hasło')
    await pg.fill('#haslo',''); await pg.click('#wyslij'); await expect(pg.locator('.msg')).to_contain_text('Trzeba wpisać hasło'); ok(name+' logowanie błędy')
    await pg.fill('#haslo','Dobrehaslo1'); await pg.click('#wyslij')
    await expect(pg.locator('h1')).to_have_text('Moje mieszkania'); await expect(pg.locator('#who')).to_have_text('pati@test.pl')
    await expect(pg.locator('.empty')).to_contain_text('Nie ma jeszcze'); await pg.screenshot(path=shot('3pusta')); ok(name+' logowanie i pusta lista')
    # 4. dodawanie – błędy
    await pg.click('#dodaj'); await pg.screenshot(path=shot('4formularz')); await pg.click('#zapisz'); await expect(pg.locator('.msg')).to_contain_text('Trzeba wpisać ulicę')
    await pg.fill('#ulica','Krasińskiego 3/4'); await pg.fill('#metraz','abc'); await pg.click('#zapisz'); await expect(pg.locator('.msg')).to_contain_text('Metraż musi')
    await expect(pg.locator('#ulica')).to_have_value('Krasińskiego 3/4')
    await pg.fill('#metraz','0'); await pg.click('#zapisz'); await expect(pg.locator('.msg')).to_contain_text('Metraż musi')
    await pg.fill('#metraz','48,5'); await pg.fill('#budzet','-3'); await pg.click('#zapisz'); await expect(pg.locator('.msg')).to_contain_text('Budżet musi')
    await pg.fill('#budzet','120 000'); await pg.fill('#data_startu','2027-02-01'); await pg.fill('#termin_konca','2027-01-01'); await pg.click('#zapisz')
    await expect(pg.locator('.msg')).to_contain_text('Termin końca nie może'); ok(name+' formularz błędy')
    await pg.fill('#data_startu','2026-11-17'); await pg.fill('#termin_konca','2027-01-30'); await pg.fill('#miasto','Sosnowiec'); await pg.click('#zapisz')
    await expect(pg.locator('.msg')).to_contain_text('Mieszkanie Krasińskiego 3/4 zapisane')
    await pg.click('#wroc')
    await expect(pg.locator('#kpiN')).to_have_text('1'); await expect(pg.locator('#kpiB')).to_have_text('120 000 zł')
    await expect(pg.locator('.flat')).to_contain_text('48,5 m²'); ok(name+' dodanie mieszkania')
    await dodaj(pg, ulica='Łódzka 2', budzet='50000')
    await dodaj(pg, ulica='Lipowa 7', termin_konca='2025-01-10')
    await dodaj(pg, ulica='Akacjowa 1')
    await dodaj(pg, ulica='<b>x</b> Zła 1')
    kol = await pg.locator('.flat b').all_inner_texts()
    assert kol == ['<b>x</b> Zła 1','Akacjowa 1','Krasińskiego 3/4','Lipowa 7','Łódzka 2'], kol
    ok(name+' kolejność A–Z i bezpieczne napisy')
    await expect(pg.locator('#kpiL')).to_have_text('1'); await expect(pg.locator('.flat:has-text("Lipowa") .late')).to_contain_text('po terminie')
    await expect(pg.locator('#kpiB')).to_have_text('170 000 zł'); await pg.screenshot(path=shot('5lista'), full_page=True); ok(name+' liczniki i po terminie')
    # 5. zapis na stałe
    await pg.reload(); await expect(pg.locator('.flat')).to_have_count(5); ok(name+' po odświeżeniu dane zostają')
    # 6. szczegóły i zmiana
    await pg.click('.flat:has-text("Krasińskiego")'); await expect(pg.locator('h1')).to_have_text('Krasińskiego 3/4'); await pg.screenshot(path=shot('6szczegoly'))
    await pg.click('#zmien'); await expect(pg.locator('#budzet')).to_have_value('120000'); await pg.fill('#budzet','135000,50'); await pg.click('#zapisz')
    await expect(pg.locator('.msg')).to_contain_text('Zmiany zapisane'); await expect(pg.locator('.card').first).to_contain_text('135 000,5 zł')
    await pg.click('#zmien'); await pg.click('#wroc'); await expect(pg.locator('h1')).to_have_text('Krasińskiego 3/4')
    await pg.click('#wroc'); await expect(pg.locator('#kpiB')).to_have_text('185 000,5 zł'); ok(name+' zmiana danych')
    # 7. usuwanie
    await pg.click('.flat:has-text("Zła")'); await pg.click('#usun'); await pg.screenshot(path=shot('7usun')); await pg.click('#nie'); await expect(pg.locator('h1')).to_contain_text('Zła 1')
    await pg.click('#usun'); await pg.click('#tak'); await expect(pg.locator('.msg')).to_contain_text('zostało usunięte'); await expect(pg.locator('.flat')).to_have_count(4); ok(name+' usuwanie')
    # 8. brak internetu
    await pg.evaluate("localStorage.mock_offline='true'"); await pg.reload(); await expect(pg.locator('.msg')).to_contain_text('Brak połączenia')
    await pg.evaluate("localStorage.removeItem('mock_offline')"); await pg.click('#ponow'); await expect(pg.locator('.flat')).to_have_count(4); ok(name+' brak internetu')
    # 9. wylogowanie i drugie konto
    await pg.click('#wyloguj'); await expect(pg.locator('h1')).to_have_text('Logowanie'); await expect(pg.locator('#who')).to_be_hidden()
    await pg.evaluate("localStorage.removeItem('mock_confirm')")
    await pg.click('text=Nie masz konta? Załóż konto'); await pg.fill('#email','brat@test.pl'); await pg.fill('#haslo','Hasłobrata1'); await pg.fill('#haslo2','Hasłobrata1'); await pg.click('#wyslij')
    await expect(pg.locator('h1')).to_have_text('Moje mieszkania'); await expect(pg.locator('.flat')).to_have_count(0); ok(name+' drugie konto nie widzi cudzych')
    await pg.click('#wyloguj')
    # 10. nie pamiętam hasła + nowe hasło
    await pg.click('text=Nie pamiętam hasła'); await pg.fill('#email','pati@test.pl'); await pg.click('#wyslij'); await expect(pg.locator('.msg')).to_contain_text('przyszedł mail')
    pid = await pg.evaluate("JSON.parse(localStorage.mock_users).find(u=>u.email==='pati@test.pl').id")
    await pg.evaluate(f"localStorage.mock_session=JSON.stringify('{pid}')")
    await pg.goto(URL + '#type=recovery'); await pg.reload(); await expect(pg.locator('h1')).to_have_text('Ustawianie nowego hasła'); await pg.screenshot(path=shot('8nowehaslo'))
    await pg.fill('#haslo','abc'); await pg.fill('#haslo2','abc'); await pg.click('button.btn'); await expect(pg.locator('.msg')).to_contain_text('co najmniej 8')
    await pg.fill('#haslo','NoweHaslo99'); await pg.fill('#haslo2','NoweHaslo99'); await pg.click('button.btn')
    await expect(pg.locator('.msg')).to_contain_text('Nowe hasło zapisane'); await expect(pg.locator('.flat')).to_have_count(4)
    await pg.click('#wyloguj'); await pg.fill('#email','pati@test.pl'); await pg.fill('#haslo','NoweHaslo99'); await pg.click('#wyslij'); await expect(pg.locator('.flat')).to_have_count(4); ok(name+' nowe hasło działa')
    # 11. telefon: nic nie wychodzi poza ekran
    sz = await pg.evaluate("document.documentElement.scrollWidth - innerWidth"); assert sz <= 0, sz; ok(name+' bez przewijania w bok')
    await pg.click('.logo'); await expect(pg.locator('h1')).to_have_text('Moje mieszkania')
    await ctx.close()
    assert not errs, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for name, vp in [('pc', {'width':1280,'height':900}), ('tel', {'width':390,'height':844})]:
            await scen(b, name, vp)
        await b.close()
    print('RAZEM OK:', len(wyniki)); print('ERR []')
asyncio.run(main())
