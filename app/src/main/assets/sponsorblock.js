(function () {
    'use strict';
    if (window.__aabSponsorBlockInstalled) return;
    window.__aabSponsorBlockInstalled = true;

    var API = 'https://sponsor.ajay.app/api/skipSegments';
    var CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'filler', 'music_offtopic'];
    var LABELS = {
        sponsor: 'Skip sponsor',
        selfpromo: 'Skip self-promo',
        interaction: 'Skip reminder',
        intro: 'Skip intro',
        outro: 'Skip outro',
        preview: 'Skip preview',
        filler: 'Skip filler',
        music_offtopic: 'Skip non-music'
    };

    var state = { videoId: null, segments: [], active: null, button: null };
    window.__aabSB = state; // debug handle

    function getVideoId() {
        try {
            var m = location.search.match(/[?&]v=([\w-]{5,})/);
            if (m) return m[1];
            var p = location.pathname.match(/\/(?:shorts|embed)\/([\w-]{5,})/);
            return p ? p[1] : null;
        } catch (e) { return null; }
    }

    function fetchSegments(videoId) {
        var url = API + '?videoID=' + encodeURIComponent(videoId) +
            '&categories=' + encodeURIComponent(JSON.stringify(CATEGORIES));
        fetch(url)
            .then(function (r) { return r.status === 200 ? r.json() : []; })
            .then(function (list) {
                if (state.videoId === videoId && Array.isArray(list)) state.segments = list;
            })
            .catch(function () { /* offline or blocked: no button, nothing broken */ });
    }

    function doSkip() {
        var video = document.querySelector('.html5-video-player video') ||
            document.querySelector('video');
        if (video && state.active) video.currentTime = state.active.segment[1] + 0.01;
        if (state.button) state.button.style.display = 'none';
        state.active = null;
    }

    function isOurs(el) {
        return !!(el && el.nodeType === 1 &&
            (el.id === 'aab-sb-skip' || (el.closest && el.closest('#aab-sb-skip'))));
    }

    // Registered at document start, so these capture-phase listeners run before
    // YouTube's own touch handlers (which otherwise toggle the control overlay).
    ['touchstart', 'touchend', 'click'].forEach(function (type) {
        window.addEventListener(type, function (ev) {
            if (!isOurs(ev.target)) return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            if (type !== 'touchstart') doSkip();
        }, { capture: true, passive: false });
    });

    // The mobile player (#movie_player) has a transform, so it is a stacking
    // context below the controls overlay host; the button must live in the
    // host (or the fullscreen element) to be tappable above the overlay.
    function mountTarget(player) {
        var fs = document.fullscreenElement;
        if (fs) {
            var fsHost = fs.querySelector && fs.querySelector('.ytmWatchPlayerControlsHost');
            return fsHost || fs;
        }
        return document.querySelector('.ytmWatchPlayerControlsHost') || player;
    }

    function ensureButton(target) {
        var btn = state.button;
        if (btn && btn.parentNode === target) return btn;
        if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'aab-sb-skip';
            btn.style.cssText =
                'position:absolute;right:16px;bottom:80px;z-index:2147483647;display:none;' +
                'padding:14px 22px;font-size:18px;font-weight:600;color:#fff;cursor:pointer;' +
                'background:rgba(0,0,0,0.75);border:2px solid #fff;border-radius:28px;' +
                'pointer-events:auto;';
            state.button = btn;
        }
        target.appendChild(btn);
        return btn;
    }

    setInterval(function () {
        try {
            var vid = getVideoId();
            if (vid !== state.videoId) {
                state.videoId = vid;
                state.segments = [];
                state.active = null;
                if (state.button) state.button.style.display = 'none';
                if (vid) fetchSegments(vid);
            }
            if (!state.segments.length) return;

            var player = document.querySelector('.html5-video-player');
            var video = player && player.querySelector('video');
            if (!player || !video) return;

            var btn = ensureButton(mountTarget(player));
            var t = video.currentTime;
            var found = null;
            for (var i = 0; i < state.segments.length; i++) {
                var s = state.segments[i].segment;
                if (t >= s[0] && t < s[1] - 0.3) { found = state.segments[i]; break; }
            }
            if (found) {
                if (state.active !== found) {
                    state.active = found;
                    btn.textContent = (LABELS[found.category] || 'Skip segment') + ' »';
                }
                btn.style.display = 'block';
            } else {
                state.active = null;
                btn.style.display = 'none';
            }
        } catch (e) { /* keep the watchdog alive */ }
    }, 500);
})();
