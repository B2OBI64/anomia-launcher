const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const config = require("./config");

let mainWindow;
let localServerPort = null;

// ============================================================
// Petit serveur HTTP local qui sert src/ et assets/.
// Nécessaire pour que l'embed Twitch fonctionne : Twitch exige un
// paramètre "parent" qui corresponde au vrai domaine de la page.
// En chargeant l'appli depuis http://localhost au lieu de file://,
// on peut déclarer parent=localhost et Twitch l'accepte.
// ============================================================
const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/") urlPath = "/src/index.html";

      // Sécurité basique : on reste cantonné au dossier du projet
      const safePath = path.normalize(path.join(__dirname, urlPath));
      if (!safePath.startsWith(__dirname)) {
        res.writeHead(403);
        return res.end("Forbidden");
      }

      fs.readFile(safePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end("Not found");
        }
        const ext = path.extname(safePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(data);
      });
    });

    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
    server.on("error", reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 700,
    minWidth: 980,
    minHeight: 620,
    frame: false, // titlebar custom (style Anomia)
    backgroundColor: "#0a1416",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadURL(`http://localhost:${localServerPort}/src/index.html`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Toutes les tentatives d'ouverture de nouvelle fenêtre (liens externes) passent par le navigateur système
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  localServerPort = await startLocalServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Vérifie les mises à jour au démarrage (silencieux si aucune config "publish" valide,
  // ou si on est en dev via `npm start` plutôt qu'un build installé)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        // pas de connexion / pas de repo configuré / pas de release publiée -> on ignore silencieusement
      });
    }, 3000);
  }
});

// ============================================================
// Auto-update (electron-updater + GitHub Releases)
// ============================================================
autoUpdater.autoDownload = true;

autoUpdater.on("update-available", (info) => {
  mainWindow?.webContents.send("update:available", { version: info.version });
});

autoUpdater.on("update-downloaded", (info) => {
  mainWindow?.webContents.send("update:downloaded", { version: info.version });
});

autoUpdater.on("error", (err) => {
  console.error("[auto-update]", err.message);
});

ipcMain.on("update:install", () => {
  autoUpdater.quitAndInstall();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ============================================================
// Contrôles de fenêtre (frameless)
// ============================================================
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

// ============================================================
// Petit utilitaire de requête HTTP(S) -> JSON, sans dépendance externe
// ============================================================
function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      { headers: { "User-Agent": "AnomiaLauncher/1.0" }, timeout: timeoutMs },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const tmpPath = destPath + ".part";
    const file = fs.createWriteStream(tmpPath);
    const req = lib.get(url, { headers: { "User-Agent": "AnomiaLauncher/1.0" } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        fs.unlink(tmpPath, () => {});
        return reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
      }
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let received = 0;
      res.on("data", (chunk) => {
        received += chunk.length;
        if (onProgress && total) onProgress(received / total);
      });
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.rename(tmpPath, destPath, (err) => (err ? reject(err) : resolve()));
        });
      });
    });
    req.on("error", (err) => {
      file.close();
      fs.unlink(tmpPath, () => {});
      reject(err);
    });
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

// ============================================================
// Statut serveur (API officielle CFX via le code cfx.re/join/xxxxx)
// ============================================================
ipcMain.handle("server:status", async () => {
  // Ping moyen via la ressource b2_pingstats (privacy-safe, prioritaire dès qu'elle répond)
  let avgPing = null;
  try {
    const pingStats = await fetchJson(config.server.pingStatsUrl, 4000);
    if (typeof pingStats.avgPing === "number") avgPing = pingStats.avgPing;
  } catch {
    // Ressource pas (encore) installée côté serveur, pas bloquant
  }

  // 1) Essai direct sur le serveur FiveM (le plus fiable)
  try {
    const dynamic = await fetchJson(config.server.directDynamicUrl, 5000);
    let players = [];
    try {
      const rawPlayers = await fetchJson(config.server.directPlayersUrl, 5000);
      players = (rawPlayers || []).map((p) => ({ name: p.name, ping: p.ping }));
    } catch {
      // players.json peut être désactivé indépendamment de dynamic.json (souvent volontaire,
      // pour ne pas exposer la liste des joueurs) - on tente l'API CFX en repli juste pour le ping
    }
    if (players.length === 0 && avgPing === null) {
      try {
        const cfxData = await fetchJson(config.server.fallbackStatusApiUrl, 5000);
        const cfxPlayers = cfxData && cfxData.Data ? cfxData.Data.players : null;
        if (cfxPlayers) players = cfxPlayers.map((p) => ({ name: p.name, ping: p.ping }));
      } catch {
        // toujours indisponible, on repart avec une liste vide
      }
    }
    return {
      online: true,
      hostname: dynamic.hostname || "Anomia",
      clients: dynamic.clients ?? players.length ?? 0,
      maxClients: dynamic.sv_maxclients ?? 0,
      players,
      avgPing
    };
  } catch (directErr) {
    // 2) Repli sur l'API CFX (peut être bloquée par Cloudflare selon les cas)
    try {
      const data = await fetchJson(config.server.fallbackStatusApiUrl, 6000);
      const d = data && data.Data ? data.Data : null;
      if (!d) throw new Error("Réponse inattendue de l'API CFX");
      return {
        online: true,
        hostname: d.hostname || "Anomia",
        clients: d.clients ?? 0,
        maxClients: d.sv_maxclients ?? d.svMaxclients ?? 0,
        players: (d.players || []).map((p) => ({ name: p.name, ping: p.ping })),
        avgPing
      };
    } catch (fallbackErr) {
      return { online: false, error: `${directErr.message} / ${fallbackErr.message}` };
    }
  }
});

