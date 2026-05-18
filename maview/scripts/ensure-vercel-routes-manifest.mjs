import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const manifest = resolve(projectRoot, ".next", "routes-manifest.json");
const deterministicManifest = resolve(
  projectRoot,
  ".next",
  "routes-manifest-deterministic.json",
);

if (existsSync(manifest) && !existsSync(deterministicManifest)) {
  copyFileSync(manifest, deterministicManifest);
}
