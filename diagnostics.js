// ============================================================
// B2 Launcher - Rapports d'erreur / diagnostics
// - Garde un journal (fichier + mémoire) de tout ce que le launcher écrit en console.
// - Si le launcher plante (erreur fatale, processus d'affichage mort), génère
//   automatiquement un ZIP de rapport, ouvre l'explorateur de fichiers dessus
//   et affiche un message : le joueur n'a plus qu'à envoyer le zip.
// - Aucun jeton / mot de passe n'est inclus (tout est nettoyé avant écriture).
// ============================================================
const { app, dialog, shell, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

let AdmZip = null;
try { AdmZip = require("adm-zip"); } catch (e) { /* le rapport sera alors écrit en dossier */ }

const MAX_MEM_LINES = 800;
const MAX_LOG_BYTES = 1024 * 1024; // 1 Mo, puis rotation
const memLines = [];
let logStream = null;
let logFile = null;
let crashHandled = false;
let appVersionSafe = "?";

function sanitize(text) {
  if (text == null) return "";
  let s = String(text);
  // chemins utilisateur -> pas de nom Windows dans le rapport
  try {
    const home = os.homedir();
    if (home) s = s.split(home).join("~");
  } catch (e) {}
  s = s.replace(/(access_token|refresh_token|id_token|client_secret|token|secret|authorization|passphrase|password|GH_TOKEN)(["'\s]*[:=]["'\s]*)([^\s"',}&]+)/gi, "$1$2[MASQUÉ]");
  s = s.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [MASQUÉ]");
  s = s.replace(/[MN][A-Za-z0-9_\-]{23,27}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27,}/g, "[TOKEN-DISCORD-MASQUÉ]");
  s = s.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[TOKEN-GITHUB-MASQUÉ]");
  return s;
}

function stamp() {
  return new Date().toISOString();
}

function pushLine(level, args) {
  let msg;
  try {
    msg = args.map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "object") { try { return JSON.stringify(a); } catch (e) { return String(a); } }
      return String(a);
    }).join(" ");
  } catch (e) { msg = "(log illisible)"; }
  const line = `[${stamp()}] [${level}] ${sanitize(msg)}`;
  memLines.push(line);
  if (memLines.length > MAX_MEM_LINES) memLines.shift();
  try { if (logStream) logStream.write(line + "\n"); } catch (e) {}
}

function logsDir() {
  return path.join(app.getPath("userData"), "logs");
}

function initLogging() {
  try {
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, "launcher.log");
    try {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) {
        fs.renameSync(logFile, path.join(dir, "launcher.old.log"));
      }
    } catch (e) {}
    logStream = fs.createWriteStream(logFile, { flags: "a" });
    logStream.on("error", () => { logStream = null; });
  } catch (e) { logStream = null; }

  for (const level of ["log", "info", "warn", "error"]) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      pushLine(level.toUpperCase(), args);
      try { orig(...args); } catch (e) {}
    };
  }
  pushLine("INFO", [`--- Démarrage B2 Launcher ${appVersionSafe} (${process.platform} ${os.release()}) ---`]);
}

function reportsDir() {
  let base;
  try { base = app.getPath("documents"); } catch (e) { base = app.getPath("userData"); }
  return path.join(base, "B2 Launcher - Rapports");
}

function readSettingsSanitized() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "settings.json"), "utf-8"));
    // On ne garde que des réglages d'apparence/comportement, jamais d'identifiants.
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (/token|secret|pass|auth|discord|profile|oauth/i.test(k)) { out[k] = "[MASQUÉ]"; continue; }
      out[k] = v;
    }
    return JSON.stringify(out, null, 2);
  } catch (e) { return "(settings illisibles)"; }
}

function systemInfo(extra) {
  const lines = [];
  lines.push(`Date du rapport : ${stamp()}`);
  lines.push(`Launcher : ${app.getName()} ${appVersionSafe} (${app.isPackaged ? "installé" : "développement"})`);
  lines.push(`Electron : ${process.versions.electron} | Chrome : ${process.versions.chrome} | Node : ${process.versions.node}`);
  lines.push(`Système : ${process.platform} ${process.arch} ${os.release()}`);
  lines.push(`RAM : ${(os.freemem() / 1073741824).toFixed(1)} Go libres / ${(os.totalmem() / 1073741824).toFixed(1)} Go`);
  lines.push(`CPU : ${(os.cpus()[0] || {}).model || "?"} x${os.cpus().length}`);
  lines.push(`Uptime du launcher : ${Math.round(process.uptime())} s`);
  try {
    lines.push(`Fenêtres ouvertes : ${BrowserWindow.getAllWindows().length}`);
  } catch (e) {}
  if (extra) lines.push("", extra);
  return lines.join("\n");
}

