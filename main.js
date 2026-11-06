const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require("electron");
const path = require("path");

// B2 Launcher : le produit a été renommé (avant : "Anomia Launcher"). On garde l'ancien
// dossier de données pour que les joueurs ne perdent ni leur connexion Discord, ni leurs
// réglages, ni leur temps de jeu après la mise à jour.
app.setPath("userData", path.join(app.getPath("appData"), "Anomia Launcher"));
const fs = require("fs");
const https = require("https");
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const config = require("./config");
const diagnostics = require("./diagnostics");
diagnostics.init(app.getVersion());

let mainWindow;
let splashWindow;
let localServerPort = null;

const MIN_SPLASH_MS = 6000; // durée minimum d'affichage du splash, façon Discord
const MAX_UPDATE_WAIT_MS = 10000; // sécurité : jamais plus de 10s à attendre le check

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
      const urlObj = new URL(req.url, "http://localhost");

      // Route spéciale : réception du token OAuth Discord (voir oauth-callback.html)
      if (urlObj.pathname === "/oauth-receive") {
        const token = urlObj.searchParams.get("token");
        handleDiscordToken(token);
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end("ok");
      }

      let urlPath = urlObj.pathname;
      if (urlPath === "/") urlPath = "/src/index.html";
      // Le lien de redirection Discord pointe volontairement vers la racine
      // (/oauth-callback.html) pour rester simple à enregistrer sur Discord,
      // mais le vrai fichier vit dans src/ - on fait la correspondance ici.
      if (urlPath === "/oauth-callback.html") urlPath = "/src/oauth-callback.html";

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

    // Port fixe requis pour l'OAuth Discord (l'URI de redirection doit être
    // enregistrée à l'identique sur Discord, donc pas de port aléatoire ici).
    // Si le port est déjà pris (rare), on retombe sur un port aléatoire - dans
    // ce cas précis la connexion Discord ne fonctionnera pas ce lancement-ci,
    // mais le reste du launcher continue de fonctionner normalement.
    server.listen(config.discordAuth.redirectPort, "127.0.0.1", () => {
      resolve(server.address().port);
    });
    server.on("error", () => {
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    });
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 300,
    height: 340,
    frame: false,
    resizable: false,
    backgroundColor: "#07050d",
    show: false,
    webPreferences: { sandbox: false }
  });
  splashWindow.loadURL(`http://localhost:${localServerPort}/src/splash.html`);
  splashWindow.once("ready-to-show", () => splashWindow.show());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 700,
    minWidth: 980,
    minHeight: 620,
    frame: false, // titlebar custom (style B2 Launcher)
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#0e0a1a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadURL(`http://localhost:${localServerPort}/src/index.html`);

  // On ne montre la fenêtre principale qu'une fois le contenu prêt ET la
  // vérification de mise à jour terminée, avec un splash animé affiché au moins
  // MIN_SPLASH_MS (façon Discord). Sécurité : jamais plus de MAX_UPDATE_WAIT_MS
  // à attendre le check si la connexion est lente/coupée.
  let contentReady = false;
  let updateCheckSettled = !app.isPackaged; // en dev (npm start), pas de check -> pas d'attente
  const startTime = Date.now();

  const swapToMainWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  };

  const tryShowWindow = () => {
    if (!contentReady || !updateCheckSettled) return;
    if (!app.isPackaged) return swapToMainWindow();

    const elapsed = Date.now() - startTime;
    const remaining = MIN_SPLASH_MS - elapsed;
    if (remaining > 0) {
      setTimeout(swapToMainWindow, remaining);
    } else {
      swapToMainWindow();
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
    setTimeout(settleUpdateCheck, MAX_UPDATE_WAIT_MS);
  }

  // Toutes les tentatives d'ouverture de nouvelle fenêtre (liens externes) passent par le navigateur système
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  localServerPort = await startLocalServer();
  if (app.isPackaged) createSplashWindow();
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

// electron-updater expose releaseNotes soit en texte, soit en tableau
// {version, note} selon les versions sautées - on normalise en une seule chaîne.
function extractReleaseNotes(info) {
  if (!info || !info.releaseNotes) return "";
  if (typeof info.releaseNotes === "string") {
    // Retire les balises HTML basiques que GitHub peut inclure dans la description de release
    return info.releaseNotes.replace(/<[^>]+>/g, "").trim();
  }
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes
      .map((n) => (n && n.note ? n.note.replace(/<[^>]+>/g, "").trim() : ""))
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

autoUpdater.on("update-available", (info) => {
  mainWindow?.webContents.send("update:available", {
    version: info.version,
    releaseNotes: extractReleaseNotes(info)
  });
});

autoUpdater.on("update-not-available", (info) => {
  mainWindow?.webContents.send("update:not-available", { version: info.version });
});

autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("update:progress", { percent: progress.percent });
});

autoUpdater.on("update-downloaded", (info) => {
  mainWindow?.webContents.send("update:downloaded", {
    version: info.version,
    releaseNotes: extractReleaseNotes(info)
  });
});

autoUpdater.on("error", (err) => {
  console.error("[auto-update]", err.message);
  mainWindow?.webContents.send("update:error", { message: err.message });
});

ipcMain.on("update:install", () => {
  // isSilent=true : aucune fenêtre d'installateur ne s'affiche, même une seconde.
  // isForceRunAfter=true : relance le launcher automatiquement une fois l'installation terminée.
  autoUpdater.quitAndInstall(true, true);
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

// Comme fetchJson, mais garde la dernière réponse réussie sur le disque : si internet coupe
// (ou si le serveur est éteint), on réaffiche le dernier contenu connu au lieu de rien.
// À ne PAS utiliser pour des données privées ni pour un statut « en direct ».
async function fetchJsonCached(url, timeoutMs = 8000) {
  const key = crypto.createHash("sha1").update(String(url)).digest("hex");
  const dir = path.join(app.getPath("userData"), "cache");
  const file = path.join(dir, key + ".json");
  try {
    const data = await fetchJson(url, timeoutMs);
    try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } catch { /* cache non bloquant */ }
    return data;
  } catch (err) {
    try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { /* pas de cache */ }
    throw err;
  }
}

// ============================================================
// Connexion Discord (pré-vérification avant de lancer FiveM)
// ============================================================
const discordProfilePath = () => path.join(app.getPath("userData"), "discord-profile.json");

function loadDiscordProfile() {
  try {
    return JSON.parse(fs.readFileSync(discordProfilePath(), "utf-8"));
  } catch {
    return null;
  }
}

function saveDiscordProfile(profile) {
  try {
    fs.writeFileSync(discordProfilePath(), JSON.stringify(profile, null, 2), "utf-8");
  } catch (err) {
    console.error("[discord] impossible d'enregistrer le profil :", err.message);
  }
}

// Jeton Discord du joueur : sert uniquement à prouver son identité au serveur (rôle admin).
// Gardé chiffré sur le disque (DPAPI de Windows via safeStorage) et jamais envoyé ailleurs.
let discordToken = null;
const discordTokenPath = () => path.join(app.getPath("userData"), "discord-token.bin");
function persistDiscordToken(token) {
  discordToken = token || null;
  try {
    if (!token) { fs.unlinkSync(discordTokenPath()); return; }
    if (safeStorage && safeStorage.isEncryptionAvailable()) fs.writeFileSync(discordTokenPath(), safeStorage.encryptString(token));
  } catch { /* pas grave : le jeton reste en mémoire */ }
}
function restoreDiscordToken() {
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable() && fs.existsSync(discordTokenPath())) {
      discordToken = safeStorage.decryptString(fs.readFileSync(discordTokenPath()));
    }
  } catch { discordToken = null; }
}
app.whenReady().then(restoreDiscordToken);

function clearDiscordProfile() {
  persistDiscordToken(null);
  cachedStaffRole = null; cachedStaffCode = null; cachedAdminPassphrase = null;
  try {
    fs.unlinkSync(discordProfilePath());
  } catch {
    // pas grave si le fichier n'existait pas
  }
}

async function checkDiscordRole(discordId) {
  try {
    const result = await fetchJson(`${config.server.discordCheckUrl}?discordId=${discordId}`, 6000);
    return result.allowed === true;
  } catch {
    // Ressource pas installée / serveur hors ligne -> on ne bloque pas artificiellement
    return true;
  }
}

