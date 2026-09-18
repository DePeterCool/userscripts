// ==UserScript==
// @name         IKEA prijsvergelijker alle domeinen
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Toon tooltip met prijzen in BE, NL, DE en FR boven de prijs op IKEA productpagina's op alle ikea.com domeinen
// @match        https://www.ikea.com/be/nl/p/*
// @grant        GM_xmlhttpRequest
// @connect      ikea.com
// ==/UserScript==

(function () {
  'use strict';

  // Alleen draaien op product detail pagina's met /xx/yy/p/...
  const pathOk = /^\/[a-z]{2}\/[a-z]{2}\/p\//.test(location.pathname);
  if (!pathOk) return;

  // Check of tooltip al bestaat
  const UNIQUE_ID = 'ikea-price-tooltip-wrapper';
  if (document.getElementById(UNIQUE_ID)) return;

  // Tooltip element aanmaken (maar nog niet tonen)
  const tooltip = document.createElement('div');
  tooltip.id = UNIQUE_ID;
  tooltip.style.position = 'absolute';
  tooltip.style.zIndex = '99999';
  // tooltip.style.pointerEvents = 'none'; // Removed to allow clicking
  tooltip.style.background = 'white';
  tooltip.style.border = '1px solid #ccc';
  tooltip.style.padding = '8px';
  tooltip.style.borderRadius = '4px';
  tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
  tooltip.style.fontSize = '12px';
  tooltip.style.maxWidth = '260px';
  tooltip.style.display = 'none';
  // tooltip.style.whiteSpace = 'pre-line'; // Removed, using HTML now
  tooltip.textContent = 'Prijzen laden...';
  document.body.appendChild(tooltip);

  // Event listener voor tooltip zelf om open te blijven
  tooltip.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  // Te vergelijken landen (met taal)
  const targets = [
    { code: 'be/nl', label: 'België (NL)' },
    { code: 'nl/nl', label: 'Nederland' },
    { code: 'de/de', label: 'Duitsland' },
    { code: 'fr/fr', label: 'Frankrijk' }
  ];

  let productPath = '';
  const results = {};

  // Functie om prijzen op te halen
  function fetchPrices() {
    // Bepaal product ID uit URL
    const m = location.pathname.match(/^\/[a-z]{2}\/[a-z]{2}\/p\/[^/]+-([0-9]+)\/$/);
    if (!m) return;
    const productId = m[1];

    // We moeten weten wat de slug is voor de andere landen. 
    // IKEA URL structuur is vaak /p/naam-id/. De naam kan verschillen per taal.
    // Echter, vaak werkt de ID alleen ook of redirect hij.
    // We proberen de 'canonical' URL opbouw te gebruiken of gewoon de ID.
    // De vorige methode probeerde de slug te raden/hergebruiken.
    // Laten we de huidige path gebruiken, maar strippen van landcode.
    // Path: /be/nl/p/pax-basiselement.../ -> /p/pax-basiselement.../
    const currentPathSuffix = location.pathname.substring(6); // remove /xx/yy

    targets.forEach(target => {
      const url = `https://www.ikea.com/${target.code}${currentPathSuffix}`;

      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: function (resp) {
          let priceText = '';

          // 1. Probeer via utag_data (metadata)
          // "price":["90"] (inclusief BTW), "product_prices":["74.38"] (exclusief BTW)
          const metaMatch = resp.responseText.match(/"price":\["([^"]+)"\]/);
          if (metaMatch) {
            priceText = metaMatch[1];
          }
          // 2. Fallback: Probeer via regex op HTML classes (minder betrouwbaar)
          else {
            const htmlMatch = resp.responseText.match(/class="[^"]*price__integer[^"]*">([^<]+)</);
            if (htmlMatch) {
              priceText = htmlMatch[1].trim();
            }
          }

          if (priceText) {
            results[target.code] = { priceText, url };
          } else {
            results[target.code] = { error: true };
          }
          updateTooltipContent();
        },
        onerror: function () {
          results[target.code] = { error: true };
          updateTooltipContent();
        }
      });
    });
  }

  function updateTooltipContent() {
    let html = '<strong>Prijzen voor dit artikel:</strong><br>';
    targets.forEach(t => {
      const r = results[t.code];
      if (!r) {
        html += `• ${t.label}: laden...<br>`;
      } else if (r.error) {
        html += `• ${t.label}: niet gevonden<br>`;
      } else {
        html += `• <a href="${r.url}" target="_blank" style="color: #0058a3; text-decoration: none;">${t.label}: ${r.priceText}</a><br>`;
      }
    });
    tooltip.innerHTML = html;
  }

  // Event listeners voor tooltip
  function attachEvents(element) {
    if (element.dataset.ikeaTooltipAttached) return;
    element.dataset.ikeaTooltipAttached = 'true';

    element.addEventListener('mouseenter', () => {
      const rect = element.getBoundingClientRect();
      tooltip.style.left = (rect.left + window.scrollX) + 'px';
      tooltip.style.top = (rect.top + window.scrollY - tooltip.offsetHeight - 8) + 'px';
      tooltip.style.display = 'block';
    });

    element.addEventListener('mouseleave', (e) => {
      // Als we naar de tooltip bewegen, niet verbergen
      if (tooltip.contains(e.relatedTarget)) return;
      tooltip.style.display = 'none';
    });
  }

  // Observer om het prijselement te vinden, ook na navigatie
  const observer = new MutationObserver((mutations) => {
    // Zoek naar de prijs. De classname kan variëren, we zoeken breed.
    // We voegen pipcom- varianten toe die we in de HTML hebben gevonden.

    const priceEl = document.querySelector(
      '.pip-temp-price-module__price, ' +
      '.pip-price-package__price-wrapper, ' +
      '.pip-price__integer, ' +
      '.pipcom-price__integer, ' +
      '.pipcom-price-module__current-price'
    );

    if (priceEl) {
      attachEvents(priceEl);
      // Als we nog geen prijzen hebben opgehaald voor deze URL, doe dat dan.
      // We kunnen checken of de URL veranderd is.
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initiele fetch
  fetchPrices();

})();
