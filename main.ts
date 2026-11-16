import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Copy the entry image into the output directory. The program runs
// twice and both runs must write the same bytes, so this is a plain
// byte-for-byte copy with a size check, nothing generated or random.
const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const source = join(here, "entry.png");
const target = join(outDir, "entry.png");

mkdirSync(outDir, { recursive: true });
copyFileSync(source, target);

if (statSync(source).size !== statSync(target).size) {
  throw new Error("entry.png copy is incomplete");
}
