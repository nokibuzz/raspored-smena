# Raspored smena

Javna web aplikacija za mesečni raspored rada sa fotografije. Prepoznavanje radi u pregledaču pomoću otvorenog [PaddleOCR.js](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html) modela. Nema API ključa, poziva plaćenog AI servisa ni trošenja tokena. Pri prvom korišćenju pregledač preuzima OCR biblioteku i model. Fotografija se obrađuje na uređaju.

Rukopis i sitne ćelije mogu ostati nepročitani. Svaki prepoznati podatak može se ispraviti u tabeli; raspored se ne usvaja dok nema nejasnih `?` ćelija i dok korisnik ne potvrdi proveru. Na dostavljenoj probnoj fotografiji lokalni model je automatski razvrstao deo ćelija, a ostatak je ostavio za proveru.

## Korišćenje

1. Otvori aplikaciju i učitaj JPG, PNG ili WebP fotografiju rasporeda.
2. Izaberi mesec i godinu. Po potrebi otvori „Poravnaj mrežu sa tabelom“ i podesi crvene linije na fotografiji.
3. Pokreni prepoznavanje na uređaju, ili izaberi ručni unos.
4. Uporedi sve redove i datume sa originalom. Oznake su `1` (07–15), `2` (13–21), `D` (dan), `N` (noć), `—` (slobodno), `?` (nejasno). Posle provere celog reda, dugme `—?` uz ime može da označi njegova preostala nejasna polja kao slobodna.
5. Potvrdi pregled. Izaberi svoj redni broj u kalendaru.
6. Dugme „Kopiraj link rasporeda“ pravi zaseban link za taj mesec. Svako ko dobije taj link vidi imena i smene. Podaci su kodirani u delu URL-a posle `#`, ne šalju se serveru.
7. Preuzmi `.ics` datoteku i uvezi je u kalendar telefona. Podsetnici su podešeni za 18:00 prethodnog dana, uključujući slobodne dane.

Potvrđeni rasporedi i izbor osobe čuvaju se u `localStorage` tekućeg pregledača. Raspored se prenosi na drugi uređaj deljenjem linka; za izmenjen raspored treba poslati novi link. Fotografija se ne čuva. Ako se raspored izmeni, ponovo uvezi novu `.ics` datoteku. Sati dnevne i noćne smene za prikaz preklapanja mogu se podesiti u detaljima dana.

## Lokalni razvoj

Potreban je Node.js 22 ili noviji. Nema npm zavisnosti u projektu; OCR biblioteka i model se pri korišćenju preuzimaju sa javnih CDN adresa.

```sh
npm run dev
```

Otvori `http://127.0.0.1:4173`. Za proveru deploy artefakta:

```sh
npm run build
npm run validate
```
