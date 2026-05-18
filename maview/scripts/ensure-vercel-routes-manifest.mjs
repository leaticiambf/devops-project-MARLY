import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const buildDir = resolve(projectRoot, ".next");
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
  const repoRoot = resolve(projectRoot, "..");
  const repoRootNextDir = resolve(projectRoot, "..", ".next");
  rmSync(repoRootNextDir, { recursive: true, force: true });
  mkdirSync(repoRootNextDir, { recursive: true });
  cpSync(buildDir, repoRootNextDir, { recursive: true });

  const repoRootNodeModules = resolve(repoRoot, "node_modules");
  if (!existsSync(repoRootNodeModules)) {
    symlinkSync(resolve(projectRoot, "node_modules"), repoRootNodeModules, "dir");
  }
}
