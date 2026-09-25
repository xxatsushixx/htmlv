/**
 * Fixture tests for tokenizer, parser, and compiler.
 */

import * as path from 'path';
import { Tokenizer } from '../parser/Tokenizer';
import { Parser } from '../parser/Parser';
import { TokenType } from '../parser/Token';
import { compileFile, compileSource, parseSource } from '../pipeline';
import { ASTNodeType, ElementNode } from '../parser/ASTNode';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log('  ✓', msg);
  } else {
    failed++;
    console.error('  ✗', msg);
  }
}

function testTokenizer(): void {
  console.log('Tokenizer');
  const src = `<!DOCTYPE htmlv>\n<!-- c -->\n<html><scene style="time-length: 1s;">Hi</scene></html>`;
  const tokens = new Tokenizer(src).tokenize();
  assert(tokens[0].type === TokenType.DOCTYPE, 'DOCTYPE token');
  assert(tokens.some((t) => t.type === TokenType.COMMENT), 'COMMENT token');
  assert(tokens.some((t) => t.type === TokenType.TAG_OPEN && t.value === 'scene'), 'scene open');
  assert(tokens.some((t) => t.type === TokenType.TAG_CLOSE_OPEN && t.value === 'scene'), 'scene close');
  assert(tokens[tokens.length - 1].type === TokenType.EOF, 'EOF');
}

function testParserNesting(): void {
  console.log('Parser nesting');
  const ast = parseSource(
    `<!DOCTYPE htmlv><html><body><scene><text>A</text><scene><text>B</text></scene></scene></body></html>`
  );
  const html = ast.children.find(
    (c) => c.type === ASTNodeType.Element && (c as ElementNode).tagName === 'html'
  ) as ElementNode;
  assert(!!html, 'html root');
  const body = html.children.find(
    (c) => c.type === ASTNodeType.Element && (c as ElementNode).tagName === 'body'
  ) as ElementNode;
  const scene = body.children.find(
    (c) => c.type === ASTNodeType.Element && (c as ElementNode).tagName === 'scene'
  ) as ElementNode;
  assert(!!scene, 'outer scene');
  const nested = scene.children.filter(
    (c) => c.type === ASTNodeType.Element && (c as ElementNode).tagName === 'scene'
  );
  assert(nested.length === 1, 'nested scene parsed');
}

function testExampleCompile(): void {
  console.log('Compile example.htmlv');
  const example = path.join(__dirname, '..', '..', 'examples', 'example.htmlv');
  const ir = compileFile(example);
  assert(ir.version === 1, 'IR version 1');
  assert(ir.scenes.length === 2, 'two top-level scenes');
  assert(ir.meta.durationMs === 18000, `duration 18000 (got ${ir.meta.durationMs})`);
  assert(ir.meta.framerate === 30, 'framerate 30');
  assert(ir.meta.title === 'Sample Video', 'title');
  assert(!!ir.scenes[0].transition && ir.scenes[0].transition.effect === 'fade', 'fade transition');
  assert(ir.stylesheets.length >= 1, 'inline stylesheet captured');
  const text = ir.scenes[0].children.find((c) => c.tag === 'text');
  assert(!!text && text.text === 'Welcome to htmlv', 'scene text content');
  assert((text?.timeRules?.length ?? 0) >= 1, ':time() rules on title');
}

function testAliasesAndAi(): void {
  console.log('Aliases and AI');
  const src = `<!DOCTYPE htmlv>
<html><head><title>T</title></head><body>
<scene style="time-length: 5s;">
  <text style="start: 1s; end: 4s;">Hi</text>
  <video style="time-length: 5s;">
    <ai-generate type="video/mp4" prompt="cat" seed="1"></ai-generate>
    <ai-filter type="video/mp4" prompt="bw" seed="1"></ai-filter>
  </video>
</scene>
</body></html>`;
  const ir = compileSource(src);
  assert(ir.scenes.length === 1, 'one scene');
  const text = ir.scenes[0].children.find((c) => c.tag === 'text');
  assert(!!text, 'text node');
  assert(text!.startMs === 1000, `start alias → 1000ms (got ${text!.startMs})`);
  const video = ir.scenes[0].children.find((c) => c.tag === 'video');
  assert(!!video?.ai, 'ai hook on video');
  assert(video!.ai!.kind === 'generate' || video!.children.some((c) => c.ai), 'generate present');
}