function writeReport(kind, errorText) {
  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const name = `B2Launcher-${kind}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

  const files = {
    "LISEZMOI.txt":
      "Rapport d'erreur du B2 Launcher\n" +
      "================================\n\n" +
      "Envoie ce fichier .zip au staff (ticket Discord ou MP) pour qu'on corrige le problème.\n" +
      "Il ne contient AUCUN mot de passe ni jeton de connexion : seulement des informations\n" +
      "techniques (version, système, journal du launcher, erreur).\n",
    "erreur.txt": sanitize(errorText || "(aucune erreur détaillée : rapport manuel)"),
    "systeme.txt": sanitize(systemInfo()),
    "reglages.json": readSettingsSanitized(),
    "journal-recent.log": memLines.join("\n")
  };
  // fin du journal sur disque (couvre les lancements précédents)
  try {
    if (logFile && fs.existsSync(logFile)) {
      const buf = fs.readFileSync(logFile);
      files["journal-complet.log"] = sanitize(buf.slice(Math.max(0, buf.length - 400 * 1024)).toString("utf-8"));
    }
  } catch (e) {}

  if (AdmZip) {
    const zip = new AdmZip();
    for (const [fname, content] of Object.entries(files)) zip.addFile(fname, Buffer.from(content, "utf-8"));
    const zipPath = path.join(dir, name + ".zip");
    zip.writeZip(zipPath);
    return zipPath;
  }
  const folder = path.join(dir, name);
  fs.mkdirSync(folder, { recursive: true });
  for (const [fname, content] of Object.entries(files)) fs.writeFileSync(path.join(folder, fname), content, "utf-8");
  return folder;
}

function revealReport(target) {
  try { shell.showItemInFolder(target); } catch (e) {
    try { shell.openPath(path.dirname(target)); } catch (e2) {}
  }
}

// Crash : rapport + explorateur + message. Une seule fois par session.
function handleFatal(kind, errorText) {
  if (crashHandled) return;
  crashHandled = true;
  let target = null;
  try {
    target = writeReport(kind, errorText);
    revealReport(target);
  } catch (e) {
    pushLine("ERROR", ["Impossible d'écrire le rapport :", e]);
  }
  try {
    dialog.showMessageBoxSync({
      type: "error",
      title: "B2 Launcher - Erreur",
      message: "Le B2 Launcher a rencontré un problème et doit se fermer.",
      detail: target
        ? "Un rapport d'erreur a été créé et son dossier vient de s'ouvrir.\nEnvoie le fichier .zip sélectionné au staff pour qu'on puisse corriger ça.\n\nIl ne contient aucun mot de passe."
        : "Le rapport n'a pas pu être créé. Relance le launcher ; si ça recommence, préviens le staff.",
      buttons: ["Fermer"]
    });
  } catch (e) {}
}

// Rapport manuel (bouton dans les réglages) : n'arrête rien.
function createManualReport() {
  const target = writeReport("manuel", "Rapport demandé manuellement par l'utilisateur.");
  revealReport(target);
  return target;
}

function init(version) {
  appVersionSafe = version || "?";
  initLogging();

  process.on("uncaughtException", (err) => {
    pushLine("FATAL", ["uncaughtException", err]);
    handleFatal("crash", `uncaughtException\n${err && err.stack ? err.stack : err}`);
    setTimeout(() => app.exit(1), 300);
  });
  process.on("unhandledRejection", (reason) => {
    // Pas fatal en soi : on journalise (ça apparaîtra dans le rapport si un vrai crash suit).
    pushLine("ERROR", ["unhandledRejection", reason]);
  });

  app.on("render-process-gone", (event, webContents, details) => {
    pushLine("FATAL", ["render-process-gone", JSON.stringify(details)]);
    if (details && details.reason === "clean-exit") return;
    handleFatal("affichage", `Le processus d'affichage s'est arrêté : ${JSON.stringify(details)}`);
    setTimeout(() => app.exit(1), 300);
  });
  app.on("child-process-gone", (event, details) => {
    pushLine("ERROR", ["child-process-gone", JSON.stringify(details)]);
    // GPU qui plante : Electron relance seul, on journalise sans alerter.
  });
}

module.exports = { init, createManualReport, sanitize, _writeReport: writeReport };
