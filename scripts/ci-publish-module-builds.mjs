#!/usr/bin/env node
/**
 * Build & push optional CRM module images (Docker Buildx). Writes module-manifest-addon.json for manifest merge.
 * Env: VERSION, REGISTRY (ghcr.io), IMAGE_NAMESPACE, REPO_ROOT, MODULES_CSV (comma slugs from resolve-modules-csv)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VERSION = process.env.VERSION ?? "";
const REGISTRY = (process.env.REGISTRY ?? "ghcr.io").replace(/\/$/, "");
const NS = process.env.IMAGE_NAMESPACE ?? "koskrut";
const ROOT = process.env.REPO_ROOT ?? process.cwd();
const MODULES_CSV = process.env.MODULES_CSV ?? "";

const MAP = {
  outbound: {
    target: "outbound-runner",
    imageName: "crm-module-outbound",
    role: "module_outbound",
    moduleCode: "ext.voice_outbound",
    serviceName: "backend-outbound",
    compose: ["compose.modules.outbound.yml", "compose.modules.outbound-sidecar.yml"],
  },
  "google-sheet": {
    target: "google-sheet-runner",
    imageName: "crm-module-google-sheet",
    role: "module",
    moduleCode: "int.google_sheet",
    serviceName: "backend-google-sheet",
    // Upstream URL for core `backend` is in this sidecar overlay; avoid listing
    // compose.modules.google-sheet.yml (optional thin file) so CP composeFiles match install bundles.
    compose: ["compose.modules.google-sheet-sidecar.yml"],
  },
  ringostat: {
    target: "ringostat-runner",
    imageName: "crm-module-ringostat",
    role: "module",
    moduleCode: "int.ringostat",
    serviceName: "backend-ringostat",
    compose: ["compose.modules.ringostat.yml", "compose.modules.ringostat-sidecar.yml"],
  },
  bitrix: {
    target: "bitrix-runner",
    imageName: "crm-module-bitrix",
    role: "module",
    moduleCode: "int.bitrix",
    serviceName: "backend-bitrix",
    compose: ["compose.modules.bitrix.yml", "compose.modules.bitrix-sidecar.yml"],
  },
  np: {
    target: "np-runner",
    imageName: "crm-module-np",
    role: "module",
    moduleCode: "int.nova_poshta",
    serviceName: "backend-np",
    compose: ["compose.modules.np.yml", "compose.modules.np-sidecar.yml"],
  },
  finance: {
    target: "finance-runner",
    imageName: "crm-module-finance",
    role: "module",
    moduleCode: "ext.finance",
    serviceName: "backend-finance",
    compose: ["compose.modules.finance.yml", "compose.modules.finance-sidecar.yml"],
  },
  planning: {
    target: "planning-runner",
    imageName: "crm-module-planning",
    role: "module",
    moduleCode: "ext.production_planning",
    serviceName: "backend-planning",
    compose: ["compose.modules.planning.yml", "compose.modules.planning-sidecar.yml"],
  },
};

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
}

function dockerDigest(imageUri) {
  // buildx ≥0.13+: format root is tplInput with .Name / .Manifest / .Image — not .Digest (see docker docs).
  const jsonRaw = execFileSync(
    "docker",
    ["buildx", "imagetools", "inspect", imageUri, "--format", "{{json .Manifest}}"],
    { encoding: "utf8", cwd: ROOT },
  ).trim();
  try {
    const doc = JSON.parse(jsonRaw);
    let digest = typeof doc?.digest === "string" ? doc.digest : "";
    if (!digest && Array.isArray(doc?.manifests)) {
      const amd = doc.manifests.find((m) => m?.platform?.architecture === "amd64" && m?.platform?.os === "linux");
      digest = (amd ?? doc.manifests[0])?.digest ?? "";
    }
    if (/^sha256:[a-fA-F0-9]{64}$/.test(digest)) return digest;
  } catch {
    // fall through to text parse
  }
  const text = execFileSync("docker", ["buildx", "imagetools", "inspect", imageUri, "--format", "{{.Manifest}}"], {
    encoding: "utf8",
    cwd: ROOT,
  });
  const m = text.match(/Digest:\s*(sha256:[a-fA-F0-9]{64})/);
  if (m?.[1] && /^sha256:[a-fA-F0-9]{64}$/.test(m[1])) return m[1];
  throw new Error(`Could not read digest for ${imageUri} (json=${jsonRaw.slice(0, 200)}…)`);
}

const slugs = MODULES_CSV.split(",").map((s) => s.trim()).filter(Boolean);
const addon = { images: [], composeFiles: [], moduleCodes: [] };

for (const slug of slugs) {
  const spec = MAP[slug];
  if (!spec) {
    console.error(`Unknown slug: ${slug}`);
    process.exit(1);
  }
  const tag = `${REGISTRY}/${NS}/${spec.imageName}:${VERSION}`;
  run("docker", [
    "buildx",
    "build",
    "--push",
    "--target",
    spec.target,
    "-f",
    "apps/backend/Dockerfile",
    "-t",
    tag,
    "--build-arg",
    `IMAGE_VERSION=${VERSION}`,
    "--build-arg",
    `VCS_REF=${process.env.GIT_SHA ?? "unknown"}`,
    "--build-arg",
    `CRM_RELEASE_VERSION=${VERSION}`,
    "--build-arg",
    `GIT_SHA=${process.env.GIT_SHA ?? "unknown"}`,
    "--build-arg",
    `BUILD_TIME=${process.env.BUILD_TIME ?? new Date().toISOString()}`,
    "--build-arg",
    `IMAGE_TAG=${tag}`,
    ".",
  ]);
  const digest = dockerDigest(tag);
  addon.images.push({
    role: spec.role,
    serviceName: spec.serviceName,
    moduleCode: spec.moduleCode,
    imageRepository: `${REGISTRY}/${NS}/${spec.imageName}`.toLowerCase(),
    imageTag: VERSION,
    imageDigest: digest,
  });
  addon.moduleCodes.push(spec.moduleCode);
  for (const cf of spec.compose) {
    const abs = path.join(ROOT, cf);
    if (!fs.existsSync(abs)) {
      console.error(`Missing compose file referenced for module "${slug}": ${cf}`);
      process.exit(1);
    }
    if (!addon.composeFiles.includes(cf)) addon.composeFiles.push(cf);
  }
}

const outPath = path.join(ROOT, "module-manifest-addon.json");
fs.writeFileSync(outPath, `${JSON.stringify(addon, null, 2)}\n`);
console.log(`Wrote ${outPath} (${addon.images.length} module image(s))`);
