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
// Verrou mono-instance. Sans ça, relancer le launcher (double-clic accidentel,
// raccourci Discord, etc.) peut faire tourner plusieurs process en fond sans
// fenêtre visible, ce qui bloque ensuite la désinstallation/mise à jour avec
// un message "ferme d'abord l'application" alors qu'aucune fenêtre n'est ouverte.
// ============================================================
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

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

  // On ne montre la fenêtre qu'une fois le contenu prêt ET la vérification de
  // mise à jour terminée (comme Discord : on checke avant d'afficher quoi que
  // ce soit). Sécurité : timeout pour ne jamais bloquer indéfiniment si le
  // check traîne (pas de connexion, GitHub lent, etc.)
  let contentReady = false;
  let updateCheckSettled = !app.isPackaged; // en dev (npm start), pas de check -> pas d'attente

  const tryShowWindow = () => {
    if (contentReady && updateCheckSettled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  };

  mainWindow.once("ready-to-show", () => {
    contentReady = true;
    tryShowWindow();
  });

  if (app.isPackaged) {
    const settleUpdateCheck = () => {
      if (updateCheckSettled) return;
      updateCheckSettled = true;
      tryShowWindow();
    };
    autoUpdater
      .checkForUpdates()
      .catch(() => {}) // pas de connexion / pas de release publiée -> on ignore silencieusement
      .finally(settleUpdateCheck);
    setTimeout(settleUpdateCheck, 6000); // filet de sécurité, jamais plus de 6s d'attente
  }

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

  // Re-vérifie périodiquement pendant les sessions longues, en plus du check au lancement
  if (app.isPackaged) {
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 15 * 60 * 1000);
  }
});

// ============================================================
// Auto-update (electron-updater + GitHub Releases)
// Obligatoire pour se connecter, mais PAS automatique : dès qu'une mise à jour
// est détectée, le renderer affiche une modale bloquante avec un bouton pour
// lancer le téléchargement manuellement (voir renderer.js). Rien ne se
// télécharge tant que le joueur n'a pas cliqué lui-même.
// ============================================================
autoUpdater.autoDownload = false;

autoUpdater.on("update-available", (info) => {
  mainWindow?.webContents.send("update:available", { version: info.version });
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("update:progress", { percent: progress.percent });
});

autoUpdater.on("update-downloaded", (info) => {
  mainWindow?.webContents.send("update:downloaded", { version: info.version });
});

autoUpdater.on("error", (err) => {
  console.error("[auto-update]", err.message);
  mainWindow?.webContents.send("update:error", { message: err.message });
});

ipcMain.on("update:install", () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on("update:download", () => {
  autoUpdater.downloadUpdate().catch((err) => {
    mainWindow?.webContents.send("update:error", { message: err.message });
  });
});

ipcMain.handle("update:retry", async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ============================================================
// Version de l'app
// ============================================================
ipcMain.handle("app:version", () => app.getVersion());

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
//
// Structure d'installation FiveM : historiquement %localappdata%\FiveM\FiveM.app\,
// mais les installs récents utilisent %localappdata%\FiveM\FiveM Application Data\
// à la place, sans sous-dossier "FiveM.app". On teste les deux.
// ============================================================
const FIVEM_APP_FOLDER_CANDIDATES = ["FiveM.app", "FiveM Application Data"];

function getFiveMCacheDir() {
  if (process.platform !== "win32") {
    // Support best-effort si FiveM tourne via une autre plateforme
    return path.join(app.getPath("home"), ".fivem", "data", "cache");
  }
  for (const folder of FIVEM_APP_FOLDER_CANDIDATES) {
    const candidate = path.join(process.env.LOCALAPPDATA, "FiveM", folder, "data", "cache");
    if (fs.existsSync(candidate)) return candidate;
  }
  // Aucun trouvé : on retourne le premier candidat quand même (le code appelant
  // gère proprement le cas "dossier introuvable")
  return path.join(process.env.LOCALAPPDATA, "FiveM", FIVEM_APP_FOLDER_CANDIDATES[0], "data", "cache");
}

// Cherche FiveM.exe soit directement dans %localappdata%\FiveM\ (installs récents),
// soit dans %localappdata%\FiveM\FiveM.app\ (ancienne structure)
function findFiveMExe() {
  if (!process.env.LOCALAPPDATA) return null;
  const candidates = [
    path.join(process.env.LOCALAPPDATA, "FiveM", "FiveM.exe"),
    ...FIVEM_APP_FOLDER_CANDIDATES.map((folder) =>
      path.join(process.env.LOCALAPPDATA, "FiveM", folder, "FiveM.exe")
    )
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
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
ipcMain.handle("media:get", async () => {
  let media = [];
  if (config.media.remoteUrl) {
    try {
      const remote = await fetchJson(config.media.remoteUrl);
      if (Array.isArray(remote)) media = remote;
    } catch {
      // on retombe sur le fichier local ci-dessous
    }
  }
  if (media.length === 0) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, config.media.localFallback), "utf-8");
      media = JSON.parse(raw);
    } catch {
      media = [];
    }
  }
  return media;
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

  // On vérifie si Windows a le protocole fivem:// enregistré. L'installeur FiveM
  // (sans droits admin, cas le plus courant) écrit dans HKEY_CURRENT_USER, qui est
  // censé être fusionné dans HKEY_CLASSES_ROOT — mais pour plus de robustesse on
  // vérifie aussi HKCU directement, plus l'existence du fichier exe en dernier recours.
  const { execFile } = require("child_process");
  const regExePath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "reg.exe");

  function regKeyExists(hivePath) {
    return new Promise((resolve) => {
      execFile(regExePath, ["query", hivePath], (err) => resolve(!err));
    });
  }

  const [viaHkcr, viaHkcu] = await Promise.all([
    regKeyExists("HKCR\\fivem\\shell\\open\\command"),
    regKeyExists("HKCU\\Software\\Classes\\fivem\\shell\\open\\command")
  ]);

  const exePath = findFiveMExe();
  const exeExists = exePath !== null;

  const protocolRegistered = viaHkcr || viaHkcu || exeExists;

  if (!protocolRegistered) {
    return { supported: true, installed: false, downloadUrl: config.fivem.downloadUrl };
  }

  // Bonus best-effort : si l'exe se trouve à l'emplacement standard, on peut estimer
  // sa fraîcheur. Si on ne le trouve pas là, ce n'est pas grave, on ne bloque rien.
  if (exeExists) {
    try {
      const stat = fs.statSync(exePath);
      const daysSinceUpdate = Math.floor((Date.now() - stat.mtimeMs) / 86400000);
      return {
        supported: true,
        installed: true,
        daysSinceUpdate,
        possiblyStale: daysSinceUpdate > config.fivem.staleWarningDays
      };
    } catch {
      // pas grave, on retombe sur "installé" simple ci-dessous
    }
  }

  return { supported: true, installed: true };
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
