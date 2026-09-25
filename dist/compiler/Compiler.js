"use strict";
/**
 * Compiles an htmlv AST into Timeline IR.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Compiler = void 0;
const ASTNode_1 = require("../parser/ASTNode");
const style_1 = require("./style");
class Compiler {
    constructor() {
        this.cssRules = [];
        this.scripts = [];
        this.stylesheets = [];
        this.meta = {
            title: '',
            framerate: 30,
            framerateMode: 'drop-frames',
            compileMode: 'precompile',
            aspectRatio: '16:9',
            width: 1280,
            seed: null,
            durationMs: 0,
        };
        this.options = {};
        this.idCounter = 0;
    }
    compile(ast, options = {}) {
        var _a, _b;
        this.options = options;
        this.cssRules = [];
        this.scripts = [];
        this.stylesheets = [];
        this.idCounter = 0;
        this.meta = {
            title: '',
            framerate: 30,
            framerateMode: 'drop-frames',
            compileMode: 'precompile',
            aspectRatio: '16:9',
            width: 1280,
            seed: null,
            durationMs: 0,
        };
        const html = (_a = this.findElement(ast.children, 'html')) !== null && _a !== void 0 ? _a : this.wrapAsHtml(ast);
        const head = this.findElement(html.children, 'head');
        const body = (_b = this.findElement(html.children, 'body')) !== null && _b !== void 0 ? _b : html;
        if (head)
            this.ingestHead(head);
        this.ingestBodyScripts(body);
        const sceneEls = body.children.filter((c) => c.type === ASTNode_1.ASTNodeType.Element && c.tagName === 'scene');
        // First pass durations: use declared time-length or estimate
        const scenes = [];
        let cursor = 0;
        for (const sceneEl of sceneEls) {
            const node = this.compileScene(sceneEl, cursor, null);
            scenes.push(node);
            cursor = node.endMs;
        }
        this.meta.durationMs = cursor;
        return {
            version: 1,
            meta: this.meta,
            scenes,
            stylesheets: this.stylesheets,
            scripts: this.scripts,
        };
    }
    wrapAsHtml(ast) {
        return new ASTNode_1.ElementNode('html', [], ast.children);
    }
    ingestHead(head) {
        var _a, _b;
        for (const child of head.children) {
            if (child.type !== ASTNode_1.ASTNodeType.Element)
                continue;
            const el = child;
            if (el.tagName === 'title') {
                this.meta.title = this.collectText(el).trim();
            }
            else if (el.tagName === 'meta') {
                const name = (_a = el.getAttribute('name')) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                const content = (_b = el.getAttribute('content')) !== null && _b !== void 0 ? _b : '';
                if (name === 'framerate')
                    this.meta.framerate = (0, style_1.parseFramerate)(content);
                else if (name === 'framerate-mode') {
                    this.meta.framerateMode = (content === 'slowdown' ? 'slowdown' : 'drop-frames');
                }
                else if (name === 'compile-mode') {
                    this.meta.compileMode = (content === 'compile-during-playback'
                        ? 'compile-during-playback'
                        : 'precompile');
                }
                else if (name === 'seed')
                    this.meta.seed = content;
                else if (name === 'aspect-ratio')
                    this.meta.aspectRatio = content;
                else if (name === 'width') {
                    const w = parseInt(content, 10);
                    if (!Number.isNaN(w))
                        this.meta.width = w;
                }
            }
            else if (el.tagName === 'style') {
                const css = this.collectText(el);
                this.stylesheets.push(css);
                this.cssRules.push(...(0, style_1.parseStylesheet)(css));
            }
            else if (el.tagName === 'link') {
                const rel = el.getAttribute('rel');
                const href = el.getAttribute('href');
                if (rel === 'stylesheet' && href && this.options.readFile) {
                    const path = this.resolvePath(href);
                    const css = this.options.readFile(path);
                    if (css) {
                        this.stylesheets.push(css);
                        this.cssRules.push(...(0, style_1.parseStylesheet)(css));
                    }
                }
            }
            else if (el.tagName === 'script') {
                this.ingestScript(el);
            }
        }
    }
    /** Collect `<script>` elements that are direct children of body (not inside scenes). */
    ingestBodyScripts(body) {
        for (const child of body.children) {
            if (child.type !== ASTNode_1.ASTNodeType.Element)
                continue;
            const el = child;
            if (el.tagName === 'script')
                this.ingestScript(el);
        }
    }
    ingestScript(el) {
        const src = el.getAttribute('src');
        if (src && this.options.readFile) {
            const code = this.options.readFile(this.resolvePath(src));
            if (code)
                this.scripts.push(code);
        }
        else {
            this.scripts.push(this.collectText(el));
        }
    }
    resolvePath(href) {
        if (!this.options.baseDir)
            return href;
        // simple join
        const base = this.options.baseDir.replace(/\/$/, '');
        if (href.startsWith('/'))
            return href;
        return `${base}/${href}`;
    }
    compileScene(el, absoluteStartMs, parentDurationHint) {
        var _a, _b, _c;
        const inline = (0, style_1.parseStyleAttribute)(el.getAttribute('style'));
        const id = (_a = el.getAttribute('id')) !== null && _a !== void 0 ? _a : null;
        const className = (_b = el.getAttribute('class')) !== null && _b !== void 0 ? _b : null;
        // Provisional duration from time-length or children estimate
        let declaredLength = (0, style_1.resolveTimeMs)(inline['time-length'], parentDurationHint !== null && parentDurationHint !== void 0 ? parentDurationHint : 10000, undefined);
        // Build children with a provisional parent length
        const provisionalParent = (_c = declaredLength !== null && declaredLength !== void 0 ? declaredLength : parentDurationHint) !== null && _c !== void 0 ? _c : 10000;
        const { base: cssBase, timeRules: cssTime } = (0, style_1.collectMatchingStyles)(this.cssRules, el.tagName, className, id, provisionalParent);
        const styles = { ...cssBase, ...inline };
        declaredLength = (0, style_1.resolveTimeMs)(styles['time-length'], parentDurationHint !== null && parentDurationHint !== void 0 ? parentDurationHint : 10000, declaredLength);
        const transition = (0, style_1.parseTransition)(styles['scene-transition']);
        const childNodes = this.compileChildren(el, absoluteStartMs, declaredLength !== null && declaredLength !== void 0 ? declaredLength : 0);
        let endFromChildren = absoluteStartMs;
        for (const c of childNodes) {
            if (c.endMs > endFromChildren)
                endFromChildren = c.endMs;
        }
        const length = declaredLength !== undefined
            ? declaredLength
            : Math.max(0, endFromChildren - absoluteStartMs);
        // Re-resolve % times if we now know length — simplify: keep first pass
        const startMs = absoluteStartMs;
        const endMs = absoluteStartMs + length;
        // Fix up time rules against real length
        const timeRules = cssTime.map((r) => ({
            ...r,
            startMs: Math.min(r.startMs, length),
            endMs: Math.min(r.endMs, length),
        }));
        return {
            id,
            tag: 'scene',
            className,
            startMs,
            endMs,
            styles,
            timeRules,
            transition,
            children: childNodes,
        };
    }
    compileChildren(parent, parentAbsStart, parentLength) {
        var _a, _b, _c, _d;
        const result = [];
        let flowCursor = 0; // local ms
        for (const child of parent.children) {
            if (child.type === ASTNode_1.ASTNodeType.Comment)
                continue;
            if (child.type === ASTNode_1.ASTNodeType.Text) {
                const text = child.content;
                if (!text.trim())
                    continue;
                // anonymous text as <text>
                const anonStyles = {};
                if (!parentLength)
                    anonStyles['time-length'] = '2s';
                const node = this.makeLeaf('text', null, null, anonStyles, text.trim(), undefined, parentAbsStart, parentLength, flowCursor, 'static');
                result.push(node.node);
                if (node.advancesFlow)
                    flowCursor = node.localEnd;
                continue;
            }
            if (child.type !== ASTNode_1.ASTNodeType.Element)
                continue;
            const el = child;
            const tag = el.tagName === 'image' ? 'img' : el.tagName;
            if (tag === 'ai-generate' || tag === 'ai-filter' || tag === 'ai-subtitle') {
                result.push(this.compileAi(el, parentAbsStart, parentLength, flowCursor));
                continue;
            }
            if (tag === 'scene') {
                const inline = (0, style_1.parseStyleAttribute)(el.getAttribute('style'));
                const pos = inline['time-position'] || 'static';
                let absStart;
                let localStart;
                if (pos === 'fixed') {
                    absStart =
                        (_a = (0, style_1.resolveTimeMs)(inline['time-start'], this.meta.durationMs || parentLength || 10000, 0)) !== null && _a !== void 0 ? _a : 0;
                    localStart = 0;
                }
                else {
                    localStart = this.resolveLocalStart(inline, pos, flowCursor, parentLength);
                    absStart = parentAbsStart + localStart;
                }
                const scene = this.compileScene(el, absStart, parentLength);
                const length = scene.endMs - scene.startMs;
                scene.startMs = absStart;
                scene.endMs = absStart + length;
                if (pos === 'fixed') {
                    scene.clipStartMs = parentAbsStart;
                    scene.clipEndMs = parentAbsStart + (parentLength || 0);
                }
                result.push(scene);
                if (pos === 'static' || pos === 'relative') {
                    flowCursor = localStart + length;
                }
                continue;
            }
            if (tag === 'sequence') {
                const seq = this.compileSequence(el, parentAbsStart, parentLength, flowCursor);
                result.push(seq.node);
                if (seq.advancesFlow)
                    flowCursor = seq.localEnd;
                continue;
            }
            if (tag === 'iframe') {
                const iframe = this.compileIframe(el, parentAbsStart, parentLength, flowCursor);
                result.push(iframe.node);
                if (iframe.advancesFlow)
                    flowCursor = iframe.localEnd;
                continue;
            }
            // text, video, audio, img, p, etc.
            const inline = (0, style_1.parseStyleAttribute)(el.getAttribute('style'));
            const id = (_b = el.getAttribute('id')) !== null && _b !== void 0 ? _b : null;
            const className = (_c = el.getAttribute('class')) !== null && _c !== void 0 ? _c : null;
            const { base: cssBase, timeRules } = (0, style_1.collectMatchingStyles)(this.cssRules, tag, className, id, parentLength || 10000);
            const styles = { ...cssBase, ...inline };
            const pos = styles['time-position'] || 'static';
            const text = tag === 'text' || tag === 'p' ? this.collectText(el).trim() : undefined;
            let src = (_d = el.getAttribute('src')) !== null && _d !== void 0 ? _d : undefined;
            // Nested AI may provide src later — keep ai children as child nodes
            const aiChildren = [];
            for (const c of el.children) {
                if (c.type === ASTNode_1.ASTNodeType.Element &&
                    ['ai-generate', 'ai-filter', 'ai-subtitle'].includes(c.tagName)) {
                    aiChildren.push(this.compileAi(c, parentAbsStart, parentLength, 0));
                }
            }
            const made = this.makeLeaf(tag, id, className, styles, text, src, parentAbsStart, parentLength, flowCursor, pos, timeRules);
            if (aiChildren.length) {
                made.node.children = aiChildren;
                // copy first generate hook onto node
                const gen = aiChildren.find((a) => a.ai);
                if (gen === null || gen === void 0 ? void 0 : gen.ai)
                    made.node.ai = gen.ai;
            }
            result.push(made.node);
            if (made.advancesFlow)
                flowCursor = made.localEnd;
        }
        return result;
    }
    compileSequence(el, parentAbsStart, parentLength, flowCursor) {
        var _a, _b, _c, _d, _e, _f, _g;
        const inline = (0, style_1.parseStyleAttribute)(el.getAttribute('style'));
        const id = (_a = el.getAttribute('id')) !== null && _a !== void 0 ? _a : null;
        const className = (_b = el.getAttribute('class')) !== null && _b !== void 0 ? _b : null;
        const { base: cssBase, timeRules } = (0, style_1.collectMatchingStyles)(this.cssRules, 'sequence', className, id, parentLength || 10000);
        const styles = { ...cssBase, ...inline };
        const pos = styles['time-position'] || 'static';
        const localStart = this.resolveLocalStart(styles, pos, flowCursor, parentLength);
        const seqLength = (_c = (0, style_1.resolveTimeMs)(styles['time-length'], parentLength || 10000, undefined)) !== null && _c !== void 0 ? _c : (parentLength || 5000);
        const kids = el.children.filter((c) => c.type === ASTNode_1.ASTNodeType.Element);
        const allImages = kids.length > 0 && kids.every((k) => k.tagName === 'img' || k.tagName === 'image');
        const children = [];
        if (allImages) {
            const slot = seqLength / kids.length;
            kids.forEach((k, i) => {
                var _a, _b, _c;
                const src = (_a = k.getAttribute('src')) !== null && _a !== void 0 ? _a : undefined;
                children.push({
                    id: (_b = k.getAttribute('id')) !== null && _b !== void 0 ? _b : null,
                    tag: 'img',
                    className: (_c = k.getAttribute('class')) !== null && _c !== void 0 ? _c : null,
                    startMs: parentAbsStart + localStart + i * slot,
                    endMs: parentAbsStart + localStart + (i + 1) * slot,
                    src,
                    styles: (0, style_1.parseStyleAttribute)(k.getAttribute('style')),
                    timeRules: [],
                    children: [],
                });
            });
        }
        else {
            let cursor = 0;
            for (const k of kids) {
                const tag = k.tagName === 'image' ? 'img' : k.tagName;
                const st = (0, style_1.parseStyleAttribute)(k.getAttribute('style'));
                const len = (_d = (0, style_1.resolveTimeMs)(st['time-length'], seqLength, undefined)) !== null && _d !== void 0 ? _d : seqLength / Math.max(kids.length, 1);
                const text = tag === 'text' || tag === 'p' ? this.collectText(k).trim() : undefined;
                children.push({
                    id: (_e = k.getAttribute('id')) !== null && _e !== void 0 ? _e : null,
                    tag,
                    className: (_f = k.getAttribute('class')) !== null && _f !== void 0 ? _f : null,
                    startMs: parentAbsStart + localStart + cursor,
                    endMs: parentAbsStart + localStart + cursor + len,
                    text,
                    src: (_g = k.getAttribute('src')) !== null && _g !== void 0 ? _g : undefined,
                    styles: st,
                    timeRules: [],
                    children: [],
                });
                cursor += len;
            }
        }
        const node = {
            id,
            tag: 'sequence',
            className,
            startMs: parentAbsStart + localStart,
            endMs: parentAbsStart + localStart + seqLength,
            styles,
            timeRules,
            children,
        };
        const advancesFlow = pos === 'static' || pos === 'relative';
        return { node, advancesFlow, localEnd: localStart + seqLength };
    }
    compileIframe(el, parentAbsStart, parentLength, flowCursor) {
        var _a, _b, _c, _d, _e, _f;
        const inline = (0, style_1.parseStyleAttribute)(el.getAttribute('style'));
        const id = (_a = el.getAttribute('id')) !== null && _a !== void 0 ? _a : null;
        const className = (_b = el.getAttribute('class')) !== null && _b !== void 0 ? _b : null;
        const styles = { ...inline };
        const pos = styles['time-position'] || 'static';
        const localStart = this.resolveLocalStart(styles, pos, flowCursor, parentLength);
        const length = (_c = (0, style_1.resolveTimeMs)(styles['time-length'], parentLength || 10000, undefined)) !== null && _c !== void 0 ? _c : (parentLength || 5000);
        const src = (_d = el.getAttribute('src')) !== null && _d !== void 0 ? _d : undefined;
        let nested;
        if (src && this.options.readFile && this.options.compileNested) {
            const path = this.resolvePath(src);
            const source = this.options.readFile(path);
            if (source) {
                const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '') : ((_e = this.options.baseDir) !== null && _e !== void 0 ? _e : '.');
                nested = (_f = this.options.compileNested(source, dir)) !== null && _f !== void 0 ? _f : undefined;
            }
        }
        const node = {
            id,
            tag: 'iframe',
            className,
            startMs: parentAbsStart + localStart,
            endMs: parentAbsStart + localStart + length,
            src,
            styles,
            timeRules: [],
            children: [],
            nested,
        };
        return {
            node,
            advancesFlow: pos === 'static' || pos === 'relative',
            localEnd: localStart + length,
        };
    }
    compileAi(el, parentAbsStart, parentLength, flowCursor) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const kind = el.tagName === 'ai-generate'
            ? 'generate'
            : el.tagName === 'ai-filter'
                ? 'filter'
                : 'subtitle';
        const ai = {
            kind,
            type: (_a = el.getAttribute('type')) !== null && _a !== void 0 ? _a : undefined,
            prompt: (_b = el.getAttribute('prompt')) !== null && _b !== void 0 ? _b : undefined,
            target: (_c = el.getAttribute('target')) !== null && _c !== void 0 ? _c : undefined,
            seed: (_e = (_d = el.getAttribute('seed')) !== null && _d !== void 0 ? _d : this.meta.seed) !== null && _e !== void 0 ? _e : undefined,
            api: (_f = el.getAttribute('api')) !== null && _f !== void 0 ? _f : undefined,
            src: (_g = el.getAttribute('src')) !== null && _g !== void 0 ? _g : undefined,
            language: (_h = el.getAttribute('language')) !== null && _h !== void 0 ? _h : undefined,
        };
        return {
            id: (_j = el.getAttribute('id')) !== null && _j !== void 0 ? _j : `ai-${this.idCounter++}`,
            tag: el.tagName,
            className: null,
            startMs: parentAbsStart + flowCursor,
            endMs: parentAbsStart + (parentLength || flowCursor),
            styles: {},
            timeRules: [],
            ai,
            children: [],
        };
    }
    makeLeaf(tag, id, className, styles, text, src, parentAbsStart, parentLength, flowCursor, pos, timeRules = []) {
        var _a, _b, _c, _d, _e, _f, _g;
        const isFixed = pos === 'fixed';
        const localStart = isFixed
            ? 0
            : this.resolveLocalStart(styles, pos, flowCursor, parentLength);
        // For fixed: time-start is on the root clock
        const rootStart = isFixed
            ? (_a = (0, style_1.resolveTimeMs)(styles['time-start'], this.meta.durationMs || parentLength || 10000, 0)) !== null && _a !== void 0 ? _a : 0
            : null;
        let length = (0, style_1.resolveTimeMs)(styles['time-length'], parentLength || 10000, undefined);
        if (length === undefined && styles['time-end'] !== undefined) {
            const endRef = isFixed
                ? (0, style_1.resolveTimeMs)(styles['time-end'], this.meta.durationMs || 10000, undefined)
                : (0, style_1.resolveTimeMs)(styles['time-end'], parentLength || 10000, undefined);
            const startForEnd = isFixed ? (rootStart !== null && rootStart !== void 0 ? rootStart : 0) : localStart;
            if (endRef !== undefined)
                length = Math.max(0, endRef - startForEnd);
        }
        if (length === undefined) {
            length = tag === 'text' || tag === 'p' ? Math.min(3000, parentLength || 3000) : parentLength || 3000;
        }
        const marginStart = (_c = (0, style_1.resolveTimeMs)((_b = styles['time-margin-start']) !== null && _b !== void 0 ? _b : styles['time-margin'], parentLength, 0)) !== null && _c !== void 0 ? _c : 0;
        const marginEnd = (_d = (0, style_1.resolveTimeMs)(styles['time-margin-end'], parentLength, 0)) !== null && _d !== void 0 ? _d : 0;
        const paddingStart = (_e = (0, style_1.resolveTimeMs)(styles['time-padding-start'], parentLength, 0)) !== null && _e !== void 0 ? _e : 0;
        const paddingEnd = (_g = (0, style_1.resolveTimeMs)((_f = styles['time-padding-end']) !== null && _f !== void 0 ? _f : styles['time-padding'], parentLength, 0)) !== null && _g !== void 0 ? _g : 0;
        const contentDurationMs = Math.max(0, length + paddingStart + paddingEnd);
        const loopMode = (styles['loop'] || 'none').toLowerCase();
        let startMs;
        let endMs;
        let flowLocalEnd;
        if (isFixed) {
            startMs = (rootStart !== null && rootStart !== void 0 ? rootStart : 0) + marginStart + paddingStart;
            endMs = startMs + contentDurationMs - marginEnd;
            // Fill remaining document time when looping (best-effort; duration may grow later)
            if (loopMode === 'loop' || loopMode === 'flipflap' || loopMode === 'stretch') {
                const parentEnd = parentAbsStart + (parentLength || 0);
                if (parentEnd > endMs)
                    endMs = parentEnd;
            }
            flowLocalEnd = localStart; // fixed does not advance flow
        }
        else {
            const adjustedStart = localStart + marginStart + paddingStart;
            let span = contentDurationMs - marginEnd;
            if (span < 0)
                span = 0;
            startMs = parentAbsStart + adjustedStart;
            endMs = parentAbsStart + adjustedStart + span;
            if ((loopMode === 'loop' || loopMode === 'flipflap' || loopMode === 'stretch') &&
                parentLength > 0) {
                const parentEnd = parentAbsStart + parentLength;
                if (parentEnd > endMs)
                    endMs = parentEnd;
            }
            flowLocalEnd = adjustedStart + span;
        }
        const node = {
            id,
            tag,
            className,
            startMs,
            endMs,
            contentDurationMs,
            text,
            src,
            styles,
            timeRules,
            children: [],
        };
        if (isFixed) {
            node.clipStartMs = parentAbsStart;
            node.clipEndMs = parentAbsStart + (parentLength || 0);
        }
        const advancesFlow = pos === 'static' || pos === 'relative';
        return { node, advancesFlow, localEnd: flowLocalEnd };
    }
    resolveLocalStart(styles, pos, flowCursor, parentLength) {
        var _a;
        if (pos === 'absolute') {
            return (_a = (0, style_1.resolveTimeMs)(styles['time-start'], parentLength || 10000, 0)) !== null && _a !== void 0 ? _a : 0;
        }
        if (pos === 'fixed') {
            // Handled in makeLeaf against the root clock; unused for flow.
            return 0;
        }
        if (styles['time-start'] !== undefined) {
            const t = (0, style_1.resolveTimeMs)(styles['time-start'], parentLength || 10000, flowCursor);
            return t !== null && t !== void 0 ? t : flowCursor;
        }
        return flowCursor;
    }
    findElement(nodes, tag) {
        for (const n of nodes) {
            if (n.type === ASTNode_1.ASTNodeType.Element && n.tagName === tag) {
                return n;
            }
        }
        return null;
    }
    collectText(el) {
        let out = '';
        for (const c of el.children) {
            if (c.type === ASTNode_1.ASTNodeType.Text)
                out += c.content;
            else if (c.type === ASTNode_1.ASTNodeType.Element)
                out += this.collectText(c);
        }
        return out;
    }
}
exports.Compiler = Compiler;
