# HTML for Video (htmlv)

**htmlv** is a markup language and toolchain for authoring time-based, interactive videos with HTML/CSS/JS-like syntax. This document is the normative language specification for the reference TypeScript implementation in this repository.

> Conformance levels and deferred features are listed in [Conformance](#conformance).

## Introduction

htmlv extends familiar web technologies with a **temporal layout model**: documents describe what appears on a fixed stage over time, not an infinitely scrolling page. Developers write `.htmlv` files; the toolchain parses them, compiles a **Timeline IR**, and plays the result in a **browser player**.

**For engineers building an online video editor:** treat htmlv as a **timeline runtime under your UI**—a temporal DOM, a compiled Timeline IR, and a browser preview engine—not a finished editor product. Your app owns tracks, assets, and collaboration; htmlv owns time layout, preview playback, and (later) encode. Server-side MP4/WebM output is deferred; the reference player is the integration surface today.

## Basic concepts

- **Fixed stage.** Layout uses a fixed aspect ratio (default 16:9). Content is positioned within that stage, not stacked into a scrollable document height.
- **Temporal DOM.** The document tree describes elements over time. Sibling scenes advance the timeline; nested scenes create hierarchical time scopes.
- **CSS and JavaScript.** Styling and scripting work like HTML, with additional time-based properties, the `:time()` pseudo-class, and a small DOM API for pre-play and runtime interaction.
- **Primary output.** The reference runtime is an interactive **browser player**. Server-side encode to MP4/WebM is a future extension (see [Deferred](#deferred-features)).

## Building an editor on htmlv

Use htmlv as the **preview substrate**. Emit `.htmlv` (or patch IR) from your editor state, compile, load the player, and sync the playhead with your timeline UI.

### Status

| Capability | Status |
|------------|--------|
| Browser preview runtime | **Required / shipping** |
| Timeline IR as interchange | **Shipping** |
| AI media | **HTTP `api` hook**; stub placeholder if omitted |
| Browser encode (Download) | **Shipping** via `ffmpeg.wasm` (stage raster → MP4) |
| Live mutate → full IR recompile | **Best-effort** (optional conformance) |
| Server encode (ffmpeg CLI) | **Deferred** |

### Editor → htmlv map

| Editor concept | htmlv |
|----------------|-------|
| Timeline / sequence of clips | Top-level `<scene>` siblings |
| Clip on a track | `video`, `audio`, `img`, `text`, `sequence` child |
| Overlay / lower-third | Child with `time-position: absolute` (+ `time-start` / `time-length`) |
| Transition between cuts | `scene-transition` on a scene |
| Nested composition / template | `<iframe src="other.htmlv">` or nested `<scene>` |
| Generative fill | `<ai-generate>` / `<ai-filter>` (+ optional `api`) |
| Preview clock | `htmlv.play()` / `pause()` / `seek(seconds)` + `timeupdate` |
| Persist / reopen project | Timeline IR JSON (`compileSource` / `compileFile` output) |

### Integration path

```text
Editor UI state  →  .htmlv (or IR patch)  →  compile  →  Timeline IR  →  player.load
                         ↑                                         │
                         └──────── seek / timeupdate / sceneenter ─┘
```

Library (Node or bundler):

```js
const { compileSource, compileFile } = require('htmlv');
// or: import { compileSource, compileFile } from 'htmlv';

const ir = compileSource(htmlvString);
// persist ir, or embed into player/ as window.__HTMLV_IR__
```

CLI preview while you build the editor shell:

```bash
npx htmlv serve examples/showcase.htmlv
# player: source + stage + track strip at http://127.0.0.1:4173/
```

In the player page (or an iframe you host):

```js
htmlv.play();
htmlv.seek(12.5);
htmlv.addEventListener('timeupdate', (e) => {
  // sync your timeline playhead: e.detail.currentTime (seconds)
});
```

---

## Document structure

An htmlv document must begin with `<!DOCTYPE htmlv>` (case-insensitive). The root element is `<html>`, containing optional `<head>` and required `<body>`.

Top-level children of `<body>` that participate in the timeline **must** be `<scene>` elements (in document order). Other body children are ignored for timeline layout unless specified otherwise.

### Minimal example

```html
<!DOCTYPE htmlv>
<html>
<head>
    <title>Sample Video</title>
    <meta name="framerate" content="30fps">
    <meta name="compile-mode" content="precompile">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <scene style="time-length: 10s; scene-transition: fade 2s;">
        <text class="title">Welcome to htmlv</text>
    </scene>
    <scene style="time-length: 15s;">
        <video src="intro.mp4" style="time-length: 100%;"></video>
        <scene style="time-length: 5s; time-start: 5s;">
            <text class="subtitle">Creating videos with code</text>
        </scene>
    </scene>
</body>
</html>
```

### Head metadata

| Meta `name` | `content` example | Meaning |
|-------------|-------------------|---------|
| `seed` | `12345` | Global default seed for AI caching |
| `framerate` | `30fps` | Target playback frame rate |
| `framerate-mode` | `slowdown` \| `drop-frames` | Behavior when the player cannot sustain the target rate |
| `compile-mode` | `precompile` \| `compile-during-playback` | When scenes are compiled to IR (see [Compilation](#compilation)) |
| `aspect-ratio` | `16:9` | Stage aspect ratio |
| `width` | `1920` | Optional stage width in CSS pixels (height derived from aspect) |

`<link rel="stylesheet">` and `<script src>` / inline `<script>` are supported as described in [CSS](#css-extensions) and [JavaScript](#javascript-dom-api).

---

## Elements

### `<scene>`

Defines a temporal segment. Nested `<scene>` elements create child timelines relative to the parent scene.

| Attribute | Description |
|-----------|-------------|
| `id` | Optional identifier for scripting and AI `target` |
| `class` | CSS classes |
| `style` | Includes time and transition properties |

**Children:** any flow content listed in this spec (`scene`, `text`, `video`, `audio`, `sequence`, `img`, `image`, `iframe`, AI elements, and ordinary text nodes treated as anonymous text).

**Default duration:** if `time-length` is omitted, duration is the maximum end time of children (at least 0s).

### `<text>`

Text content on the stage.

| Attribute | Description |
|-----------|-------------|
| `id`, `class`, `style` | Standard |
| (text children) | Character data is the displayed string |

### `<video>` / `<audio>`

Embed media clips.

| Attribute | Description |
|-----------|-------------|
| `src` | Media URL (required unless filled by a child AI element) |
| `id`, `class`, `style` | Standard |

Children may include `<ai-generate>` / `<ai-filter>` that supply or transform media before playback.

### `<sequence>`

Plays children in temporal order (or as discrete frames when children are images), packing them into the sequence’s `time-length`.

| Attribute | Description |
|-----------|-------------|
| `id`, `class`, `style` | Standard; `time-length` sets the total sequence window |

**Children:** `img`, `image`, `text`, `video`, `audio`, `p`, or nested content. Image-only children are treated as frame strips distributed across `time-length`. Mixed children are laid out sequentially using each child’s resolved duration.

### `<img>` / `<image>`

Still image on the stage. `<image>` is an alias of `<img>`.

| Attribute | Description |
|-----------|-------------|
| `src` | Image URL |
| `id`, `class`, `style` | Standard |

### `<iframe>`

Embeds another htmlv document. The referenced `.htmlv` is compiled to nested Timeline IR and played in a sub-stage.

| Attribute | Description |
|-----------|-------------|
| `src` | URL or path to an `.htmlv` document |
| `id`, `class`, `style` | Standard; time properties control when the embed is active |

### `<ai-generate>`

Requests generated media (text, image, audio, or video) from an HTTP API.

| Attribute | Description |
|-----------|-------------|
| `type` | MIME type, e.g. `image/png`, `video/mp4`, `text/plain` |
| `prompt` | Generation prompt |
| `target` | Optional element `id` to receive the result |
| `seed` | Cache key (falls back to document `seed` meta) |
| `api` | Optional API URL; if omitted, the player uses a stub placeholder |

When nested under `video`/`audio`/`img` without `target`, the result becomes that parent’s media source.

### `<ai-filter>`

Applies an AI transform to existing media.

| Attribute | Description |
|-----------|-------------|
| `type` | MIME type of the expected output |
| `prompt` | Filter instruction |
| `target` | Optional source element `id` (default: parent media) |
| `seed`, `api` | Same as `<ai-generate>` |

### `<ai-subtitle>`

Requests a transcription/subtitle track from audio or video.

| Attribute | Description |
|-----------|-------------|
| `src` | Media to transcribe (or inherit from parent) |
| `language` | BCP 47 language tag |
| `target` | Element `id` to receive subtitle text/cues |
| `seed`, `api` | Same as `<ai-generate>` |

---

## Time properties

Time is expressed as:

- Absolute: `10s`, `500ms`, `0`
- Percentage of **parent scene duration**: `50%`

### Canonical properties

| Property | Meaning |
|----------|---------|
| `time-length` | Duration of the element |
| `time-start` | Offset from the start of the parent scene’s content box |
| `time-end` | End offset within the parent (alternative to `time-length` when paired with `time-start`) |
| `time-position` | `static` (default) \| `relative` \| `absolute` \| `fixed` |
| `time-margin` | Shorthand: delay before natural start / trim after natural end |
| `time-margin-start`, `time-margin-end` | Individual margins |
| `time-padding` | Extend duration after content |
| `time-padding-start`, `time-padding-end` | Individual paddings |
| `easing` | Timing function name (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`) |
| `loop` | How to fill remaining parent time: `none` (default) \| `loop` \| `flipflap` \| `stretch` |
| `scene-transition` | See [Transitions](#transitions) |
| `text-display` | How text appears: `character` \| `word` \| `line` \| `block` (default) |
| `text-duration` | Duration over which `text-display` reveal runs |
| `framerate` | Per-element override of document framerate |

### Aliases (normalized at compile time)

| Alias | Canonical |
|-------|-----------|
| `start` | `time-start` |
| `end` | `time-end` |

Authors may use either form; the compiler stores only canonical names in IR.

### Time-position modes

- **`static`:** Auto-flow in document order. Each static sibling starts after the previous static sibling’s end (plus margins), unless `time-start` is set.
- **`relative`:** Like static, but `time-start` / margins adjust the auto position.
- **`absolute`:** Positioned solely by `time-start` / `time-end` / `time-length` relative to the parent content start; does not push siblings.
- **`fixed`:** Positioned relative to the **root timeline** (document playhead), ignoring parent offsets except for clipping to the parent’s active interval when nested.

### Time layout algorithm (normative outline)

For each scene S with resolved parent-local interval `[S0, S1)`:

1. Resolve S’s `time-length` (or infer from children).
2. Partition children into flow (`static`/`relative`) and out-of-flow (`absolute`/`fixed`).
3. Place flow children in tree order, applying `time-start` when present, else packing after the previous flow child’s end; apply margins/paddings.
4. Place absolute children from `time-start` within S; place fixed children on the root clock then clip to S’s active window for visibility.
5. Nested scenes repeat the algorithm with their local zero at their resolved `time-start`.

---

## Transitions

`scene-transition` applies between **sibling** scenes (exit of current / entry of next).

**Syntax:** `scene-transition: <effect> <duration>;`

- `<effect>`: `fade` \| `zoom` \| `dissolve` \| `flip3d` \| `iris` \| `wipe` \| `slide`
- `<duration>`: time value; a **negative** duration means a cut (instant switch) with no animation

The transition duration overlaps the boundary: half may belong to exit and half to entry as implemented by the player; total timeline length of the parent is not extended unless padding is used.

Unsupported effects in a given player version **must** fall back to `fade` with the same duration.

---

## Frame rate and compile mode

### Framerate

- Document default from `<meta name="framerate" content="30fps">` (default `30fps` if omitted).
- `framerate-mode: slowdown` — slow the clock to match achievable rate.
- `framerate-mode: drop-frames` — keep wall-clock time, skip frames (default).

### Compilation

| Mode | Behavior |
|------|----------|
| `precompile` (default) | Entire document compiles to Timeline IR before playback; the player builds all stage layers up front |
| `compile-during-playback` | The reference compiler still emits a full IR (so seeking and duration are known). The **player** lazily creates DOM layers as the playhead approaches each node (~2s prefetch). A future revision may also defer nested resource compilation |

---

## CSS extensions

### Pseudo-class `:time()`

```css
.logo:time(10s, 12s) {
  color: blue;
}
```

Applies the rule only while the **element-local** time is within `[start, end)`. Times may use `s` / `ms` / `%` of the element’s `time-length`.

### Stage-oriented CSS subset

The reference player honors: `color`, `background`, `background-color`, `opacity`, `font-*`, `width`, `height`, `top`, `left`, `right`, `bottom`, `transform`, `object-fit`, `text-align`, `z-index`, plus all htmlv time properties above. Full CSS layout (flex/grid/flow into scrollable pages) is **not** required.

### Example

```css
.logo {
  color: white;
  time-length: 30s;
  easing: linear;
}

.logo:time(10s, 12s) {
  color: blue;
}

.subtitle {
  text-display: character;
  text-duration: 5s;
  time-position: absolute;
  time-start: 10s;
}

scene, .scene {
  /* element type or class */
}
```

Note: use property `scene-transition` on scenes via inline style or a `scene` / class selector; there is no separate `scene { }` requirement beyond normal CSS.

---

## JavaScript DOM API

Scripts in `<head>` or `<body>` run in a **restricted player sandbox**.

### Phases

1. **Pre-play (init).** After IR load, before the clock starts: scripts may query and mutate the document tree (attributes, text, styles). Mutations are re-compiled into the active IR snapshot when possible.
2. **Runtime.** During playback, scripts may listen for events and adjust styles/visibility; structural edits may be limited.

### Minimal surface

```js
document.querySelector(selector)
document.querySelectorAll(selector)
document.getElementById(id)
element.getAttribute / setAttribute
element.style  // includes time-* canonical properties
element.textContent
htmlv.currentTime  // seconds
htmlv.duration
htmlv.play() / htmlv.pause() / htmlv.seek(seconds)
```

### Events

- `timeupdate` on `htmlv` / document
- `sceneenter` / `sceneleave` on scene elements
- `ended` when the root timeline completes

### Security

Scripts run only inside the player origin sandbox (typically an iframe with a generated document). There is no privileged filesystem access. AI `api` URLs are fetched by the player with ordinary CORS rules.

### Encode note

Future server-side encode **must** run only init-phase scripts and **must** disable interactive runtime APIs.

---

## Timeline IR (informative)

The compiler emits JSON IR approximately:

```json
{
  "version": 1,
  "meta": {
    "title": "Sample Video",
    "framerate": 30,
    "framerateMode": "drop-frames",
    "compileMode": "precompile",
    "aspectRatio": "16:9",
    "width": 1920,
    "seed": "12345",
    "durationMs": 25000
  },
  "scenes": [
    {
      "id": null,
      "tag": "scene",
      "startMs": 0,
      "endMs": 10000,
      "transition": { "effect": "fade", "durationMs": 2000 },
      "styles": {},
      "children": []
    }
  ],
  "stylesheets": [],
  "scripts": []
}
```

Each node includes `tag`, absolute `startMs`/`endMs`, resolved `styles`, optional `src`/`text`, `ai` hook metadata, and `children`.

---

## Toolchain

```bash
npm install
npm run build

# Compile to IR + player bundle (minimal sample)
npx htmlv build examples/example.htmlv -o out/

# Preview the editor-shaped showcase (source + stage + track strip)
npx htmlv serve examples/showcase.htmlv
```

Library entry: `parseSource` / `compileSource` / `compileFile` → Timeline IR; see `src/index.ts` and [Building an editor on htmlv](#building-an-editor-on-htmlv).

---

## Examples

### Scene with transition and time adjustments

```html
<scene style="scene-transition: fade 2s; time-length: 20s;">
    <image src="background.jpg" style="time-length: 20s;"></image>
    <text class="title" style="time-start: 2s;">Hello World</text>
</scene>
```

### AI-generated video from prompt

```html
<scene style="time-length: 10s;">
    <video style="width: 100%; height: 100%; time-length: 10s;">
      <ai-generate type="video/mp4" prompt="A serene landscape with mountains and a river at sunset" seed="7890"></ai-generate>
      <ai-filter type="video/mp4" prompt="Black and White" seed="7890"></ai-filter>
    </video>
</scene>
```

### Sequence

```html
<scene style="time-length: 5s;">
    <sequence style="time-length: 5s;">
      <img src="frame1.png">
      <img src="frame2.png">
      <img src="frame3.png">
      <text style="time-length: 2s;">Hello World</text>
    </sequence>
</scene>
```

### Nested htmlv document

```html
<iframe src="additional_content.htmlv" style="time-length: 10s;"></iframe>
```

---

## Conformance

### Required (reference player)

- DOCTYPE, html/head/body, scenes, text, video, audio, sequence, img/image, iframe
- Canonical time properties + aliases `start`/`end`
- Time-position modes and packing algorithm
- `scene-transition` with at least `fade`; other effects may fall back to `fade`
- Framerate meta and `drop-frames` mode
- `precompile` mode
- CSS subset + `:time()`
- Browser player with play/pause/seek
- AI elements as IR nodes with stub or HTTP hooks (network optional; placeholders required)

### Optional / best-effort

- `compile-during-playback`
- `framerate-mode: slowdown`
- All transition effects beyond `fade`
- Full JS mutation → live IR update
- Linked stylesheets with complex selectors

### Deferred features

- Server-side encode to MP4/WebM via native ffmpeg (CLI/CI)
- Bundled on-device AI models (HTTP API hooks only)
- Full CSS layout engines (flex/grid/scroll)

> **Browser Download:** the reference player can encode a preview MP4 in-browser with `ffmpeg.wasm` (rasterized stage frames). Prefer server encode for production quality and long timelines.

---

## License

MIT
