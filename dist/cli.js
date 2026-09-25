#!/usr/bin/env node
"use strict";
/**
 * htmlv CLI — build and serve Timeline IR + browser player.
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
exports.build = build;
exports.serve = serve;
exports.main = main;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const pipeline_1 = require("./pipeline");
const Runtime_1 = require("./runtime/Runtime");
function printHelp() {
    console.log(`htmlv — HTML for Video

Usage:
  htmlv build <file.htmlv> [-o outDir]
  htmlv serve <file.htmlv> [--port 4173]
  htmlv help
`);
}
function findPlayerDir() {
    const candidates = [
        path.join(__dirname, '..', 'player'),
        path.join(__dirname, '..', '..', 'player'),
        path.join(process.cwd(), 'player'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'index.html')))
            return c;
    }
    throw new Error('Could not find player/ directory');
}
function copyPlayer(outDir) {
    const playerDir = findPlayerDir();
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of ['index.html', 'player.css', 'player.js']) {
        fs.copyFileSync(path.join(playerDir, file), path.join(outDir, file));
    }
}
function embedIrInHtml(html, irJson, sourceLabel, sourceText) {
    let out = html.replace(/window\.__HTMLV_IR__\s*=\s*null\s*;?/, `window.__HTMLV_IR__ = ${irJson};`);
    const srcLit = JSON.stringify(sourceLabel);
    out = out.replace(/window\.__HTMLV_SOURCE__\s*=\s*null\s*;?/, `window.__HTMLV_SOURCE__ = ${srcLit};`);
    const textLit = JSON.stringify(sourceText);
    if (/window\.__HTMLV_SOURCE_TEXT__\s*=/.test(out)) {
        out = out.replace(/window\.__HTMLV_SOURCE_TEXT__\s*=\s*null\s*;?/, `window.__HTMLV_SOURCE_TEXT__ = ${textLit};`);
    }
    else {
        out = out.replace(/window\.__HTMLV_SOURCE__\s*=/, `window.__HTMLV_SOURCE_TEXT__ = ${textLit};\n    window.__HTMLV_SOURCE__ =`);
    }
    return out;
}
function build(input, outDir) {
    const ir = (0, pipeline_1.compileFile)(input);
    const runtime = new Runtime_1.Runtime();
    const json = runtime.toJSON(ir);
    const resolved = path.resolve(input);
    const sourceText = fs.readFileSync(resolved, 'utf-8');
    copyPlayer(outDir);
    fs.writeFileSync(path.join(outDir, 'timeline.json'), json, 'utf-8');
    fs.writeFileSync(path.join(outDir, 'source.htmlv'), sourceText, 'utf-8');
    const indexPath = path.join(outDir, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');
    const sourceLabel = path.relative(process.cwd(), resolved) || path.basename(input);
    html = embedIrInHtml(html, json, sourceLabel.replace(/\\/g, '/'), sourceText);
    fs.writeFileSync(indexPath, html, 'utf-8');
    console.log(`Built ${outDir}/ (${ir.meta.durationMs}ms, ${ir.scenes.length} scenes)`);
}
function contentType(filePath) {
    if (filePath.endsWith('.html'))
        return 'text/html; charset=utf-8';
    if (filePath.endsWith('.js'))
        return 'application/javascript; charset=utf-8';
    if (filePath.endsWith('.css'))
        return 'text/css; charset=utf-8';
    if (filePath.endsWith('.json'))
        return 'application/json; charset=utf-8';
    if (filePath.endsWith('.svg'))
        return 'image/svg+xml';
    if (filePath.endsWith('.png'))
        return 'image/png';
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg'))
        return 'image/jpeg';
    if (filePath.endsWith('.mp4'))
        return 'video/mp4';
    return 'application/octet-stream';
}
function serve(input, port) {
    const outDir = path.join(path.dirname(path.resolve(input)), '.htmlv-preview');
    build(input, outDir);
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.join(outDir, urlPath === '/' ? 'index.html' : urlPath);
        if (!filePath.startsWith(outDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(data);
    });
    server.listen(port, () => {
        console.log(`htmlv player at http://127.0.0.1:${port}/`);
    });
}
function main(argv = process.argv.slice(2)) {
    const cmd = argv[0];
    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
        printHelp();
        return;
    }
    if (cmd === 'build') {
        const input = argv[1];
        if (!input) {
            console.error('Missing input file');
            process.exit(1);
        }
        let outDir = 'out';
        const oIdx = argv.indexOf('-o');
        if (oIdx !== -1 && argv[oIdx + 1])
            outDir = argv[oIdx + 1];
        build(input, outDir);
        return;
    }
    if (cmd === 'serve') {
        const input = argv[1];
        if (!input) {
            console.error('Missing input file');
            process.exit(1);
        }
        let port = 4173;
        const pIdx = argv.indexOf('--port');
        if (pIdx !== -1 && argv[pIdx + 1])
            port = parseInt(argv[pIdx + 1], 10);
        serve(input, port);
        return;
    }
    console.error('Unknown command:', cmd);
    printHelp();
    process.exit(1);
}
if (require.main === module) {
    main();
}
