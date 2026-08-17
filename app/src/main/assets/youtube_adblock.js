(function () {
    'use strict';
    if (window.__aabYtAdblockInstalled) return;
    window.__aabYtAdblockInstalled = true;

    var AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams'];

    function scrub(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        try {
            for (var i = 0; i < AD_KEYS.length; i++) {
                if (AD_KEYS[i] in obj) delete obj[AD_KEYS[i]];
            }
            if (obj.playerResponse && typeof obj.playerResponse === 'object') {
                scrub(obj.playerResponse);
            }
        } catch (e) { /* never break the page */ }
        return obj;
    }

    // 1. Any player data parsed from strings (XHR, inline scripts).
    var nativeParse = JSON.parse;
    JSON.parse = function () {
        return scrub(nativeParse.apply(this, arguments));
    };

    // 2. Player data fetched via fetch()/Response.json (bypasses JSON.parse).
    if (window.Response && Response.prototype.json) {
        var nativeJson = Response.prototype.json;
        Response.prototype.json = function () {
            return nativeJson.apply(this, arguments).then(scrub);
        };
    }

    // 3. The initial player payload embedded in the page.
    (function () {
        var value;
        try {
            Object.defineProperty(window, 'ytInitialPlayerResponse', {
                configurable: true,
                get: function () { return value; },
                set: function (v) { value = scrub(v); }
            });
        } catch (e) { /* property may be non-configurable on reinjection */ }
    })();

    // Cosmetic: hide feed/banner ad containers (desktop ytd-*, mobile ytm-*).
    var CSS = [
        '#player-ads',
        '#masthead-ad',
        'ytd-ad-slot-renderer',
        'ytd-display-ad-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-banner-promo-renderer',
        'ytd-statement-banner-renderer',
        'ytd-merch-shelf-renderer',
        'ytm-promoted-video-renderer',
        'ytm-companion-slot',
        'ad-slot-renderer',
        '.ytp-ad-overlay-container'
    ].join(',') + '{display:none!important}';

    function addStyle() {
        if (!document.head) return false;
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        return true;
    }
    if (!addStyle()) {
        new MutationObserver(function (mutations, observer) {
            if (addStyle()) observer.disconnect();
        }).observe(document.documentElement, { childList: true, subtree: true });
    }

    // Fallback watchdog: skip or fast-forward any ad that still gets through.
    var mutedByUs = false;
    setInterval(function () {
        try {
            var skips = document.querySelectorAll(
                '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'
            );
            for (var i = 0; i < skips.length; i++) skips[i].click();

            var player = document.querySelector('.html5-video-player');
            if (!player) return;
            var video = player.querySelector('video');
            var inAd = player.classList.contains('ad-showing') ||
                player.classList.contains('ad-interrupting');
            if (inAd && video) {
                if (!video.muted) { video.muted = true; mutedByUs = true; }
                if (isFinite(video.duration) && video.duration > 0.5) {
                    video.currentTime = video.duration;
                }
            } else if (mutedByUs && video) {
                video.muted = false;
                mutedByUs = false;
            }
        } catch (e) { /* keep the watchdog alive */ }
    }, 500);
})();
