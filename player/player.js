/**
 * htmlv browser player — loads Timeline IR and plays on a fixed stage.
 */
(function () {
  'use strict';

  /** @type {any} */
  let ir = window.__HTMLV_IR__;
  const stage = document.getElementById('stage');
  const btnPlay = document.getElementById('btn-play');
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
      el.style.backgroundColor = node.styles['background-color'] || 'transparent';
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

  function transitionOpacity(node, ms) {
    if (!node.transition || !node.transition.durationMs) {
      return { opacity: 1, transform: '' };
    }
    const dur = Math.abs(node.transition.durationMs);
    if (node.transition.durationMs < 0) return { opacity: 1, transform: '' };
    const local = ms - node.startMs;
    const untilEnd = node.endMs - ms;
    const effect = node.transition.effect || 'fade';
    let opacity = 1;
    let transform = '';
    if (local < dur) opacity = Math.min(1, local / dur);
    if (untilEnd < dur) opacity = Math.min(opacity, Math.max(0, untilEnd / dur));
    if (effect === 'zoom') {
      if (local < dur) {
        const t = local / dur;
        transform = 'scale(' + (0.85 + 0.15 * t) + ')';
      } else if (untilEnd < dur) {
        const t = untilEnd / dur;
        transform = 'scale(' + (0.85 + 0.15 * t) + ')';
      }
    } else if (effect === 'slide') {
      if (local < dur) {
        const t = 1 - local / dur;
        transform = 'translateX(' + 40 * t + 'px)';
      } else if (untilEnd < dur) {
        const t = 1 - untilEnd / dur;
        transform = 'translateX(' + -40 * t + 'px)';
      }
    } else if (effect === 'wipe') {
      if (local < dur) {
        const t = local / dur;
        transform = 'translateX(' + (1 - t) * -100 + '%)';
      } else if (untilEnd < dur) {
        const t = untilEnd / dur;
        transform = 'translateX(' + (1 - t) * 100 + '%)';
      }
    } else if (effect === 'iris') {
      if (local < dur) {
        const t = local / dur;
        transform = 'scale(' + t + ')';
        opacity = t;
      } else if (untilEnd < dur) {
        const t = untilEnd / dur;
        transform = 'scale(' + t + ')';
        opacity = t;
      }
    } else if (effect === 'flip3d') {
      if (local < dur) {
        const t = local / dur;
        transform = 'perspective(600px) rotateY(' + (1 - t) * -90 + 'deg)';
      } else if (untilEnd < dur) {
        const t = untilEnd / dur;
        transform = 'perspective(600px) rotateY(' + (1 - t) * 90 + 'deg)';
      }
    } else if (effect === 'dissolve') {
      // softer fade already via opacity
    }
    return { opacity, transform };
  }

  function syncMedia(el, localContentMs, isPlaying) {
    const media = el.querySelector('video, audio');
    if (!media) return;
    const mediaLocal = localContentMs / 1000;
    if (Math.abs(media.currentTime - mediaLocal) > 0.3) {
      try {
        media.currentTime = mediaLocal;
      } catch (_) {}
    }
    if (isPlaying && media.paused && media.src) media.play().catch(() => {});
    if (!isPlaying && !media.paused) media.pause();
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

      const inRange = ms >= node.startMs && ms < node.endMs;
      const clipped = isClippedOut(node, ms);
      const active = inRange && !clipped;
      const localMs = ms - node.startMs;
      const contentLocal = loopedLocalMs(node, localMs);
      el.classList.toggle('active', active);
      el.style.display = active ? 'flex' : 'none';

      if (!active) {
        const vid = el.querySelector('video, audio');
        if (vid && !vid.paused) vid.pause();
        return;
      }

      let { opacity, transform } = transitionOpacity(node, ms);
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
            opacity = parseFloat(rule.styles.opacity);
          }
        }
      }
      el.style.opacity = String(opacity);
      if (transform) el.style.transform = transform;
      else if (!node.styles.transform) el.style.transform = '';

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
          el.style.backgroundColor = (node.styles && node.styles['background-color']) || 'transparent';
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
        return;
      }
      const nestedLocal = localMs - node.startMs;
      applyVisualStyles(el, node.styles, nestedLocal, node.timeRules);
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
    stage.style.aspectRatio = String(ar);
    stage.style.width = '100%';
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

  btnPlay.addEventListener('click', () => {
    if (playing) pausePlay();
    else startPlay();
  });

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