async function handleDiscordToken(token) {
  if (!token) return;
  try {
    // fetchJson() ne permet pas d'ajouter l'en-tête Authorization, on fait donc
    // un appel dédié ici pour interroger l'API Discord avec le token du joueur.
    const profile = await new Promise((resolve, reject) => {
      const req = https.get(
        "https://discord.com/api/users/@me",
        { headers: { Authorization: `Bearer ${token}` } },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
    });

    if (!profile || !profile.id) return;
    persistDiscordToken(token);

    const allowed = await checkDiscordRole(profile.id);
    const savedProfile = {
      id: profile.id,
      username: profile.username,
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=64`
        : null,
      allowed
    };
    saveDiscordProfile(savedProfile);
    mainWindow?.webContents.send("discord:connected", savedProfile);
  } catch (err) {
    console.error("[discord] échec de la connexion :", err.message);
    mainWindow?.webContents.send("discord:error", { message: err.message });
  }
}

ipcMain.on("discord:startAuth", () => {
  const params = new URLSearchParams({
    client_id: config.discordAuth.clientId,
    redirect_uri: `http://localhost:${config.discordAuth.redirectPort}/oauth-callback.html`,
    response_type: "token",
    scope: "identify"
  });
  shell.openExternal(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

ipcMain.handle("discord:getProfile", async () => {
  const profile = loadDiscordProfile();
  if (!profile) return null;
  // Revérifie le rôle à chaque lancement (les rôles peuvent changer entre deux sessions)
  const allowed = await checkDiscordRole(profile.id);
  if (allowed !== profile.allowed) {
    profile.allowed = allowed;
    saveDiscordProfile(profile);
  }
  return profile;
});

ipcMain.on("discord:logout", () => {
  clearDiscordProfile();
});

ipcMain.handle("discord:isConfigured", () => {
  return Boolean(config.discordAuth.clientId && !config.discordAuth.clientId.includes("REMPLACE_MOI"));
});

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
  // Ping moyen + état maintenance + population par job via b2_pingstats (prioritaire dès qu'elle répond)
  let avgPing = null;
  let maintenance = false;
  let jobs = {};
  try {
    const pingStats = await fetchJson(config.server.pingStatsUrl, 4000);
    if (typeof pingStats.avgPing === "number") avgPing = pingStats.avgPing;
    if (typeof pingStats.maintenance === "boolean") maintenance = pingStats.maintenance;
    if (pingStats.jobs && typeof pingStats.jobs === "object") jobs = pingStats.jobs;
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
      avgPing,
      maintenance,
      jobs
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
        avgPing,
        maintenance,
        jobs
      };
    } catch (fallbackErr) {
      return { online: false, error: `${directErr.message} / ${fallbackErr.message}` };
    }
  }
});

// ============================================================
// Connexion au serveur
// ============================================================
ipcMain.on("server:connect", (event) => {
  const url = `fivem://connect/${config.server.ip}:${config.server.port}`;

  // Méthode d'origine (identique à la 1.4.5) : explorer.exe comme intermédiaire
  // pour que FiveM voit un lancement légitime, sans passer par le navigateur.
  // Le vrai bug qui empêchait la connexion n'était pas cette méthode (on l'a
  // longtemps soupçonnée à tort) mais un plantage JS silencieux côté launcher,
  // corrigé séparément - cette méthode directe redevient donc fiable.
  if (process.platform === "win32") {
    const child = spawn("explorer.exe", [url], { detached: true, stdio: "ignore" });
    child.on("error", (err) => {
      console.error("[connect] Échec du lancement de FiveM :", err.message);
      event.sender.send("connect:error", err.message);
    });
    child.unref();
  } else {
    shell.openExternal(url).catch((err) => {
      console.error("[connect] Échec du lancement de FiveM :", err.message);
      event.sender.send("connect:error", err.message);
    });
  }
});

