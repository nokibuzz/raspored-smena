# Raspored smena

Privatna web aplikacija za mesečni raspored rada sa fotografije. Učitavanje rukopisa radi preko OpenAI API ključa koji korisnik unosi za jedan zahtev. Ključ se ne čuva. Svaki prepoznati podatak može se ispraviti u tabeli; raspored se ne usvaja dok nema nejasnih `?` ćelija i dok korisnik ne potvrdi proveru.

## Korišćenje

1. Otvori aplikaciju i učitaj JPG, PNG ili WebP fotografiju rasporeda.
2. Unesi svoj OpenAI API ključ i pokreni prepoznavanje, ili izaberi ručni unos.
3. Uporedi sve redove i datume sa originalom. Oznake su `1` (07–15), `2` (13–21), `D` (dan), `N` (noć), `—` (slobodno), `?` (nejasno).
4. Potvrdi pregled. Izaberi svoj redni broj u kalendaru.
5. Preuzmi `.ics` datoteku i uvezi je u kalendar telefona. Podsetnici su podešeni za 18:00 prethodnog dana, uključujući slobodne dane.

Potvrđeni rasporedi čuvaju se zajednički u privatnom R2 prostoru sajta. Prva osoba koja usvoji raspored postaje urednik rasporeda; drugi korisnici kojima je odobren pristup mogu da vide kalendar i izaberu sebe. Izbor osobe i kopija rasporeda čuvaju se i u `localStorage` tekućeg pregledača. Fotografija i API ključ se ne čuvaju. Ako se raspored izmeni, ponovo uvezi novu `.ics` datoteku. Sati dnevne i noćne smene koji se koriste za prikaz preklapanja mogu se podesiti u detaljima dana.

## Lokalni razvoj

Potreban je Node.js 22 ili noviji. Nema npm zavisnosti.

```sh
npm run dev
```

Otvori `http://127.0.0.1:4173`. Za proveru deploy artefakta:

```sh
npm run build
npm run validate
```
