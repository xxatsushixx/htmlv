/**
 * Compiles an htmlv AST into Timeline IR.
 */

import {
  ASTNode,
  ASTNodeType,
  DocumentNode,
  ElementNode,
  TextNode,
} from '../parser/ASTNode';
import {
  TimelineIR,
  TimelineNode,
  DocumentMeta,
  AiHookIR,
  TimePosition,
  CompileMode,
  FramerateMode,
} from './ir';
import {
  parseStyleAttribute,
  parseStylesheet,
  parseTransition,
  resolveTimeMs,
  collectMatchingStyles,
  parseFramerate,
  CssRule,
} from './style';

/** Decode common HTML entities in text nodes (e.g. &lt;sequence&gt; → <sequence>). */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

export interface CompileOptions {
  /** Resolve linked CSS / nested htmlv relative to this directory */
  baseDir?: string;
  /** Read file contents for linked resources */
  readFile?: (path: string) => string | null;
  /** Compile nested iframe documents */
  compileNested?: (source: string, baseDir: string) => TimelineIR | null;
}

export class Compiler {
  private cssRules: CssRule[] = [];
  private scripts: string[] = [];
  private stylesheets: string[] = [];
  private meta: DocumentMeta = {
    title: '',
    framerate: 30,
    framerateMode: 'drop-frames',
    compileMode: 'precompile',
    aspectRatio: '16:9',
    width: 1280,
    seed: null,
    durationMs: 0,
  };
  private options: CompileOptions = {};
  private idCounter = 0;