// ============================================================
// News / changelog
// ============================================================
ipcMain.handle("news:get", async () => {
  if (config.news.remoteUrl) {
    try {
      const remote = await fetchJsonCached(config.news.remoteUrl);
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
  // On cible le dossier "data" tout entier (pas juste "data/cache") : le nettoyage
  // vide tout ce qu'il contient SAUF "game-storage", voir cache:clear plus bas.
  if (process.platform !== "win32") {
    // Support best-effort si FiveM tourne via une autre plateforme
    return path.join(app.getPath("home"), ".fivem", "data");
  }
  for (const folder of FIVEM_APP_FOLDER_CANDIDATES) {
    const candidate = path.join(process.env.LOCALAPPDATA, "FiveM", folder, "data");
    if (fs.existsSync(candidate)) return candidate;
  }
  // Aucun trouvé : on retourne le premier candidat quand même (le code appelant
  // gère proprement le cas "dossier introuvable")
  return path.join(process.env.LOCALAPPDATA, "FiveM", FIVEM_APP_FOLDER_CANDIDATES[0], "data");
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
// Copie une image (https uniquement, 15 Mo max) dans le presse-papiers
ipcMain.handle("media:copyImage", async (event, url) => {
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:") return { ok: false };
    const { clipboard, nativeImage, net } = require("electron");
    const res = await net.fetch(u.toString());
    if (!res.ok || !/^image\//i.test(res.headers.get("content-type") || "")) return { ok: false };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) return { ok: false };
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return { ok: false };
    clipboard.writeImage(img);
    return { ok: true };
  } catch { return { ok: false }; }
});
ipcMain.handle("media:get", async () => {
  let media = [];
  if (config.media.remoteUrl) {
    try {
      const remote = await fetchJsonCached(config.media.remoteUrl);
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
// Gardé en mémoire uniquement (jamais écrit sur disque) après un déverrouillage
// réussi, pour authentifier les actions serveur sensibles (ex: maintenance)
// déclenchées depuis le launcher pendant cette session.
let cachedAdminPassphrase = null;
let cachedStaffRole = null; // "admin" | "mod"
let cachedStaffCode = null; // code staff (admin ou modo), en mémoire uniquement

function staffRequest(urlPath, code) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, config.server.staffPanelUrl);
    const headers = { "User-Agent": "B2Launcher/1.0" };
    if (code === "discord") headers["x-discord-token"] = discordToken || "";
    else headers["x-staff-code"] = code;
    const req = http.get(url, { headers, timeout: 6000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

ipcMain.handle("admin:unlock", async (event, passphrase) => {
  const code = String(passphrase || "").trim();
  // Admin : uniquement via le rôle Discord (Kannibal Team), vérifié par le serveur. Code vide = vérification Discord.
  // Modo : code modo vérifié par le serveur.
  const mode = code ? code : "discord";
  if (mode === "discord" && !discordToken) {
    return { ok: false, reason: "no_token", error: mode === "discord" ? null : undefined };
  }
  try {
    const r = await staffRequest("role", mode);
    if (r.status === 200 && (r.body.role === "admin" || r.body.role === "mod")) {
      cachedStaffRole = r.body.role;
      cachedStaffCode = mode;
      cachedAdminPassphrase = null;
      return { ok: true, role: r.body.role };
    }
    if (r.status === 429) return { ok: false, reason: "throttled", error: "Trop d'essais, réessaie dans une minute." };
    return { ok: false, reason: (r.body && r.body.reason) || (mode === "discord" ? "server_outdated" : "invalid_code") };
  } catch (e) {
    return { ok: false, reason: "server_down", error: mode === "discord" ? null : "Impossible de joindre le serveur pour vérifier ton accès (serveur éteint ?)." };
  }
});

ipcMain.handle("admin:toggleMaintenance", async (event, enable) => {
  if (cachedStaffRole !== "admin" || cachedStaffCode !== "discord") {
    return { ok: false, error: "Session admin expirée, reconnecte-toi avec Discord." };
  }
  try {
    const r = await staffRequest(`maintenance/${enable ? "on" : "off"}`, "discord");
    if (r.status === 200) return { ok: true };
    return { ok: false, error: (r.body && r.body.error) || `HTTP ${r.status}` };
  } catch (err) {
    return { ok: false, error: "Serveur injoignable." };
  }
});

ipcMain.handle("admin:getPlayers", async () => {
  if (!cachedStaffCode) return { ok: false, error: "Session staff expirée, redéverrouille l'onglet." };
  try {
    const r = await staffRequest("players", cachedStaffCode);
    if (r.status === 200 && Array.isArray(r.body.players)) {
      return { ok: true, role: r.body.role, players: r.body.players, maxClients: r.body.maxClients || 0 };
    }
    return { ok: false, error: r.body && r.body.error === "invalid_code" ? "Code refusé par le serveur." : "Réponse inattendue du serveur." };
  } catch (e) {
    return { ok: false, error: "Serveur injoignable (éteint ou ressource b2_staffpanel absente)." };
  }
});

ipcMain.handle("admin:getHealth", async () => {
  if (cachedStaffRole !== "admin" || !cachedStaffCode) return { ok: false, error: "Réservé aux admins." };
  try {
    const r = await staffRequest("health", cachedStaffCode);
    if (r.status === 200 && r.body && r.body.health) return { ok: true, health: r.body.health };
    return { ok: false, error: "Réponse inattendue du serveur." };
  } catch (e) {
    return { ok: false, error: "Serveur injoignable (éteint ou b2_staffpanel pas à jour)." };
  }
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

// ============================================================
// Statut Twitch des streamers Anomia (via b2_twitchstatus)
// ============================================================
ipcMain.handle("twitch:getStatus", async () => {
  try {
    const result = await fetchJson(config.server.twitchStatusUrl, 6000);
    if (Array.isArray(result)) return { ok: true, streamers: result };
    return { ok: false, error: result.error || "unknown_error" };
  } catch (err) {
    return { ok: false, error: "La ressource b2_twitchstatus ne répond pas (pas encore installée, ou serveur hors ligne)." };
  }
});

// Discord : membres en ligne / total via l'invitation publique (sans connexion ni jeton)
const inviteCache = new Map();
ipcMain.handle("discord:getCommunities", async () => {
  const list = Array.isArray(config.discordCommunities) ? config.discordCommunities : [];
  const out = [];
  for (const c of list) {
    const m = /(?:discord\.gg\/|discord\.com\/invite\/|^)([A-Za-z0-9-]{2,32})$/.exec(String(c.invite || "").trim());
    if (!m) continue; // pas encore d'invitation : carte masquée
    const code = m[1];
    const logo = /^\.\.\/assets\/[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$/.test(String(c.logo || "")) ? c.logo : null;
    const entry = { name: c.name, color: c.color || null, logo, main: Boolean(c.main), url: `https://discord.gg/${code}`, online: null, members: null };
    const cached = inviteCache.get(code);
    if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
      Object.assign(entry, cached.data);
    } else {
      try {
        const r = await fetchJsonCached(`https://discord.com/api/v10/invites/${code}?with_counts=true`, 6000);
        const data = {
          online: typeof r.approximate_presence_count === "number" ? r.approximate_presence_count : null,
          members: typeof r.approximate_member_count === "number" ? r.approximate_member_count : null
        };
        inviteCache.set(code, { at: Date.now(), data });
        Object.assign(entry, data);
      } catch (e) { /* on affiche la carte sans les chiffres */ }
    }
    out.push(entry);
  }
  return out;
});

// Clips Twitch de la communauté (via b2_twitchstatus/clips)
ipcMain.handle("twitch:getClips", async () => {
  try {
    const result = await fetchJsonCached(config.server.twitchClipsUrl, 8000);
    if (Array.isArray(result)) {
      // On ne renvoie que des clips twitch.tv valides (le launcher ouvre l'URL dans le navigateur)
      const clips = result.filter((c) => c && typeof c.url === "string" && /^https:\/\/(www\.)?twitch\.tv\//.test(c.url)).slice(0, 24);
      return { ok: true, clips };
    }
    return { ok: false, error: (result && result.error) || "unknown_error" };
  } catch (err) {
    return { ok: false, error: "unreachable" };
  }
});

// ============================================================
// Succès (nécessite une connexion Discord préalable, voir plus haut)
// ============================================================
// --- Succès du launcher (locaux) : { unlocked: {key: timestamp}, eggs: {id: timestamp} } ---
const LA = config.achievements.launcher;
function getLauncherAch() {
  const s = loadSettings().launcherAch || {};
  return { unlocked: s.unlocked || {}, eggs: s.eggs || {} };
}
function unlockLauncherAch(key) {
  const la = getLauncherAch();
  const newly = [];
  // « secretSeeker » ne se débloque jamais directement : uniquement via le compteur d'easter eggs
  if (key !== "secretSeeker" && LA.list.some((d) => d.key === key) && !la.unlocked[key]) { la.unlocked[key] = Date.now(); newly.push(key); }
  const eggCount = Object.keys(la.eggs).length;
  if (eggCount >= LA.eggsRequired && !la.unlocked.secretSeeker) { la.unlocked.secretSeeker = Date.now(); newly.push("secretSeeker"); }
  if (newly.length) saveSettings({ launcherAch: la });
  return newly;
}
ipcMain.handle("launcherAch:unlock", (e, key) => {
  const newly = unlockLauncherAch(String(key));
  return { newly, defs: LA.list.filter((d) => newly.includes(d.key)) };
});
ipcMain.handle("launcherAch:egg", (e, id) => {
  id = String(id);
  if (!LA.eggs.includes(id)) return { newly: [], defs: [], eggs: 0, required: LA.eggsRequired, isNew: false };
  const la = getLauncherAch();
  const isNew = !la.eggs[id];
  if (isNew) { la.eggs[id] = Date.now(); saveSettings({ launcherAch: la }); }
  const newly = unlockLauncherAch("secretSeeker");
  return { newly, defs: LA.list.filter((d) => newly.includes(d.key)), eggs: Object.keys(la.eggs).length, required: LA.eggsRequired, isNew };
});
function launcherDefs() { return LA.list.map((d) => Object.assign({ category: "launcher" }, d)); }
function mergeLauncherAch(result) {
  const la = getLauncherAch();
  const achievements = Object.assign({}, result.achievements);
  const unlockedAt = Object.assign({}, result.unlockedAt);
  // Paliers « Chasseur de succès » : nombre total de succès débloqués (hors paliers eux-mêmes)
  const hunterKeys = (LA.hunters || []).map((h) => h.key);
  const base = new Set([...Object.keys(achievements).filter((k) => achievements[k]), ...Object.keys(la.unlocked)].filter((k) => !hunterKeys.includes(k)));
  const launcherNew = [];
  (LA.hunters || []).forEach((h) => { if (base.size >= h.n && !la.unlocked[h.key]) { la.unlocked[h.key] = Date.now(); launcherNew.push(h.key); } });
  if (launcherNew.length) saveSettings({ launcherAch: la });
  LA.list.forEach((d) => { if (la.unlocked[d.key]) { achievements[d.key] = true; unlockedAt[d.key] = la.unlocked[d.key]; } });
  return Object.assign({}, result, { list: (result.list || config.achievements.list).concat(launcherDefs()), achievements, unlockedAt, launcherNew, launcherNewDefs: LA.list.filter((d) => launcherNew.includes(d.key)) });
}
ipcMain.handle("launcherAch:state", () => ({ list: launcherDefs(), unlocked: getLauncherAch().unlocked }));

ipcMain.handle("achievements:getTitlePriority", () => (LA.exclusiveTitles || []).concat(config.achievements.titlePriority || []));

ipcMain.handle("achievements:get", async () => {
  const profile = loadDiscordProfile();
  if (!profile) {
    return { ok: false, notConnected: true, list: config.achievements.list };
  }

  try {
    const result = await fetchJson(`${config.server.achievementsUrl}?discordId=${profile.id}`, 6000);
    if (result.linked === false) {
      return { ok: true, linked: false, list: config.achievements.list };
    }
    return mergeLauncherAch({ ok: true, linked: true, achievements: result.achievements || {}, unlockedAt: result.unlockedAt || {}, playtimeSeconds: result.playtimeSeconds || 0, playtimeByServer: { anomia: result.playtimeSeconds || 0, kannibaventure: kbPlaytime().total }, list: config.achievements.list });
  } catch (err) {
    return { ok: false, error: "La ressource b2_achievements ne répond pas (pas encore installée, ou serveur hors ligne).", list: config.achievements.list };
  }
});

// ============================================================
// Envoi d'un point GPS chez le joueur, s'il est en jeu (nécessite Discord)
// ============================================================
ipcMain.handle("map:sendGpsWaypoint", async (event, x, y) => {
  const profile = loadDiscordProfile();
  if (!profile) {
    return { ok: false, reason: "not_connected" };
  }

  try {
    const payload = JSON.stringify({ discordId: profile.id, x, y });
    const result = await new Promise((resolve, reject) => {
      const url = new URL(config.server.gpsWaypointUrl);
      const req = http.request(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error("Réponse invalide du serveur"));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
    return result;
  } catch (err) {
    return { ok: false, reason: "server_unreachable", error: err.message };
  }
});

// ============================================================
// Réglages locaux (thème, tour guidé déjà vu) - persistés indépendamment
// de la version du launcher, donc jamais réinitialisés par une mise à jour.
// ============================================================
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");

// Les réglages sont lus une seule fois puis gardés en mémoire (écriture directe sur disque à chaque sauvegarde)
let settingsCache = null;
function loadSettings() {
  if (!settingsCache) {
    try { settingsCache = JSON.parse(fs.readFileSync(settingsPath(), "utf-8")); } catch { settingsCache = {}; }
  }
  return structuredClone(settingsCache);
}

function saveSettings(patch) {
  const current = loadSettings();
  const updated = { ...current, ...patch };
  settingsCache = structuredClone(updated);
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("[settings] impossible d'enregistrer :", err.message);
  }
  return updated;
}

ipcMain.handle("image:save", async (event, dataUrl, defaultName) => {
  try {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!m) return { ok: false, error: "image invalide" };
    const safeName = String(defaultName || "profil-b2.png").replace(/[^A-Za-z0-9._-]/g, "_");
    const res = await dialog.showSaveDialog(mainWindow, {
      title: "Enregistrer l'image",
      defaultPath: path.join(app.getPath("pictures"), safeName),
      filters: [{ name: "Image PNG", extensions: ["png"] }]
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, Buffer.from(m[1], "base64"));
    shell.showItemInFolder(res.filePath);
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("diagnostics:createReport", () => {
  try {
    const target = diagnostics.createManualReport();
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ============================================================
// Réseau : bandeau « hors ligne »
// ============================================================
const { net: electronNet } = require("electron");
let lastOnline = true;
function pushNetworkStatus() {
  let online = true;
  try { online = electronNet.isOnline(); } catch { online = true; }
  if (online !== lastOnline) {
    lastOnline = online;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("network:status", online);
  }
}
setInterval(pushNetworkStatus, 8000);
ipcMain.handle("network:isOnline", () => { try { return electronNet.isOnline(); } catch { return true; } });

// ============================================================
// Jeu en cours (« Tu joues à Anomia depuis 2 h 14 »)
// ============================================================
let gameSince = null;
async function pollGameState() {
  const running = await isFiveMRunning();
  if (running && !gameSince) gameSince = Date.now();
  if (!running) gameSince = null;
}
setInterval(pollGameState, 20000);
setTimeout(pollGameState, 3000);
ipcMain.handle("game:getState", async () => {
  await pollGameState();
  return { running: Boolean(gameSince), since: gameSince, game: "Anomia" };
});

// ============================================================
// Bloc-notes (local, sur le PC du joueur uniquement)
// ============================================================
const notesPath = () => path.join(app.getPath("userData"), "notes.json");
ipcMain.handle("notes:get", () => {
  try { const n = JSON.parse(fs.readFileSync(notesPath(), "utf-8")); return Array.isArray(n) ? n : []; } catch { return []; }
});
ipcMain.handle("notes:set", (_e, notes) => {
  if (!Array.isArray(notes)) return { ok: false };
  const clean = notes.slice(0, 200).map((n) => ({
    id: String(n && n.id || "").slice(0, 40),
    title: String(n && n.title || "").slice(0, 120),
    tag: ["general", "anomia", "kannibaventure"].includes(n && n.tag) ? n.tag : "general",
    body: String(n && n.body || "").slice(0, 100000),
    updatedAt: Number(n && n.updatedAt) || Date.now()
  })).filter((n) => n.id);
  try { fs.writeFileSync(notesPath(), JSON.stringify(clean)); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});

// ============================================================
// « Quoi de neuf » : historique de toutes les versions (src/changelog.json)
// ============================================================
ipcMain.handle("changelog:get", () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "src", "changelog.json"), "utf-8")); } catch { return []; }
});

// ============================================================
// Retour à une version précédente : liste des versions publiées sur GitHub
// ============================================================
ipcMain.handle("releases:list", async () => {
  try {
    const list = await fetchJson("https://api.github.com/repos/B2OBI64/anomia-launcher/releases?per_page=12", 8000);
    return {
      ok: true,
      current: app.getVersion(),
      releases: (Array.isArray(list) ? list : []).filter((r) => !r.draft).map((r) => {
        const exe = (r.assets || []).find((a) => /\.exe$/i.test(a.name || ""));
        return { tag: String(r.tag_name || ""), date: String(r.published_at || "").slice(0, 10), page: r.html_url, installer: exe ? exe.browser_download_url : null };
      }).filter((r) => r.tag)
    };
  } catch (err) {
    return { ok: false, error: "Impossible de récupérer la liste des versions (hors ligne ?)." };
  }
});

// ============================================================
// Anomia en chiffres (b2_stats) : gardé en cache pour rester visible quand le serveur est éteint
// ============================================================
ipcMain.handle("stats:getAnomia", async () => {
  try {
    const r = await fetchJsonCached(config.server.statsUrl, 6000);
    if (r && typeof r === "object" && !r.error) return { ok: true, stats: r };
  } catch { /* indisponible */ }
  return { ok: false };
});

// Dernier stream (VOD) de la chaîne : b2_twitchstatus/videos
ipcMain.handle("twitch:getLastVideo", async () => {
  try {
    const r = await fetchJsonCached(config.server.twitchVideosUrl, 8000);
    if (r && typeof r.url === "string" && /^https:\/\/(www\.)?twitch\.tv\//.test(r.url)) return { ok: true, video: r };
  } catch { /* indisponible */ }
  return { ok: false };
});

// ============================================================
// KannibAventure : statut du serveur Minecraft (Server List Ping, protocole public).
// Lecture seule, réservée à l'admin en service dans le launcher.
// ============================================================
function writeVarInt(n) { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return Buffer.from(out); }
function pingMinecraft(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.connect({ host, port });
    let buf = Buffer.alloc(0), done = false;
    const finish = (r) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(r); };
    sock.setTimeout(timeoutMs, () => finish({ online: false, error: "timeout" }));
    sock.on("error", (e) => finish({ online: false, error: e.code || e.message }));
    sock.on("connect", () => {
      const hostBuf = Buffer.from(host, "utf8");
      const portBuf = Buffer.alloc(2); portBuf.writeUInt16BE(port);
      const payload = Buffer.concat([writeVarInt(0), writeVarInt(767), writeVarInt(hostBuf.length), hostBuf, portBuf, writeVarInt(1)]);
      sock.write(Buffer.concat([writeVarInt(payload.length), payload]));
      sock.write(Buffer.from([0x01, 0x00]));
    });
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      try {
        let off = 0, shift = 0, len = 0, b;
        do { b = buf[off++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80 && off < buf.length);
        if (buf.length < off + len) return;
        off += 0; let pid = 0; shift = 0;
        do { b = buf[off++]; pid |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
        let jl = 0; shift = 0;
        do { b = buf[off++]; jl |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
        const json = JSON.parse(buf.slice(off, off + jl).toString("utf8"));
        const motd = typeof json.description === "string" ? json.description : (json.description && (json.description.text || (json.description.extra || []).map((x) => x.text).join(""))) || "";
        finish({
          online: true, latencyMs: Date.now() - started,
          version: json.version && json.version.name, players: json.players ? json.players.online : 0, maxPlayers: json.players ? json.players.max : 0,
          names: ((json.players && json.players.sample) || []).map((p) => String(p.name || "")).slice(0, 30), motd: String(motd).replace(/§./g, "").slice(0, 120)
        });
      } catch { /* paquet incomplet : on attend la suite */ }
    });
  });
}
ipcMain.handle("kb:getStatus", async () => {
  const kb = (config.servers || []).find((s) => s.id === "kannibaventure") || {};
  if (!kb.serverAddress) return { ok: false, error: "Adresse du serveur non configurée." };
  const isAdmin = cachedStaffRole === "admin";
  // 1) Anomia (hôte FiveM, toujours allumé) : maintenance + statut Minecraft en cache (évite de solliciter le serveur Minecraft)
  const m = await staffRequest("kbstatus", "public").catch(() => null);
  const cached = m && m.status === 200 && m.body && m.body.kb && typeof m.body.kb.online === "boolean" ? m.body.kb : null;
  // 2) Sinon (ou pour l'admin, qui veut la liste des joueurs) : ping direct
  const r = cached && !isAdmin
    ? { online: cached.online, players: cached.players, maxPlayers: cached.maxPlayers, version: cached.version, latencyMs: null, cached: true }
    : await pingMinecraft(kb.serverAddress, kb.serverPort || 25565);
  const maintenance = !!(m && m.status === 200 && m.body && m.body.kbMaintenance);
  const out = { ok: true, maintenance, maintenanceKnown: !!(m && m.status === 200), ...r };
  if (!isAdmin) { delete out.names; delete out.motd; }
  return out;
});
ipcMain.handle("admin:toggleKbMaintenance", async (event, enable) => {
  if (cachedStaffRole !== "admin" || cachedStaffCode !== "discord") {
    return { ok: false, error: "Session admin expirée, reconnecte-toi avec Discord." };
  }
  try {
    const r = await staffRequest(`kbmaintenance/${enable ? "on" : "off"}`, "discord");
    if (r.status === 200) return { ok: true };
    return { ok: false, error: (r.body && r.body.error) || `HTTP ${r.status}` };
  } catch { return { ok: false, error: "Serveur injoignable (l'hôte FiveM doit être allumé)." }; }
});
// Rôle abonné Twitch (Kannibal Team) : vérifié côté serveur avec le jeton Discord de l'utilisateur
ipcMain.handle("sub:check", async () => {
  if (!discordToken) return { ok: false, sub: false };
  try {
    const r = await staffRequest("subcheck", "discord");
    return { ok: r.status === 200, sub: !!(r.body && r.body.sub) };
  } catch { return { ok: false, sub: false, offline: true }; }
});

// ============================================================
// KannibAventure : lancement de Minecraft Java dans la bonne version
// (profil du launcher officiel + serveur ajouté à la liste Multijoueur).
// ============================================================
function nbtRead(buf) {
  let o = 0;
  const str = () => { const l = buf.readUInt16BE(o); o += 2; const s = buf.toString("utf8", o, o + l); o += l; return s; };
  const payload = (t) => {
    const raw = (n) => { const b = buf.slice(o, o + n); o += n; return b; };
    switch (t) {
      case 1: return raw(1); case 2: return raw(2); case 3: return raw(4); case 4: return raw(8); case 5: return raw(4); case 6: return raw(8);
      case 7: { const n = buf.readInt32BE(o); o += 4; return raw(n); }
      case 8: return str();
      case 9: { const et = buf[o++]; const n = buf.readInt32BE(o); o += 4; const items = []; for (let i = 0; i < n; i++) items.push(payload(et)); return { et, items }; }
      case 10: { const m = new Map(); for (;;) { const ct = buf[o++]; if (ct === 0) break; const name = str(); m.set(name, { t: ct, v: payload(ct) }); } return m; }
      case 11: { const n = buf.readInt32BE(o); o += 4; return raw(n * 4); }
      case 12: { const n = buf.readInt32BE(o); o += 4; return raw(n * 8); }
      default: throw new Error("tag NBT inconnu " + t);
    }
  };
  const rt = buf[o++]; if (rt !== 10) throw new Error("racine NBT invalide");
  const rootName = str();
  return { rootName, root: payload(10) };
}
function nbtWrite({ rootName, root }) {
  const parts = [];
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
  const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
  const str = (s) => { const sb = Buffer.from(s, "utf8"); return Buffer.concat([u16(sb.length), sb]); };
  const payload = (t, v) => {
    switch (t) {
      case 1: case 2: case 3: case 4: case 5: case 6: parts.push(v); break;
      case 7: parts.push(i32(v.length), v); break;
      case 8: parts.push(str(v)); break;
      case 9: parts.push(Buffer.from([v.et]), i32(v.items.length)); v.items.forEach((x) => payload(v.et, x)); break;
      case 10: for (const [k, e] of v) { parts.push(Buffer.from([e.t]), str(k)); payload(e.t, e.v); } parts.push(Buffer.from([0])); break;
      case 11: parts.push(i32(v.length / 4), v); break;
      case 12: parts.push(i32(v.length / 8), v); break;
    }
  };
  parts.push(Buffer.from([10]), str(rootName)); payload(10, root);
  return Buffer.concat(parts);
}
// Ajoute le serveur en tête de la liste Multijoueur (sans toucher aux autres). Sauvegarde .b2bak avant d'écrire.
function addServerToServersDat(file, name, ip) {
  let data;
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    data = nbtRead(buf);
    const list = data.root.get("servers");
    if (list && list.v.items.some((c) => c.get("ip") && c.get("ip").v === ip)) return "deja";
    try { fs.copyFileSync(file, file + ".b2bak"); } catch {}
  } else data = { rootName: "", root: new Map() };
  if (!data.root.has("servers")) data.root.set("servers", { t: 9, v: { et: 10, items: [] } });
  const l = data.root.get("servers").v; if (l.et === 0) l.et = 10;
  l.items.unshift(new Map([["ip", { t: 8, v: ip }], ["name", { t: 8, v: name }]]));
  fs.writeFileSync(file, nbtWrite(data));
  return "ajoute";
}
function prepareMinecraftProfile(kb) {
  const mcDir = path.join(app.getPath("appData"), ".minecraft");
  const res = { profile: false, server: null };
  const addr = `${kb.serverAddress}:${kb.serverPort || 25565}`;
  const prof = path.join(mcDir, "launcher_profiles.json");
  try {
    if (fs.existsSync(prof)) {
      const raw = fs.readFileSync(prof, "utf-8");
      const j = JSON.parse(raw);
      if (!fs.existsSync(prof + ".b2bak")) fs.writeFileSync(prof + ".b2bak", raw);
      j.profiles = j.profiles || {};
      const prev = j.profiles["b2-kannibaventure"] || {};
      j.profiles["b2-kannibaventure"] = { created: prev.created || new Date().toISOString(), icon: "Grass", name: "KannibAventure", type: "custom", ...prev, lastUsed: new Date().toISOString(), lastVersionId: kb.minecraftVersionId || kb.minecraftVersion || "26.1.2", gameDir: path.join(mcDir, "kannibaventure") };
      fs.writeFileSync(prof, JSON.stringify(j, null, 2));
      res.profile = true;
    }
  } catch (e) { console.error("[kb] profil Minecraft :", e.message); }
  try { if (fs.existsSync(mcDir)) { fs.mkdirSync(path.join(mcDir, "kannibaventure"), { recursive: true }); res.server = addServerToServersDat(path.join(mcDir, "kannibaventure", "servers.dat"), "KannibAventure", addr); } }
  catch (e) { console.error("[kb] servers.dat :", e.message); }
  return res;
}
function findMinecraftLauncher() {
  const c = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap((b) => [path.join(b, "Minecraft Launcher", "MinecraftLauncher.exe"), path.join(b, "Programs", "Minecraft Launcher", "MinecraftLauncher.exe")]);
  return c.find((f) => { try { return fs.existsSync(f); } catch { return false; } }) || null;
}
ipcMain.handle("kb:launch", async () => {
  const kb = (config.servers || []).find((s) => s.id === "kannibaventure") || {};
  if (!kb.serverAddress) return { ok: false, error: "Adresse du serveur non configurée." };
  const addr = `${kb.serverAddress}:${kb.serverPort || 25565}`;
  const prep = prepareMinecraftProfile(kb);
  const exe = findMinecraftLauncher();
  try {
    if (exe) { const { spawn } = require("child_process"); spawn(exe, [], { detached: true, stdio: "ignore" }).unref(); }
    else if (process.platform === "win32") {
      const { spawn } = require("child_process");
      spawn("explorer.exe", ["shell:AppsFolder\\Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft"], { detached: true, stdio: "ignore" }).unref();
    } else return { ok: false, error: "Minecraft Launcher introuvable." };
  } catch (e) { return { ok: false, error: "Impossible de lancer le Minecraft Launcher : " + e.message }; }
  return { ok: true, version: kb.minecraftVersionId || kb.minecraftVersion || "26.1.2", ...prep, launcherFound: Boolean(exe) };
});

// ------------------------------------------------------------------
// Connexion DIRECTE à KannibAventure (bêta, admins) : le launcher lance Minecraft lui-même
// (connexion Microsoft une seule fois, puis jeton chiffré), télécharge le jeu si besoin
// et démarre directement dans le serveur (Quick Play). En cas d'échec : repli sur le profil officiel.
// ------------------------------------------------------------------
const msTokenPath = () => path.join(app.getPath("userData"), "ms-auth.bin");
function readMsToken() {
  try { if (safeStorage && safeStorage.isEncryptionAvailable() && fs.existsSync(msTokenPath())) return safeStorage.decryptString(fs.readFileSync(msTokenPath())); } catch {}
  return null;
}
function writeMsToken(t) { try { if (t && safeStorage && safeStorage.isEncryptionAvailable()) fs.writeFileSync(msTokenPath(), safeStorage.encryptString(t)); } catch {} }
function findJava21() {
  const rt = path.join(app.getPath("appData"), ".minecraft", "runtime");
  // Minecraft 26.1.x exige Java 25 : runtime « epsilon » du launcher officiel, sinon une installation Java 25 classique
  const cands = [path.join(rt, "java-runtime-epsilon", "windows-x64", "java-runtime-epsilon", "bin", "java.exe")];
  for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)) {
    for (const vendor of ["Java", "Eclipse Adoptium", "Microsoft", "Zulu", "BellSoft", "Amazon Corretto"]) {
      try {
        const d = path.join(base, vendor);
        if (fs.existsSync(d)) for (const n of fs.readdirSync(d)) if (/(^|[^0-9])25([^0-9]|$)/.test(n)) cands.push(path.join(d, n, "bin", "java.exe"));
      } catch {}
    }
  }
  if (process.env.JAVA_HOME) cands.push(path.join(process.env.JAVA_HOME, "bin", "java.exe"));
  for (const exe of cands) { try { if (fs.existsSync(exe)) return exe; } catch {} }
  return null;
}
let kbLaunching = false;
// ------------------------------------------------------------------
// Temps de jeu KannibAventure (sessions lancées depuis le launcher) : jour / semaine / mois / année
// ------------------------------------------------------------------
const kbSessionsPath = () => path.join(app.getPath("userData"), "kb-sessions.json");
function readKbSessions() { try { const a = JSON.parse(fs.readFileSync(kbSessionsPath(), "utf8")); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeKbSessions(a) { try { fs.writeFileSync(kbSessionsPath(), JSON.stringify(a.slice(-3000))); } catch {} }
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
let kbSessionTimer = null;
// Résumé de fin de session (fenêtre + notification Windows si le launcher n'est pas au premier plan)
function emitSessionEnded(game, seconds, todaySeconds) {
  if (seconds < 120) return; // sessions trop courtes ignorées
  const label = game === "anomia" ? "Anomia RP" : "KannibAventure";
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("session:ended", { game, label, seconds, todaySeconds });
    try {
      if (!mainWindow.isFocused()) {
        const { Notification } = require("electron");
        if (Notification.isSupported()) new Notification({ title: `Session ${label} terminée`, body: `Tu as joué ${Math.floor(seconds / 3600) ? Math.floor(seconds / 3600) + " h " : ""}${Math.floor((seconds % 3600) / 60)} min.` }).show();
      }
    } catch {}
  }
}
const kbLiveStarts = new Set(); // sessions démarrées pendant cette exécution du launcher
function kbTick() {
  const a = readKbSessions(); let any = false;
  for (const s of a) {
    if (!s.open) continue;
    if (s.pid && pidAlive(s.pid)) { s.last = Date.now(); any = true; }
    else {
      s.open = false;
      if (kbLiveStarts.has(s.start)) { kbLiveStarts.delete(s.start); try { emitSessionEnded("kannibaventure", Math.round(((s.last || s.start) - s.start) / 1000), kbPlaytime().day); } catch {} }
    }
  }
  writeKbSessions(a);
  if (!any && kbSessionTimer) { clearInterval(kbSessionTimer); kbSessionTimer = null; }
  return any;
}
function kbEnsureTimer() { if (!kbSessionTimer) kbSessionTimer = setInterval(kbTick, 30000); }
function kbTrackStart(pid) { const t0 = Date.now(); kbLiveStarts.add(t0); const a = readKbSessions(); a.push({ start: t0, last: Date.now(), pid, open: true }); writeKbSessions(a); kbEnsureTimer(); }
function kbPlaytime() {
  const now = Date.now(), d = new Date();
  const win = { day: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), week: now - 7 * 864e5, month: now - 30 * 864e5, year: now - 365 * 864e5, total: 0 };
  const out = { day: 0, week: 0, month: 0, year: 0, total: 0 };
  for (const s of readKbSessions()) {
    const end = s.open ? now : s.last || s.start;
    for (const k of Object.keys(win)) out[k] += Math.max(0, Math.round((end - Math.max(s.start, win[k])) / 1000));
  }
  return out;
}
ipcMain.handle("kb:getPlaytime", () => ({ ok: true, ...kbPlaytime() }));
app.whenReady().then(() => { if (kbTick()) kbEnsureTimer(); });

const kbRoot = () => path.join(app.getPath("appData"), ".minecraft");
const kbGameDir = () => path.join(kbRoot(), "kannibaventure"); // instance isolée : mods, config, mondes, options
// Étapes 1 à 4 : Java 25, NeoForge, fichiers du jeu, mods (partagées entre le lancement et « Réparer »)
async function kbPrepare({ verify, progress, klog, kb, versionId }) {
  const K = require("./kb-install");
  const { loadVersion, ruleOk } = require("./kb-launch");
  const root = kbRoot(), gameDir = kbGameDir();
  fs.mkdirSync(gameDir, { recursive: true });
  let java;
  try { java = await K.ensureJava({ userData: app.getPath("userData"), findExisting: findJava21, progress, AdmZip: require("adm-zip") }); }
  catch (e) { throw new Error("Java 25 : " + e.message); }
  klog("# java : " + java);
  await K.ensureNeoForge({ root, java, installerSrc: path.join(__dirname, "assets", "neoforge-installer.jar"), versionId, tmpDir: path.join(app.getPath("temp"), "b2-launcher"), log: klog, progress });
  try { await K.ensureGameFiles({ root, versionId, loadVersion, ruleOk, progress, log: klog, verify }); }
  catch (e) { throw new Error("fichiers du jeu : " + e.message); }
  const mp = kb.modpack;
  if (mp && mp.repo) {
    try {
      progress({ step: "mods", label: "Vérification des mods", percent: null });
      const { pack, assets } = await K.loadModpack(mp);
      await K.syncMods({ gameDir, pack, assets, progress, log: klog });
    } catch (e) {
      klog("# mods : " + e.message);
      const have = fs.existsSync(path.join(gameDir, "mods")) && fs.readdirSync(path.join(gameDir, "mods")).some((f) => /\.jar$/i.test(f));
      if (!have) throw new Error("mods : " + e.message);
    }
  }
  return { java, root, gameDir };
}
function kbMemory() {
  const gb = Math.max(2, Math.min(16, Number(loadSettings().kbMemoryGb) || 4));
  return { max: gb + "G", min: Math.min(2, gb) + "G" };
}
ipcMain.handle("kb:repair", async () => {
  if (kbLaunching) return { ok: false, reason: "Un lancement est déjà en cours." };
  const kb = (config.servers || []).find((s) => s.id === "kannibaventure") || {};
  const versionId = kb.minecraftVersionId || kb.minecraftVersion || "26.1.2";
  kbLaunching = true;
  const logFile = path.join(app.getPath("userData"), "kb-launch.log");
  const klog = (t) => { try { fs.appendFileSync(logFile, String(t) + "\n"); } catch {} };
  try { fs.writeFileSync(logFile, `# KannibAventure — réparation ${new Date().toISOString()}\n`); } catch {}
  try {
    await kbPrepare({ verify: true, progress: (p) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("kb:launchProgress", p); }, klog, kb, versionId });
    return { ok: true };
  } catch (e) { klog("# erreur : " + e.message); return { ok: false, reason: e.message }; }
  finally { kbLaunching = false; }
});
ipcMain.handle("kb:openFolder", async () => { const d = kbGameDir(); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d); return { ok: true }; });
ipcMain.handle("kb:openLog", async () => {
  const f = path.join(app.getPath("userData"), "kb-launch.log");
  if (fs.existsSync(f)) { shell.showItemInFolder(f); return { ok: true }; }
  return { ok: false, reason: "Aucun journal pour l'instant (lance KannibAventure une fois)." };
});
ipcMain.handle("kb:launchDirect", async () => {
  if (kbLaunching) return { ok: false, fallback: false, reason: "Lancement déjà en cours." };
  const kb = (config.servers || []).find((s) => s.id === "kannibaventure") || {};
  const addr = `${kb.serverAddress}:${kb.serverPort || 25565}`;
  const version = kb.minecraftVersion || "26.1.2";
  const versionId = kb.minecraftVersionId || version;
  kbLaunching = true;
  const send = (ch, p) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, p); };
  const progress = (p) => send("kb:launchProgress", p);
  const logFile = path.join(app.getPath("userData"), "kb-launch.log");
  const klog = (t) => { try { fs.appendFileSync(logFile, String(t).replace(/(--accessToken\s+)\S+/g, "$1***") + "\n"); } catch {} };
  try { fs.writeFileSync(logFile, `# KannibAventure — lancement ${new Date().toISOString()}\n# version: ${version} / ${versionId}\n`); } catch {}
  try {
    const { buildLaunch } = require("./kb-launch");
    const root = kbRoot(), gameDir = kbGameDir();
    fs.mkdirSync(gameDir, { recursive: true });
    // Première fois : reprend tes réglages (touches, vidéo, son) du Minecraft habituel pour ne pas tout reconfigurer
    try {
      const src = path.join(root, "options.txt"), dst = path.join(gameDir, "options.txt");
      if (!fs.existsSync(dst) && fs.existsSync(src)) { fs.copyFileSync(src, dst); klog("# options.txt copié depuis .minecraft"); }
    } catch {}

    let java;
    try { java = (await kbPrepare({ verify: false, progress, klog, kb, versionId })).java; }
    catch (e) { return { ok: false, fallback: true, reason: e.message }; }

    // 5) Connexion Microsoft (jeton mémorisé ensuite)
    progress({ step: "auth", label: "Connexion Microsoft…", percent: null });
    let mc;
    try {
      const { Auth } = require("msmc");
      const ma = config.microsoftAuth || {};
      const auth = ma.clientId ? new Auth({ client_id: ma.clientId, redirect: ma.redirect, prompt: "select_account" }) : new Auth("select_account");
      let xbox = null;
      const saved = readMsToken();
      if (saved) { try { xbox = await auth.refresh(saved); } catch { xbox = null; } }
      if (!xbox) xbox = await auth.launch("electron", { width: 520, height: 700, title: "Connexion Microsoft" });
      mc = await xbox.getMinecraft();
      writeMsToken(xbox.save());
    } catch (e) { return { ok: false, fallback: true, reason: "connexion Microsoft : " + ((e && e.message) || e) }; }

    // 6) Lancement direct dans le serveur
    progress({ step: "start", label: "Démarrage de Minecraft…", percent: null });
    const nativesDir = path.join(root, "bin", "b2-natives");
    try { fs.mkdirSync(nativesDir, { recursive: true }); } catch {}
    let plan;
    try { plan = buildLaunch({ root, gameDir, versionId, auth: mc.mclc(), quickPlay: addr, nativesDir, memory: kbMemory() }); }
    catch (e) { return { ok: false, fallback: true, reason: e.message }; }
    // Journal partageable : on masque le jeton d'accès et l'adresse du serveur
    klog("# commande : " + java + " " + plan.args.join(" ").replace(/(--accessToken\s+)\S+/g, "$1***").replace(/(--quickPlayMultiplayer\s+)\S+/g, "$1***").split(addr).join("***"));
    const { spawn } = require("child_process");
    const out = fs.openSync(logFile, "a");
    const child = spawn(java, plan.args, { cwd: gameDir, detached: true, stdio: ["ignore", out, out] });
    const early = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 8000);
      child.on("error", (e) => { clearTimeout(t); resolve("Impossible de lancer Java : " + e.message); });
      child.on("exit", (c) => { clearTimeout(t); resolve(c === 0 ? null : "Minecraft s'est arrêté (code " + c + "), voir kb-launch.log"); });
    });
    if (early) return { ok: false, fallback: true, reason: early };
    child.unref();
    if (child.pid) kbTrackStart(child.pid);
    return { ok: true, direct: true, version, player: mc.profile && mc.profile.name };
  } catch (e) {
    klog("# erreur : " + ((e && e.stack) || e));
    return { ok: false, fallback: true, reason: (e && e.message) || "Erreur inattendue." };
  } finally { kbLaunching = false; }
});
ipcMain.handle("kb:forgetMicrosoft", () => { try { fs.unlinkSync(msTokenPath()); } catch {} return { ok: true }; });

ipcMain.on("app:relaunch", () => { app.relaunch(); app.exit(0); });

ipcMain.handle("settings:get", () => loadSettings());
ipcMain.handle("tour:get", () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "src", "tour.json"), "utf8")); } catch { return []; }
});
ipcMain.handle("settings:set", (event, patch) => saveSettings(patch));

