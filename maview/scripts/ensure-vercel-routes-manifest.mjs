import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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

if (process.env.VERCEL === "1" && existsSync(deterministicManifest)) {
  const repoRootNextDir = resolve(projectRoot, "..", ".next");
  mkdirSync(repoRootNextDir, { recursive: true });
  copyFileSync(
    deterministicManifest,
    resolve(repoRootNextDir, "routes-manifest-deterministic.json"),
  );
}
