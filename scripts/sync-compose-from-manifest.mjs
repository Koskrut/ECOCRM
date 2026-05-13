#!/usr/bin/env node
/**
 * Ensures every compose file listed in a Control Plane deployment manifest exists
 * under --root, downloading from manifest.composeFileUrls[filename] when missing.
 *
 * Usage: node scripts/sync-compose-from-manifest.mjs --manifest path/to/deployment-manifest.json --root /opt/crm
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  let manifestPath;
  let rootPath;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--manifest") manifestPath = argv[++i];
    else if (a === "--root") rootPath = argv[++i];
    else fail(`unknown arg: ${a}`);
  }
  if (!manifestPath) fail("missing --manifest");
  if (!rootPath) fail("missing --root");
  return { manifestPath, rootPath };
}

function downloadHttps(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmp = `${destPath}.part`;
    const file = fs.createWriteStream(tmp);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          res.resume();
          file.close(() => {
            fs.rm(tmp, () => {});
            if (!loc) reject(new Error(`redirect without location from ${url}`));
            else resolve(downloadHttps(new URL(loc, url).href, destPath));
          });
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          file.close(() => {
            fs.rm(tmp, () => {});
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          });
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close((err) => {
            if (err) {
              fs.rm(tmp, () => {});
              reject(err);
            } else fs.rename(tmp, destPath, (e2) => (e2 ? reject(e2) : resolve()));
          });
        });
      })
      .on("error", (e) => {
        try {
          file.close();
        } catch {
          /* ignore */
        }
        fs.rm(tmp, () => {});
        reject(e);
      });
  });
}

const { manifestPath, rootPath } = parseArgs(process.argv);

async function main() {
  const absRoot = path.resolve(rootPath);
  const absManifest = path.resolve(manifestPath);

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(absManifest, "utf8"));
  } catch (e) {
    fail(`cannot read manifest: ${e instanceof Error ? e.message : String(e)}`);
  }

  const composeFiles = Array.isArray(doc.composeFiles) ? doc.composeFiles : [];
  const urls =
    doc.composeFileUrls && typeof doc.composeFileUrls === "object" && !Array.isArray(doc.composeFileUrls)
      ? doc.composeFileUrls
      : null;

  for (const cf of composeFiles) {
    const dest = path.join(absRoot, cf);
    if (fs.existsSync(dest)) continue;
    const u = urls?.[cf];
    if (typeof u !== "string" || !u.startsWith("https://")) {
      console.error(
        `Manifest compose file is missing on this host (and no composeFileUrls[${JSON.stringify(cf)}] in manifest): ${cf}`,
      );
      console.error(
        "Hint: commit compose files into the install bundle repo root, or have Control Plane include composeFileUrls for each path (Publish Registry Release from ECOCRM does this).",
      );
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await downloadHttps(u, dest);
    console.log(`Downloaded ${cf}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});