// ============================================================
// Temps de jeu (observé localement, jamais transmis à un serveur - c'est
// purement pour l'affichage personnel du joueur). On considère que le
// joueur "joue" quand FiveM.exe tourne en même temps que le launcher est
// ouvert. Suivi sur 4 périodes indépendantes (jour/semaine/mois/année),
// chacune remise à zéro uniquement quand SA propre période change.
// ============================================================
function getIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Jour/mois/année suivent l'heure locale du joueur (plus intuitif que l'UTC
// pour "aujourd'hui"/"ce mois-ci"), la semaine garde son calcul ISO existant.
function getPeriodKeys(date = new Date()) {
  return {
    day: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    week: getIsoWeekKey(date),
    month: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`,
    year: `${date.getFullYear()}`
  };
}

// Une seule commande « tasklist » à la fois, résultat gardé 10 s (plusieurs fonctions le demandent)
let fivemCheck = { at: 0, value: false, pending: null };
function isFiveMRunning() {
  if (process.platform !== "win32") return Promise.resolve(false);
  if (Date.now() - fivemCheck.at < 10000) return Promise.resolve(fivemCheck.value);
  if (fivemCheck.pending) return fivemCheck.pending;
  fivemCheck.pending = new Promise((resolve) => {
    const { exec } = require("child_process");
    exec('tasklist /FI "IMAGENAME eq FiveM.exe" /NH', { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      const v = err ? false : stdout.toLowerCase().includes("fivem.exe");
      fivemCheck = { at: Date.now(), value: v, pending: null };
      resolve(v);
    });
  });
  return fivemCheck.pending;
}

const PLAYTIME_POLL_MS = 60000; // vérifie toutes les minutes
const PLAYTIME_PERIODS = ["day", "week", "month", "year"];

let fivemSince = null;
async function pollPlaytime() {
  const running = await isFiveMRunning();
  if (running && !fivemSince) fivemSince = Date.now();
  if (!running) {
    if (fivemSince) {
      const secs = Math.round((Date.now() - fivemSince) / 1000);
      fivemSince = null;
      try {
        const st = (loadSettings().playtimeStats || {}).day;
        emitSessionEnded("anomia", secs, st && st.key === getPeriodKeys().day ? st.seconds : secs);
      } catch {}
    }
    return;
  }

  const keys = getPeriodKeys();
  const settings = loadSettings();
  const stats = settings.playtimeStats || {};
  const addedSeconds = PLAYTIME_POLL_MS / 1000;

  PLAYTIME_PERIODS.forEach((period) => {
    const current = stats[period];
    if (!current || current.key !== keys[period]) {
      stats[period] = { key: keys[period], seconds: addedSeconds };
    } else {
      current.seconds += addedSeconds;
    }
  });

  saveSettings({ playtimeStats: stats });
}

setInterval(pollPlaytime, PLAYTIME_POLL_MS);

ipcMain.handle("playtime:get", () => {
  const settings = loadSettings();
  const stats = settings.playtimeStats || {};
  const keys = getPeriodKeys();
  const result = {};

  PLAYTIME_PERIODS.forEach((period) => {
    const current = stats[period];
    result[period] = current && current.key === keys[period] ? current.seconds : 0;
  });

  return result; // { day, week, month, year } en secondes
});

// ============================================================
// Staff de l'équipe (page publique, contenu géré via un fichier distant -
// même principe que news.json/media.json)
// ============================================================
ipcMain.handle("staff:get", async () => {
  let staff = [];
  if (config.staff.remoteUrl) {
    try {
      const remote = await fetchJsonCached(config.staff.remoteUrl);
      if (Array.isArray(remote) && remote.length > 0) staff = remote;
    } catch {
      // on retombe sur le fichier local ci-dessous
    }
  }
  if (staff.length === 0) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, config.staff.localFallback), "utf-8");
      staff = JSON.parse(raw);
    } catch {
      staff = [];
    }
  }
  return staff;
});

ipcMain.handle("rules:get", async () => {
  let content = "";
  if (config.rules.remoteUrl) {
    try {
      const remote = await fetchJsonCached(config.rules.remoteUrl);
      if (remote && remote.content) content = remote.content;
    } catch {
      // on retombe sur le fichier local ci-dessous
    }
  }
  if (!content) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, config.rules.localFallback), "utf-8");
      const parsed = JSON.parse(raw);
      content = parsed.content || "";
    } catch {
      content = "";
    }
  }
  return content;
});

// --- B2 Launcher : liste des serveurs + contenu des pages KannibAventure ---
ipcMain.handle("servers:get", () => ({ servers: config.servers || [], hub: config.hub || { slides: [] }, twitch: config.twitch || null }));

ipcMain.handle("kb:getContent", async (_event, name) => {
  const files = (config.kannibaventure && config.kannibaventure.files) || {};
  const fileName = files[name]; // seuls les noms déclarés dans la config sont autorisés
  if (!fileName) return null;
  const readLocal = () => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, "src", fileName), "utf-8")); }
    catch { return null; }
  };
  try {
    const remote = await fetchJsonCached(config.kannibaventure.remoteBase + fileName);
    if (remote) return remote;
  } catch {
    // on retombe sur le fichier local
  }
  return readLocal();
});

// --- KannibAventure : installateur de mods ---
const kbModsStatePath = () => path.join(app.getPath("userData"), "kb-mods-state.json");

function readKbModsState() {
  try { return JSON.parse(fs.readFileSync(kbModsStatePath(), "utf-8")); } catch { return {}; }
}
function writeKbModsState(state) {
  try { fs.writeFileSync(kbModsStatePath(), JSON.stringify(state, null, 2)); } catch { /* non bloquant */ }
}
function defaultMinecraftModsFolder() {
  return path.join(app.getPath("appData"), ".minecraft", "mods");
}

async function loadKbModsManifest() {
  const fileName = config.kannibaventure.files.mods;
  try {
    const remote = await fetchJson(config.kannibaventure.remoteBase + fileName);
    if (remote && Array.isArray(remote.mods)) return remote;
  } catch { /* fichier local ci-dessous */ }
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "src", fileName), "utf-8")); }
  catch { return { minecraft: null, loader: null, mods: [] }; }
}

// Un nom de fichier de mod doit être un simple nom .jar (jamais un chemin) et une URL https.
function isSafeMod(mod) {
  return mod && typeof mod.file === "string" && /^[\w.\-+() ]+\.jar$/i.test(mod.file) &&
    typeof mod.url === "string" && mod.url.startsWith("https://") &&
    typeof mod.sha256 === "string" && /^[a-f0-9]{64}$/i.test(mod.sha256);
}

function sha256File(filePath) {
  return new Promise((resolve) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", () => resolve(null));
  });
}

function downloadWithRedirects(url, destPath, onChunk, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("trop de redirections"));
    if (!url.startsWith("https://")) return reject(new Error("URL non sécurisée"));
    const req = https.get(url, { headers: { "User-Agent": "B2Launcher/1.5" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return downloadWithRedirects(next, destPath, onChunk, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const tmp = destPath + ".part";
      const out = fs.createWriteStream(tmp);
      res.on("data", (chunk) => onChunk && onChunk(chunk.length));
      res.pipe(out);
      out.on("finish", () => out.close(() => fs.rename(tmp, destPath, (e) => (e ? reject(e) : resolve()))));
      out.on("error", (e) => { fs.unlink(tmp, () => {}); reject(e); });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
  });
}

async function computeKbModsStatus() {
  const manifest = await loadKbModsManifest();
  const state = readKbModsState();
  const folder = state.folder || defaultMinecraftModsFolder();
  const folderExists = fs.existsSync(folder);
  const mods = [];
  for (const mod of manifest.mods || []) {
    if (!isSafeMod(mod)) continue;
    let status = "missing";
    const target = path.join(folder, mod.file);
    if (folderExists && fs.existsSync(target)) {
      const hash = await sha256File(target);
      status = hash && hash.toLowerCase() === mod.sha256.toLowerCase() ? "ok" : "outdated";
    }
    mods.push({ name: mod.name || mod.file, file: mod.file, size: mod.size || 0, status });
  }
  return {
    minecraft: manifest.minecraft || null,
    loader: manifest.loader || null,
    loaderVersion: manifest.loaderVersion || null,
    notes: manifest.notes || "",
    folder,
    folderExists,
    mods
  };
}

ipcMain.handle("kbmods:getState", async () => {
  const kb = (config.servers || []).find((x) => x.id === "kannibaventure") || {};
  const modsDir = path.join(kbGameDir(), "mods");
  const cache = path.join(app.getPath("userData"), "kb-modpack-cache.json");
  let pack = null, note = "";
  try { pack = (await require("./kb-install").loadModpack(kb.modpack)).pack; try { fs.writeFileSync(cache, JSON.stringify(pack)); } catch {} }
  catch (e) { note = "Liste en ligne indisponible (" + e.message + ")."; try { pack = JSON.parse(fs.readFileSync(cache, "utf8")); } catch {} }
  const mods = ((pack && pack.mods) || []).map((m) => {
    let status = "missing";
    try { const st = fs.statSync(path.join(modsDir, m.file)); status = st.size === m.size ? "ok" : "outdated"; } catch {}
    return { name: m.file.replace(/\.jar$/i, ""), file: m.file, size: m.size, status };
  });
  return { minecraft: kb.minecraftVersion || "26.1.2", loader: "NeoForge", loaderVersion: kb.neoForgeVersion || "", notes: note, folder: modsDir, folderExists: fs.existsSync(modsDir), mods };
});
ipcMain.handle("kbmods:chooseFolder", async () => { await shell.openPath(kbGameDir()); return { ok: false }; });
ipcMain.handle("kbmods:install", async (event) => {
  if (kbLaunching) return { ok: false, error: "Un lancement est déjà en cours." };
  const kb = (config.servers || []).find((x) => x.id === "kannibaventure") || {};
  const versionId = kb.minecraftVersionId || kb.minecraftVersion || "26.1.2";
  kbLaunching = true;
  const logFile = path.join(app.getPath("userData"), "kb-launch.log");
  const klog = (t) => { try { fs.appendFileSync(logFile, String(t) + "\n"); } catch {} };
  try { fs.writeFileSync(logFile, `# KannibAventure — vérification ${new Date().toISOString()}\n`); } catch {}
  try {
    await kbPrepare({ verify: true, progress: (p) => { try { event.sender.send("kbmods:progress", p); } catch {} }, klog, kb, versionId });
    return { ok: true, message: "Java, NeoForge, fichiers du jeu et mods sont à jour." };
  } catch (e) { klog("# erreur : " + e.message); return { ok: false, error: e.message }; }
  finally { kbLaunching = false; }
});

