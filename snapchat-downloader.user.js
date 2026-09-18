// ==UserScript==
// @name         Snapchat Image, Video & Voice Downloader
// @namespace    https://github.com/DePeterCool/userscripts
// @version      1.3
// @description  Double-click on an image, video, or voice message to download it instantly without the user noticing.
// @author       Me
// @match        https://www.snapchat.com/*
// @license      MIT
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      sc-cdn.net
// @connect      snapchat.com
// @connect      snap.com
// @downloadURL  https://raw.githubusercontent.com/DePeterCool/userscripts/main/snapchat-downloader.user.js
// @updateURL    https://raw.githubusercontent.com/DePeterCool/userscripts/main/snapchat-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    function findMediaElement(target) {
        if (!target) return null;

        // Direct media elements
        if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement || target instanceof HTMLAudioElement) {
            return target;
        }

        // Check inside the clicked element
        if (target.querySelector) {
            const inner = target.querySelector('audio, video, img');
            if (inner) return inner;
        }

        // Check parent container (voice message bubbles, custom players, chat rows)
        const container = target.closest('button, [role="button"], [data-testid], [class*="voice" i], [class*="audio" i], [class*="media" i], [class*="message" i], [class*="player" i], [class*="chat" i]');
        if (container) {
            const found = container.querySelector('audio, video, img');
            if (found) return found;
        }

        // Step up parents to find nearby audio element (common for custom waveform players)
        let parent = target.parentElement;
        let depth = 0;
        while (parent && depth < 4) {
            const audio = parent.querySelector('audio');
            if (audio) return audio;
            parent = parent.parentElement;
            depth++;
        }

        return null;
    }

    function fallbackDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log('[SnapDL] ✅ Download triggered via fallback link:', filename);
    }

    // Snapchat serves media without a usable extension in the URL, so the real
    // format has to come from the bytes themselves. Chrome replaces any
    // extension that contradicts the actual content type, which is how a
    // hardcoded .png on JPEG data ended up on disk as .jfif.
    const SIGNATURES = [
        { ext: 'jpg',  match: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
        { ext: 'png',  match: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
        { ext: 'gif',  match: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
        { ext: 'webp', match: b => b.length >= 12 &&
                                   b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
                                   b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
        { ext: 'bmp',  match: b => b[0] === 0x42 && b[1] === 0x4D }
    ];

    // blob: URLs are same-origin to the page, so fetch can read them. Remote CDN
    // URLs usually are not, so those go through GM_xmlhttpRequest, which is not
    // bound by CORS. Only the first bytes are needed; the Range header keeps it
    // cheap when the server honours it.
    function readHeaderBytes(src) {
        if (src.startsWith('blob:')) {
            return fetch(src)
                .then(resp => resp.blob())
                .then(blob => blob.slice(0, 16).arrayBuffer())
                .then(buf => new Uint8Array(buf));
        }

        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                resolve(null);
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url: src,
                responseType: 'arraybuffer',
                headers: { Range: 'bytes=0-15' },
                onload: resp => resolve(resp.response ? new Uint8Array(resp.response) : null),
                onerror: reject
            });
        });
    }

    async function detectImageExtension(src) {
        try {
            const head = await readHeaderBytes(src);
            if (head && head.length >= 2) {
                const hit = SIGNATURES.find(sig => sig.match(head));
                if (hit) return hit.ext;
            }
        } catch (err) {
            console.warn('[SnapDL] Could not read file header, falling back to .jpg:', err);
        }

        // Snapchat photos are JPEG in practice, so jpg is the safer guess than
        // png: a wrong .jpg on PNG data gets corrected by the browser, while a
        // wrong .png on JPEG data is exactly what produced .jfif.
        return 'jpg';
    }

    document.addEventListener('dblclick', async (e) => {
        const mediaEl = findMediaElement(e.target);
        if (!mediaEl) return;

        const src = mediaEl.currentSrc || mediaEl.src || mediaEl.querySelector('source')?.src;
        if (!src || (!src.startsWith('blob:') && !src.startsWith('http:') && !src.startsWith('https:'))) {
            return;
        }

        let type = 'image';
        let extension;

        if (mediaEl instanceof HTMLVideoElement) {
            type = 'video';
            extension = 'mp4';
        } else if (mediaEl instanceof HTMLAudioElement) {
            type = 'audio';
            if (src.includes('.m4a')) extension = 'm4a';
            else if (src.includes('.wav')) extension = 'wav';
            else if (src.includes('.ogg')) extension = 'ogg';
            else if (src.includes('.webm')) extension = 'webm';
            else extension = 'mp3';
        } else {
            extension = await detectImageExtension(src);
        }

        const now = new Date();
        const filename = `snapblob_${type}_${now.toISOString().replace(/[:.]/g, '-')}.${extension}`;

        console.log(`[SnapDL] Downloading ${type} as .${extension}...`, src);

        if (typeof GM_download === 'function') {
            GM_download({
                url: src,
                name: filename,
                saveAs: true,
                onload: () => console.log('[SnapDL] ✅ Success:', filename),
                onerror: (err) => {
                    console.warn('[SnapDL] GM_download error, attempting fallback:', err);
                    fallbackDownload(src, filename);
                }
            });
        } else {
            fallbackDownload(src, filename);
        }
    });
})();