// ============================================================
// Connexion au serveur
// ============================================================
ipcMain.on("server:connect", () => {
  const url = `fivem://connect/${config.server.ip}:${config.server.port}`;

  // FiveM refuse de se lancer si l'appel ne vient pas "du shell ou d'un navigateur"
  // (protection anti-triche). shell.openExternal() invoque le protocole avec le
  // launcher lui-même comme processus parent, ce que FiveM rejette. En passant par
  // explorer.exe comme intermédiaire, FiveM voit un lancement légitime.
  if (process.platform === "win32") {
    spawn("explorer.exe", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    shell.openExternal(url);
  }
});

// ============================================================
// News / changelog
// ============================================================
ipcMain.handle("news:get", async () => {
  if (config.news.remoteUrl) {
    try {
      const remote = await fetchJson(config.news.remoteUrl);
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch (err) {
      // on retombe sur le fichier local ci-dessous
    }
  }
  try {
    const raw = fs.readFileSync(path.join(__dirname, config.news.localFallback), "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
});

// ============================================================
// Liens externes génériques (Discord, Twitch, etc.)
// ============================================================
ipcMain.on("shell:openExternal", (event, url) => {
  if (typeof url === "string" && /^https?:\/\//.test(url)) {
    shell.openExternal(url);
  }
});

// ============================================================
// Vérification / téléchargement des assets custom
// ============================================================
ipcMain.handle("assets:check", async (event) => {
  if (!config.assets.manifestUrl || config.assets.manifestUrl.includes("REMPLACE_MOI")) {
    return {
      ok: false,
      notConfigured: true,
      error: "Aucun fichier custom à vérifier pour le moment (non configuré côté serveur)."
    };
  }

  const userDataDir = app.getPath("userData");
  const localDir = path.join(userDataDir, config.assets.localFolder);
  fs.mkdirSync(localDir, { recursive: true });

  let manifest;
  try {
    manifest = await fetchJson(config.assets.manifestUrl);
  } catch (err) {
    return { ok: false, error: `Impossible de récupérer le manifest: ${err.message}` };
  }

  const files = manifest.files || [];
  const toDownload = [];

  for (const f of files) {
    const destPath = path.join(localDir, f.name);
    if (!fs.existsSync(destPath)) {
      toDownload.push(f);
      continue;
    }
    if (f.sha256) {
      try {
        const localHash = await sha256File(destPath);
        if (localHash !== f.sha256) toDownload.push(f);
      } catch {
        toDownload.push(f);
      }
    }
  }

  const total = toDownload.length;
  let done = 0;

  for (const f of toDownload) {
    const destPath = path.join(localDir, f.name);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    try {
      await downloadFile(f.url, destPath, (fileProgress) => {
        event.sender.send("assets:progress", {
          fileName: f.name,
          fileProgress,
          done,
          total
        });
      });
    } catch (err) {
      return { ok: false, error: `Échec téléchargement ${f.name}: ${err.message}` };
    }
    done++;
    event.sender.send("assets:progress", { fileName: f.name, fileProgress: 1, done, total });
  }

  return { ok: true, updated: toDownload.length, total: files.length };
});

// ============================================================
// Nettoyage du cache FiveM (préserve le dossier game-storage)
// ============================================================
function getFiveMCacheDir() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA, "FiveM", "FiveM.app", "data", "cache");
  }
  // Support best-effort si FiveM tourne via une autre plateforme
  return path.join(app.getPath("home"), ".fivem", "data", "cache");
}

function getDirSize(dir) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getDirSize(full);
    } else {
      try {
        total += fs.statSync(full).size;
      } catch {
        // fichier verrouillé ou supprimé entre temps, on ignore
      }
    }
  }
  return total;
}

ipcMain.handle("cache:info", async () => {
  const cacheDir = getFiveMCacheDir();
  if (!fs.existsSync(cacheDir)) {
    return { exists: false, path: cacheDir };
  }
  let totalSize = 0;
  let clearableSize = 0;
  try {
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cacheDir, entry.name);
      const size = entry.isDirectory() ? getDirSize(full) : fs.statSync(full).size;
      totalSize += size;
      if (entry.name.toLowerCase() !== "game-storage") clearableSize += size;
    }
  } catch (err) {
    return { exists: true, path: cacheDir, error: err.message };
  }
  return { exists: true, path: cacheDir, totalSize, clearableSize };
});