ipcMain.handle("map:getPoints", async () => {
  let points = [];
  if (config.map.remoteUrl) {
    try {
      const remote = await fetchJsonCached(config.map.remoteUrl);
      if (Array.isArray(remote)) points = remote;
    } catch {
      // on retombe sur le fichier local ci-dessous
    }
  }
  if (points.length === 0) {
    try {
      const raw = fs.readFileSync(path.join(__dirname, config.map.localFallback), "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) points = parsed;
    } catch {
      points = [];
    }
  }
  return points;
});

// ============================================================
// Compte à rebours du prochain redémarrage programmé (via b2_pingstats)
// ============================================================
ipcMain.handle("server:nextRestart", async () => {
  try {
    const stats = await fetchJson(config.server.pingStatsUrl, 4000);
    return stats.nextRestartAt || null;
  } catch {
    return null;
  }
});

// ============================================================
// Envoi automatique des rapports de crash FiveM vers Discord
// Détecte les nouveaux fichiers CfxCrashDump_*.zip dans les emplacements
// habituels, demande le consentement du joueur, puis n'envoie QUE le texte
// du log (pas le fichier binaire) via une ressource serveur qui relaie vers
// un webhook Discord - le webhook ne quitte jamais le serveur.
// ============================================================
const AdmZip = (() => {
  try {
    return require("adm-zip");
  } catch {
    return null; // dépendance pas installée -> fonctionnalité désactivée proprement
  }
})();

function getCrashWatchDirs() {
  const dirs = [];
  if (process.env.USERPROFILE) {
    dirs.push(path.join(process.env.USERPROFILE, "Desktop"));
    dirs.push(path.join(process.env.USERPROFILE, "Downloads"));
  }
  return dirs.filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });
}

