#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cli = path.join(__dirname, '..', 'dist', 'cli.js');
if (fs.existsSync(cli)) {
  fs.chmodSync(cli, 0o755);
}
