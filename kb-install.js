// Installation automatique pour KannibAventure : Java 25, NeoForge, fichiers du jeu et mods.
// Aucune dépendance externe (fetch intégré à Electron/Node).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const UA = { "User-Agent": "B2-Launcher" };
const ADOPTIUM_JRE25 = "https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function speedMeter() {
  const t0 = Date.now();
  return (bytes) => { const s = (Date.now() - t0) / 1000; return s > 0.5 ? bytes / 1048576 / s : 0; };
}
const mo = (b) => (b / 1048576).toFixed(b > 10485760 ? 0 : 1);
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return r.json();
}

function hashFile(file, algo = "sha256") {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algo);
    fs.createReadStream(file).on("data", (d) => h.update(d)).on("error", reject).on("end", () => resolve(h.digest("hex")));
  });
}

/** Télécharge url -> dest (fichier .part puis renommage), avec vérification d'empreinte et nouvelles tentatives. */
async function download(url, dest, o = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + ".part";
  let lastErr;
  for (let attempt = 1; attempt <= (o.retries || 3); attempt++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
      const total = Number(r.headers.get("content-length")) || o.size || 0;
      const h = o.sha256 ? crypto.createHash("sha256") : o.sha1 ? crypto.createHash("sha1") : null;
      const ws = fs.createWriteStream(part);
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!ws.write(value)) await new Promise((res) => ws.once("drain", res));
        if (h) h.update(value);
        if (o.onBytes) o.onBytes(value.length, total);
      }
      await new Promise((res, rej) => { ws.on("error", rej); ws.end(res); });
      if (h) {
        const got = h.digest("hex"), want = o.sha256 || o.sha1;
        if (got.toLowerCase() !== String(want).toLowerCase()) throw new Error(`empreinte invalide pour ${path.basename(dest)}`);
      }
      fs.renameSync(part, dest);
      return dest;
    } catch (e) {
      lastErr = e;
      try { fs.unlinkSync(part); } catch {}
      if (attempt < (o.retries || 3)) await sleep(700 * attempt);
    }
  }
  throw lastErr;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); }
  }));
}

// ------------------------------------------------------------------ Java 25
function findJavaExe(dir, depth = 0) {
  if (!exists(dir) || depth > 3) return null;
  const direct = path.join(dir, "bin", "java.exe");
  if (exists(direct)) return direct;
  try {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      try { if (fs.statSync(p).isDirectory()) { const r = findJavaExe(p, depth + 1); if (r) return r; } } catch {}
    }
  } catch {}
  return null;
}

async function ensureJava({ userData, findExisting, progress, AdmZip }) {
  const found = findExisting && findExisting();
  if (found) return found;
  const dir = path.join(userData, "runtime", "java25");
  const have = findJavaExe(dir);
  if (have) return have;
  progress({ step: "java", label: "Téléchargement de Java 25", percent: 0 });
  const zip = path.join(userData, "runtime", "java25.zip");
  let got = 0; const sp = speedMeter();
  await download(ADOPTIUM_JRE25, zip, { onBytes: (n, total) => { got += n; progress({ step: "java", label: `Java 25 ${mo(got)}${total ? "/" + mo(total) : ""} Mo · ${sp(got).toFixed(1)} Mo/s`, percent: total ? Math.min(99, Math.round((got / total) * 100)) : null }); } });
  progress({ step: "java", label: "Installation de Java 25", percent: null });
  fs.rmSync(dir, { recursive: true, force: true });
  new AdmZip(zip).extractAllTo(dir, true);
  try { fs.unlinkSync(zip); } catch {}
  const exe = findJavaExe(dir);
  if (!exe) throw new Error("Java 25 téléchargé mais java.exe introuvable");
  return exe;
}

// ------------------------------------------------------------------ NeoForge
function run(cmd, args, log, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { windowsHide: true });
    const t = setTimeout(() => { try { c.kill(); } catch {} reject(new Error("délai dépassé")); }, timeoutMs);
    const onData = (d) => log && log(String(d).trimEnd());
    c.stdout.on("data", onData); c.stderr.on("data", onData);
    c.on("error", (e) => { clearTimeout(t); reject(e); });
    c.on("exit", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error("code de sortie " + code)); });
  });
}

