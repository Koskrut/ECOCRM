#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { get as httpsGet } from "node:https";
import { join } from "node:path";

const PORT = Number(process.env.UPDATER_AGENT_PORT || 7788);
const HOST = process.env.UPDATER_AGENT_HOST || "127.0.0.1";
const TOKEN = process.env.UPDATER_AGENT_TOKEN || "";
const REPO_ROOT = process.env.UPDATER_REPO_ROOT || process.cwd();
const ENV_FILE = process.env.UPDATER_ENV_FILE || join(REPO_ROOT, ".env");
const COMPOSE_FILES = (process.env.UPDATER_COMPOSE_FILES || "compose.base.yml,compose.client.yml")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const MANIFEST_URL = String(process.env.UPDATER_MANIFEST_URL || "").trim();
const MANIFEST_PATH = process.env.UPDATER_MANIFEST_PATH || join(REPO_ROOT, "deployment-manifest.json");
const LOG_DIR = process.env.UPDATER_LOG_DIR || join(REPO_ROOT, ".updater-logs");

mkdirSync(LOG_DIR, { recursive: true });
const jobs = new Map();
let activeJobId = null;

function respondJson(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authorized(req) {
  if (!TOKEN) return true;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${TOKEN}`;
}

function nowIso() {
  return new Date().toISOString();
}

function buildComposeArgs(composeFiles = COMPOSE_FILES) {
  const args = [];
  for (const file of composeFiles) args.push("-f", file);
  args.push("--env-file", ENV_FILE);
  return args;
}

function downloadHttps(url, destPath) {
  return new Promise((resolve, reject) => {
    httpsGet(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        res.resume();
        if (!loc) reject(new Error(`redirect without location from ${url}`));
        else resolve(downloadHttps(new URL(loc, url).href, destPath));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        writeFileSync(destPath, Buffer.concat(chunks), "utf8");
        resolve();
      });
    }).on("error", reject);
  });
}

async function syncComposeFromManifest(manifestPath) {
  const script = join(REPO_ROOT, "scripts/sync-compose-from-manifest.mjs");
  if (!existsSync(script)) return;
  const r = await runCommand("node", [script, "--manifest", manifestPath, "--root", REPO_ROOT]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "compose manifest sync failed");
}

async function resolveComposeFiles() {
  let manifestPath = null;
  if (MANIFEST_URL) {
    manifestPath = join(LOG_DIR, `manifest-${Date.now()}.json`);
    await downloadHttps(MANIFEST_URL, manifestPath);
  } else if (existsSync(MANIFEST_PATH)) {
    manifestPath = MANIFEST_PATH;
  }
  if (!manifestPath) return COMPOSE_FILES;

  await syncComposeFromManifest(manifestPath);
  const doc = JSON.parse(readFileSync(manifestPath, "utf8"));
  const files = Array.isArray(doc.composeFiles) ? doc.composeFiles.filter(Boolean) : [];
  return files.length > 0 ? files : COMPOSE_FILES;
}

function runCommand(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function setEnvValues(updates) {
  let raw = "";
  try {
    raw = readFileSync(ENV_FILE, "utf8");
  } catch {
    raw = "";
  }
  const lines = raw.split(/\r?\n/);
  const keys = new Set(Object.keys(updates));
  const next = lines.map((line) => {
    const i = line.indexOf("=");
    if (i <= 0) return line;
    const key = line.slice(0, i).trim();
    if (!keys.has(key)) return line;
    keys.delete(key);
    return `${key}=${String(updates[key])}`;
  });
  for (const key of keys) next.push(`${key}=${String(updates[key])}`);
  writeFileSync(ENV_FILE, `${next.filter((l) => l !== "").join("\n")}\n`, "utf8");
}

async function runPreflight() {
  const checks = [];
  const docker = await runCommand("docker", ["info"]);
  checks.push({ key: "docker", ok: docker.code === 0, message: docker.code === 0 ? "ok" : docker.stderr.trim() });
  const compose = await runCommand("docker", ["compose", "version"]);
  checks.push({
    key: "compose",
    ok: compose.code === 0,
    message: compose.code === 0 ? "ok" : compose.stderr.trim(),
  });
  const allOk = checks.every((c) => c.ok);
  return {
    ok: allOk,
    message: allOk ? "Preflight passed." : "Preflight failed.",
    details: { checks, composeFiles: COMPOSE_FILES, envFile: ENV_FILE },
    suggestedVersion: null,
  };
}

async function runApplyJob(job, targetVersion) {
  job.status = "running";
  job.updatedAt = nowIso();
  const log = [];
  const pushLog = (s) => {
    if (!s) return;
    const lines = String(s).split(/\r?\n/).filter(Boolean);
    for (const line of lines) log.push(line);
    if (log.length > 200) log.splice(0, log.length - 200);
    job.logTail = [...log];
  };
  try {
    const fromVersion = process.env.CRM_RELEASE_VERSION || null;
    job.fromVersion = fromVersion;
    job.toVersion = targetVersion;

    job.message = "Syncing deployment manifest";
    job.updatedAt = nowIso();
    const composeFiles = await resolveComposeFiles();
    const composeArgs = buildComposeArgs(composeFiles);
    pushLog(`compose files: ${composeFiles.join(", ")}`);

    const buildTime = nowIso();
    setEnvValues({
      BACKEND_VERSION: targetVersion,
      WEB_VERSION: targetVersion,
      STORE_VERSION: targetVersion,
      CRM_RELEASE_VERSION: targetVersion,
      BUILD_TIME: buildTime,
      IMAGE_TAG: `ghcr.io/koskrut/crm-core-api:${targetVersion}`,
    });
    process.env.CRM_RELEASE_VERSION = targetVersion;
    process.env.BUILD_TIME = buildTime;
    process.env.IMAGE_TAG = `ghcr.io/koskrut/crm-core-api:${targetVersion}`;
    job.message = "Pulling images";
    job.updatedAt = nowIso();

    let r = await runCommand("docker", ["compose", ...composeArgs, "pull"]);
    pushLog(r.stdout);
    pushLog(r.stderr);
    if (r.code !== 0) throw new Error("docker compose pull failed");

    job.message = "Recreating containers";
    job.updatedAt = nowIso();
    r = await runCommand("docker", ["compose", ...composeArgs, "up", "-d", "--remove-orphans"]);
    pushLog(r.stdout);
    pushLog(r.stderr);
    if (r.code !== 0) throw new Error("docker compose up failed");

    job.status = "succeeded";
    job.message = "Update completed.";
    job.updatedAt = nowIso();
  } catch (e) {
    job.status = "failed";
    job.message = e instanceof Error ? e.message : "Update failed.";
    job.updatedAt = nowIso();
  } finally {
    const outPath = join(LOG_DIR, `${job.id}.json`);
    writeFileSync(outPath, JSON.stringify(job, null, 2), "utf8");
    activeJobId = null;
  }
}

const server = createServer(async (req, res) => {
  if (!authorized(req)) return respondJson(res, 401, { message: "Unauthorized" });
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/status") {
    return respondJson(res, 200, { ok: true, activeJobId, composeFiles: COMPOSE_FILES, envFile: ENV_FILE });
  }
  if (req.method === "POST" && url.pathname === "/preflight") {
    const result = await runPreflight();
    return respondJson(res, result.ok ? 200 : 409, result);
  }
  if (req.method === "POST" && url.pathname === "/apply") {
    if (activeJobId) return respondJson(res, 409, { message: "Update already running", id: activeJobId });
    let body = {};
    try {
      body = await parseBody(req);
    } catch {
      return respondJson(res, 400, { message: "Invalid JSON body" });
    }
    const targetVersion = String(body.targetVersion || "").trim();
    if (!targetVersion) return respondJson(res, 400, { message: "targetVersion is required" });
    const id = `upd-${Date.now()}`;
    const job = {
      id,
      status: "queued",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      requestedBy: "crm-admin",
      fromVersion: process.env.CRM_RELEASE_VERSION || null,
      toVersion: targetVersion,
      backupPath: null,
      message: "Update queued",
      logTail: [],
    };
    jobs.set(id, job);
    activeJobId = id;
    runApplyJob(job, targetVersion);
    return respondJson(res, 202, job);
  }
  if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
    const id = decodeURIComponent(url.pathname.slice("/jobs/".length));
    const job = jobs.get(id);
    if (!job) return respondJson(res, 404, { message: "Not found" });
    return respondJson(res, 200, job);
  }
  return respondJson(res, 404, { message: "Not found" });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Updater agent listening on http://${HOST}:${PORT}\n`);
});
