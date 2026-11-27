# Zmyślone obrazki paragonów do testów klocka 7 (Pillow, czcionka DejaVu). Dane wymyślone (zasada 27).
# Uruchamianie: python3 gen_paragony.py KATALOG   -> paragon1.jpg, paragon2.jpg (do odczytu), zdjecie.png (bez tekstu), faktura.pdf, nie_paragon.txt,
#   rozmyte.jpg, lekko_rozmyte.jpg, ciemne.jpg, przeswietlone.jpg, uciete.jpg (jakość zdjęcia)
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
K = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
os.makedirs(K, exist_ok=True)
M = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'; MB = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
f = ImageFont.truetype(M, 26); fb = ImageFont.truetype(MB, 30)

def paragon(plik, sklep, data, pozycje, obrot=1.5):
    suma = sum(round(i * c, 2) for _, i, c in pozycje)
    ptu = round(suma * 23 / 123, 2)
    zl = lambda v: ('%.2f' % v).replace('.', ',')
    L = [('c', sklep, fb), ('c', 'Market Testowy Sp. z o.o.', f), ('c', 'ul. Przykładowa 1, 00-001 Miasto', f), ('c', 'NIP 123-456-32-18', f), ('l', '', f),
         ('c', 'PARAGON FISKALNY', fb), ('l', data + '            nr 0042', f), ('l', '', f)]
    for n, i, c in pozycje:
        L.append(('p', (n, '%g x %s' % (i, zl(c)), zl(round(i * c, 2)) + ' A'), f))
    L += [('l', '-' * 38, f), ('p', ('SPRZEDAŻ OPOD. A', '', zl(suma)), f), ('p', ('PTU A 23%', '', zl(ptu)), f),
          ('p', ('SUMA PTU', '', zl(ptu)), f), ('p', ('SUMA PLN', '', zl(suma)), fb), ('l', '', f), ('p', ('Karta płatnicza', '', zl(suma)), f)]
    W = 720; H = 80 + len(L) * 40
    im = Image.new('RGB', (W, H), (250, 248, 240)); d = ImageDraw.Draw(im); y = 40
    for k, t, fo in L:
        if k == 'c': d.text(((W - d.textlength(t, font=fo)) / 2, y), t, font=fo, fill=(30, 26, 23))
        elif k == 'l': d.text((30, y), t, font=fo, fill=(30, 26, 23))
        else:
            a, b, c = t; d.text((30, y), a, font=fo, fill=(30, 26, 23))
            if b: d.text((330, y), b, font=fo, fill=(30, 26, 23))
            d.text((W - 30 - d.textlength(c, font=fo), y), c, font=fo, fill=(30, 26, 23))
        y += 40
    im = im.rotate(obrot, expand=True, fillcolor=(110, 100, 90)).filter(ImageFilter.GaussianBlur(0.6))
    bg = Image.new('RGB', (im.width + 120, im.height + 160), (110, 100, 90)); bg.paste(im, (60, 80))
    bg.save(os.path.join(K, plik), quality=88)
    return suma

s1 = paragon('paragon1.jpg', 'LEROY MERLIN', '2026-11-14', [('Farba biała 10l', 2, 89.99), ('Wałek malarski', 1, 24.50), ('Taśma malarska', 3, 7.90)])
s2 = paragon('paragon2.jpg', 'SKLEP TESTOWY', '12.11.2026', [('Klej do płytek 25kg', 4, 39.90)], obrot=-1)
Image.new('RGB', (900, 600), (184, 146, 74)).save(os.path.join(K, 'zdjecie.png'))
Image.open(os.path.join(K, 'paragon2.jpg')).save(os.path.join(K, 'faktura.pdf'))
# do sprawdzania jakości zdjęcia: rozmyte, ciemne, prześwietlone, ucięte (z paragon1.jpg)
from PIL import ImageEnhance
p1 = Image.open(os.path.join(K, 'paragon1.jpg'))
p1.filter(ImageFilter.GaussianBlur(3)).save(os.path.join(K, 'rozmyte.jpg'), quality=88)
p1.filter(ImageFilter.GaussianBlur(1.6)).save(os.path.join(K, 'lekko_rozmyte.jpg'), quality=88)
ImageEnhance.Brightness(p1).enhance(0.22).save(os.path.join(K, 'ciemne.jpg'), quality=88)
ImageEnhance.Brightness(p1).enhance(2.6).save(os.path.join(K, 'przeswietlone.jpg'), quality=88)
p1.crop((90, 300, p1.width - 90, p1.height - 120)).save(os.path.join(K, 'uciete.jpg'), quality=88)
open(os.path.join(K, 'nie_paragon.txt'), 'w').write('to nie jest zdjęcie')
print('paragon1.jpg suma', round(s1, 2), '| paragon2.jpg suma', round(s2, 2))