  public compile(ast: DocumentNode, options: CompileOptions = {}): TimelineIR {
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

    const html = this.findElement(ast.children, 'html') ?? this.wrapAsHtml(ast);
    const head = this.findElement(html.children, 'head');
    const body = this.findElement(html.children, 'body') ?? html;

    if (head) this.ingestHead(head);
    this.ingestBodyScripts(body);

    const sceneEls = body.children.filter(
      (c): c is ElementNode =>
        c.type === ASTNodeType.Element && (c as ElementNode).tagName === 'scene'
    );

    // First pass durations: use declared time-length or estimate
    const scenes: TimelineNode[] = [];
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

  private wrapAsHtml(ast: DocumentNode): ElementNode {
    return new ElementNode('html', [], ast.children);
  }

  private ingestHead(head: ElementNode): void {
    for (const child of head.children) {
      if (child.type !== ASTNodeType.Element) continue;
      const el = child as ElementNode;
      if (el.tagName === 'title') {
        this.meta.title = this.collectText(el).trim();
      } else if (el.tagName === 'meta') {
        const name = el.getAttribute('name')?.toLowerCase();
        const content = el.getAttribute('content') ?? '';
        if (name === 'framerate') this.meta.framerate = parseFramerate(content);
        else if (name === 'framerate-mode') {
          this.meta.framerateMode = (
            content === 'slowdown' ? 'slowdown' : 'drop-frames'
          ) as FramerateMode;
        } else if (name === 'compile-mode') {
          this.meta.compileMode = (
            content === 'compile-during-playback'
              ? 'compile-during-playback'
              : 'precompile'
          ) as CompileMode;
        } else if (name === 'seed') this.meta.seed = content;
        else if (name === 'aspect-ratio') this.meta.aspectRatio = content;
        else if (name === 'width') {
          const w = parseInt(content, 10);
          if (!Number.isNaN(w)) this.meta.width = w;
        }
      } else if (el.tagName === 'style') {
        const css = this.collectText(el);
        this.stylesheets.push(css);
        this.cssRules.push(...parseStylesheet(css));
      } else if (el.tagName === 'link') {
        const rel = el.getAttribute('rel');
        const href = el.getAttribute('href');
        if (rel === 'stylesheet' && href && this.options.readFile) {
          const path = this.resolvePath(href);
          const css = this.options.readFile(path);
          if (css) {
            this.stylesheets.push(css);
            this.cssRules.push(...parseStylesheet(css));
          }
        }
      } else if (el.tagName === 'script') {
        this.ingestScript(el);
      }
    }
  }

  /** Collect `<script>` elements that are direct children of body (not inside scenes). */
  private ingestBodyScripts(body: ElementNode): void {
    for (const child of body.children) {
      if (child.type !== ASTNodeType.Element) continue;
      const el = child as ElementNode;
      if (el.tagName === 'script') this.ingestScript(el);
    }
  }

  private ingestScript(el: ElementNode): void {
    const src = el.getAttribute('src');
    if (src && this.options.readFile) {
      const code = this.options.readFile(this.resolvePath(src));
      if (code) this.scripts.push(code);
    } else {
      this.scripts.push(this.collectText(el));
    }
  }

  private resolvePath(href: string): string {
    if (!this.options.baseDir) return href;
    // simple join
    const base = this.options.baseDir.replace(/\/$/, '');
    if (href.startsWith('/')) return href;
    return `${base}/${href}`;
  }

  private compileScene(
    el: ElementNode,
    absoluteStartMs: number,
    parentDurationHint: number | null
  ): TimelineNode {
    const inline = parseStyleAttribute(el.getAttribute('style'));
    const id = el.getAttribute('id') ?? null;
    const className = el.getAttribute('class') ?? null;

    // Provisional duration from time-length or children estimate
    let declaredLength = resolveTimeMs(
      inline['time-length'],
      parentDurationHint ?? 10000,
      undefined
    );

    // Build children with a provisional parent length
    const provisionalParent = declaredLength ?? parentDurationHint ?? 10000;
    const { base: cssBase, timeRules: cssTime } = collectMatchingStyles(
      this.cssRules,
      el.tagName,
      className,
      id,
      provisionalParent
    );
    const styles = { ...cssBase, ...inline };
    declaredLength = resolveTimeMs(
      styles['time-length'],
      parentDurationHint ?? 10000,
      declaredLength
    );

    const transition = parseTransition(styles['scene-transition']);

    const childNodes = this.compileChildren(
      el,
      absoluteStartMs,
      declaredLength ?? 0
    );

    let endFromChildren = absoluteStartMs;
    for (const c of childNodes) {
      if (c.endMs > endFromChildren) endFromChildren = c.endMs;
    }

    const length =
      declaredLength !== undefined
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

  private compileChildren(
    parent: ElementNode,
    parentAbsStart: number,
    parentLength: number
  ): TimelineNode[] {
    const result: TimelineNode[] = [];
    let flowCursor = 0; // local ms

    for (const child of parent.children) {
      if (child.type === ASTNodeType.Comment) continue;
      if (child.type === ASTNodeType.Text) {
        const text = decodeHtmlEntities((child as TextNode).content);
        if (!text.trim()) continue;
        // anonymous text as <text>
        const anonStyles: Record<string, string> = {};
        if (!parentLength) anonStyles['time-length'] = '2s';
        const node = this.makeLeaf(
          'text',
          null,
          null,
          anonStyles,
          text.trim(),
          undefined,
          parentAbsStart,
          parentLength,
          flowCursor,
          'static'
        );
        result.push(node.node);
        if (node.advancesFlow) flowCursor = node.localEnd;
        continue;
      }
      if (child.type !== ASTNodeType.Element) continue;
      const el = child as ElementNode;
      const tag = el.tagName === 'image' ? 'img' : el.tagName;

      if (tag === 'ai-generate' || tag === 'ai-filter' || tag === 'ai-subtitle') {
        result.push(this.compileAi(el, parentAbsStart, parentLength, flowCursor));
        continue;
      }

      if (tag === 'scene') {
        const inline = parseStyleAttribute(el.getAttribute('style'));
        const pos = (inline['time-position'] as TimePosition) || 'static';
        let absStart: number;
        let localStart: number;
        if (pos === 'fixed') {
          absStart =
            resolveTimeMs(inline['time-start'], this.meta.durationMs || parentLength || 10000, 0) ?? 0;
          localStart = 0;
        } else {
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
        if (seq.advancesFlow) flowCursor = seq.localEnd;
        continue;
      }

      if (tag === 'iframe') {
        const iframe = this.compileIframe(el, parentAbsStart, parentLength, flowCursor);
        result.push(iframe.node);
        if (iframe.advancesFlow) flowCursor = iframe.localEnd;
        continue;
      }

      // text, video, audio, img, p, etc.
      const inline = parseStyleAttribute(el.getAttribute('style'));
      const id = el.getAttribute('id') ?? null;
      const className = el.getAttribute('class') ?? null;
      const { base: cssBase, timeRules } = collectMatchingStyles(
        this.cssRules,
        tag,
        className,
        id,
        parentLength || 10000
      );
      const styles = { ...cssBase, ...inline };
      const pos = (styles['time-position'] as TimePosition) || 'static';
      const text =
        tag === 'text' || tag === 'p' ? this.collectText(el).trim() : undefined;
      let src = el.getAttribute('src') ?? undefined;

      // Nested AI may provide src later — keep ai children as child nodes
      const aiChildren: TimelineNode[] = [];
      for (const c of el.children) {
        if (
          c.type === ASTNodeType.Element &&
          ['ai-generate', 'ai-filter', 'ai-subtitle'].includes(
            (c as ElementNode).tagName
          )
        ) {
          aiChildren.push(
            this.compileAi(c as ElementNode, parentAbsStart, parentLength, 0)
          );
        }
      }

      const made = this.makeLeaf(
        tag,
        id,
        className,
        styles,
        text,
        src,
        parentAbsStart,
        parentLength,
        flowCursor,
        pos,
        timeRules
      );
      if (aiChildren.length) {
        made.node.children = aiChildren;
        // copy first generate hook onto node
        const gen = aiChildren.find((a) => a.ai);
        if (gen?.ai) made.node.ai = gen.ai;
      }
      result.push(made.node);
      if (made.advancesFlow) flowCursor = made.localEnd;
    }

    return result;
  }

  private compileSequence(
    el: ElementNode,
    parentAbsStart: number,
    parentLength: number,
    flowCursor: number
  ): { node: TimelineNode; advancesFlow: boolean; localEnd: number } {
    const inline = parseStyleAttribute(el.getAttribute('style'));
    const id = el.getAttribute('id') ?? null;
    const className = el.getAttribute('class') ?? null;
    const { base: cssBase, timeRules } = collectMatchingStyles(
      this.cssRules,
      'sequence',
      className,
      id,
      parentLength || 10000
    );
    const styles = { ...cssBase, ...inline };
    const pos = (styles['time-position'] as TimePosition) || 'static';
    const localStart = this.resolveLocalStart(styles, pos, flowCursor, parentLength);
    const seqLength =
      resolveTimeMs(styles['time-length'], parentLength || 10000, undefined) ??
      (parentLength || 5000);

    const kids = el.children.filter(
      (c): c is ElementNode => c.type === ASTNodeType.Element
    );
    const allImages =
      kids.length > 0 && kids.every((k) => k.tagName === 'img' || k.tagName === 'image');

    const children: TimelineNode[] = [];
    if (allImages) {
      const slot = seqLength / kids.length;
      kids.forEach((k, i) => {
        const src = k.getAttribute('src') ?? undefined;
        children.push({
          id: k.getAttribute('id') ?? null,
          tag: 'img',
          className: k.getAttribute('class') ?? null,
          startMs: parentAbsStart + localStart + i * slot,
          endMs: parentAbsStart + localStart + (i + 1) * slot,
          src,
          styles: parseStyleAttribute(k.getAttribute('style')),
          timeRules: [],
          children: [],
        });
      });
    } else {
      let cursor = 0;
      for (const k of kids) {
        const tag = k.tagName === 'image' ? 'img' : k.tagName;
        const st = parseStyleAttribute(k.getAttribute('style'));
        const len =
          resolveTimeMs(st['time-length'], seqLength, undefined) ??
          seqLength / Math.max(kids.length, 1);
        const text =
          tag === 'text' || tag === 'p' ? this.collectText(k).trim() : undefined;
        children.push({
          id: k.getAttribute('id') ?? null,
          tag,
          className: k.getAttribute('class') ?? null,
          startMs: parentAbsStart + localStart + cursor,
          endMs: parentAbsStart + localStart + cursor + len,
          text,
          src: k.getAttribute('src') ?? undefined,
          styles: st,
          timeRules: [],
          children: [],
        });
        cursor += len;
      }
    }

    const node: TimelineNode = {
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

  private compileIframe(
    el: ElementNode,
    parentAbsStart: number,
    parentLength: number,
    flowCursor: number
  ): { node: TimelineNode; advancesFlow: boolean; localEnd: number } {
    const inline = parseStyleAttribute(el.getAttribute('style'));
    const id = el.getAttribute('id') ?? null;
    const className = el.getAttribute('class') ?? null;
    const styles = { ...inline };
    const pos = (styles['time-position'] as TimePosition) || 'static';
    const localStart = this.resolveLocalStart(styles, pos, flowCursor, parentLength);
    const length =
      resolveTimeMs(styles['time-length'], parentLength || 10000, undefined) ??
      (parentLength || 5000);
    const src = el.getAttribute('src') ?? undefined;
    let nested: TimelineIR | undefined;
    if (src && this.options.readFile && this.options.compileNested) {
      const path = this.resolvePath(src);
      const source = this.options.readFile(path);
      if (source) {
        const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '') : (this.options.baseDir ?? '.');
        nested = this.options.compileNested(source, dir) ?? undefined;
      }
    }
    const node: TimelineNode = {
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

  private compileAi(
    el: ElementNode,
    parentAbsStart: number,
    parentLength: number,
    flowCursor: number
  ): TimelineNode {
    const kind =
      el.tagName === 'ai-generate'
        ? 'generate'
        : el.tagName === 'ai-filter'
          ? 'filter'
          : 'subtitle';
    const ai: AiHookIR = {
      kind,
      type: el.getAttribute('type') ?? undefined,
      prompt: el.getAttribute('prompt') ?? undefined,
      target: el.getAttribute('target') ?? undefined,
      seed: el.getAttribute('seed') ?? this.meta.seed ?? undefined,
      api: el.getAttribute('api') ?? undefined,
      src: el.getAttribute('src') ?? undefined,
      language: el.getAttribute('language') ?? undefined,
    };
    return {
      id: el.getAttribute('id') ?? `ai-${this.idCounter++}`,
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

  private makeLeaf(
    tag: string,
    id: string | null,
    className: string | null,
    styles: Record<string, string>,
    text: string | undefined,
    src: string | undefined,
    parentAbsStart: number,
    parentLength: number,
    flowCursor: number,
    pos: TimePosition,
    timeRules: TimelineNode['timeRules'] = []
  ): { node: TimelineNode; advancesFlow: boolean; localEnd: number } {
    const isFixed = pos === 'fixed';
    const localStart = isFixed
      ? 0
      : this.resolveLocalStart(styles, pos, flowCursor, parentLength);
    // For fixed: time-start is on the root clock
    const rootStart = isFixed
      ? resolveTimeMs(styles['time-start'], this.meta.durationMs || parentLength || 10000, 0) ?? 0
      : null;

    let length = resolveTimeMs(styles['time-length'], parentLength || 10000, undefined);
    if (length === undefined && styles['time-end'] !== undefined) {
      const endRef = isFixed
        ? resolveTimeMs(styles['time-end'], this.meta.durationMs || 10000, undefined)
        : resolveTimeMs(styles['time-end'], parentLength || 10000, undefined);
      const startForEnd = isFixed ? (rootStart ?? 0) : localStart;
      if (endRef !== undefined) length = Math.max(0, endRef - startForEnd);
    }
    if (length === undefined) {
      length = tag === 'text' || tag === 'p' ? Math.min(3000, parentLength || 3000) : parentLength || 3000;
    }

    const marginStart =
      resolveTimeMs(styles['time-margin-start'] ?? styles['time-margin'], parentLength, 0) ?? 0;
    const marginEnd =
      resolveTimeMs(styles['time-margin-end'], parentLength, 0) ?? 0;
    const paddingStart =
      resolveTimeMs(styles['time-padding-start'], parentLength, 0) ?? 0;
    const paddingEnd =
      resolveTimeMs(styles['time-padding-end'] ?? styles['time-padding'], parentLength, 0) ?? 0;

    const contentDurationMs = Math.max(0, length + paddingStart + paddingEnd);
    const loopMode = (styles['loop'] || 'none').toLowerCase();

    let startMs: number;
    let endMs: number;
    let flowLocalEnd: number;

    if (isFixed) {
      startMs = (rootStart ?? 0) + marginStart + paddingStart;
      endMs = startMs + contentDurationMs - marginEnd;
      // Fill remaining document time when looping (best-effort; duration may grow later)
      if (loopMode === 'loop' || loopMode === 'flipflap' || loopMode === 'stretch') {
        const parentEnd = parentAbsStart + (parentLength || 0);
        if (parentEnd > endMs) endMs = parentEnd;
      }
      flowLocalEnd = localStart; // fixed does not advance flow
    } else {
      const adjustedStart = localStart + marginStart + paddingStart;
      let span = contentDurationMs - marginEnd;
      if (span < 0) span = 0;
      startMs = parentAbsStart + adjustedStart;
      endMs = parentAbsStart + adjustedStart + span;
      if (
        (loopMode === 'loop' || loopMode === 'flipflap' || loopMode === 'stretch') &&
        parentLength > 0
      ) {
        const parentEnd = parentAbsStart + parentLength;
        if (parentEnd > endMs) endMs = parentEnd;
      }
      flowLocalEnd = adjustedStart + span;
    }

    const node: TimelineNode = {
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

  private resolveLocalStart(
    styles: Record<string, string>,
    pos: TimePosition,
    flowCursor: number,
    parentLength: number
  ): number {
    if (pos === 'absolute') {
      return resolveTimeMs(styles['time-start'], parentLength || 10000, 0) ?? 0;
    }
    if (pos === 'fixed') {
      // Handled in makeLeaf against the root clock; unused for flow.
      return 0;
    }
    if (styles['time-start'] !== undefined) {
      const t = resolveTimeMs(styles['time-start'], parentLength || 10000, flowCursor);
      return t ?? flowCursor;
    }
    return flowCursor;
  }

  private findElement(nodes: ASTNode[], tag: string): ElementNode | null {
    for (const n of nodes) {
      if (n.type === ASTNodeType.Element && (n as ElementNode).tagName === tag) {
        return n as ElementNode;
      }
    }
    return null;
  }

  private collectText(el: ElementNode): string {
    let out = '';
    for (const c of el.children) {
      if (c.type === ASTNodeType.Text) out += (c as TextNode).content;
      else if (c.type === ASTNodeType.Element) out += this.collectText(c as ElementNode);
    }
    return decodeHtmlEntities(out);
  }
}
