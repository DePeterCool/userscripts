// ==UserScript==
// @name         Instagram Video & Reel Downloader
// @namespace    https://github.com/DePeterCool/userscripts
// @version      1.3.1
// @description  Download Instagram videos and Reels directly as playable MP4 with a single click.
// @author       Antigravity
// @match        https://www.instagram.com/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      instagram.com
// @connect      cdninstagram.com
// @connect      fbcdn.net
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/DePeterCool/userscripts/main/instagram-video-reel-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/DePeterCool/userscripts/main/instagram-video-reel-downloader.user.js
// ==/UserScript==

(function () {
    'use strict';

    // Store intercepted media shortcodes to video URLs in sandbox scope
    const mediaUrlMap = new Map();

    // Clean video URL to remove byte range parameters that restrict download to small chunks
    function cleanVideoUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        try {
            let clean = rawUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
            const u = new URL(clean);
            u.searchParams.delete('bytestart');
            u.searchParams.delete('byteend');
            return u.toString();
        } catch (e) {
            return rawUrl.replace(/([?&])bytestart=\d+(&|$)/, '$1').replace(/([?&])byteend=\d+(&|$)/, '$1');
        }
    }

    // Extract best quality full video URL from video_versions array
    function getBestVideoUrl(versions) {
        if (!Array.isArray(versions) || versions.length === 0) return null;
        let best = versions[0];
        for (const v of versions) {
            if (v && v.width && best.width && v.width > best.width && v.url) {
                best = v;
            }
        }
        return cleanVideoUrl(best.url || best.src);
    }

    // ----------------------------------------------------
    // 1. Main World Network Interceptor Injection
    // ----------------------------------------------------
    function injectMainWorldInterceptor() {
        const scriptContent = `
        (function() {
            if (window.__igInterceptorInjected) return;
            window.__igInterceptorInjected = true;
            window.__igMediaMap = window.__igMediaMap || new Map();

            function cleanUrl(rawUrl) {
                if (!rawUrl || typeof rawUrl !== 'string') return null;
                try {
                    let clean = rawUrl.replace(/\\\\u0026/g, '&').replace(/\\\\/g, '');
                    const u = new URL(clean);
                    u.searchParams.delete('bytestart');
                    u.searchParams.delete('byteend');
                    return u.toString();
                } catch (e) {
                    return rawUrl;
                }
            }

            function extractMedia(obj) {
                if (!obj || typeof obj !== 'object') return;
                const shortcode = obj.shortcode || obj.code;
                if (shortcode) {
                    let videoUrl = null;
                    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
                        let best = obj.video_versions[0];
                        for (const v of obj.video_versions) {
                            if (v && v.width && best.width && v.width > best.width && v.url) {
                                best = v;
                            }
                        }
                        videoUrl = best.url;
                    } else if (obj.video_url) {
                        videoUrl = obj.video_url;
                    }
                    if (videoUrl) {
                        window.__igMediaMap.set(shortcode, cleanUrl(videoUrl));
                    }
                }
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        if (typeof obj[key] === 'object' && obj[key] !== null) {
                            extractMedia(obj[key]);
                        }
                    }
                }
            }

            const origFetch = window.fetch;
            window.fetch = async function(...args) {
                const res = await origFetch.apply(this, args);
                try {
                    const clone = res.clone();
                    const contentType = clone.headers.get('content-type') || '';
                    if (contentType.includes('application/json') || contentType.includes('text/plain')) {
                        clone.json().then(data => extractMedia(data)).catch(() => {});
                    }
                } catch (e) {}
                return res;
            };

            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function(method, url) {
                this._url = url;
                return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function() {
                this.addEventListener('load', function() {
                    try {
                        if (this.responseText && (this._url.includes('graphql') || this._url.includes('api/v1') || this._url.includes('query'))) {
                            const data = JSON.parse(this.responseText);
                            extractMedia(data);
                        }
                    } catch (e) {}
                });
                return origSend.apply(this, arguments);
            };
        })();
        `;

        try {
            const script = document.createElement('script');
            script.textContent = scriptContent;
            (document.head || document.documentElement).appendChild(script);
            script.remove();
        } catch (e) {
            console.warn('[IG Downloader] Main world script injection error:', e);
        }
    }

    injectMainWorldInterceptor();

    // ----------------------------------------------------
    // 2. Inject CSS Styles
    // ----------------------------------------------------
    function injectStyles() {
        if (document.getElementById('ig-downloader-styles')) return;
        const style = document.createElement('style');
        style.id = 'ig-downloader-styles';
        style.textContent = `
            .ig-download-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 14px;
                margin: 6px 0;
                background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
                color: #ffffff !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                font-weight: 600;
                border: none;
                border-radius: 20px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
                transition: all 0.2s ease-in-out;
                z-index: 9999;
                text-decoration: none !important;
                user-select: none;
            }

            .ig-download-btn:hover {
                transform: translateY(-2px) scale(1.03);
                box-shadow: 0 6px 16px rgba(220, 39, 67, 0.4);
                opacity: 0.95;
            }

            .ig-download-btn:active {
                transform: translateY(0) scale(0.98);
            }

            .ig-download-btn.downloading {
                background: #444444 !important;
                cursor: wait;
                opacity: 0.8;
            }

            .ig-download-btn.success {
                background: #2e7d32 !important;
            }

            .ig-download-btn.error {
                background: #c62828 !important;
            }

            .ig-download-overlay {
                position: absolute;
                top: 12px;
                right: 12px;
                z-index: 99999;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // ----------------------------------------------------
    // 3. Advanced Extraction Helpers
    // ----------------------------------------------------

    // Extract shortcode from element or URL
    function getShortcodeFromElement(element) {
        if (!element) return null;
        let container = element.closest('article, [role="dialog"], section, div[role="aria-roledescription"]');
        if (!container) container = element.parentElement;

        if (container) {
            const links = container.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
            for (const link of links) {
                const match = link.href.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
                if (match && match[2]) {
                    return match[2];
                }
            }
        }

        const match = window.location.href.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
        if (match && match[2]) {
            return match[2];
        }

        return null;
    }

    // Inspect React Fiber / React Props for Video Metadata
    function findVideoFromReactFiber(element) {
        let curr = element;
        let depth = 0;

        function searchObj(obj, visited = new Set(), currentDepth = 0) {
            if (!obj || currentDepth > 10 || visited.has(obj) || typeof obj !== 'object') return null;
            visited.add(obj);

            // Check for video_versions array
            if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
                const url = getBestVideoUrl(obj.video_versions);
                if (url && typeof url === 'string' && url.startsWith('http')) return url;
            }

            // Check for direct video_url / videoUrl properties
            if (typeof obj.video_url === 'string' && obj.video_url.startsWith('http')) return cleanVideoUrl(obj.video_url);
            if (typeof obj.videoUrl === 'string' && obj.videoUrl.startsWith('http')) return cleanVideoUrl(obj.videoUrl);

            // Check memoizedProps or pendingProps
            const props = obj.memoizedProps || obj.pendingProps;
            if (props && typeof props === 'object' && props !== obj) {
                const res = searchObj(props, visited, currentDepth + 1);
                if (res) return res;
            }

            // Check return fiber (parent node in React tree)
            if (obj.return && typeof obj.return === 'object') {
                const res = searchObj(obj.return, visited, currentDepth + 1);
                if (res) return res;
            }

            // Check items array if present
            if (Array.isArray(obj.items)) {
                for (const item of obj.items) {
                    const res = searchObj(item, visited, currentDepth + 1);
                    if (res) return res;
                }
            }

            return null;
        }

        while (curr && depth < 15) {
            const keys = Object.keys(curr);
            for (const key of keys) {
                if (key.startsWith('__reactFiber') || key.startsWith('__reactProps')) {
                    const fiber = curr[key];
                    const found = searchObj(fiber);
                    if (found) return found;
                }
            }
            curr = curr.parentElement;
            depth++;
        }
        return null;
    }

    // Inspect Performance Resource Timing API for loaded video streams
    function findVideoFromPerformance() {
        try {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const perf = win.performance || window.performance;
            if (!perf) return null;

            const entries = perf.getEntriesByType('resource');
            for (let i = entries.length - 1; i >= 0; i--) {
                const name = entries[i].name;
                if (name && (name.includes('cdninstagram.com') || name.includes('fbcdn.net'))) {
                    if (name.includes('.mp4') || name.includes('mime_type=video')) {
                        return cleanVideoUrl(name);
                    }
                }
            }
        } catch (e) {
            console.warn('[IG Downloader] Performance search error:', e);
        }
        return null;
    }

    // Inspect page <script> JSON tags
    function findVideoFromScripts(shortcode) {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
            const text = s.textContent;
            if (!text) continue;
            if (shortcode && !text.includes(shortcode) && !text.includes('video_versions')) continue;

            const vvMatch = text.match(/"video_versions"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);
            if (vvMatch && vvMatch[1]) {
                return cleanVideoUrl(vvMatch[1]);
            }

            const vuMatch = text.match(/"video_url"\s*:\s*"([^"]+)"/);
            if (vuMatch && vuMatch[1]) {
                return cleanVideoUrl(vuMatch[1]);
            }
        }
        return null;
    }

    // Master Video URL Resolver
    async function findVideoUrl(videoEl) {
        console.log('[IG Downloader] Extracting video URL for element:', videoEl);

        // Strategy 1: Direct src / currentSrc / <source> tags
        if (videoEl.src && !videoEl.src.startsWith('blob:') && videoEl.src.startsWith('http')) {
            console.log('[IG Downloader] Strategy 1 (video.src):', videoEl.src);
            return cleanVideoUrl(videoEl.src);
        }
        if (videoEl.currentSrc && !videoEl.currentSrc.startsWith('blob:') && videoEl.currentSrc.startsWith('http')) {
            console.log('[IG Downloader] Strategy 1 (video.currentSrc):', videoEl.currentSrc);
            return cleanVideoUrl(videoEl.currentSrc);
        }
        const sources = videoEl.querySelectorAll('source');
        for (const s of sources) {
            if (s.src && !s.src.startsWith('blob:') && s.src.startsWith('http')) {
                console.log('[IG Downloader] Strategy 1 (source.src):', s.src);
                return cleanVideoUrl(s.src);
            }
        }

        // Strategy 2: React Fiber & State Tree Inspection (Highest precision!)
        const reactUrl = findVideoFromReactFiber(videoEl);
        if (reactUrl) {
            console.log('[IG Downloader] Strategy 2 (React Fiber):', reactUrl);
            return cleanVideoUrl(reactUrl);
        }

        // Strategy 3: Network Interceptor Map (Main world & sandbox)
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const mediaMap = win.__igMediaMap || mediaUrlMap;
        const shortcode = getShortcodeFromElement(videoEl);

        if (shortcode && mediaMap && mediaMap.has(shortcode)) {
            const interceptedUrl = mediaMap.get(shortcode);
            console.log('[IG Downloader] Strategy 3 (Network Interceptor):', interceptedUrl);
            return cleanVideoUrl(interceptedUrl);
        }

        // Strategy 4: On-demand Page/API Fetch for shortcode
        if (shortcode) {
            console.log('[IG Downloader] Strategy 4 (Page Fetch for shortcode:', shortcode, ')');
            try {
                const pageUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
                const res = await fetch(pageUrl, { credentials: 'include' });
                const data = await res.json();

                let fetchedUrl = null;
                if (data && data.items && data.items[0]) {
                    const item = data.items[0];
                    if (item.video_versions && item.video_versions.length > 0) {
                        fetchedUrl = getBestVideoUrl(item.video_versions);
                    } else if (item.video_url) {
                        fetchedUrl = item.video_url;
                    }
                } else if (data && data.graphql && data.graphql.shortcode_media) {
                    fetchedUrl = data.graphql.shortcode_media.video_url;
                }

                if (fetchedUrl) {
                    console.log('[IG Downloader] Strategy 4 (Fetch JSON success):', fetchedUrl);
                    return cleanVideoUrl(fetchedUrl);
                }
            } catch (err) {
                console.warn('[IG Downloader] Strategy 4 JSON fetch failed, trying HTML parse:', err);
            }

            try {
                const htmlRes = await fetch(`https://www.instagram.com/p/${shortcode}/`);
                const text = await htmlRes.text();

                const ogMatch = text.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
                if (ogMatch && ogMatch[1]) {
                    const url = ogMatch[1].replace(/&amp;/g, '&');
                    console.log('[IG Downloader] Strategy 4 (HTML og:video success):', url);
                    return cleanVideoUrl(url);
                }

                const vuMatch = text.match(/"video_url"\s*:\s*"([^"]+)"/);
                if (vuMatch && vuMatch[1]) {
                    const url = vuMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                    console.log('[IG Downloader] Strategy 4 (HTML regex success):', url);
                    return cleanVideoUrl(url);
                }
            } catch (err) {
                console.warn('[IG Downloader] Strategy 4 HTML parse failed:', err);
            }
        }

        // Strategy 5: Script tag JSON search
        const scriptUrl = findVideoFromScripts(shortcode);
        if (scriptUrl) {
            console.log('[IG Downloader] Strategy 5 (Script JSON):', scriptUrl);
            return cleanVideoUrl(scriptUrl);
        }

        // Strategy 6: Performance API resource entries
        const perfUrl = findVideoFromPerformance();
        if (perfUrl) {
            console.log('[IG Downloader] Strategy 6 (Performance Entry):', perfUrl);
            return cleanVideoUrl(perfUrl);
        }

        console.error('[IG Downloader] All video extraction strategies failed.');
        return null;
    }

    // ----------------------------------------------------
    // 4. Download Execution Handler with Integrity Validation
    // ----------------------------------------------------
    async function downloadVideo(url, filename, button) {
        const cleanUrl = cleanVideoUrl(url);
        const originalText = button.innerHTML;
        button.classList.add('downloading');
        button.innerHTML = `<span>⏳ Downloading...</span>`;

        const updateStatus = (status, msg, duration = 4000) => {
            button.classList.remove('downloading');
            button.classList.add(status);
            button.innerHTML = `<span>${msg}</span>`;
            setTimeout(() => {
                button.classList.remove(status);
                button.innerHTML = originalText;
            }, duration);
        };

        if (typeof GM_download === 'function') {
            GM_download({
                url: cleanUrl,
                name: filename,
                onload: () => updateStatus('success', '✅ Saved!'),
                onerror: (err) => {
                    console.warn('[IG Downloader] GM_download error, using fallback stream download:', err);
                    fallbackDownload(cleanUrl, filename, updateStatus);
                }
            });
            return;
        }

        fallbackDownload(cleanUrl, filename, updateStatus);
    }

    function fallbackDownload(cleanUrl, filename, updateStatus) {
        const saveBlob = (blob) => {
            if (!blob || blob.size < 10000) {
                console.warn('[IG Downloader] Blob payload invalid or small (' + (blob ? blob.size : 0) + ' bytes). Opening direct link.');
                window.open(cleanUrl, '_blank');
                updateStatus('success', '🔗 Opened MP4');
                return;
            }

            // Instantiate valid video/mp4 Blob
            const mp4Blob = new Blob([blob], { type: 'video/mp4' });
            const blobUrl = URL.createObjectURL(mp4Blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename.endsWith('.mp4') ? filename : `${filename}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
            updateStatus('success', '✅ Saved!');
        };

        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: cleanUrl,
                headers: {
                    'Referer': 'https://www.instagram.com/',
                    'Origin': 'https://www.instagram.com',
                    'Accept': 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8'
                },
                responseType: 'blob',
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300 && res.response) {
                        saveBlob(res.response);
                    } else {
                        console.warn('[IG Downloader] GM_xmlhttpRequest failed status:', res.status);
                        window.open(cleanUrl, '_blank');
                        updateStatus('success', '🔗 Opened MP4');
                    }
                },
                onerror: (err) => {
                    console.error('[IG Downloader] GM_xmlhttpRequest error:', err);
                    window.open(cleanUrl, '_blank');
                    updateStatus('success', '🔗 Opened MP4');
                }
            });
        } else {
            fetch(cleanUrl, { mode: 'cors', credentials: 'omit' })
                .then(res => {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.blob();
                })
                .then(blob => saveBlob(blob))
                .catch(err => {
                    console.error('[IG Downloader] Fetch error:', err);
                    window.open(cleanUrl, '_blank');
                    updateStatus('success', '🔗 Opened MP4');
                });
        }
    }

    // ----------------------------------------------------
    // 5. UI Button Generators
    // ----------------------------------------------------
    function createDownloadButton(videoEl) {
        const btn = document.createElement('button');
        btn.className = 'ig-download-btn';
        btn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download MP4</span>
        `;

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const videoUrl = await findVideoUrl(videoEl);
            if (!videoUrl) {
                alert('Could not extract MP4 video URL. Try playing the video for a moment first.');
                return;
            }

            const shortcode = getShortcodeFromElement(videoEl) || 'video';
            const filename = `instagram_${shortcode}_${Date.now()}.mp4`;

            downloadVideo(videoUrl, filename, btn);
        });

        return btn;
    }

    function processVideoElement(videoEl) {
        if (videoEl.dataset.igDownloaderAttached) return;
        videoEl.dataset.igDownloaderAttached = 'true';

        const article = videoEl.closest('article, [role="dialog"], section');

        if (article) {
            const sectionBar = article.querySelector('section');
            if (sectionBar) {
                // Eén knop per post: als de actiebalk er al een heeft, niet
                // doorvallen naar de overlay-tak.
                if (!sectionBar.querySelector('.ig-download-btn')) {
                    const btn = createDownloadButton(videoEl);
                    sectionBar.appendChild(btn);
                }
                return;
            }
        }

        const parent = videoEl.parentElement;
        if (parent && !parent.querySelector('.ig-download-btn')) {
            const overlay = document.createElement('div');
            overlay.className = 'ig-download-overlay';
            const btn = createDownloadButton(videoEl);
            overlay.appendChild(btn);

            if (getComputedStyle(parent).position === 'static') {
                parent.style.position = 'relative';
            }
            parent.appendChild(overlay);
        }
    }

    function scanVideos() {
        const videos = document.querySelectorAll('video');
        videos.forEach(processVideoElement);
    }

    // ----------------------------------------------------
    // 6. Initialization & Mutation Observer
    // ----------------------------------------------------
    function init() {
        injectStyles();
        scanVideos();

        const observer = new MutationObserver(() => {
            scanVideos();
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
