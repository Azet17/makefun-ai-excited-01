// ai-excited-01 — "Make the AI judge excited"
// Copies the pre-generated entry image into the make.fun output directory.
// Deterministic: the output is a byte-for-byte copy of entry.png, every run.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, 'entry.png');

const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const destination = join(outputDir, 'entry.png');

if (!existsSync(source)) {
  throw new Error(`entry image not found: ${source}`);
}

mkdirSync(outputDir, { recursive: true });
copyFileSync(source, destination);

// Verify the copy is byte-for-byte identical to the source; fail loudly
// rather than handing make.fun a truncated or corrupted image.
const digest = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const sourceHash = digest(source);
const outputHash = digest(destination);
if (sourceHash !== outputHash) {
  throw new Error(
    `output hash mismatch: source ${sourceHash} != output ${outputHash}`,
  );
}

console.log(`wrote ${destination} (sha256 ${outputHash})`);