function extractCrashLogText(zipPath) {
  if (!AdmZip) return null;
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const logEntry = entries.find((e) => /CitizenFX_log.*\.log$/i.test(e.entryName));
    if (!logEntry) return null;
    const fullText = zip.readAsText(logEntry);
    // On ne garde que la toute fin du log (là où se trouve la vraie erreur), pour
    // rester léger et lisible dans un message Discord.
    return fullText.slice(-2500);
  } catch (err) {
    console.error("[crash-report] impossible de lire le zip :", err.message);
    return null;
  }
}

function watchForCrashDumps() {
  if (process.platform !== "win32" || !AdmZip) return;

  const seen = new Set();
  for (const dir of getCrashWatchDirs()) {
    try {
      fs.watch(dir, (eventType, filename) => {
        if (!filename || !/^CfxCrashDump_.*\.zip$/i.test(filename)) return;
        const fullPath = path.join(dir, filename);
        if (seen.has(fullPath)) return;
        seen.add(fullPath);

        // Petit délai pour laisser le temps au fichier d'être complètement écrit sur disque
        setTimeout(() => {
          mainWindow?.webContents.send("crash:detected", { path: fullPath, filename });
        }, 2000);
      });
    } catch (err) {
      console.error(`[crash-report] impossible de surveiller ${dir} :`, err.message);
    }
  }
}

ipcMain.handle("crash:send", async (event, crashPath) => {
  const logText = extractCrashLogText(crashPath);
  if (!logText) {
    return { ok: false, error: "Impossible de lire le contenu du rapport de crash." };
  }

  try {
    const payload = JSON.stringify({
      player: process.env.USERNAME || "Joueur inconnu",
      log: logText
    });

    await new Promise((resolve, reject) => {
      const url = new URL(config.server.crashReportUrl);
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => (res.statusCode < 300 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`))));
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

if (app.isPackaged) {
  app.whenReady().then(watchForCrashDumps);
}
