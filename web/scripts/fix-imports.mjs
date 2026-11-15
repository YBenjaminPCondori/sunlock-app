/**
 * Rewrite extensionless relative imports in compiled output so Node can run it.
 *
 * `tsc` is invoked with `--moduleResolution bundler` to type-check the browser
 * sources, which leaves `from "./selene"` in the emitted JavaScript. Node needs
 * `from "./selene.js"`. This used to be done with a chain of `sed -i '' ...`
 * commands, which only work with BSD sed and therefore failed on Windows and
 * Linux. Doing it in Node keeps every script portable.
 *
 * Usage: node scripts/fix-imports.mjs <file> [file...]
 */
import { readFileSync, writeFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/fix-imports.mjs <file> [file...]");
  process.exit(1);
}

// Only lowercase module basenames, and only when no extension is already there.
const EXTENSIONLESS = /(from\s+"\.\/)([a-z][a-z0-9]*)(?=")/g;

let changed = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const patched = source.replace(EXTENSIONLESS, "$1$2.js");
  if (patched !== source) {
    writeFileSync(file, patched);
    changed++;
  }
}

console.log(`fix-imports: ${files.length} file(s) checked, ${changed} rewritten`);
