# Userscripts

Een verzameling persoonlijke userscripts voor Tampermonkey / Violentmonkey.

## Installatie

Je hebt een userscript-manager nodig, bijvoorbeeld
[Tampermonkey](https://www.tampermonkey.net/) of
[Violentmonkey](https://violentmonkey.github.io/).

Bestanden die op `.user.js` eindigen kun je installeren door ze in "raw"-weergave
te openen — je manager pikt ze dan automatisch op. De overige bestanden eindigen
op `.js`, dus daarvoor maak je in het dashboard een nieuw script aan en plak je
de inhoud erin (of je hernoemt het bestand lokaal naar `.user.js`).

## Scripts

### IKEA prijsvergelijker alle domeinen

`IKEA prijsvergelijker alle domeinen-0.2.user.js` — versie 0.3

Toont op een IKEA-productpagina een tooltip met de prijs van hetzelfde artikel in
België, Nederland, Duitsland en Frankrijk.

**Gebruik** — ga naar een productpagina en hou je muis boven de prijs. De tooltip
verschijnt erboven en blijft open zolang je muis erin staat, zodat je kunt
doorklikken: elk land is een link naar de productpagina in dat land.

**Hoe het werkt** — het script neemt het pad van de huidige URL, stript de
land-/taalcode en vraagt dezelfde pagina op bij `ikea.com/nl/nl`, `/de/de` en
`/fr/fr`. De prijs komt uit het `utag_data`-blok in de HTML, met een regex op de
`price__integer`-class als terugval.

**Beperkingen**

- De `@match` staat op `https://www.ikea.com/be/nl/p/*`. Ondanks de naam draait
  het script dus alleen op het Belgisch-Nederlandstalige domein. Wil je het op
  andere domeinen gebruiken, voeg dan extra `@match`-regels toe.
- De vergelijking gaat ervan uit dat de URL-slug in elk land gelijk is. Wijkt die
  af of bestaat het artikel daar niet, dan meldt de tooltip "niet gevonden".
- Prijzen worden getoond zoals IKEA ze publiceert, zonder omrekening of
  verzendkosten.

Vereist `GM_xmlhttpRequest` met `@connect ikea.com` om de andere domeinen te
mogen bevragen.

### Instagram Video & Reel Downloader

`Instagram video & reel downloader.js` — versie 1.3.0

Zet een **Download MP4**-knop bij video's en Reels op instagram.com.

**Gebruik** — open een post of Reel en klik op de knop. Die verschijnt in de
actiebalk van de post, of als overlay op de video zelf wanneer er geen actiebalk
is. De knop toont zijn eigen status (`⏳ Downloading…`, `✅ Saved!`).

**Hoe het werkt** — het script draait op `document-start` en hangt een
interceptor in de main world om media-URL's op te vangen zodra Instagram ze
ophaalt. Bij een klik probeert het de URL in deze volgorde te vinden: directe
`src`/`currentSrc`, inspectie van de React-fiber-boom, de Performance-entries van
de pagina, en tot slot de inline scripts van de pagina. Uit `video_versions`
wordt de hoogste kwaliteit gekozen, en `bytestart`/`byteend` worden uit de URL
gehaald zodat je het volledige bestand krijgt en niet één fragment.

Downloaden gaat via `GM_download`, met een blob-download als terugval. Is de
opgehaalde blob verdacht klein (< 10 kB), dan opent het script de MP4 in een
nieuw tabblad in plaats van een kapot bestand op te slaan. Bestandsnaam:
`instagram_<shortcode>_<timestamp>.mp4`.

**Tip** — lukt het extraheren niet, speel de video dan even een seconde af en
klik opnieuw. De URL is dan geladen en wordt alsnog gevonden.

### Snapchat Image, Video & Voice Downloader

`snap downloader.js` — versie 1.1, MIT-licentie

Downloadt media uit een Snapchat-gesprek in de webclient.

**Gebruik** — dubbelklik op een afbeelding, video of spraakbericht. Er verschijnt
een opslaan-dialoog.

**Hoe het werkt** — bij een dubbelklik zoekt het script het bijbehorende
media-element: eerst het aangeklikte element zelf, dan een `img`/`video`/`audio`
daarbinnen, dan de omliggende container (knoppen, chatrijen, spelers), en tot
slot maximaal vier niveaus omhoog in de DOM. Die laatste stap vangt
spraakberichten op, waar de zichtbare waveform los staat van het `audio`-element.

De extensie wordt afgeleid uit het type en de bron-URL (`m4a`, `wav`, `ogg`,
`webm`, anders `mp3` voor audio; `mp4` voor video; `png` voor afbeeldingen).
Bestandsnaam: `snapblob_<type>_<iso-timestamp>.<ext>`. Zowel `http(s):`- als
`blob:`-bronnen worden ondersteund. Downloaden gaat via `GM_download` met
`saveAs`, met een gewone downloadlink als terugval.

## Ontwikkeling

Alle bestanden gebruiken LF-regeleindes. Dat is vastgelegd in
[`.gitattributes`](.gitattributes), zodat het niet afhangt van de
`core.autocrlf`-instelling van de machine waarop je werkt.

## Licentie

`snap downloader.js` staat onder MIT. Voor de overige scripts is geen licentie
opgegeven; het zijn persoonlijke scripts, gedeeld zoals ze zijn.
