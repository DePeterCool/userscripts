# Userscripts

Een verzameling persoonlijke userscripts voor Tampermonkey / Violentmonkey.

## Installatie

Je hebt een userscript-manager nodig, bijvoorbeeld
[Tampermonkey](https://www.tampermonkey.net/) of
[Violentmonkey](https://violentmonkey.github.io/).

Installeer een script door op de link hieronder te klikken; je manager vangt de
installatie op.

| Script | Installeren |
| --- | --- |
| IKEA prijsvergelijker | [installeren](https://raw.githubusercontent.com/DePeterCool/userscripts/main/ikea-prijsvergelijker.user.js) |
| Instagram Video & Reel Downloader | [installeren](https://raw.githubusercontent.com/DePeterCool/userscripts/main/instagram-video-reel-downloader.user.js) |
| Snapchat Downloader | [installeren](https://raw.githubusercontent.com/DePeterCool/userscripts/main/snapchat-downloader.user.js) |

Lukt dat niet, maak dan in het dashboard een nieuw script aan en plak de inhoud
van het bestand erin.

### Automatische updates

Alle scripts hebben een `@updateURL` en `@downloadURL` die naar deze repo wijzen.
Je manager controleert die periodiek en installeert een nieuwe versie zodra het
`@version`-nummer in het bestand omhoog gaat. Alleen het bestand wijzigen is dus
niet genoeg: bij elke inhoudelijke aanpassing hoort een hogere `@version`.

Heb je een script eerder handmatig geïnstalleerd, dan mist die kopie de
update-URL's. Installeer hem in dat geval één keer opnieuw via de link hierboven.

## Scripts

### IKEA prijsvergelijker alle domeinen

`ikea-prijsvergelijker.user.js` — versie 0.4

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

- De `@match` is `https://www.ikea.com/*/*/p/*` en dekt dus elke land-/taalcombinatie
  op ikea.com. De vergelijking zelf blijft vast op BE, NL, DE en FR staan,
  ongeacht op welk domein je zit.
- De vergelijking gaat ervan uit dat de URL-slug in elk land gelijk is. Wijkt die
  af of bestaat het artikel daar niet, dan meldt de tooltip "niet gevonden".
- Prijzen worden getoond zoals IKEA ze publiceert, zonder omrekening of
  verzendkosten.

Vereist `GM_xmlhttpRequest` met `@connect ikea.com` om de andere domeinen te
mogen bevragen.

### Instagram Video & Reel Downloader

`instagram-video-reel-downloader.user.js` — versie 1.3.1

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

`snapchat-downloader.user.js` — versie 1.3, MIT-licentie

Downloadt media uit een Snapchat-gesprek in de webclient.

**Gebruik** — dubbelklik op een afbeelding, video of spraakbericht. Er verschijnt
een opslaan-dialoog.

**Hoe het werkt** — bij een dubbelklik zoekt het script het bijbehorende
media-element: eerst het aangeklikte element zelf, dan een `img`/`video`/`audio`
daarbinnen, dan de omliggende container (knoppen, chatrijen, spelers), en tot
slot maximaal vier niveaus omhoog in de DOM. Die laatste stap vangt
spraakberichten op, waar de zichtbare waveform los staat van het `audio`-element.

Voor afbeeldingen leest het script de eerste bytes van het bestand en leidt het
formaat daaruit af (JPEG, PNG, GIF, WebP of BMP). Dat is nodig omdat Snapchat
geen bruikbare extensie in de URL zet: een verkeerd geraden extensie wordt door
de browser vervangen door wat volgens het content-type hoort, en dat is op
Windows `.jfif` voor JPEG. Lukt het uitlezen niet, dan valt het script terug op
`.jpg`. Voor audio komt de extensie uit de bron-URL (`m4a`, `wav`, `ogg`,
`webm`, anders `mp3`), video is altijd `mp4`.

Bestandsnaam: `snapblob_<type>_<iso-timestamp>.<ext>`. Zowel `http(s):`- als
`blob:`-bronnen worden ondersteund; de eerste worden via `GM_xmlhttpRequest`
gelezen om CORS te omzeilen, de tweede via een gewone `fetch`. Downloaden gaat
via `GM_download` met `saveAs`, met een gewone downloadlink als terugval.

## Ontwikkeling

Alle bestanden gebruiken LF-regeleindes. Dat is vastgelegd in
[`.gitattributes`](.gitattributes), zodat het niet afhangt van de
`core.autocrlf`-instelling van de machine waarop je werkt.

## Licentie

`snapchat-downloader.user.js` staat onder MIT. Voor de overige scripts is geen
licentie opgegeven; het zijn persoonlijke scripts, gedeeld zoals ze zijn.

`snapchat-downloader.user.js` komt oorspronkelijk van
[Greasy Fork](https://greasyfork.org/scripts/531940). De update-URL's wijzen nu
naar deze repo, dus updates van de oorspronkelijke auteur komen niet meer
automatisch binnen.