async function ensureNeoForge({ root, java, installerSrc, versionId, tmpDir, log, progress }) {
  const vjson = path.join(root, "versions", versionId, versionId + ".json");
  if (exists(vjson)) return false;
  fs.mkdirSync(root, { recursive: true });
  const prof = path.join(root, "launcher_profiles.json"); // l'installateur exige ce fichier
  if (!exists(prof)) fs.writeFileSync(prof, JSON.stringify({ profiles: {}, settings: {}, version: 3 }));
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, "neoforge-installer.jar");
  fs.copyFileSync(installerSrc, tmp); // copie hors de l'archive de l'appli (Java ne lit pas l'asar)
  progress({ step: "neoforge", label: "Installation de NeoForge (quelques minutes)", percent: null });
  try { await run(java, ["-jar", tmp, "--installClient", root], log); }
  catch (e) { throw new Error("l'installation de NeoForge a échoué (" + e.message + ")"); }
  if (!exists(vjson)) throw new Error("NeoForge installé mais la version « " + versionId + " » est introuvable");
  return true;
}

// ------------------------------------------------------------------ Fichiers du jeu (vanilla, bibliothèques, assets)
async function ensureGameFiles({ root, versionId, loadVersion, ruleOk, progress, log, verify = false }) {
  const bad = (dest, size) => !exists(dest) || (verify && size && (() => { try { return fs.statSync(dest).size !== size; } catch { return true; } })());
  const v0 = loadVersion(root, versionId);
  const mc = v0._parentId || versionId;
  const vdir = path.join(root, "versions", mc), vjson = path.join(vdir, mc + ".json");
  progress({ step: "files", label: "Vérification des fichiers du jeu", percent: null });
  if (!exists(vjson)) {
    const man = await getJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
    const e = (man.versions || []).find((x) => x.id === mc);
    if (!e) throw new Error("version " + mc + " introuvable chez Mojang");
    fs.mkdirSync(vdir, { recursive: true });
    fs.writeFileSync(vjson, JSON.stringify(await getJson(e.url)));
  }
  const v = loadVersion(root, versionId); // recharge avec le parent présent
  const jar = path.join(vdir, mc + ".jar");
  const todo = [];
  if (bad(jar, v.downloads && v.downloads.client && v.downloads.client.size) && v.downloads && v.downloads.client) todo.push({ url: v.downloads.client.url, dest: jar, sha1: v.downloads.client.sha1, size: v.downloads.client.size });
  const features = { has_quick_plays_support: true, is_quick_play_multiplayer: true };
  for (const lib of v.libraries || []) {
    if (!ruleOk(lib.rules, features)) continue;
    const a = lib.downloads && lib.downloads.artifact;
    if (!a || !a.url || !a.path) continue; // les bibliothèques sans URL sont créées par l'installateur NeoForge
    const dest = path.join(root, "libraries", a.path);
    if (bad(dest, a.size)) todo.push({ url: a.url, dest, sha1: a.sha1, size: a.size });
  }
  if (v.assetIndex && v.assetIndex.url) {
    const idx = path.join(root, "assets", "indexes", v.assetIndex.id + ".json");
    if (!exists(idx)) await download(v.assetIndex.url, idx, { sha1: v.assetIndex.sha1 });
    const objects = JSON.parse(fs.readFileSync(idx, "utf8")).objects || {};
    for (const o of Object.values(objects)) {
      const dest = path.join(root, "assets", "objects", o.hash.slice(0, 2), o.hash);
      if (bad(dest, o.size)) todo.push({ url: `https://resources.download.minecraft.net/${o.hash.slice(0, 2)}/${o.hash}`, dest, sha1: o.hash, size: o.size });
    }
  }
  if (!todo.length) return 0;
  log && log(`# ${todo.length} fichier(s) du jeu à télécharger`);
  let done = 0, got = 0; const sp = speedMeter();
  const totalBytes = todo.reduce((s2, t) => s2 + (t.size || 0), 0) || 1;
  let lastEmit = 0;
  await pool(todo, 16, async (t) => {
    await download(t.url, t.dest, { sha1: t.sha1, size: t.size, onBytes: (n) => {
      got += n;
      const now = Date.now();
      if (now - lastEmit > 250) { lastEmit = now; progress({ step: "files", label: `Jeu ${mo(got)}/${mo(totalBytes)} Mo · ${sp(got).toFixed(1)} Mo/s`, percent: Math.min(99, Math.round((got / totalBytes) * 100)) }); }
    } });
    done++;
  });
  progress({ step: "files", label: "Fichiers du jeu à jour", percent: 100 });
  return todo.length;
}