function testSequence(): void {
  console.log('Sequence');
  const src = `<!DOCTYPE htmlv><html><body>
<scene style="time-length: 5s;">
  <sequence style="time-length: 5s;">
    <img src="a.png" />
    <img src="b.png" />
  </sequence>
</scene>
</body></html>`;
  const ir = compileSource(src);
  const seq = ir.scenes[0].children.find((c) => c.tag === 'sequence');
  assert(!!seq, 'sequence node');
  assert(seq!.children.length === 2, 'two frames');
  assert(seq!.children[0].endMs - seq!.children[0].startMs === 2500, 'equal frame slots');
}

function testSelfClosing(): void {
  console.log('Self-closing');
  const tokens = new Tokenizer(`<meta name="x" content="y" />`).tokenize();
  assert(tokens.some((t) => t.type === TokenType.TAG_SELF_CLOSE), 'self close token');
  const ast = new Parser(tokens).parse();
  const meta = ast.children[0] as ElementNode;
  assert(meta.tagName === 'meta', 'meta element');
  assert(meta.getAttribute('name') === 'x', 'meta name attr');
}

function testFullDemoAndIframe(): void {
  console.log('Full demo + iframe');
  const demo = path.join(__dirname, '..', '..', 'examples', 'full-demo.htmlv');
  const ir = compileFile(demo);
  assert(ir.scenes.length === 3, 'three scenes in full-demo');
  assert(ir.scripts.length >= 1, 'head script collected');
  const iframe = ir.scenes[2].children.find((c) => c.tag === 'iframe');
  assert(!!iframe, 'iframe node');
  assert(!!iframe!.nested, 'nested IR compiled');
  assert(iframe!.nested!.meta.title === 'Nested Clip', 'nested title');
}

function testBodyScriptFixedLoopMargins(): void {
  console.log('Body script, fixed, loop, margins');
  const src = `<!DOCTYPE htmlv>
<html><head><title>X</title></head><body>
<script>void 0;</script>
<scene style="time-length: 10s;">
  <text style="time-length: 2s; loop: loop;">Loop me</text>
  <text id="fixed" style="time-position: fixed; time-start: 1s; time-length: 2s;">Fixed</text>
  <text style="time-length: 1s; time-margin-start: 0.5s; time-margin-end: 0.25s; time-padding-start: 0.1s; time-padding-end: 0.2s;">M</text>
  <audio src="a.mp3" style="time-length: 3s;"></audio>
</scene>
</body></html>`;
  const ir = compileSource(src);
  assert(ir.scripts.some((s) => s.includes('void 0')), 'body script collected');
  const loopText = ir.scenes[0].children.find((c) => c.text === 'Loop me');
  assert(!!loopText, 'loop text');
  assert(loopText!.endMs === 10000, `loop fills parent (got ${loopText!.endMs})`);
  assert((loopText!.contentDurationMs ?? 0) === 2000, 'contentDurationMs 2000');
  const fixed = ir.scenes[0].children.find((c) => c.id === 'fixed');
  assert(!!fixed, 'fixed text');
  assert(fixed!.startMs === 1000, `fixed root start 1000 (got ${fixed!.startMs})`);
  assert(fixed!.clipStartMs === 0 && fixed!.clipEndMs === 10000, 'fixed clip window');
  const margined = ir.scenes[0].children.find((c) => c.text === 'M');
  assert(!!margined, 'margined text');
  // start = 0 (after loop fills? wait - loop text advances flow to 10000!)
  // Actually loop text advances flow by its natural span before fill...
  // Looking at makeLeaf: advancesFlow uses adjustedStart + span BEFORE parent fill extension
  // for loop: span = contentDuration - marginEnd = 2000, flowLocalEnd = 2000
  // Then fixed doesn't advance. Then M starts at flowCursor after loop = 2000
  // M: marginStart 500 + paddingStart 100 = start offset 2600 from parent? 
  // adjustedStart = 2000 + 500 + 100 = 2600, content = 1000+100+200=1300, marginEnd 250 → span 1050
  assert(margined!.startMs === 2600, `margin/padding start (got ${margined!.startMs})`);
  const audio = ir.scenes[0].children.find((c) => c.tag === 'audio');
  assert(!!audio && audio.src === 'a.mp3', 'audio node');
}

function main(): void {
  testTokenizer();
  testParserNesting();
  testSelfClosing();
  testExampleCompile();
  testAliasesAndAi();
  testSequence();
  testFullDemoAndIframe();
  testBodyScriptFixedLoopMargins();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
