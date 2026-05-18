#!/usr/bin/env node
/*
 * Workaround for yarn 3 + node-modules linker occasionally leaving CLI
 * entry scripts non-executable, which breaks Gradle's invokeLibraryCodegen
 * Exec task and other shell invocations. Touch the binaries that the build
 * pipeline actually spawns so a fresh install is immediately usable.
 */
const fs = require('node:fs');
const path = require('node:path');

const targets = [
  '@react-native-community/cli/build/bin.js',
  'react-native-builder-bob/lib/bin.js',
  'metro/src/cli.js',
  'metro-symbolicate/src/index.js',
];

const root = path.resolve(__dirname, '..');
for (const rel of targets) {
  const file = path.join(root, 'node_modules', rel);
  try {
    fs.chmodSync(file, 0o755);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`fix-bin-permissions: ${file}: ${err.message}\n`);
    }
  }
}
