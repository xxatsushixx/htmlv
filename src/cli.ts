#!/usr/bin/env node
/**
 * htmlv CLI — build and serve Timeline IR + browser player.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { compileFile } from './pipeline';
import { Runtime } from './runtime/Runtime';

function printHelp(): void {
  console.log(`htmlv — HTML for Video

Usage:
  htmlv build <file.htmlv> [-o outDir]
  htmlv serve <file.htmlv> [--port 4173]
  htmlv help
`);
}

function findPlayerDir(): string {
  const candidates = [
    path.join(__dirname, '..', 'player'),
    path.join(__dirname, '..', '..', 'player'),
    path.join(process.cwd(), 'player'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  throw new Error('Could not find player/ directory');
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyPlayer(outDir: string): void {
  const playerDir = findPlayerDir();
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of ['index.html', 'player.css', 'player.js']) {
    fs.copyFileSync(path.join(playerDir, file), path.join(outDir, file));
  }
  for (const dir of ['vendor', 'themes']) {
    const src = path.join(playerDir, dir);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, path.join(outDir, dir));
    }
  }
}

function embedIrInHtml(
  html: string,
  irJson: string,
  sourceLabel: string,
  sourceText: string
): string {
  let out = html.replace(
    /window\.__HTMLV_IR__\s*=\s*null\s*;?/,
    `window.__HTMLV_IR__ = ${irJson};`
  );
  const srcLit = JSON.stringify(sourceLabel);
  out = out.replace(
    /window\.__HTMLV_SOURCE__\s*=\s*null\s*;?/,
    `window.__HTMLV_SOURCE__ = ${srcLit};`
  );
  const textLit = JSON.stringify(sourceText);
  if (/window\.__HTMLV_SOURCE_TEXT__\s*=/.test(out)) {
    out = out.replace(
      /window\.__HTMLV_SOURCE_TEXT__\s*=\s*null\s*;?/,
      `window.__HTMLV_SOURCE_TEXT__ = ${textLit};`
    );
  } else {
    out = out.replace(
      /window\.__HTMLV_SOURCE__\s*=/,
      `window.__HTMLV_SOURCE_TEXT__ = ${textLit};\n    window.__HTMLV_SOURCE__ =`
    );
  }
  return out;
}

export function build(input: string, outDir: string): void {
  const ir = compileFile(input);
  const runtime = new Runtime();
  const json = runtime.toJSON(ir);
  const resolved = path.resolve(input);
  const sourceText = fs.readFileSync(resolved, 'utf-8');

  copyPlayer(outDir);
  // Copy sibling assets/ next to the .htmlv so relative img/video srcs resolve in preview
  const assetsSrc = path.join(path.dirname(resolved), 'assets');
  if (fs.existsSync(assetsSrc) && fs.statSync(assetsSrc).isDirectory()) {
    copyDirRecursive(assetsSrc, path.join(outDir, 'assets'));
  }
  fs.writeFileSync(path.join(outDir, 'timeline.json'), json, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'source.htmlv'), sourceText, 'utf-8');

  const indexPath = path.join(outDir, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf-8');
  const sourceLabel = path.relative(process.cwd(), resolved) || path.basename(input);
  html = embedIrInHtml(html, json, sourceLabel.replace(/\\/g, '/'), sourceText);
  fs.writeFileSync(indexPath, html, 'utf-8');

  console.log(`Built ${outDir}/ (${ir.meta.durationMs}ms, ${ir.scenes.length} scenes)`);
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return 'application/javascript; charset=utf-8';
  }
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

export function serve(input: string, port: number): void {
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

export function main(argv: string[] = process.argv.slice(2)): void {
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
    if (oIdx !== -1 && argv[oIdx + 1]) outDir = argv[oIdx + 1];
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
    if (pIdx !== -1 && argv[pIdx + 1]) port = parseInt(argv[pIdx + 1], 10);
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