ipcMain.handle("cache:clear", async () => {
  const cacheDir = getFiveMCacheDir();
  if (!fs.existsSync(cacheDir)) {
    return { ok: false, error: "Dossier cache FiveM introuvable sur cette machine." };
  }

  let entries;
  try {
    entries = fs.readdirSync(cacheDir, { withFileTypes: true });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  let cleared = 0;
  const errors = [];

  for (const entry of entries) {
    // On préserve exclusivement le dossier game-storage (paramètres/données locales des ressources NUI)
    if (entry.name.toLowerCase() === "game-storage") continue;

    const full = path.join(cacheDir, entry.name);
    try {
      fs.rmSync(full, { recursive: true, force: true });
      cleared++;
    } catch (err) {
      errors.push(`${entry.name}: ${err.message}`);
    }
  }

  return { ok: errors.length === 0, cleared, errors };
});

// ============================================================
// Calendrier des events RP
// ============================================================
ipcMain.handle("events:get", async () => {
  let events = [];
  if (config.events.remoteUrl) {
    try {
      const remote = await fetchJson(config.events.remoteUrl);
      if (Array.isArray(remote)) events = remote;
    } catch {
      // on retombe sur le fichier local ci-dessous
    }
  }
  if (events.length === 0) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, config.events.localFallback), "utf-8");
      events = JSON.parse(raw);
    } catch {
      events = [];
    }
  }
  // On ne garde que les events à venir, triés du plus proche au plus lointain
  const now = Date.now();
  return events
    .filter((e) => e.date && new Date(e.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
});

// ============================================================
// Diagnostic réseau (remplace l'ancien bouton "copier l'IP", peu utile)
// ============================================================
function tcpPing(ip, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, latencyMs: ok ? Date.now() - start : null, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "Timeout"));
    socket.once("error", (err) => finish(false, err.message));

    socket.connect(port, ip);
  });
}

ipcMain.handle("network:diagnose", async () => {
  const tcp = await tcpPing(config.server.ip, config.server.port);

  let httpOk = false;
  let httpLatencyMs = null;
  const httpStart = Date.now();
  try {
    await fetchJson(config.server.directDynamicUrl, 5000);
    httpOk = true;
    httpLatencyMs = Date.now() - httpStart;
  } catch {
    httpOk = false;
  }

  return {
    ip: config.server.ip,
    port: config.server.port,
    tcpOk: tcp.ok,
    tcpLatencyMs: tcp.latencyMs,
    tcpError: tcp.error || null,
    httpOk,
    httpLatencyMs
  };
});

// ============================================================
// Détection de FiveM installé + fraîcheur (heuristique)
// ============================================================
ipcMain.handle("fivem:check", async () => {
  if (process.platform !== "win32") {
    return { supported: false };
  }
  const exePath = path.join(process.env.LOCALAPPDATA, "FiveM", "FiveM.app", "FiveM.exe");
  if (!fs.existsSync(exePath)) {
    return { supported: true, installed: false, downloadUrl: config.fivem.downloadUrl };
  }
  try {
    const stat = fs.statSync(exePath);
    const daysSinceUpdate = Math.floor((Date.now() - stat.mtimeMs) / 86400000);
    return {
      supported: true,
      installed: true,
      daysSinceUpdate,
      possiblyStale: daysSinceUpdate > config.fivem.staleWarningDays
    };
  } catch (err) {
    return { supported: true, installed: true, error: err.message };
  }
});

// ============================================================
// Admin (lecture seule) - déverrouillage par code d'accès local
// ============================================================
ipcMain.handle("admin:unlock", async (event, passphrase) => {
  if (!config.admin.passphraseHash) {
    return { ok: false, error: "Aucun code d'accès configuré." };
  }
  const hash = crypto.createHash("sha256").update(passphrase || "").digest("hex");
  return { ok: hash === config.admin.passphraseHash };
});

ipcMain.handle("admin:stats", async () => {
  const stats = {
    players: null,
    maxPlayers: null,
    avgPing: null,
    resourceCount: null,
    txAdminUrl: config.admin.txAdminUrl || null
  };

  try {
    const dynamic = await fetchJson(config.server.directDynamicUrl, 5000);
    stats.players = dynamic.clients ?? null;
    stats.maxPlayers = dynamic.sv_maxclients ?? null;
  } catch {
    // pas grave, on laisse à null
  }

  try {
    const pingStats = await fetchJson(config.server.pingStatsUrl, 4000);
    if (typeof pingStats.avgPing === "number") stats.avgPing = pingStats.avgPing;
  } catch {
    // ressource b2_pingstats pas installée, pas bloquant
  }

  try {
    const info = await fetchJson(config.server.directInfoUrl, 5000);
    if (Array.isArray(info.resources)) stats.resourceCount = info.resources.length;
  } catch {
    // pas grave
  }

  return stats;
});