// ------------------------------------------------------------------ Mods
const fmtMo = (n) => (n / 1048576).toFixed(n >= 104857600 ? 0 : 1).replace(".", ",");
function rate(got, t0) { const s = (Date.now() - t0) / 1000; return s > 1 ? ` · ${fmtMo(got / s)} Mo/s` : ""; }
const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

async function listReleaseAssets({ owner, repo, tag, apiBase = "https://api.github.com" }) {
  const rel = await getJson(`${apiBase}/repos/${owner}/${repo}/releases/tags/${tag}`);
  const all = [];
  for (let page = 1; page < 10; page++) {
    const part = await getJson(`${apiBase}/repos/${owner}/${repo}/releases/${rel.id}/assets?per_page=100&page=${page}`);
    all.push(...part);
    if (part.length < 100) break;
  }
  return all;
}

/** GitHub renomme parfois les fichiers envoyés (espaces, « + »…) : on retrouve l'asset par nom exact, puis par taille + nom normalisé. */
function findAsset(assets, mod) {
  let a = assets.find((x) => x.name === mod.file);
  if (a) return a;
  const n = normName(mod.file);
  a = assets.find((x) => x.size === mod.size && normName(x.name) === n);
  if (a) return a;
  const same = assets.filter((x) => x.size === mod.size && x.name !== "kb-modpack.json");
  return same.length === 1 ? same[0] : null;
}

async function loadModpack(rel) {
  const assets = await listReleaseAssets(rel);
  const man = assets.find((x) => x.name === "kb-modpack.json");
  if (!man) throw new Error("kb-modpack.json absent de la release des mods");
  const pack = await getJson(man.browser_download_url);
  if (!pack || !Array.isArray(pack.mods)) throw new Error("kb-modpack.json invalide");
  return { pack, assets };
}

async function syncMods({ gameDir, pack, assets, progress, log }) {
  const modsDir = path.join(gameDir, "mods"), extra = path.join(gameDir, "mods-extra");
  fs.mkdirSync(modsDir, { recursive: true });
  const want = new Map(pack.mods.map((m) => [m.file, m]));
  let removed = 0;
  for (const f of fs.readdirSync(modsDir)) {
    if (!/\.jar$/i.test(f) || want.has(f)) continue;
    fs.mkdirSync(extra, { recursive: true });
    try { fs.rmSync(path.join(extra, f), { force: true }); fs.renameSync(path.join(modsDir, f), path.join(extra, f)); removed++; } catch {}
  }
  progress({ step: "mods", label: "Vérification des mods", percent: null });
  const todo = [];
  for (const m of pack.mods) {
    const p = path.join(modsDir, m.file);
    let ok = false;
    try { ok = exists(p) && fs.statSync(p).size === m.size && (await hashFile(p)) === m.sha256; } catch {}
    if (!ok) todo.push(m);
  }
  log && log(`# mods : ${pack.mods.length} attendus, ${todo.length} à télécharger, ${removed} déplacé(s) vers mods-extra`);
  if (!todo.length) return { downloaded: 0, removed };
  const totalBytes = todo.reduce((s, m) => s + (m.size || 0), 0) || 1;
  let got = 0, doneCount = 0, lastEmit = 0; const sp = speedMeter();
  await pool(todo, 4, async (m) => {
    const a = findAsset(assets, m);
    if (!a) throw new Error("mod introuvable sur l'hébergement : " + m.file);
    await download(a.browser_download_url, path.join(modsDir, m.file), { sha256: m.sha256, onBytes: (n) => {
      got += n;
      const now = Date.now();
      if (now - lastEmit > 250) { lastEmit = now; progress({ step: "mods", label: `Mods ${doneCount}/${todo.length} · ${mo(got)}/${mo(totalBytes)} Mo · ${sp(got).toFixed(1)} Mo/s`, percent: Math.min(99, Math.round((got / totalBytes) * 100)) }); }
    } });
    doneCount++;
  });
  progress({ step: "mods", label: "Mods à jour", percent: 100 });
  return { downloaded: todo.length, removed };
}

module.exports = { download, pool, hashFile, ensureJava, ensureNeoForge, ensureGameFiles, listReleaseAssets, loadModpack, findAsset, syncMods, findJavaExe };
