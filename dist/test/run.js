"use strict";
/**
 * Fixture tests for tokenizer, parser, and compiler.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const Tokenizer_1 = require("../parser/Tokenizer");
const Parser_1 = require("../parser/Parser");
const Token_1 = require("../parser/Token");
const pipeline_1 = require("../pipeline");
const ASTNode_1 = require("../parser/ASTNode");
let passed = 0;
let failed = 0;
function assert(cond, msg) {
    if (cond) {
        passed++;
        console.log('  ✓', msg);
    }
    else {
        failed++;
        console.error('  ✗', msg);
    }
}
function testTokenizer() {
    console.log('Tokenizer');
    const src = `<!DOCTYPE htmlv>\n<!-- c -->\n<html><scene style="time-length: 1s;">Hi</scene></html>`;
    const tokens = new Tokenizer_1.Tokenizer(src).tokenize();
    assert(tokens[0].type === Token_1.TokenType.DOCTYPE, 'DOCTYPE token');
    assert(tokens.some((t) => t.type === Token_1.TokenType.COMMENT), 'COMMENT token');
    assert(tokens.some((t) => t.type === Token_1.TokenType.TAG_OPEN && t.value === 'scene'), 'scene open');
    assert(tokens.some((t) => t.type === Token_1.TokenType.TAG_CLOSE_OPEN && t.value === 'scene'), 'scene close');
    assert(tokens[tokens.length - 1].type === Token_1.TokenType.EOF, 'EOF');
}
function testParserNesting() {
    console.log('Parser nesting');
    const ast = (0, pipeline_1.parseSource)(`<!DOCTYPE htmlv><html><body><scene><text>A</text><scene><text>B</text></scene></scene></body></html>`);
    const html = ast.children.find((c) => c.type === ASTNode_1.ASTNodeType.Element && c.tagName === 'html');
    assert(!!html, 'html root');
    const body = html.children.find((c) => c.type === ASTNode_1.ASTNodeType.Element && c.tagName === 'body');
    const scene = body.children.find((c) => c.type === ASTNode_1.ASTNodeType.Element && c.tagName === 'scene');
    assert(!!scene, 'outer scene');
    const nested = scene.children.filter((c) => c.type === ASTNode_1.ASTNodeType.Element && c.tagName === 'scene');
    assert(nested.length === 1, 'nested scene parsed');
}
function testExampleCompile() {
    var _a, _b;
    console.log('Compile example.htmlv');
    const example = path.join(__dirname, '..', '..', 'examples', 'example.htmlv');
    const ir = (0, pipeline_1.compileFile)(example);
    assert(ir.version === 1, 'IR version 1');
    assert(ir.scenes.length === 2, 'two top-level scenes');
    assert(ir.meta.durationMs === 18000, `duration 18000 (got ${ir.meta.durationMs})`);
    assert(ir.meta.framerate === 30, 'framerate 30');
    assert(ir.meta.title === 'Sample Video', 'title');
    assert(!!ir.scenes[0].transition && ir.scenes[0].transition.effect === 'fade', 'fade transition');
    assert(ir.stylesheets.length >= 1, 'inline stylesheet captured');
    const text = ir.scenes[0].children.find((c) => c.tag === 'text');
    assert(!!text && text.text === 'Welcome to htmlv', 'scene text content');
    assert(((_b = (_a = text === null || text === void 0 ? void 0 : text.timeRules) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) >= 1, ':time() rules on title');
}
function testAliasesAndAi() {
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
    const ir = (0, pipeline_1.compileSource)(src);
    assert(ir.scenes.length === 1, 'one scene');
    const text = ir.scenes[0].children.find((c) => c.tag === 'text');
    assert(!!text, 'text node');
    assert(text.startMs === 1000, `start alias → 1000ms (got ${text.startMs})`);
    const video = ir.scenes[0].children.find((c) => c.tag === 'video');
    assert(!!(video === null || video === void 0 ? void 0 : video.ai), 'ai hook on video');
    assert(video.ai.kind === 'generate' || video.children.some((c) => c.ai), 'generate present');
}
function testSequence() {
    console.log('Sequence');
    const src = `<!DOCTYPE htmlv><html><body>
<scene style="time-length: 5s;">
  <sequence style="time-length: 5s;">
    <img src="a.png" />
    <img src="b.png" />
  </sequence>
</scene>
</body></html>`;
    const ir = (0, pipeline_1.compileSource)(src);
    const seq = ir.scenes[0].children.find((c) => c.tag === 'sequence');
    assert(!!seq, 'sequence node');
    assert(seq.children.length === 2, 'two frames');
    assert(seq.children[0].endMs - seq.children[0].startMs === 2500, 'equal frame slots');
}
function testSelfClosing() {
    console.log('Self-closing');
    const tokens = new Tokenizer_1.Tokenizer(`<meta name="x" content="y" />`).tokenize();
    assert(tokens.some((t) => t.type === Token_1.TokenType.TAG_SELF_CLOSE), 'self close token');
    const ast = new Parser_1.Parser(tokens).parse();
    const meta = ast.children[0];
    assert(meta.tagName === 'meta', 'meta element');
    assert(meta.getAttribute('name') === 'x', 'meta name attr');
}
function testFullDemoAndIframe() {
    console.log('Full demo + iframe');
    const demo = path.join(__dirname, '..', '..', 'examples', 'full-demo.htmlv');
    const ir = (0, pipeline_1.compileFile)(demo);
    assert(ir.scenes.length === 3, 'three scenes in full-demo');
    assert(ir.scripts.length >= 1, 'head script collected');
    const iframe = ir.scenes[2].children.find((c) => c.tag === 'iframe');
    assert(!!iframe, 'iframe node');
    assert(!!iframe.nested, 'nested IR compiled');
    assert(iframe.nested.meta.title === 'Nested Clip', 'nested title');
}
function testBodyScriptFixedLoopMargins() {
    var _a;
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
    const ir = (0, pipeline_1.compileSource)(src);
    assert(ir.scripts.some((s) => s.includes('void 0')), 'body script collected');
    const loopText = ir.scenes[0].children.find((c) => c.text === 'Loop me');
    assert(!!loopText, 'loop text');
    assert(loopText.endMs === 10000, `loop fills parent (got ${loopText.endMs})`);
    assert(((_a = loopText.contentDurationMs) !== null && _a !== void 0 ? _a : 0) === 2000, 'contentDurationMs 2000');
    const fixed = ir.scenes[0].children.find((c) => c.id === 'fixed');
    assert(!!fixed, 'fixed text');
    assert(fixed.startMs === 1000, `fixed root start 1000 (got ${fixed.startMs})`);
    assert(fixed.clipStartMs === 0 && fixed.clipEndMs === 10000, 'fixed clip window');
    const margined = ir.scenes[0].children.find((c) => c.text === 'M');
    assert(!!margined, 'margined text');
    // start = 0 (after loop fills? wait - loop text advances flow to 10000!)
    // Actually loop text advances flow by its natural span before fill...
    // Looking at makeLeaf: advancesFlow uses adjustedStart + span BEFORE parent fill extension
    // for loop: span = contentDuration - marginEnd = 2000, flowLocalEnd = 2000
    // Then fixed doesn't advance. Then M starts at flowCursor after loop = 2000
    // M: marginStart 500 + paddingStart 100 = start offset 2600 from parent? 
    // adjustedStart = 2000 + 500 + 100 = 2600, content = 1000+100+200=1300, marginEnd 250 → span 1050
    assert(margined.startMs === 2600, `margin/padding start (got ${margined.startMs})`);
    const audio = ir.scenes[0].children.find((c) => c.tag === 'audio');
    assert(!!audio && audio.src === 'a.mp3', 'audio node');
}
function main() {
    testTokenizer();
    testParserNesting();
    testSelfClosing();
    testExampleCompile();
    testAliasesAndAi();
    testSequence();
    testFullDemoAndIframe();
    testBodyScriptFixedLoopMargins();
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0)
        process.exit(1);
}
main();
