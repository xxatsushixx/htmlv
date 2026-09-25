#!/usr/bin/env node
/**
 * Copy @ffmpeg packages into player/vendor for same-origin Workers.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'player', 'vendor');

function rimraf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

const packs = [
  ['node_modules/@ffmpeg/ffmpeg/dist/esm', 'ffmpeg'],
  ['node_modules/@ffmpeg/util/dist/esm', 'util'],
  ['node_modules/@ffmpeg/core/dist/esm', 'core'],
];

rimraf(vendor);
fs.mkdirSync(vendor, { recursive: true });

for (const [fromRel, name] of packs) {
  const from = path.join(root, fromRel);
  if (!fs.existsSync(from)) {
    console.error('Missing', fromRel, '— run npm install');
    process.exit(1);
  }
  copyDir(from, path.join(vendor, name));
}

console.log('Copied ffmpeg vendor → player/vendor/{ffmpeg,util,core}');
