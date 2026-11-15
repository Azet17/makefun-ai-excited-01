// ai-excited-01 entry (Node 22, standard library only).
// Copies the entry image beside this file to the output directory
// (MAKEFUN_OUTPUT_DIR, or /output by default) as entry.png.
// Deterministic: the output bytes are exactly the source bytes.
//
// Local run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'entry.png');
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outputPath = join(outputDir, 'entry.png');

if (!existsSync(sourcePath)) {
  throw new Error(`entry image not found: ${sourcePath}`);
}

mkdirSync(outputDir, { recursive: true });
const bytes = readFileSync(sourcePath);
writeFileSync(outputPath, bytes);

// Fail loudly if the copy is not byte-identical to the source.
const digest = (data) => createHash('sha256').update(data).digest('hex');
if (digest(readFileSync(outputPath)) !== digest(bytes)) {
  throw new Error(`output hash mismatch: ${outputPath} differs from ${sourcePath}`);
}
