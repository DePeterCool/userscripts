// ==UserScript==
// @name         Periscope Video Downloader
// @namespace    https://github.com/DePeterCool/userscripts
// @version      1.0
// @description  Download Periscope- en X-broadcasts: haalt de HLS-playlist op, plakt alle segmenten aan elkaar en bewaart ze als MP4 of TS.
// @author       Me
// @match        https://www.periscope.tv/*
// @match        https://periscope.tv/*
// @match        https://www.pscp.tv/*
// @match        https://pscp.tv/*
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @connect      pscp.tv
// @connect      periscope.tv
// @connect      twimg.com
// @connect      akamaized.net
// @connect      cloudfront.net
// @connect      x.com
// @connect      twitter.com
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/DePeterCool/userscripts/main/periscope-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/DePeterCool/userscripts/main/periscope-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    const LOG = '[PeriDL]';
    const CONCURRENCY = 6;   // parallelle segment-downloads
    const RETRIES = 3;       // pogingen per segment
    const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;

    const sources = new Map();       // url -> { url, label }
    const state = { busy: false, cancel: false, minimized: false };
    let apiChecked = '';
    let lastHref = location.href;

    // ---------------------------------------------------------------- bronnen

    function isPlaylist(url) {
        return /\.m3u8(\?|#|$)/i.test(url);
    }

    // Losse fMP4-segmenten eindigen ook op .mp4; die horen niet in de lijst met
    // bronnen, want je hebt de playlist nodig om ze te ordenen.
    function isWholeMp4(url) {
        return /\.mp4(\?|#|$)/i.test(url) && !/(chunk|segment|frag|init|_\d{3,}\.mp4)/i.test(url);
    }

    function remember(raw, label) {
        if (!raw || typeof raw !== 'string') return;
        let url;
        try {
            url = new URL(raw, location.href).toString();
        } catch (err) {
            return;
        }
        if (!isPlaylist(url) && !isWholeMp4(url)) return;
        if (sources.has(url)) return;
        sources.set(url, { url, label: label || (isPlaylist(url) ? 'HLS' : 'MP4') });
        console.log(LOG, 'bron gevonden:', label, url);
        scheduleRender();
    }

    // De player vraagt de playlist zelf op zodra je afspeelt. Door fetch en XHR
    // te onderscheppen hebben we de URL ook als de API-lookup niets oplevert.
    function hookNetwork() {
        const origFetch = pageWindow.fetch;
        if (typeof origFetch === 'function') {
            pageWindow.fetch = function (input) {
                try {
                    remember(typeof input === 'string' ? input : (input && input.url), 'netwerk');
                } catch (err) { /* nooit de pagina breken */ }
                return origFetch.apply(this, arguments);
            };
        }

        const XHR = pageWindow.XMLHttpRequest;
        if (XHR && XHR.prototype && XHR.prototype.open) {
            const origOpen = XHR.prototype.open;
            XHR.prototype.open = function (method, url) {
                try {
                    remember(url, 'netwerk');
                } catch (err) { /* idem */ }
                return origOpen.apply(this, arguments);
            };
        }
    }

    function scanPerformance() {
        try {
            performance.getEntriesByType('resource').forEach(entry => remember(entry.name, 'netwerk'));
        } catch (err) { /* Performance-API niet beschikbaar */ }
    }

    // /w/<token> is de korte deel-URL, /<user>/<id> en /i/broadcasts/<id>
    // bevatten het broadcast-id zelf.
    function broadcastRef() {
        const path = location.pathname;
        let m = path.match(/^\/w\/([A-Za-z0-9_-]{8,})/);
        if (m) return { token: m[1] };
        m = path.match(/^\/i\/broadcasts\/([A-Za-z0-9]{8,})/);
        if (m) return { broadcast_id: m[1] };
        m = path.match(/^\/[^/]+\/(1[A-Za-z0-9]{10,})/);
        if (m) return { broadcast_id: m[1] };
        return null;
    }

    // De publieke API geeft voor een broadcast de live- of replay-playlist terug,
    // ook zonder dat je de video eerst afspeelt.
    async function lookupApi() {
        const ref = broadcastRef();
        if (!ref) return;
        const key = JSON.stringify(ref);
        if (apiChecked === key) return;
        apiChecked = key;

        const query = new URLSearchParams(ref).toString();
        try {
            const body = await fetchText('https://api.pscp.tv/api/v2/getAccessPublic?' + query);
            const data = JSON.parse(body);
            [
                ['replay_url', 'replay'],
                ['hls_url', 'live'],
                ['https_hls_url', 'live'],
                ['lhls_url', 'live']
            ].forEach(pair => {
                if (data && data[pair[0]]) remember(data[pair[0]], pair[1]);
            });
        } catch (err) {
            console.warn(LOG, 'API-lookup mislukt:', err);
        }
    }

    // ---------------------------------------------------------------- netwerk

    function gmRequest(url, responseType) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest ontbreekt'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: responseType,
                onload: resp => {
                    if (resp.status >= 200 && resp.status < 300) {
                        resolve(responseType === 'arraybuffer' ? resp.response : resp.responseText);
                    } else {
                        reject(new Error('HTTP ' + resp.status));
                    }
                },
                onerror: () => reject(new Error('netwerkfout')),
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    // De CDN's sturen CORS-headers mee, dus een gewone fetch werkt meestal en is
    // sneller. Lukt dat niet, dan gaat het alsnog via GM_xmlhttpRequest, dat
    // niet aan CORS gebonden is.
    async function fetchText(url) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return await resp.text();
        } catch (err) {
            return gmRequest(url, 'text');
        }
    }

    async function fetchBytes(url) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return new Uint8Array(await resp.arrayBuffer());
        } catch (err) {
            return new Uint8Array(await gmRequest(url, 'arraybuffer'));
        }
    }

    // --------------------------------------------------------------- playlist

    function resolveUrl(uri, base) {
        return new URL(uri, base).toString();
    }

    function parseAttrs(line) {
        const attrs = {};
        const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
        let m;
        while ((m = re.exec(line))) attrs[m[1]] = m[2].replace(/^"|"$/g, '');
        return attrs;
    }

    function parseMaster(text, base) {
        const lines = text.split(/\r?\n/);
        const variants = [];
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue;
            const attrs = parseAttrs(lines[i]);
            for (let j = i + 1; j < lines.length; j++) {
                const uri = lines[j].trim();
                if (!uri || uri.startsWith('#')) continue;
                variants.push({
                    url: resolveUrl(uri, base),
                    bandwidth: parseInt(attrs.BANDWIDTH || '0', 10),
                    resolution: attrs.RESOLUTION || ''
                });
                break;
            }
        }
        return variants;
    }

    function parseMedia(text, base) {
        const segments = [];
        let key = null;
        let map = null;
        let sequence = 0;
        let live = true;
        let duration = 0;

        text.split(/\r?\n/).forEach(raw => {
            const line = raw.trim();
            if (!line) return;

            if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
                sequence = parseInt(line.split(':')[1], 10) || 0;
            } else if (line.startsWith('#EXT-X-ENDLIST')) {
                live = false;
            } else if (line.startsWith('#EXT-X-KEY')) {
                const attrs = parseAttrs(line);
                key = (!attrs.METHOD || attrs.METHOD === 'NONE')
                    ? null
                    : {
                        method: attrs.METHOD,
                        url: attrs.URI ? resolveUrl(attrs.URI, base) : null,
                        iv: attrs.IV || null
                    };
            } else if (line.startsWith('#EXT-X-MAP')) {
                const attrs = parseAttrs(line);
                if (attrs.URI) map = resolveUrl(attrs.URI, base);
            } else if (line.startsWith('#EXTINF')) {
                duration += parseFloat(line.split(':')[1]) || 0;
            } else if (!line.startsWith('#')) {
                segments.push({ url: resolveUrl(line, base), key: key, seq: sequence + segments.length });
            }
        });

        return { segments: segments, map: map, live: live, duration: duration };
    }

    // -------------------------------------------------------------- segmenten

    const keyCache = new Map();

    function getKey(url) {
        if (!keyCache.has(url)) keyCache.set(url, fetchBytes(url));
        return keyCache.get(url);
    }

    function hexToBytes(hex) {
        const clean = hex.replace(/^0x/i, '');
        const out = new Uint8Array(Math.floor(clean.length / 2));
        for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
        return out;
    }

    // Zonder IV-attribuut is de IV het mediasequentienummer als 128-bit getal.
    function ivFromSequence(seq) {
        const iv = new Uint8Array(16);
        new DataView(iv.buffer).setUint32(12, seq >>> 0);
        return iv;
    }

    // HLS gebruikt AES-128-CBC met PKCS#7-padding, precies wat WebCrypto met
    // AES-CBC verwacht. Decryptie kan dus zonder extra bibliotheek.
    async function decryptSegment(data, keyInfo, seq) {
        if (!keyInfo) return data;
        if (keyInfo.method !== 'AES-128' || !keyInfo.url) {
            throw new Error('niet-ondersteunde versleuteling: ' + keyInfo.method);
        }
        const rawKey = await getKey(keyInfo.url);
        const iv = keyInfo.iv ? hexToBytes(keyInfo.iv) : ivFromSequence(seq);
        const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-CBC', false, ['decrypt']);
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, cryptoKey, data));
    }

    async function withRetry(fn) {
        let last;
        for (let attempt = 0; attempt < RETRIES; attempt++) {
            try {
                return await fn();
            } catch (err) {
                last = err;
            }
        }
        throw last;
    }

    async function loadSegments(segments, onProgress) {
        const parts = new Array(segments.length);
        let next = 0;
        let done = 0;

        async function worker() {
            while (!state.cancel) {
                const index = next++;
                if (index >= segments.length) return;
                const segment = segments[index];
                const raw = await withRetry(() => fetchBytes(segment.url));
                parts[index] = await decryptSegment(raw, segment.key, segment.seq);
                onProgress(++done, segments.length);
            }
        }

        const workers = [];
        for (let i = 0; i < Math.min(CONCURRENCY, segments.length); i++) workers.push(worker());
        await Promise.all(workers);
        if (state.cancel) throw new Error('geannuleerd');
        return parts;
    }

    // ---------------------------------------------------------------- opslaan

    function baseName() {
        const ref = broadcastRef();
        const id = ref ? (ref.broadcast_id || ref.token) : 'video';
        return 'periscope_' + id + '_' + new Date().toISOString().replace(/[:.]/g, '-');
    }

    function linkDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // GM_download slikt blob:-URL's niet in elke manager, dus een gewone
    // downloadlink is hier de betrouwbaarste weg.
    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        linkDownload(url, filename);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        console.log(LOG, 'opgeslagen:', filename, Math.round(blob.size / 1048576) + ' MB');
    }

    function saveDirect(url, filename) {
        if (typeof GM_download === 'function') {
            GM_download({
                url: url,
                name: filename,
                saveAs: true,
                onerror: err => {
                    console.warn(LOG, 'GM_download mislukt, terugval op link:', err);
                    linkDownload(url, filename);
                }
            });
        } else {
            linkDownload(url, filename);
        }
    }

    async function download(source) {
        if (!isPlaylist(source.url)) {
            setStatus('Losse MP4 — download start…');
            saveDirect(source.url, baseName() + '.mp4');
            setStatus('MP4 doorgegeven aan de downloadmanager.');
            return;
        }

        setStatus('Playlist ophalen…');
        let base = source.url;
        let text = await fetchText(base);

        if (text.indexOf('#EXT-X-STREAM-INF') !== -1) {
            const variants = parseMaster(text, base).sort((a, b) => b.bandwidth - a.bandwidth);
            if (!variants.length) throw new Error('geen varianten in de master-playlist');
            base = variants[0].url;
            setStatus('Kwaliteit: ' + (variants[0].resolution || Math.round(variants[0].bandwidth / 1000) + ' kbps'));
            text = await fetchText(base);
        }

        const media = parseMedia(text, base);
        if (!media.segments.length) throw new Error('geen segmenten in de playlist');

        const minutes = Math.round(media.duration / 60);
        setStatus(media.segments.length + ' segmenten'
            + (minutes ? ' (~' + minutes + ' min)' : '')
            + (media.live ? ' — live, alleen het beschikbare deel' : ''));

        const parts = [];
        // Een fMP4-playlist begint met een init-segment; zonder dat stuk is de
        // rest onspeelbaar. Is er geen init-segment, dan is het MPEG-TS.
        if (media.map) parts.push(await withRetry(() => fetchBytes(media.map)));

        const started = Date.now();
        const loaded = await loadSegments(media.segments, (done, total) => {
            const perSecond = done / Math.max((Date.now() - started) / 1000, 1);
            const left = Math.round((total - done) / Math.max(perSecond, 0.1));
            setProgress(Math.round((done / total) * 100));
            setStatus('Segment ' + done + '/' + total + ' — nog ~' + left + 's');
        });
        loaded.forEach(part => parts.push(part));

        const isFmp4 = Boolean(media.map);
        const blob = new Blob(parts, { type: isFmp4 ? 'video/mp4' : 'video/mp2t' });
        saveBlob(blob, baseName() + (isFmp4 ? '.mp4' : '.ts'));
        setProgress(100);
        setStatus(isFmp4
            ? 'Klaar — MP4 van ' + Math.round(blob.size / 1048576) + ' MB opgeslagen.'
            : 'Klaar — TS van ' + Math.round(blob.size / 1048576) + ' MB. Naar MP4 remuxen kan met het ffmpeg-commando.');
    }

    // ----------------------------------------------------------------- paneel

    let panel = null;
    let select = null;
    let statusEl = null;
    let barEl = null;
    let downloadBtn = null;
    let renderTimer = null;

    function el(tag, style, text) {
        const node = document.createElement(tag);
        if (style) node.style.cssText = style;
        if (text) node.textContent = text;
        return node;
    }

    function button(label, onClick) {
        const btn = el('button', [
            'background:#1d9bf0', 'color:#fff', 'border:0', 'border-radius:999px',
            'padding:6px 12px', 'font:600 12px/1 system-ui,sans-serif', 'cursor:pointer',
            'flex:0 0 auto'
        ].join(';'), label);
        btn.addEventListener('click', onClick);
        return btn;
    }

    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
        console.log(LOG, text);
    }

    function setProgress(pct) {
        if (barEl) barEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }

    function selectedSource() {
        if (!select || !select.value) return null;
        return sources.get(select.value) || null;
    }

    function buildPanel() {
        panel = el('div', [
            'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
            'width:300px', 'background:#15202b', 'color:#e7e9ea',
            'border:1px solid #38444d', 'border-radius:12px', 'padding:10px',
            'font:13px/1.4 system-ui,sans-serif', 'box-shadow:0 8px 24px rgba(0,0,0,.4)'
        ].join(';'));

        const body = el('div', 'margin-top:8px');

        const header = el('div', 'display:flex;align-items:center;gap:8px;cursor:pointer');
        header.appendChild(el('strong', 'flex:1;font-size:13px', '⬇ Periscope downloader'));
        const toggle = el('span', 'opacity:.7;font-size:16px;line-height:1', '–');
        header.appendChild(toggle);
        header.addEventListener('click', () => {
            state.minimized = !state.minimized;
            body.style.display = state.minimized ? 'none' : 'block';
            toggle.textContent = state.minimized ? '+' : '–';
        });
        panel.appendChild(header);

        select = el('select', [
            'width:100%', 'background:#273340', 'color:#e7e9ea', 'border:1px solid #38444d',
            'border-radius:6px', 'padding:5px', 'font:12px system-ui,sans-serif'
        ].join(';'));
        body.appendChild(select);

        const row = el('div', 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap');
        downloadBtn = button('Download', onDownloadClick);
        row.appendChild(downloadBtn);
        row.appendChild(button('⧉ URL', () => {
            const source = selectedSource();
            if (source) copy(source.url, 'URL gekopieerd.');
        }));
        row.appendChild(button('⧉ ffmpeg', () => {
            const source = selectedSource();
            if (source) copy('ffmpeg -i "' + source.url + '" -c copy "' + baseName() + '.mp4"', 'ffmpeg-commando gekopieerd.');
        }));
        body.appendChild(row);

        const track = el('div', 'height:4px;background:#38444d;border-radius:2px;margin-top:8px;overflow:hidden');
        barEl = el('div', 'height:100%;width:0;background:#1d9bf0;transition:width .2s');
        track.appendChild(barEl);
        body.appendChild(track);

        statusEl = el('div', 'margin-top:6px;font-size:11px;opacity:.75;word-break:break-word', 'Bron gevonden.');
        body.appendChild(statusEl);

        panel.appendChild(body);
        document.body.appendChild(panel);
    }

    function copy(text, message) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            setStatus(message);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => setStatus(message));
        } else {
            setStatus(text);
        }
    }

    async function onDownloadClick() {
        if (state.busy) {
            state.cancel = true;
            setStatus('Annuleren…');
            return;
        }
        const source = selectedSource();
        if (!source) return;

        state.busy = true;
        state.cancel = false;
        downloadBtn.textContent = '✕ Stop';
        setProgress(0);
        try {
            await download(source);
        } catch (err) {
            console.warn(LOG, err);
            setStatus('Mislukt: ' + err.message + ' — probeer het ffmpeg-commando.');
        } finally {
            state.busy = false;
            state.cancel = false;
            downloadBtn.textContent = 'Download';
        }
    }

    function render() {
        if (!sources.size || !document.body) return;
        if (!panel) buildPanel();

        // Een handmatige keuze blijft staan als er later bronnen bijkomen.
        const current = select.value;
        select.textContent = '';
        sources.forEach(source => {
            const option = document.createElement('option');
            option.value = source.url;
            const kind = isPlaylist(source.url) ? 'HLS' : 'MP4';
            const tail = source.url.split('?')[0].split('/').pop() || source.url;
            option.textContent = source.label + ' · ' + kind + ' · ' + tail.slice(0, 28);
            select.appendChild(option);
        });
        if (current && sources.has(current)) select.value = current;
    }

    function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(render, 300);
    }

    // ------------------------------------------------------------------ start

    hookNetwork();

    function tick() {
        // X is een SPA: bij navigatie verandert de URL zonder herlaadbeurt, dus
        // moeten de bronnen van de vorige broadcast weg.
        if (location.href !== lastHref) {
            lastHref = location.href;
            if (!state.busy) {
                sources.clear();
                apiChecked = '';
                if (panel) {
                    panel.remove();
                    panel = null;
                    select = null;
                    statusEl = null;
                    barEl = null;
                    downloadBtn = null;
                }
            }
        }
        lookupApi();
        scanPerformance();
    }

    function start() {
        tick();
        setInterval(tick, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
