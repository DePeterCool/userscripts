// ==UserScript==
// @name         Snapchat Image, Video & Voice Downloader
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Double-click on an image, video, or voice message to download it instantly without the user noticing.
// @author       Me
// @match        https://www.snapchat.com/*
// @license      MIT
// @grant        GM_download
// @downloadURL  https://update.greasyfork.org/scripts/531940/Snapchat%20Image%20%20Video%20Downloader.user.js
// @updateURL    https://update.greasyfork.org/scripts/531940/Snapchat%20Image%20%20Video%20Downloader.meta.js
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

    document.addEventListener('dblclick', (e) => {
        const mediaEl = findMediaElement(e.target);
        if (!mediaEl) return;

        const src = mediaEl.currentSrc || mediaEl.src || mediaEl.querySelector('source')?.src;
        if (!src || (!src.startsWith('blob:') && !src.startsWith('http:') && !src.startsWith('https:'))) {
            return;
        }

        let type = 'image';
        let extension = 'png';

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
        }

        const now = new Date();
        const filename = `snapblob_${type}_${now.toISOString().replace(/[:.]/g, '-')}.${extension}`;

        console.log(`[SnapDL] Downloading ${type}...`, src);

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

