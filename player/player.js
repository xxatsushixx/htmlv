/**
 * htmlv browser player — loads Timeline IR and plays on a fixed stage.
 */
(function () {
  'use strict';

  /** @type {any} */
  let ir = window.__HTMLV_IR__;
  const stage = document.getElementById('stage');
  const btnPlay = document.getElementById('btn-play');
  const btnDownload = document.getElementById('btn-download');
  const seek = document.getElementById('seek');
  const timeLabel = document.getElementById('time-label');
  const docTitle = document.getElementById('doc-title');
  const metaChips = document.getElementById('meta-chips');
  const sourcePath = document.getElementById('source-path');
  const sceneStrip = document.getElementById('scene-strip');
  const sceneTicks = document.getElementById('scene-ticks');
  const trackStrip = document.getElementById('track-strip');
  const sourceCode = document.getElementById('source-code');
  const sourceScroll = document.getElementById('source-scroll');
  const btnToggleSource = document.getElementById('btn-toggle-source');
  const btnShowSource = document.getElementById('btn-show-source');
  const appEl = document.getElementById('app');
  const exportOverlay = document.getElementById('export-overlay');
  const exportOverlayTitle = document.getElementById('export-overlay-title');
  const exportOverlayDetail = document.getElementById('export-overlay-detail');

  let playing = false;
  let currentMs = 0;
  let lastTs = 0;
  let raf = 0;
  /** @type {Map<string, HTMLElement>} */
  const layerMap = new Map();
  /** @type {any[]} */
  let flatNodes = [];
  const aiCache = new Map();
  /** @type {HTMLButtonElement[]} */
  let sceneButtons = [];
  /** @type {{ startLine: number, endLine: number, el: HTMLElement|null }[]} */
  let sceneSourceRanges = [];
  let lastHighlightedScene = -1;
  /** @type {{ id: string, label: string, blocks: { startMs: number, endMs: number, label: string, el: HTMLElement|null }[] }[]} */
  let trackModel = [];
  /** @type {HTMLElement[]} */
  let trackPlayheads = [];

  const htmlvApi = {
    get currentTime() {
      return currentMs / 1000;
    },
    get duration() {
      return (ir?.meta?.durationMs ?? 0) / 1000;
    },
    play() {
      startPlay();
    },
    pause() {
      pausePlay();
    },
    seek(seconds) {
      seekTo(seconds * 1000);
    },
    addEventListener(type, fn, opts) {
      document.addEventListener(type, fn, opts);
    },
    removeEventListener(type, fn, opts) {
      document.removeEventListener(type, fn, opts);
    },
  };
  window.htmlv = htmlvApi;

  function formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  function parseAspect(ratio) {
    const m = String(ratio || '16:9').match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!m) return 16 / 9;
    return parseFloat(m[1]) / parseFloat(m[2]);
  }

  function flatten(nodes, out) {
    for (const n of nodes || []) {
      out.push(n);
      if (n.children && n.children.length) flatten(n.children, out);
    }
  }

  function applyVisualStyles(el, styles, localMs, timeRules) {
    const merged = Object.assign({}, styles || {});
    if (timeRules) {
      for (const rule of timeRules) {
        if (localMs >= rule.startMs && localMs < rule.endMs) {
          Object.assign(merged, rule.styles);
        }
      }
    }
    const skip = new Set([
      'time-length',
      'time-start',
      'time-end',
      'time-position',
      'time-margin',
      'time-margin-start',
      'time-margin-end',
      'time-padding',
      'time-padding-start',
      'time-padding-end',
      'scene-transition',
      'easing',
      'loop',
      'text-display',
      'text-duration',
      'framerate',
      'start',
      'end',
    ]);
    for (const [k, v] of Object.entries(merged)) {
      if (skip.has(k)) continue;
      const prop = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      try {
        el.style[prop] = v;
      } catch (_) {
        /* ignore invalid */
      }
    }
    if (merged.opacity !== undefined) el.style.opacity = merged.opacity;
    if (merged.background) el.style.background = merged.background;
    if (merged['background-image']) el.style.backgroundImage = merged['background-image'];
    if (merged['background-size']) el.style.backgroundSize = merged['background-size'];
    if (merged['background-position']) el.style.backgroundPosition = merged['background-position'];
    if (merged['background-color']) el.style.backgroundColor = merged['background-color'];
    if (merged.color) el.style.color = merged.color;
    if (merged['font-size']) el.style.fontSize = merged['font-size'];
    if (merged['font-family']) el.style.fontFamily = merged['font-family'];
    if (merged['text-align']) el.style.textAlign = merged['text-align'];
  }

  function revealText(full, styles, localMs) {
    const mode = styles['text-display'] || 'block';
    const dur = parseTimeMs(styles['text-duration'], 0);
    if (mode === 'block' || !dur) return full;
    const t = Math.min(1, Math.max(0, localMs / dur));
    if (mode === 'character') {
      const n = Math.floor(full.length * t);
      return full.slice(0, n);
    }
    if (mode === 'word') {
      const words = full.split(/(\s+)/);
      const count = Math.floor((words.length / 2) * t) * 2;
      return words.slice(0, Math.max(1, count)).join('');
    }
    if (mode === 'line') {
      const lines = full.split('\n');
      const n = Math.max(1, Math.ceil(lines.length * t));
      return lines.slice(0, n).join('\n');
    }
    return full;
  }

  function parseTimeMs(raw, fallback) {
    if (!raw) return fallback;
    const s = String(raw).trim().toLowerCase();
    if (s.endsWith('ms')) return parseFloat(s) || fallback;
    if (s.endsWith('s')) return (parseFloat(s) || 0) * 1000;
    const n = parseFloat(s);
    return Number.isNaN(n) ? fallback : n * 1000;
  }

  function contentDuration(node) {
    if (node.contentDurationMs != null && node.contentDurationMs > 0) {
      return node.contentDurationMs;
    }
    const fromStyle = parseTimeMs(node.styles && node.styles['time-length'], 0);
    if (fromStyle > 0) return fromStyle;
    return Math.max(1, node.endMs - node.startMs);
  }

  /** Map wall-clock localMs into content-local ms using loop mode. */
  function loopedLocalMs(node, localMs) {
    const mode = ((node.styles && node.styles.loop) || 'none').toLowerCase();
    const dur = contentDuration(node);
    const span = Math.max(1, node.endMs - node.startMs);
    if (mode === 'stretch') {
      return (localMs / span) * dur;
    }
    if (mode === 'loop' && dur > 0) {
      return ((localMs % dur) + dur) % dur;
    }
    if (mode === 'flipflap' && dur > 0) {
      const cycle = dur * 2;
      const t = ((localMs % cycle) + cycle) % cycle;
      return t <= dur ? t : cycle - t;
    }
    return localMs;
  }

  function nodeKey(node, index) {
    return (node.id || node.tag + '-' + index) + '-' + node.startMs + '-' + node.endMs;
  }

  function isClippedOut(node, ms) {
    if (node.clipStartMs == null || node.clipEndMs == null) return false;
    return ms < node.clipStartMs || ms >= node.clipEndMs;
  }

  function stubDataUrl(kind, label) {
    const text = String(label || 'AI stub').slice(0, 48);
    if (kind === 'image' || kind === 'img') {
      const svg =
        "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>" +
        "<rect fill='#1a3048' width='100%' height='100%'/>" +
        "<text x='50%' y='48%' fill='#9eb6d0' text-anchor='middle' font-size='22' font-family='sans-serif'>" +
        text.replace(/[<>&]/g, '') +
        '</text>' +
        "<text x='50%' y='58%' fill='#6a849e' text-anchor='middle' font-size='14'>AI placeholder</text>" +
        '</svg>';
      return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }
    return null;
  }

  function ensureLayers() {
    stage.innerHTML = '';
    layerMap.clear();
    flatNodes = [];
    flatten(ir.scenes, flatNodes);

    const lazy = ir.meta.compileMode === 'compile-during-playback';
    // Always register nodes; DOM layers for non-first scenes can wait until near playhead when lazy.
    flatNodes.forEach((node, index) => {
      if (node.tag === 'ai-generate' || node.tag === 'ai-filter' || node.tag === 'ai-subtitle') {
        return;
      }
      if (lazy && node.startMs > 0) {
        // Defer DOM until renderFrame approaches this node
        return;
      }
      buildLayer(node, index);
    });
  }

  function ensureLayerForNode(node, index) {
    const key = nodeKey(node, index);
    if (layerMap.has(key)) return;
    if (node.tag === 'ai-generate' || node.tag === 'ai-filter' || node.tag === 'ai-subtitle') {
      return;
    }
    buildLayer(node, index);
  }

  function buildLayer(node, index) {
    const el = document.createElement('div');
    el.className = 'layer';
    el.dataset.tag = node.tag;
    const key = nodeKey(node, index);
    el.dataset.key = key;

      if (node.tag === 'scene') {
        if (node.styles && node.styles.background) {
          el.style.background = node.styles.background;
        } else if (node.styles && node.styles['background-image']) {
          el.style.backgroundImage = node.styles['background-image'];
          if (node.styles['background-color']) {
            el.style.backgroundColor = node.styles['background-color'];
          }
        } else {
          el.style.backgroundColor =
            (node.styles && node.styles['background-color']) || 'transparent';
        }
      } else if (node.tag === 'text' || node.tag === 'p') {
      el.classList.add('text');
      el.textContent = node.text || '';
    } else if (node.tag === 'img' || node.tag === 'image') {
      const img = document.createElement('img');
      img.alt = '';
      img.src = node.src || '';
      el.appendChild(img);
      el.classList.add('img');
      maybeResolveAi(node, img, 'image');
    } else if (node.tag === 'video') {
      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      if (node.src) vid.src = node.src;
      el.appendChild(vid);
      el.classList.add('video');
      maybeResolveAi(node, vid, 'video');
    } else if (node.tag === 'audio') {
      const aud = document.createElement('audio');
      if (node.src) aud.src = node.src;
      el.appendChild(aud);
      el.classList.add('audio');
      maybeResolveAi(node, aud, 'audio');
    } else if (node.tag === 'sequence') {
      el.style.pointerEvents = 'none';
    } else if (node.tag === 'iframe' && node.nested) {
      el.classList.add('iframe-host');
      const nestedStage = document.createElement('div');
      nestedStage.className = 'stage nested';
      nestedStage.style.width = '100%';
      nestedStage.style.height = '100%';
      nestedStage.style.position = 'relative';
      el.appendChild(nestedStage);
      el._nestedIr = node.nested;
      el._nestedStage = nestedStage;
    } else if (node.ai) {
      const ph = document.createElement('div');
      ph.className = 'ai-placeholder';
      ph.textContent = 'AI: ' + (node.ai.prompt || node.tag);
      el.appendChild(ph);
    }

    applyVisualStyles(el, node.styles, 0, node.timeRules);
    stage.appendChild(el);
    layerMap.set(key, el);
  }

  async function maybeResolveAi(node, mediaEl, kind) {
    const aiNode =
      node.ai ||
      (node.children || []).map((c) => c.ai).find(Boolean);
    if (!aiNode) return;
    const cacheKey = (aiNode.seed || '') + '|' + (aiNode.prompt || '') + '|' + (aiNode.type || '');
    if (aiCache.has(cacheKey)) {
      const url = aiCache.get(cacheKey);
      applyAiResult(mediaEl, url, aiNode, kind);
      return;
    }
    if (aiNode.api) {
      try {
        const res = await fetch(aiNode.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: aiNode.kind,
            type: aiNode.type,
            prompt: aiNode.prompt,
            seed: aiNode.seed,
            src: aiNode.src,
            language: aiNode.language,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            aiCache.set(cacheKey, data.url);
            applyAiResult(mediaEl, data.url, aiNode, kind);
            return;
          }
        }
      } catch (e) {
        console.warn('AI API failed, using stub', e);
      }
    }
    const stub = stubDataUrl(kind === 'video' || kind === 'audio' ? 'image' : kind, aiNode.prompt);
    aiCache.set(cacheKey, stub);
    applyAiResult(mediaEl, stub, aiNode, kind);
  }

  function applyAiResult(mediaEl, url, aiNode, kind) {
    if (!mediaEl) return;
    const parent = mediaEl.parentElement;
    if (url) {
      if (kind === 'video' && url.indexOf('data:image') === 0) {
        // Video AI stub: swap to placeholder image
        const img = document.createElement('img');
        img.src = url;
        img.alt = aiNode.prompt || 'AI stub';
        mediaEl.replaceWith(img);
        if (parent) {
          const badge = document.createElement('div');
          badge.className = 'ai-placeholder ai-overlay';
          badge.textContent = 'AI stub: ' + (aiNode.prompt || 'video');
          parent.appendChild(badge);
        }
        return;
      }
      mediaEl.src = url;
      return;
    }
    if (parent && !parent.querySelector('.ai-placeholder')) {
      const ph = document.createElement('div');
      ph.className = 'ai-placeholder';
      ph.textContent = 'AI: ' + (aiNode.prompt || 'placeholder');
      parent.appendChild(ph);
    }
  }

  function easeInOutCubic(t) {
    const x = Math.min(1, Math.max(0, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function smootherstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  function easeByName(name, t) {
    const n = (name || 'ease-in-out').toLowerCase();
    if (n === 'linear') return Math.min(1, Math.max(0, t));
    if (n === 'ease-in') {
      const x = Math.min(1, Math.max(0, t));
      return x * x * x;
    }
    if (n === 'ease-out') {
      const x = Math.min(1, Math.max(0, t));
      return 1 - Math.pow(1 - x, 3);
    }
    if (n === 'ease') return easeInOutCubic(t);
    return easeInOutCubic(t);
  }

  function isTopLevelScene(node) {
    return !!(ir && ir.scenes && ir.scenes.indexOf(node) !== -1);
  }

  function sceneTransitionDur(scene) {
    if (!scene || !scene.transition || !(scene.transition.durationMs > 0)) return 0;
    return scene.transition.durationMs;
  }

  function findTopLevelParent(node) {
    if (!ir || !ir.scenes) return null;
    function contains(parent, target) {
      if (!parent.children) return false;
      for (let i = 0; i < parent.children.length; i++) {
        const c = parent.children[i];
        if (c === target) return true;
        if (contains(c, target)) return true;
      }
      return false;
    }
    for (let i = 0; i < ir.scenes.length; i++) {
      const s = ir.scenes[i];
      if (s === node) return null;
      if (contains(s, node)) return s;
    }
    return null;
  }

  /** Extend top-level scenes into the next scene for true crossfade. */
  function isVisuallyActive(node, ms) {
    if (isClippedOut(node, ms)) return false;

    if (node.tag === 'scene' && isTopLevelScene(node)) {
      const dur = sceneTransitionDur(node);
      return ms >= node.startMs && ms < node.endMs + dur;
    }

    const parent = findTopLevelParent(node);
    if (parent) {
      const dur = sceneTransitionDur(parent);
      if (dur > 0 && ms >= parent.endMs && ms < parent.endMs + dur) {
        const t = parent.endMs - 0.5;
        return t >= node.startMs && t < node.endMs;
      }
    }

    return ms >= node.startMs && ms < node.endMs;
  }

  function transitionVisual(node, ms) {
    const empty = { opacity: 1, transform: '', filter: '' };
    const easingName = (node.styles && node.styles.easing) || 'ease-in-out';
    const effect = (node.transition && node.transition.effect) || 'fade';
    const dur =
      node.transition && node.transition.durationMs > 0
        ? node.transition.durationMs
        : 0;

    if (!dur) {
      // Children may still inherit parent outgoing fade
      return empty;
    }
    if (node.transition && node.transition.durationMs < 0) return empty;

    const local = ms - node.startMs;
    const untilEnd = node.endMs - ms;
    let opacity = 1;
    let transform = '';
    let filter = '';

    const soft =
      effect === 'dissolve' ? smootherstep : (t) => easeByName(easingName, t);

    // Incoming
    if (local >= 0 && local < dur) {
      opacity = Math.min(opacity, soft(local / dur));
    }
    // Outgoing inside nominal range
    if (ms < node.endMs && untilEnd >= 0 && untilEnd < dur) {
      opacity = Math.min(opacity, soft(untilEnd / dur));
    }
    // Outgoing tail past endMs (crossfade overlap)
    if (isTopLevelScene(node) && ms >= node.endMs) {
      const past = ms - node.endMs;
      if (past < dur) {
        opacity = Math.min(opacity, soft(1 - past / dur));
      }
    }

    if (effect === 'dissolve') {
      let mix = 1;
      if (local >= 0 && local < dur) mix = Math.min(mix, local / dur);
      if (ms < node.endMs && untilEnd >= 0 && untilEnd < dur) mix = Math.min(mix, untilEnd / dur);
      if (isTopLevelScene(node) && ms >= node.endMs && ms - node.endMs < dur) {
        mix = Math.min(mix, 1 - (ms - node.endMs) / dur);
      }
      const mid = 1 - Math.abs(1 - 2 * mix);
      filter = 'blur(' + (mid * 2).toFixed(2) + 'px)';
    } else if (effect === 'zoom') {
      if (local >= 0 && local < dur) {
        const t = soft(local / dur);
        transform = 'scale(' + (0.88 + 0.12 * t) + ')';
      } else if (ms < node.endMs && untilEnd < dur) {
        const t = soft(untilEnd / dur);
        transform = 'scale(' + (0.88 + 0.12 * t) + ')';
      } else if (isTopLevelScene(node) && ms >= node.endMs && ms - node.endMs < dur) {
        const t = soft(1 - (ms - node.endMs) / dur);
        transform = 'scale(' + (0.88 + 0.12 * t) + ')';
      }
    } else if (effect === 'slide') {
      if (local >= 0 && local < dur) {
        const t = 1 - soft(local / dur);
        transform = 'translateX(' + 48 * t + 'px)';
      } else if (ms < node.endMs && untilEnd < dur) {
        const t = 1 - soft(untilEnd / dur);
        transform = 'translateX(' + -48 * t + 'px)';
      }
    } else if (effect === 'wipe') {
      if (local >= 0 && local < dur) {
        const t = soft(local / dur);
        transform = 'translateX(' + (1 - t) * -100 + '%)';
      } else if (ms < node.endMs && untilEnd < dur) {
        const t = soft(untilEnd / dur);
        transform = 'translateX(' + (1 - t) * 100 + '%)';
      }
    } else if (effect === 'iris') {
      if (local >= 0 && local < dur) {
        const t = soft(local / dur);
        transform = 'scale(' + t + ')';
        opacity = t;
      } else if (ms < node.endMs && untilEnd < dur) {
        const t = soft(untilEnd / dur);
        transform = 'scale(' + t + ')';
        opacity = t;
      }
    } else if (effect === 'flip3d') {
      if (local >= 0 && local < dur) {
        const t = soft(local / dur);
        transform = 'perspective(800px) rotateY(' + (1 - t) * -80 + 'deg)';
      } else if (ms < node.endMs && untilEnd < dur) {
        const t = soft(untilEnd / dur);
        transform = 'perspective(800px) rotateY(' + (1 - t) * 80 + 'deg)';
      }
    }

    return { opacity, transform, filter };
  }

  function parentCrossfadeFactor(node, ms) {
    const parent = findTopLevelParent(node);
    if (!parent) return 1;
    const dur = sceneTransitionDur(parent);
    if (dur <= 0) return 1;
    const easingName = (parent.styles && parent.styles.easing) || 'ease-in-out';
    const soft =
      parent.transition && parent.transition.effect === 'dissolve'
        ? smootherstep
        : (t) => easeByName(easingName, t);
    if (ms >= parent.endMs && ms < parent.endMs + dur) {
      return soft(1 - (ms - parent.endMs) / dur);
    }
    if (ms < parent.endMs && parent.endMs - ms < dur) {
      return soft((parent.endMs - ms) / dur);
    }
    return 1;
  }

  /** @type {Promise<void>[]|null} */
  let exportSeekWaits = null;
  let exporting = false;

  function waitMediaSeeked(media, timeoutMs) {
    const limit = timeoutMs == null ? 700 : timeoutMs;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        media.removeEventListener('seeked', finish);
        media.removeEventListener('error', finish);
        media.removeEventListener('loadeddata', finish);
        clearTimeout(timer);
        resolve();
      };
      media.addEventListener('seeked', finish);
      media.addEventListener('error', finish);
      media.addEventListener('loadeddata', finish);
      const timer = setTimeout(finish, limit);
      if (!media.seeking && media.readyState >= 2) {
        setTimeout(() => {
          if (!media.seeking) finish();
        }, 0);
      }
    });
  }

  /** Wait until the browser has a decoded video frame ready to paint (not a black seek flash). */
  function waitVideoFrame(video, timeoutMs) {
    const limit = timeoutMs == null ? 500 : timeoutMs;
    if (!video || (!video.currentSrc && !video.src)) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, limit);
      if (typeof video.requestVideoFrameCallback === 'function') {
        try {
          video.requestVideoFrameCallback(() => finish());
          return;
        } catch (_) {}
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(finish);
      });
    });
  }

  function syncMedia(el, localContentMs, isPlaying) {
    const media = el.querySelector('video, audio');
    if (!media) return;
    const mediaLocal = localContentMs / 1000;
    // Export: seek every frame, but we wait for a painted frame afterward.
    const threshold = exporting ? 0.001 : 0.3;
    if (Math.abs(media.currentTime - mediaLocal) > threshold) {
      try {
        media.currentTime = mediaLocal;
        if (exportSeekWaits) exportSeekWaits.push(waitMediaSeeked(media, 700));
      } catch (_) {}
    }
    if (isPlaying && media.paused && media.src) media.play().catch(() => {});
    if (!isPlaying && !media.paused) media.pause();
  }

  async function seekToExportFrame(ms) {
    exportSeekWaits = [];
    seekTo(ms);
    const waits = exportSeekWaits;
    exportSeekWaits = null;
    if (waits && waits.length) await Promise.all(waits);
    const videos = stage.querySelectorAll(
      ':scope > .layer.active video, :scope > .layer.active .stage.nested .layer.active video'
    );
    if (videos.length) {
      await Promise.all(Array.prototype.map.call(videos, (v) => waitVideoFrame(v, 500)));
    } else {
      await waitFrames(1);
    }
  }

  function renderFrame(ms) {
    const duration = ir.meta.durationMs || 1;
    const lazy = ir.meta.compileMode === 'compile-during-playback';
    const prefetchMs = 2000;
    flatNodes.forEach((node, index) => {
      if (node.tag === 'ai-generate' || node.tag === 'ai-filter' || node.tag === 'ai-subtitle') {
        return;
      }
      if (lazy && ms + prefetchMs >= node.startMs) {
        ensureLayerForNode(node, index);
      }
      const key = nodeKey(node, index);
      const el = layerMap.get(key);
      if (!el) return;

      const active = isVisuallyActive(node, ms);
      // Content clock: clamp into nominal range for media/text during overlap tail
      const localMs = Math.min(Math.max(0, ms - node.startMs), Math.max(0, node.endMs - node.startMs - 0.001));
      const contentLocal = loopedLocalMs(node, localMs);
      el.classList.toggle('active', active);
      el.style.display = active ? 'flex' : 'none';

      if (!active) {
        const vid = el.querySelector('video, audio');
        if (vid && !vid.paused) vid.pause();
        el.style.filter = '';
        // Clear nested .active so export capture cannot paint stale iframe layers
        if (el._nestedStage) {
          el._nestedStage.querySelectorAll('.layer.active').forEach((nl) => {
            nl.classList.remove('active');
            nl.style.display = 'none';
          });
        }
        return;
      }

      // Stack order: later scenes above during crossfade
      el.style.zIndex = String(Math.floor(node.startMs / 10) + (node.tag === 'scene' ? 0 : 1));

      let { opacity, transform, filter } = transitionVisual(node, ms);
      opacity *= parentCrossfadeFactor(node, ms);

      if (node.styles && node.styles.opacity !== undefined) {
        opacity *= parseFloat(node.styles.opacity) || 1;
      }
      applyVisualStyles(el, node.styles, contentLocal, node.timeRules);
      if (node.timeRules) {
        for (const rule of node.timeRules) {
          if (
            contentLocal >= rule.startMs &&
            contentLocal < rule.endMs &&
            rule.styles.opacity !== undefined
          ) {
            opacity *= parseFloat(rule.styles.opacity) || 1;
          }
        }
      }
      el.style.opacity = String(opacity);
      if (transform) el.style.transform = transform;
      else if (!node.styles || !node.styles.transform) el.style.transform = '';
      el.style.filter = filter || '';

      if (node.tag === 'text' || node.tag === 'p') {
        el.textContent = revealText(node.text || '', node.styles || {}, contentLocal);
      }

      syncMedia(el, contentLocal, playing);

      if (el._nestedIr && el._nestedStage) {
        renderNested(el._nestedIr, el._nestedStage, contentLocal, playing);
      }
    });

    seek.value = String(Math.round((ms / duration) * 1000));
    timeLabel.textContent = formatTime(ms) + ' / ' + formatTime(duration);
    updateActiveSceneMarkers(ms);
    updateSourceHighlight(ms);
    updateTrackStrip(ms);
    dispatchTimeEvents(ms);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Find top-level <scene>…</scene> ranges in source (line-based).
   * Prefer id="…" match; otherwise assign in document order.
   */
  function findSceneRanges(text, scenes) {
    const lines = text.split(/\r?\n/);
    /** @type {{ startLine: number, endLine: number }[]} */
    const ranges = [];
    const stack = [];
    const openRe = /<scene(\s[^>]*)?>/i;
    const closeRe = /<\/scene\s*>/i;
    const selfCloseRe = /<scene(\s[^>]*)?\/>/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (selfCloseRe.test(line) && !closeRe.test(line)) {
        if (stack.length === 0) {
          ranges.push({ startLine: i, endLine: i });
        }
        continue;
      }
      if (openRe.test(line)) {
        stack.push(i);
      }
      if (closeRe.test(line) && stack.length) {
        const startLine = stack.pop();
        if (stack.length === 0) {
          ranges.push({ startLine: startLine, endLine: i });
        }
      }
    }

    // Map IR scenes to ranges: by id attribute first, then order
    const used = new Set();
    /** @type {{ startLine: number, endLine: number, el: HTMLElement|null }[]} */
    const mapped = scenes.map((scene) => {
      if (scene.id) {
        const idRe = new RegExp(
          '<scene\\b[^>]*\\bid\\s*=\\s*["\']' + scene.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']',
          'i'
        );
        for (let r = 0; r < ranges.length; r++) {
          if (used.has(r)) continue;
          const chunk = lines.slice(ranges[r].startLine, ranges[r].endLine + 1).join('\n');
          if (idRe.test(chunk)) {
            used.add(r);
            return { startLine: ranges[r].startLine, endLine: ranges[r].endLine, el: null };
          }
        }
      }
      return null;
    });

    let orderIdx = 0;
    for (let s = 0; s < mapped.length; s++) {
      if (mapped[s]) continue;
      while (orderIdx < ranges.length && used.has(orderIdx)) orderIdx++;
      if (orderIdx < ranges.length) {
        used.add(orderIdx);
        mapped[s] = {
          startLine: ranges[orderIdx].startLine,
          endLine: ranges[orderIdx].endLine,
          el: null,
        };
        orderIdx++;
      } else {
        mapped[s] = { startLine: -1, endLine: -1, el: null };
      }
    }
    return mapped;
  }

  function renderSourcePane(text) {
    if (!sourceCode) return;
    sceneSourceRanges = [];
    lastHighlightedScene = -1;
    if (!text) {
      sourceCode.textContent = '// no source embedded';
      return;
    }
    const lines = text.split(/\r?\n/);
    sceneSourceRanges = findSceneRanges(text, ir.scenes || []);

    const html = lines
      .map((line, i) => {
        return (
          '<span class="source-line" data-line="' +
          i +
          '"><span class="ln">' +
          (i + 1) +
          '</span>' +
          escapeHtml(line || ' ') +
          '</span>'
        );
      })
      .join('');
    sourceCode.innerHTML = html;

    const lineEls = sourceCode.querySelectorAll('.source-line');
    sceneSourceRanges.forEach((range) => {
      if (range.startLine < 0) return;
      range.el = lineEls[range.startLine] || null;
    });
  }

  function updateSourceHighlight(ms) {
    if (!sourceCode || !sceneSourceRanges.length) return;
    let active = -1;
    (ir.scenes || []).forEach((scene, index) => {
      if (ms >= scene.startMs && ms < scene.endMs) active = index;
    });
    if (active === lastHighlightedScene) return;

    const lineEls = sourceCode.querySelectorAll('.source-line');
    lineEls.forEach((el) => el.classList.remove('active-scene'));

    if (active >= 0) {
      const range = sceneSourceRanges[active];
      if (range && range.startLine >= 0) {
        for (let i = range.startLine; i <= range.endLine && i < lineEls.length; i++) {
          lineEls[i].classList.add('active-scene');
        }
        const anchor = range.el || lineEls[range.startLine];
        if (anchor && sourceScroll) {
          const top = anchor.offsetTop - sourceScroll.clientHeight * 0.25;
          sourceScroll.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      }
    }
    lastHighlightedScene = active;
  }

  function setSourceCollapsed(collapsed) {
    if (!appEl) return;
    appEl.classList.toggle('source-collapsed', collapsed);
    if (btnToggleSource) {
      btnToggleSource.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btnToggleSource.title = collapsed ? 'Show source' : 'Hide source';
      btnToggleSource.textContent = collapsed ? 'Source' : 'Source';
    }
  }

  function sceneLabel(scene, index) {
    if (scene.id) return scene.id;
    return 'Scene ' + (index + 1);
  }

  function sceneKey(scene, index) {
    return scene.id || 'scene-' + index + '-' + scene.startMs;
  }

  function classifyTrack(node) {
    const tag = node.tag;
    const pos = (node.styles && node.styles['time-position']) || 'static';
    if (tag === 'iframe') return 'COMP';
    if (tag === 'ai-generate' || tag === 'ai-filter' || tag === 'ai-subtitle') return 'AI';
    if (tag === 'text' || tag === 'p') {
      return pos === 'absolute' || pos === 'fixed' ? 'TX' : 'V1';
    }
    if (tag === 'video' || tag === 'audio' || tag === 'img' || tag === 'image' || tag === 'sequence') {
      return 'V1';
    }
    if (tag === 'scene') return null;
    return 'V1';
  }

  function buildTrackStrip() {
    trackModel = [];
    trackPlayheads = [];
    if (!trackStrip) return;
    trackStrip.innerHTML = '';

    const duration = ir.meta.durationMs || 1;
    /** @type {Map<string, { id: string, label: string, blocks: any[] }>} */
    const rows = new Map();
    const order = ['V1', 'TX', 'AI', 'COMP'];

    function ensureRow(id) {
      if (!rows.has(id)) {
        rows.set(id, { id: id, label: id, blocks: [] });
      }
      return rows.get(id);
    }

    (ir.scenes || []).forEach((scene) => {
      const kids = scene.children || [];
      if (!kids.length) {
        ensureRow('V1').blocks.push({
          startMs: scene.startMs,
          endMs: scene.endMs,
          label: scene.id || 'scene',
          el: null,
        });
        return;
      }
      kids.forEach((child) => {
        if (child.ai && (child.tag === 'video' || child.tag === 'audio' || child.tag === 'img')) {
          ensureRow('AI').blocks.push({
            startMs: child.startMs,
            endMs: child.endMs,
            label: (child.ai && child.ai.prompt) || 'ai',
            el: null,
          });
        }
        const lane = classifyTrack(child);
        if (!lane) return;
        const label = child.id || child.text || child.tag || lane;
        ensureRow(lane).blocks.push({
          startMs: child.startMs,
          endMs: child.endMs,
          label: String(label).slice(0, 28),
          el: null,
        });
      });
    });

    trackModel = order.filter((id) => rows.has(id)).map((id) => rows.get(id));
    if (!trackModel.length) return;

    trackModel.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'track-row';
      const lab = document.createElement('div');
      lab.className = 'track-label';
      lab.textContent = row.label;
      const lane = document.createElement('div');
      lane.className = 'track-lane';
      const playhead = document.createElement('div');
      playhead.className = 'track-playhead';
      playhead.style.left = '0%';
      lane.appendChild(playhead);
      trackPlayheads.push(playhead);

      row.blocks.forEach((block) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'track-block';
        const left = (block.startMs / duration) * 100;
        const width = Math.max(0.8, ((block.endMs - block.startMs) / duration) * 100);
        btn.style.left = left + '%';
        btn.style.width = width + '%';
        btn.textContent = block.label;
        btn.title = formatTime(block.startMs) + ' – ' + formatTime(block.endMs);
        btn.addEventListener('click', () => {
          seekTo(block.startMs);
          if (!playing) startPlay();
        });
        lane.appendChild(btn);
        block.el = btn;
      });

      rowEl.appendChild(lab);
      rowEl.appendChild(lane);
      trackStrip.appendChild(rowEl);
    });
  }

  function updateTrackStrip(ms) {
    if (!trackModel.length) return;
    const duration = ir.meta.durationMs || 1;
    const pct = Math.min(100, Math.max(0, (ms / duration) * 100));
    trackPlayheads.forEach((ph) => {
      ph.style.left = pct + '%';
    });
    trackModel.forEach((row) => {
      row.blocks.forEach((block) => {
        if (!block.el) return;
        const active = ms >= block.startMs && ms < block.endMs;
        block.el.classList.toggle('active', active);
      });
    });
  }

  function buildChrome() {
    if (sourcePath) {
      const src = window.__HTMLV_SOURCE__ || '';
      sourcePath.textContent = src;
      sourcePath.hidden = !src;
    }

    if (metaChips) {
      metaChips.innerHTML = '';
      const parts = [];
      if (ir.meta.framerate) parts.push(ir.meta.framerate + 'fps');
      if (ir.meta.aspectRatio) parts.push(ir.meta.aspectRatio);
      if (ir.meta.durationMs != null) parts.push(formatTime(ir.meta.durationMs));
      for (const p of parts) {
        const span = document.createElement('span');
        span.textContent = p;
        metaChips.appendChild(span);
      }
    }

    const sourceText = window.__HTMLV_SOURCE_TEXT__ || '';
    renderSourcePane(sourceText);
    setSourceCollapsed(false);

    if (sceneStrip) {
      sceneStrip.innerHTML = '';
      sceneButtons = [];
      (ir.scenes || []).forEach((scene, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scene-marker';
        btn.setAttribute('role', 'tab');
        btn.textContent = sceneLabel(scene, index);
        btn.dataset.key = sceneKey(scene, index);
        btn.title = formatTime(scene.startMs) + ' – ' + formatTime(scene.endMs);
        btn.addEventListener('click', () => {
          seekTo(scene.startMs);
          lastHighlightedScene = -1;
          updateSourceHighlight(scene.startMs);
          if (!playing) startPlay();
        });
        sceneStrip.appendChild(btn);
        sceneButtons.push(btn);
      });
    }

    if (sceneTicks) {
      sceneTicks.innerHTML = '';
      const duration = ir.meta.durationMs || 1;
      (ir.scenes || []).forEach((scene, index) => {
        if (index === 0) return;
        const tick = document.createElement('div');
        tick.className = 'tick';
        tick.style.left = (scene.startMs / duration) * 100 + '%';
        sceneTicks.appendChild(tick);
      });
    }

    buildTrackStrip();
  }

  function updateActiveSceneMarkers(ms) {
    if (!sceneButtons.length) return;
    (ir.scenes || []).forEach((scene, index) => {
      const btn = sceneButtons[index];
      if (!btn) return;
      const active = ms >= scene.startMs && ms < scene.endMs;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  /** Nested IR render into a host (supports text/img/video/audio). */
  function renderNested(nestedIr, host, localMs, isPlaying) {
    if (!host._built) {
      host.innerHTML = '';
      host._nodes = [];
      flatten(nestedIr.scenes, host._nodes);
      host._layers = new Map();
      host._nodes.forEach((node, index) => {
        if (node.tag.startsWith('ai-')) return;
        const el = document.createElement('div');
        el.className = 'layer';
        if (node.tag === 'text' || node.tag === 'p') {
          el.classList.add('text');
          el.textContent = node.text || '';
        } else if (node.tag === 'img' || node.tag === 'image') {
          const img = document.createElement('img');
          img.src = node.src || '';
          el.appendChild(img);
        } else if (node.tag === 'video') {
          const vid = document.createElement('video');
          vid.muted = true;
          vid.playsInline = true;
          if (node.src) vid.src = node.src;
          el.appendChild(vid);
        } else if (node.tag === 'audio') {
          const aud = document.createElement('audio');
          if (node.src) aud.src = node.src;
          el.appendChild(aud);
        } else if (node.tag === 'scene') {
          if (node.styles && node.styles.background) {
            el.style.background = node.styles.background;
          } else {
            el.style.backgroundColor =
              (node.styles && node.styles['background-color']) || 'transparent';
          }
        }
        host.appendChild(el);
        host._layers.set(nodeKey(node, index), el);
      });
      host._built = true;
    }
    host._nodes.forEach((node, index) => {
      const el = host._layers.get(nodeKey(node, index));
      if (!el) return;
      const active = localMs >= node.startMs && localMs < node.endMs;
      el.classList.toggle('active', active);
      el.style.display = active ? 'flex' : 'none';
      if (!active) {
        const media = el.querySelector('video, audio');
        if (media && !media.paused) media.pause();
        el.style.opacity = '0';
        return;
      }
      // CSS .layer defaults opacity:0 — JS must own opacity (same as top-level renderFrame)
      el.style.opacity = '1';
      const nestedLocal = localMs - node.startMs;
      applyVisualStyles(el, node.styles, nestedLocal, node.timeRules);
      if (node.styles && node.styles.opacity !== undefined) {
        el.style.opacity = String(parseFloat(node.styles.opacity) || 1);
      }
      if (node.tag === 'text' || node.tag === 'p') {
        el.textContent = revealText(node.text || '', node.styles || {}, nestedLocal);
      }
      syncMedia(el, nestedLocal, isPlaying);
    });
  }

  let lastSceneIds = new Set();
  function dispatchTimeEvents(ms) {
    const detail = { currentTime: ms / 1000 };
    document.dispatchEvent(new CustomEvent('timeupdate', { detail }));
    htmlvApi.dispatchEvent && htmlvApi.dispatchEvent(new CustomEvent('timeupdate', { detail }));
    const activeScenes = new Set();
    for (const s of ir.scenes) {
      const sid = s.id || String(s.startMs);
      if (ms >= s.startMs && ms < s.endMs) {
        activeScenes.add(sid);
        if (!lastSceneIds.has(sid)) {
          document.dispatchEvent(new CustomEvent('sceneenter', { detail: { scene: s } }));
        }
      }
    }
    for (const id of lastSceneIds) {
      if (!activeScenes.has(id)) {
        document.dispatchEvent(new CustomEvent('sceneleave', { detail: { id } }));
      }
    }
    lastSceneIds = activeScenes;
    if (ms >= ir.meta.durationMs && playing) {
      pausePlay();
      document.dispatchEvent(new Event('ended'));
    }
  }

  function tick(ts) {
    if (!playing) return;
    if (!lastTs) lastTs = ts;
    let dt = ts - lastTs;
    lastTs = ts;
    const mode = ir.meta.framerateMode || 'drop-frames';
    const fps = ir.meta.framerate || 30;
    if (mode === 'slowdown') {
      const budget = 1000 / fps;
      if (dt > budget * 2) dt = budget;
    }
    currentMs += dt;
    if (currentMs > ir.meta.durationMs) currentMs = ir.meta.durationMs;
    renderFrame(currentMs);
    raf = requestAnimationFrame(tick);
  }

  function startPlay() {
    if (!ir) return;
    const duration = ir.meta.durationMs || 0;
    if (duration > 0 && currentMs >= duration) {
      currentMs = 0;
      renderFrame(0);
    }
    playing = true;
    btnPlay.textContent = 'Pause';
    lastTs = 0;
    raf = requestAnimationFrame(tick);
  }

  function pausePlay() {
    playing = false;
    btnPlay.textContent = 'Play';
    cancelAnimationFrame(raf);
  }

  function seekTo(ms) {
    currentMs = Math.max(0, Math.min(ms, ir.meta.durationMs || 0));
    renderFrame(currentMs);
  }

  /** @type {any} */
  let ffmpegInstance = null;

  function waitFrames(n) {
    return new Promise((resolve) => {
      let left = n;
      function step() {
        left--;
        if (left <= 0) resolve();
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /** @type {WeakMap<HTMLVideoElement, HTMLCanvasElement>} */
  const videoFrameCache = new WeakMap();

  function drawContained(ctx, source, dw, dh) {
    let src = source;
    if (source && source.tagName === 'VIDEO') {
      const vid = source;
      const bad = vid.seeking || vid.readyState < 2 || !vid.videoWidth;
      if (bad) {
        const cached = videoFrameCache.get(vid);
        if (!cached) return; // skip black flash frame
        src = cached;
      }
    }
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    if (!sw || !sh) return;
    const scale = Math.min(dw / sw, dh / sh);
    const w = sw * scale;
    const h = sh * scale;
    const x = (dw - w) / 2;
    const y = (dh - h) / 2;
    ctx.drawImage(src, x, y, w, h);
    if (source && source.tagName === 'VIDEO' && source.readyState >= 2 && source.videoWidth && !source.seeking) {
      let cache = videoFrameCache.get(source);
      if (!cache || cache.width !== source.videoWidth || cache.height !== source.videoHeight) {
        cache = document.createElement('canvas');
        cache.width = source.videoWidth;
        cache.height = source.videoHeight;
        videoFrameCache.set(source, cache);
      }
      try {
        cache.getContext('2d').drawImage(source, 0, 0);
      } catch (_) {}
    }
  }

  function parseCssColor(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (s.startsWith('#')) {
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6) return null;
      return '#' + h;
    }
    const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (m) {
      const r = Math.round(parseFloat(m[1]));
      const g = Math.round(parseFloat(m[2]));
      const b = Math.round(parseFloat(m[3]));
      if (m[4] !== undefined) {
        return 'rgba(' + r + ',' + g + ',' + b + ',' + parseFloat(m[4]) + ')';
      }
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    return s;
  }

  /** Parse "color pos%" where color may be rgb(...)/#hex (computed styles use commas+spaces). */
  function parseGradientStop(stop, index, total) {
    const s = String(stop).trim();
    let colorRaw = s;
    let pos = total <= 1 ? 0 : index / (total - 1);
    const withPos = s.match(/^(.*?)\s+([\d.]+%)\s*$/);
    if (withPos) {
      colorRaw = withPos[1].trim();
      pos = parseFloat(withPos[2]) / 100;
    }
    const color = parseCssColor(colorRaw) || colorRaw;
    return { color, pos };
  }

  function fillLayerBackground(ctx, layer, outW, outH, box) {
    const x = box ? box.x : 0;
    const y = box ? box.y : 0;
    const w = box ? box.w : outW;
    const h = box ? box.h : outH;
    const cs = window.getComputedStyle(layer);
    const image = cs.backgroundImage || '';
    if (image && image !== 'none') {
      // linear-gradient(angle, color stop%, ...)
      const linear = image.match(/linear-gradient\((.+)\)/i);
      if (linear) {
        const inner = linear[1];
        const parts = inner.split(/,(?![^\(]*\))/).map((p) => p.trim());
        let x0 = x;
        let y0 = y;
        let x1 = x;
        let y1 = y + h;
        let stopStart = 0;
        if (parts[0] && /deg|to\s/i.test(parts[0])) {
          const ang = parts[0];
          stopStart = 1;
          if (/to\s+bottom/i.test(ang)) {
            x0 = x;
            y0 = y;
            x1 = x;
            y1 = y + h;
          } else if (/to\s+right/i.test(ang) || /90deg/i.test(ang)) {
            x0 = x;
            y0 = y;
            x1 = x + w;
            y1 = y;
          } else if (/to\s+top/i.test(ang)) {
            x0 = x;
            y0 = y + h;
            x1 = x;
            y1 = y;
          } else {
            const deg = parseFloat(ang);
            if (!Number.isNaN(deg)) {
              const rad = ((deg - 90) * Math.PI) / 180;
              x0 = x + w / 2 - (Math.cos(rad) * w) / 2;
              y0 = y + h / 2 - (Math.sin(rad) * h) / 2;
              x1 = x + w / 2 + (Math.cos(rad) * w) / 2;
              y1 = y + h / 2 + (Math.sin(rad) * h) / 2;
            }
          }
        }
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        const stops = parts.slice(stopStart);
        stops.forEach((stop, i) => {
          const { color, pos } = parseGradientStop(stop, i, stops.length);
          try {
            grad.addColorStop(Math.min(1, Math.max(0, pos)), color);
          } catch (_) {
            /* skip invalid stop */
          }
        });
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);
        return;
      }
      // radial-gradient — approximate with radial from center
      const radial = image.match(/radial-gradient\((.+)\)/i);
      if (radial) {
        const grad = ctx.createRadialGradient(
          x + w * 0.5,
          y + h * 0.2,
          0,
          x + w * 0.5,
          y + h * 0.5,
          Math.max(w, h) * 0.85
        );
        const parts = radial[1].split(/,(?![^\(]*\))/).map((p) => p.trim());
        // Drop position/shape preamble ("120% 90% at 50% 15%", "circle", …)
        const stops = parts.filter(
          (p) => !/^(at\s|circle|ellipse|closest-|farthest-)/i.test(p) && !/^\d+(\.\d+)?%\s+\d/.test(p)
        );
        stops.forEach((stop, i) => {
          const { color, pos } = parseGradientStop(stop, i, stops.length);
          try {
            grad.addColorStop(Math.min(1, Math.max(0, pos)), color);
          } catch (_) {
            /* skip invalid stop */
          }
        });
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);
        return;
      }
    }
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
    }
  }

  /** Map a DOM layer's box onto the export canvas using stage-relative layout. */
  function layerBoxOnCanvas(layer, outW, outH) {
    const sr = stage.getBoundingClientRect();
    const r = layer.getBoundingClientRect();
    if (!sr.width || !sr.height) {
      return { x: 0, y: 0, w: outW, h: outH };
    }
    return {
      x: ((r.left - sr.left) / sr.width) * outW,
      y: ((r.top - sr.top) / sr.height) * outH,
      w: (r.width / sr.width) * outW,
      h: (r.height / sr.height) * outH,
    };
  }

  function drawTextLayer(ctx, layer, outW, outH) {
    const text = layer.textContent || '';
    if (!text) return;
    const cs = window.getComputedStyle(layer);
    const box = layerBoxOnCanvas(layer, outW, outH);
    fillLayerBackground(ctx, layer, outW, outH, box);

    const fontSize = parseFloat(cs.fontSize) || 32;
    const scale = outW / Math.max(1, stage.clientWidth);
    const padX = (parseFloat(cs.paddingLeft) || 0) * scale;
    const padY = (parseFloat(cs.paddingTop) || 0) * scale;
    const align = (cs.textAlign || 'center').toLowerCase();
    ctx.fillStyle = cs.color || '#ffffff';
    ctx.font =
      (cs.fontWeight || '400') +
      ' ' +
      Math.round(fontSize * scale) +
      'px ' +
      (cs.fontFamily || 'sans-serif');
    ctx.textAlign =
      align === 'left' || align === 'start'
        ? 'left'
        : align === 'right' || align === 'end'
          ? 'right'
          : 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    const lineH = Math.round(fontSize * scale * 1.25);
    const innerW = Math.max(0, box.w - padX * 2);
    const innerH = Math.max(0, box.h - padY * 2);
    let tx = box.x + box.w / 2;
    if (ctx.textAlign === 'left') tx = box.x + padX;
    else if (ctx.textAlign === 'right') tx = box.x + box.w - padX;
    const startY = box.y + padY + innerH / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, tx, startY + i * lineH, innerW > 0 ? innerW : undefined);
    });
  }


  /** Content opacity only (styles / :time) — excludes scene transition fades. */
  function contentOpacity(node, ms) {
    let op = 1;
    const localMs = Math.min(
      Math.max(0, ms - node.startMs),
      Math.max(0, node.endMs - node.startMs - 0.001)
    );
    const contentLocal = loopedLocalMs(node, localMs);
    if (node.styles && node.styles.opacity !== undefined) {
      op *= parseFloat(node.styles.opacity) || 1;
    }
    if (node.timeRules) {
      for (let i = 0; i < node.timeRules.length; i++) {
        const rule = node.timeRules[i];
        if (
          contentLocal >= rule.startMs &&
          contentLocal < rule.endMs &&
          rule.styles &&
          rule.styles.opacity !== undefined
        ) {
          op *= parseFloat(rule.styles.opacity) || 1;
        }
      }
    }
    return op;
  }

  /** Paint one layer's pixels (no opacity). Opacity is applied by caller. */
  function paintLayer(ctx, layer, outW, outH) {
    if (layer.dataset.tag === 'scene' || layer.classList.contains('iframe-host')) {
      fillLayerBackground(ctx, layer, outW, outH);
    }

    const vid = layer.querySelector(':scope > video');
    const img = layer.querySelector(':scope > img');
    if (vid && vid.readyState >= 2 && vid.videoWidth) {
      drawContained(ctx, vid, outW, outH);
    } else if (img && img.complete && img.naturalWidth) {
      drawContained(ctx, img, outW, outH);
    } else if (
      layer.classList.contains('text') ||
      layer.dataset.tag === 'text' ||
      layer.dataset.tag === 'p'
    ) {
      drawTextLayer(ctx, layer, outW, outH);
    } else if (layer.classList.contains('iframe-host')) {
      const nested = layer.querySelector('.stage.nested');
      if (nested) {
        nested.querySelectorAll(':scope > .layer.active').forEach((nl) => {
          if (nl.dataset.tag === 'scene') fillLayerBackground(ctx, nl, outW, outH);
          const nImg = nl.querySelector(':scope > img');
          const nVid = nl.querySelector(':scope > video');
          if (nVid && nVid.readyState >= 2) drawContained(ctx, nVid, outW, outH);
          else if (nImg && nImg.complete) drawContained(ctx, nImg, outW, outH);
          else if (
            nl.classList.contains('text') ||
            nl.dataset.tag === 'text' ||
            nl.dataset.tag === 'p'
          ) {
            drawTextLayer(ctx, nl, outW, outH);
          }
        });
      }
    }
  }

  /**
   * Export compositor — do NOT mirror DOM opacity onto a black canvas per-layer
   * (that causes dark mid-fades or bright double-text flashes).
   *
   * Instead: render each top-level scene stack fully (content opacities only) to
   * an offscreen buffer, then source-over composite stacks:
   *   bottom stacks at alpha 1, topmost at its scene fade alpha
   * → A*(1-t)+B*t during crossfade, matching a proper dissolve.
   */
  function captureStageFrame(outW, outH) {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outW, outH);

    const ms = currentMs;
    /** @type {Map<any, { scene: any, fade: number, z: number, items: { layer: HTMLElement, node: any, z: number }[] }>} */
    const groups = new Map();

    flatNodes.forEach((node, index) => {
      if (node.tag === 'ai-generate' || node.tag === 'ai-filter' || node.tag === 'ai-subtitle') {
        return;
      }
      if (!isVisuallyActive(node, ms)) return;
      const layer = layerMap.get(nodeKey(node, index));
      if (!layer || !layer.classList.contains('active')) return;

      const scene = isTopLevelScene(node) ? node : findTopLevelParent(node);
      const groupKey = scene || node;
      let g = groups.get(groupKey);
      if (!g) {
        const fadeScene = scene || node;
        const fade =
          fadeScene.tag === 'scene' ? transitionVisual(fadeScene, ms).opacity : 1;
        g = {
          scene: fadeScene,
          fade: Number.isFinite(fade) ? fade : 1,
          z: parseInt(layer.style.zIndex || '0', 10) || 0,
          items: [],
        };
        groups.set(groupKey, g);
      }
      const z = parseInt(layer.style.zIndex || '0', 10) || 0;
      if (z > g.z) g.z = z;
      g.items.push({ layer: layer, node: node, z: z });
    });

    const ordered = Array.from(groups.values()).sort(function (a, b) {
      if (a.scene.startMs !== b.scene.startMs) return a.scene.startMs - b.scene.startMs;
      return a.z - b.z;
    });

    ordered.forEach(function (g, gi) {
      g.items.sort(function (a, b) {
        return a.z - b.z;
      });

      const off = document.createElement('canvas');
      off.width = outW;
      off.height = outH;
      const octx = off.getContext('2d');
      octx.clearRect(0, 0, outW, outH);

      g.items.forEach(function (item) {
        const op = contentOpacity(item.node, ms);
        octx.save();
        octx.globalAlpha = Math.max(0, Math.min(1, op));
        paintLayer(octx, item.layer, outW, outH);
        octx.restore();
      });

      // Multi-scene overlap: keep lower scenes solid, fade only the topmost in.
      // Single scene: use its fade (allows fade-to-black at the end).
      let alpha = g.fade;
      if (ordered.length >= 2) {
        alpha = gi === ordered.length - 1 ? g.fade : 1;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    });

    return canvas;
  }

  function canvasToJpegUint8(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error('Frame capture failed'));
            return;
          }
          resolve(new Uint8Array(await blob.arrayBuffer()));
        },
        'image/jpeg',
        quality
      );
    });
  }

  async function loadFfmpeg() {
    if (ffmpegInstance) return ffmpegInstance;
    // Same-origin ESM so Worker(./worker.js) is not blocked by CDN CORS.
    const { FFmpeg } = await import('./vendor/ffmpeg/index.js');
    const { toBlobURL } = await import('./vendor/util/index.js');
    const coreBase = new URL('./vendor/core/', window.location.href).href;
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }) => {
      if (message) console.debug('[ffmpeg]', message);
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(coreBase + 'ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL(coreBase + 'ffmpeg-core.wasm', 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  }


  function setExportOverlay(visible, title, detail) {
    if (!exportOverlay) return;
    if (visible) {
      exportOverlay.hidden = false;
      exportOverlay.setAttribute('aria-busy', 'true');
      document.documentElement.classList.add('htmlv-exporting');
    } else {
      exportOverlay.hidden = true;
      exportOverlay.setAttribute('aria-busy', 'false');
      document.documentElement.classList.remove('htmlv-exporting');
    }
    if (exportOverlayTitle && title != null) exportOverlayTitle.textContent = title;
    if (exportOverlayDetail && detail != null) exportOverlayDetail.textContent = detail;
  }

  async function downloadExport() {
    if (!ir || exporting) return;
    exporting = true;
    pausePlay();
    const resumeMs = currentMs;
    const defaultLabel = 'Download';
    if (btnDownload) {
      btnDownload.disabled = true;
      btnDownload.textContent = 'Encoding…';
    }
    setExportOverlay(true, 'Encoding…', 'Preparing');

    try {
      const metaFps = ir.meta.framerate || 30;
      const fps = Math.min(30, Math.max(24, metaFps >= 24 ? metaFps : 30));
      const aspect = parseAspect(ir.meta.aspectRatio);
      const outW = Math.min(854, ir.meta.width || 854);
      const outH = Math.round(outW / aspect) & ~1;
      const durationMs = ir.meta.durationMs || 0;
      const frameCount = Math.max(1, Math.ceil((durationMs / 1000) * fps));

      setExportOverlay(true, 'Loading…', 'ffmpeg.wasm');
      if (btnDownload) btnDownload.textContent = 'Loading…';
      const ffmpeg = await loadFfmpeg();

      for (let i = 0; i < frameCount; i++) {
        const t = Math.min(durationMs, (i / fps) * 1000);
        await seekToExportFrame(t);
        const canvas = captureStageFrame(outW, outH);
        const data = await canvasToJpegUint8(canvas, 0.92);
        const name = 'frame' + String(i).padStart(5, '0') + '.jpg';
        await ffmpeg.writeFile(name, data);
        if (i % 2 === 0 || i === frameCount - 1) {
          const pct = Math.round(((i + 1) / frameCount) * 70);
          const msg = 'Frames ' + (i + 1) + '/' + frameCount;
          setExportOverlay(true, 'Rendering…', msg + ' · ' + pct + '%');
          if (btnDownload) btnDownload.textContent = 'Rendering… ' + pct + '%';
        }
      }

      setExportOverlay(true, 'Encoding…', 'Writing MP4');
      if (btnDownload) btnDownload.textContent = 'Encoding…';
      try {
        await ffmpeg.exec([
          '-framerate',
          String(fps),
          '-i',
          'frame%05d.jpg',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          'out.mp4',
        ]);
      } catch (encodeErr) {
        console.warn('libx264 failed, trying mpeg4', encodeErr);
        setExportOverlay(true, 'Encoding…', 'Fallback encoder');
        await ffmpeg.exec([
          '-framerate',
          String(fps),
          '-i',
          'frame%05d.jpg',
          '-c:v',
          'mpeg4',
          '-qscale:v',
          '5',
          'out.mp4',
        ]);
      }

      setExportOverlay(true, 'Saving…', 'Download starting');
      const out = await ffmpeg.readFile('out.mp4');
      const bytes = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const base =
        (ir.meta.title || 'htmlv').replace(/[^\w\-]+/g, '_').replace(/^_|_$/g, '') || 'htmlv';
      a.href = url;
      a.download = base + '.mp4';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      for (let i = 0; i < frameCount; i++) {
        try {
          await ffmpeg.deleteFile('frame' + String(i).padStart(5, '0') + '.jpg');
        } catch (_) {}
      }
      try {
        await ffmpeg.deleteFile('out.mp4');
      } catch (_) {}

      if (btnDownload) btnDownload.textContent = 'Done';
      setExportOverlay(true, 'Done', 'Download ready');
    } catch (err) {
      console.error('htmlv export failed', err);
      alert('Export failed: ' + (err && err.message ? err.message : String(err)));
      if (btnDownload) btnDownload.textContent = defaultLabel;
    } finally {
      exporting = false;
      setExportOverlay(false, '', '');
      if (btnDownload) btnDownload.disabled = false;
      seekTo(resumeMs);
      if (btnDownload) {
        const t = btnDownload.textContent;
        if (t === 'Done') {
          setTimeout(() => {
            if (btnDownload) btnDownload.textContent = defaultLabel;
          }, 1000);
        } else if (t !== defaultLabel) {
          btnDownload.textContent = defaultLabel;
        }
      }
    }
  }

  function installDomShim() {
    const virtual = {
      querySelector(sel) {
        return virtual.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        flatNodes.forEach((node) => {
          if (matchSel(sel, node)) out.push(wrapNode(node));
        });
        return out;
      },
      getElementById(id) {
        const n = flatNodes.find((x) => x.id === id);
        return n ? wrapNode(n) : null;
      },
    };

    function matchSel(sel, node) {
      sel = sel.trim();
      if (sel.startsWith('#')) return node.id === sel.slice(1);
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return (node.className || '').split(/\s+/).includes(cls);
      }
      return node.tag === sel.toLowerCase();
    }

    function wrapNode(node) {
      return {
        getAttribute(name) {
          if (name === 'src') return node.src;
          if (name === 'id') return node.id;
          if (name === 'class') return node.className;
          return node.styles[name];
        },
        setAttribute(name, value) {
          if (name === 'src') node.src = value;
          else if (name === 'id') node.id = value;
          else if (name === 'class') node.className = value;
          else node.styles[name] = value;
          renderFrame(currentMs);
        },
        get style() {
          return node.styles;
        },
        get textContent() {
          return node.text || '';
        },
        set textContent(v) {
          node.text = v;
          renderFrame(currentMs);
        },
      };
    }

    window.htmlvDocument = virtual;
    const realQS = document.querySelector.bind(document);
    const realQSA = document.querySelectorAll.bind(document);
    document.querySelector = function (sel) {
      if (sel.startsWith('htmlv ') || sel.startsWith('@')) {
        return virtual.querySelector(sel.replace(/^htmlv |^@/, ''));
      }
      return realQS(sel) || virtual.querySelector(sel);
    };
    document.querySelectorAll = function (sel) {
      const a = realQSA(sel);
      if (a.length) return a;
      return virtual.querySelectorAll(sel);
    };
    const realGEBI = document.getElementById.bind(document);
    document.getElementById = function (id) {
      return realGEBI(id) || virtual.getElementById(id);
    };
  }

  function runScripts() {
    if (!ir.scripts || !ir.scripts.length) return;
    for (const code of ir.scripts) {
      if (!code || !String(code).trim()) continue;
      try {
        const fn = new Function('htmlv', 'document', code);
        fn(htmlvApi, document);
      } catch (e) {
        console.error('htmlv script error', e);
      }
    }
  }

  function applyStageSize() {
    const ar = parseAspect(ir.meta.aspectRatio);
    stage.style.setProperty('--stage-ar', String(ar));
    stage.style.aspectRatio = String(ar);
    stage.style.width = '';
    stage.style.height = '';
  }

  function loadIr(data) {
    ir = data;
    window.__HTMLV_IR__ = data;
    docTitle.textContent = ir.meta.title || 'Untitled';
    document.title = (ir.meta.title || 'htmlv') + ' — player';
    applyStageSize();
    buildChrome();
    ensureLayers();
    installDomShim();
    runScripts();
    currentMs = 0;
    renderFrame(0);
  }

  // #region agent log
  window.__htmlvCaptureFrame = captureStageFrame;
  // #endregion

  btnPlay.addEventListener('click', () => {
    if (playing) pausePlay();
    else startPlay();
  });

  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      downloadExport();
    });
  }

  if (btnToggleSource) {
    btnToggleSource.addEventListener('click', () => {
      const collapsed = !appEl.classList.contains('source-collapsed');
      setSourceCollapsed(collapsed);
    });
  }
  if (btnShowSource) {
    btnShowSource.addEventListener('click', () => setSourceCollapsed(false));
  }

  seek.addEventListener('input', () => {
    const duration = ir.meta.durationMs || 1;
    seekTo((parseInt(seek.value, 10) / 1000) * duration);
  });

  document.addEventListener('keydown', (e) => {
    if (exporting) {
      e.preventDefault();
      return;
    }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (playing) pausePlay();
      else startPlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seekTo(currentMs - 1000);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      seekTo(currentMs + 1000);
    }
  });

  async function boot() {
    if (!window.__HTMLV_SOURCE_TEXT__) {
      try {
        const srcRes = await fetch('source.htmlv');
        if (srcRes.ok) window.__HTMLV_SOURCE_TEXT__ = await srcRes.text();
      } catch (_) {}
    }
    if (ir) {
      loadIr(ir);
      return;
    }
    try {
      const res = await fetch('timeline.json');
      if (res.ok) {
        loadIr(await res.json());
        return;
      }
    } catch (_) {}
    docTitle.textContent = 'No timeline loaded';
  }

  boot();
})();
