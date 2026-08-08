// ============================================================
// ANOMIA LAUNCHER — renderer
// ============================================================

const TWITCH_CHANNEL = "b2obi64";

// --- Contrôles fenêtre ---
document.getElementById("btn-min").addEventListener("click", () => window.anomia.minimize());
document.getElementById("btn-max").addEventListener("click", () => window.anomia.maximize());
document.getElementById("btn-close").addEventListener("click", () => window.anomia.close());

// --- Version affichée ---
window.anomia.getAppVersion().then((v) => {
  document.getElementById("app-version").textContent = `v${v}`;
});

// --- Navigation entre vues ---
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");

function goToView(name) {
  navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
  views.forEach((v) => {
    const shouldShow = v.id === `view-${name}`;
    v.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      // Rejoue l'animation d'entrée même si on revient sur une vue déjà visitée
      v.classList.remove("view-entering");
      void v.offsetWidth; // force le navigateur à repartir de zéro avant de rajouter la classe
      v.classList.add("view-entering");
    }
  });
  if (name === "twitch") loadTwitchEmbed();
  if (name === "media") loadMedia();
  if (name === "admin") refreshAdminStats();
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => goToView(btn.dataset.view));
});
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => goToView(btn.dataset.goto));
});

// --- Discord ---
document.getElementById("btn-discord").addEventListener("click", () => {
  window.anomia.openExternal("https://discord.gg/REMPLACE_MOI");
});

// --- Connexion serveur ---
document.getElementById("btn-connect").addEventListener("click", () => {
  window.anomia.connect();
});

// --- Statut serveur (polling) ---
let lastJobStats = {};

async function refreshStatus() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const count = document.getElementById("players-count");
  const tmStatus = document.getElementById("tm-status");
  const tmPlayers = document.getElementById("tm-players");
  const tmPing = document.getElementById("tm-ping");
  const tmJobs = document.getElementById("tm-jobs");
  const maintenanceBanner = document.getElementById("maintenance-banner");

  const status = await window.anomia.getServerStatus();

  if (status.online) {
    count.textContent = `${status.clients} / ${status.maxClients}`;
    tmPlayers.textContent = `${status.clients}/${status.maxClients}`;

    if (status.maintenance) {
      dot.className = "status-dot maintenance";
      text.textContent = "En maintenance";
      tmStatus.textContent = "MAINTENANCE";
      tmStatus.classList.remove("dim");
      tmStatus.classList.add("maintenance-active");
      maintenanceBanner.classList.remove("hidden");
    } else {
      dot.className = "status-dot online";
      text.textContent = "En ligne";
      tmStatus.textContent = "ONLINE";
      tmStatus.classList.remove("dim", "maintenance-active");
      maintenanceBanner.classList.add("hidden");
    }

    if (typeof status.avgPing === "number") {
      tmPing.textContent = `${status.avgPing} ms`;
    } else {
      const pings = (status.players || []).map((p) => p.ping).filter((p) => typeof p === "number" && p > 0);
      tmPing.textContent = pings.length
        ? `${Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)} ms`
        : "Indisponible";
    }

    lastJobStats = status.jobs || {};
    const jobCategories = Object.keys(lastJobStats).length;
    tmJobs.textContent = jobCategories > 0 ? String(jobCategories) : "—";
  } else {
    dot.className = "status-dot offline";
    text.textContent = "Hors ligne / injoignable";
    count.textContent = "–";
    tmStatus.textContent = "OFFLINE";
    tmStatus.classList.add("dim");
    tmStatus.classList.remove("maintenance-active");
    tmPlayers.textContent = "—";
    tmPing.textContent = "—";
    tmJobs.textContent = "—";
    lastJobStats = {};
    maintenanceBanner.classList.add("hidden");
  }
}
refreshStatus();
setInterval(refreshStatus, 30000);

// --- News ---
function tagClass(tag) {
  const t = (tag || "").toLowerCase();
  if (t.includes("fix")) return "fix";
  if (t.includes("nouveau")) return "nouveau";
  return "maj";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Transforme le texte brut d'un patch-note (retours à la ligne, "*" en puces,
// ".1 : Texte" en points numérotés, "-Titre" ou "Titre :" en sous-titre,
// lignes "---" ignorées) en HTML structuré, pour garder la mise en forme
// que b2 utilise déjà dans Discord.
function formatContent(raw) {
  const lines = String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^-{2,}$/.test(l)); // ignore les lignes "---" (séparateurs)

  let html = "";
  let i = 0;

  while (i < lines.length) {
    // répare l'artefact occasionnel de copier-coller Discord où un ":" isolé
    // se retrouve seul en début de ligne (ex: ": .1 : Tablette")
    const line = lines[i].replace(/^:\s*/, "");
    const subMatch = line.match(/^\.(\d+)\s*:\s*(.*)$/);

    if (subMatch) {
      html += `<div class="news-subitem"><strong>${escapeHtml(subMatch[2] || `Point ${subMatch[1]}`)}</strong>`;
      i++;
      const bullets = [];
      while (i < lines.length && lines[i].startsWith("*")) {
        bullets.push(lines[i].slice(1).trim());
        i++;
      }
      if (bullets.length) {
        html += `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
      }
      html += "</div>";
      continue;
    }

    // sous-titre de section : commence par "-" (ex: "-Nouveautés") ou finit par ":" (ex: "Nouveautés :")
    const isDashHeading = /^-[^-]/.test(line);
    const isColonHeading = /:$/.test(line) && !line.startsWith("*");
    if (isDashHeading || isColonHeading) {
      const clean = line.replace(/^-+\s*/, "").replace(/:$/, "").trim();
      html += `<div class="news-heading">${escapeHtml(clean)}</div>`;
      i++;
      continue;
    }

    if (line.startsWith("*")) {
      const bullets = [];
      while (i < lines.length && lines[i].startsWith("*")) {
        bullets.push(lines[i].slice(1).trim());
        i++;
      }
      html += `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
      continue;
    }

    html += `<p>${escapeHtml(line)}</p>`;
    i++;
  }

  return html;
}

function renderNewsCard(item) {
  const el = document.createElement("div");
  el.className = "news-card";
  el.innerHTML = `
    <span class="news-date">${escapeHtml(item.date || "")}</span>
    <span class="news-tag ${tagClass(item.tag)}">${escapeHtml(item.tag || "MAJ")}</span>
    <h3>${escapeHtml(item.title || "")}</h3>
    <div class="news-body">${formatContent(item.content)}</div>
  `;
  return el;
}

async function loadNews() {
  const news = await window.anomia.getNews();
  const preview = document.getElementById("news-preview");
  const list = document.getElementById("news-list");
  preview.innerHTML = "";
  list.innerHTML = "";

  if (!news.length) {
    preview.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Aucune actu pour le moment.</p>`;
    return;
  }

  news.slice(0, 3).forEach((item) => preview.appendChild(renderNewsCard(item)));
  news.forEach((item) => list.appendChild(renderNewsCard(item)));
}
loadNews();

// --- Twitch ---
let twitchLoaded = false;
function loadTwitchEmbed() {
  if (twitchLoaded) return;
  twitchLoaded = true;
  // "parent" doit correspondre au domaine hôte. En Electron il n'y a pas de vrai domaine,
  // donc on déclare localhost — si Twitch refuse l'affichage, utilise le bouton
  // "Ouvrir sur twitch.tv" en dessous comme repli.
  document.getElementById("twitch-player").src =
    `https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=localhost&muted=false`;
  document.getElementById("twitch-chat").src =
    `https://www.twitch.tv/embed/${TWITCH_CHANNEL}/chat?parent=localhost&darkpopout`;
}
document.getElementById("btn-open-twitch").addEventListener("click", () => {
  window.anomia.openExternal(`https://twitch.tv/${TWITCH_CHANNEL}`);
});

// --- Assets ---
const assetsStatus = document.getElementById("assets-status");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const btnCheckAssets = document.getElementById("btn-check-assets");

window.anomia.onAssetsProgress(({ fileName, fileProgress, done, total }) => {
  const overall = total ? (done + fileProgress) / total : 0;
  progressFill.style.width = `${Math.round(overall * 100)}%`;
  progressLabel.textContent = `${fileName} — ${done}/${total} fichiers`;
});

btnCheckAssets.addEventListener("click", async () => {
  btnCheckAssets.disabled = true;
  assetsStatus.textContent = "Vérification en cours…";
  progressFill.style.width = "0%";
  progressLabel.textContent = "";

  try {
    const result = await window.anomia.checkAssets();

    if (result.ok) {
      assetsStatus.textContent =
        result.updated > 0
          ? `${result.updated} fichier(s) mis à jour sur ${result.total}. Tout est prêt.`
          : "Tous les fichiers sont déjà à jour.";
      progressFill.style.width = "100%";
    } else if (result.notConfigured) {
      assetsStatus.textContent = result.error;
      progressFill.style.width = "0%";
    } else {
      assetsStatus.textContent = `Erreur : ${result.error}`;
    }
  } catch (err) {
    assetsStatus.textContent = `Erreur inattendue : ${err.message}`;
  } finally {
    btnCheckAssets.disabled = false;
  }
});

// --- Modale de confirmation custom (pas de window.confirm) ---
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-overlay");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-message").textContent = message;
    overlay.classList.remove("hidden");

    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    const cleanup = (result) => {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// --- Cache FiveM ---
function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function refreshCacheInfo() {
  const status = document.getElementById("cache-status");
  const info = await window.anomia.getCacheInfo();
  if (!info.exists) {
    status.textContent = "Dossier cache FiveM introuvable sur cette machine (le jeu a-t-il déjà été lancé ?).";
    return;
  }
  if (info.error) {
    status.textContent = `Impossible de lire le cache : ${info.error}`;
    return;
  }
  const preserved = info.totalSize - info.clearableSize;
  status.textContent = `${formatMB(info.clearableSize)} de cache à libérer. game-storage préservé (${formatMB(preserved)}).`;
}
refreshCacheInfo();

document.getElementById("btn-clear-cache").addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "Vider le cache FiveM ?",
    "Ça supprime les fichiers temporaires (textures, streaming) téléchargés par FiveM. Tes paramètres et données locales (game-storage) sont conservés. FiveM re-téléchargera le nécessaire au prochain lancement."
  );
  if (!confirmed) return;

  const btn = document.getElementById("btn-clear-cache");
  const status = document.getElementById("cache-status");
  btn.disabled = true;
  status.textContent = "Nettoyage en cours…";

  try {
    const result = await window.anomia.clearCache();
    if (result.ok) {
      status.textContent = `Cache vidé (${result.cleared} élément(s) supprimé(s)). game-storage conservé.`;
    } else {
      const detail = result.error || (result.errors || []).join(", ");
      status.textContent = `Terminé avec des erreurs : ${detail}`;
    }
  } catch (err) {
    status.textContent = `Erreur inattendue : ${err.message}`;
  } finally {
    btn.disabled = false;
    refreshCacheInfo();
  }
});

// --- Modale d'information (générique, OK uniquement) ---
function showInfo(title, htmlMessage) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("info-overlay");
    document.getElementById("info-title").textContent = title;
    document.getElementById("info-message").innerHTML = htmlMessage;
    overlay.classList.remove("hidden");

    const okBtn = document.getElementById("info-ok");
    const onOk = () => {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      resolve();
    };
    okBtn.addEventListener("click", onOk);
  });
}

// --- Diagnostic réseau ---
document.getElementById("btn-diagnose").addEventListener("click", async (e) => {
  const btn = e.target;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Test en cours…";

  try {
    const r = await window.anomia.diagnoseNetwork();
    const lines = [
      `<p><strong>Connexion (${r.ip}:${r.port})</strong> : ${r.tcpOk ? `✅ OK (${r.tcpLatencyMs} ms)` : `❌ Échec${r.tcpError ? " — " + r.tcpError : ""}`}</p>`,
      `<p><strong>Serveur FiveM (HTTP)</strong> : ${r.httpOk ? `✅ Répond (${r.httpLatencyMs} ms)` : "❌ Ne répond pas"}</p>`
    ];
    if (!r.tcpOk) {
      lines.push(`<p style="color:var(--text-dim);font-size:12.5px;">Le port ne répond pas — pare-feu, serveur hors ligne, ou mauvaise adresse.</p>`);
    } else if (!r.httpOk) {
      lines.push(`<p style="color:var(--text-dim);font-size:12.5px;">Le port est joignable mais le serveur ne répond pas en HTTP — le serveur redémarre peut-être.</p>`);
    }
    await showInfo("Diagnostic connexion", lines.join(""));
  } catch (err) {
    await showInfo("Diagnostic connexion", `<p>Erreur inattendue : ${err.message}</p>`);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

// --- Population par job (clic sur la carte télémétrie "Entreprises ouvertes") ---
document.getElementById("tm-jobs-item").addEventListener("click", async () => {
  const entries = Object.entries(lastJobStats);
  if (entries.length === 0) {
    await showInfo("Entreprises ouvertes", `<p style="color:var(--text-dim);">Aucune donnée disponible pour le moment (serveur hors ligne, ou ressource b2_pingstats pas installée).</p>`);
    return;
  }
  entries.sort((a, b) => b[1].onDuty - a[1].onDuty); // du plus actif au moins actif
  const rows = entries
    .map(
      ([label, counts]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:13px;">
        <span style="color:var(--text-dim);">${escapeHtml(label)}</span>
        <span style="color:var(--violet);font-weight:700;">${counts.onDuty}/${counts.total}</span>
      </div>`
    )
    .join("");
  await showInfo("Entreprises ouvertes", `<div>${rows}</div><p style="color:var(--text-faint);font-size:11px;margin-top:10px;">En service / connectés avec ce métier</p>`);
});

// --- Galerie média ---
function renderMediaItem(item) {
  const el = document.createElement("div");
  el.className = "media-item";
  el.innerHTML = `
    <img src="${escapeHtml(item.url)}" alt="" loading="lazy" />
    <div class="media-item-author">${escapeHtml(item.author || "")}${item.date ? " · " + escapeHtml(item.date) : ""}</div>
  `;
  el.addEventListener("click", () => window.anomia.openExternal(item.url));
  return el;
}

let mediaLoaded = false;
async function loadMedia() {
  if (mediaLoaded) return;
  mediaLoaded = true;
  const grid = document.getElementById("media-grid");
  const media = await window.anomia.getMedia();
  grid.innerHTML = "";
  if (!media.length) {
    grid.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Aucun media partagé pour le moment.</p>`;
    return;
  }
  media.forEach((item) => grid.appendChild(renderMediaItem(item)));
}

// --- Détection FiveM ---
async function checkFiveM() {
  const banner = document.getElementById("fivem-banner");
  const bannerText = document.getElementById("fivem-banner-text");
  const status = document.getElementById("fivem-status");
  const dlBtn = document.getElementById("btn-fivem-download");
  const dlBtnBanner = document.getElementById("btn-download-fivem");

  const result = await window.anomia.checkFiveM();

  if (!result.supported) {
    status.textContent = "Vérification automatique non disponible sur ce système.";
    return;
  }

  if (!result.installed) {
    banner.classList.remove("hidden");
    bannerText.textContent = "FiveM non détecté sur cette machine — installe-le pour pouvoir te connecter.";
    status.textContent = "FiveM ne semble pas installé.";
    dlBtn.classList.remove("hidden");
    const openDownload = () => window.anomia.openExternal("https://fivem.net/");
    dlBtn.addEventListener("click", openDownload);
    dlBtnBanner.addEventListener("click", openDownload);
    return;
  }

  if (result.possiblyStale) {
    banner.classList.remove("hidden");
    bannerText.textContent = `FiveM n'a pas été mis à jour depuis ${result.daysSinceUpdate} jours — relance-le pour vérifier les mises à jour.`;
    document.getElementById("btn-download-fivem").textContent = "OK";
    document.getElementById("btn-download-fivem").addEventListener("click", () => banner.classList.add("hidden"));
  }
  status.textContent =
    typeof result.daysSinceUpdate === "number"
      ? `FiveM détecté (dernière mise à jour il y a ${result.daysSinceUpdate} jour(s)).`
      : "FiveM détecté.";
}
checkFiveM();

// --- Auto-update (obligatoire, mais téléchargement déclenché manuellement) ---
const updateOverlay = document.getElementById("update-overlay");
const updateMessage = document.getElementById("update-message");
const updateProgressTrack = document.getElementById("update-progress-track");
const updateProgressFill = document.getElementById("update-progress-fill");
const updateProgressLabel = document.getElementById("update-progress-label");
const updateDownloadBtn = document.getElementById("update-download-btn");
const updateInstallBtn = document.getElementById("update-install-btn");
const updateRetryBtn = document.getElementById("update-retry-btn");
const updateStatusLabel = document.getElementById("update-status");
let pendingUpdateVersion = null;

window.anomia.onUpdateAvailable(({ version }) => {
  pendingUpdateVersion = version;
  updateOverlay.classList.remove("hidden");
  updateMessage.textContent = `Une nouvelle version (v${version}) est disponible. Le serveur nécessite la dernière version pour te connecter.`;
  updateProgressTrack.classList.add("hidden");
  updateProgressLabel.textContent = "";
  updateDownloadBtn.classList.remove("hidden");
  updateInstallBtn.classList.add("hidden");
  updateRetryBtn.classList.add("hidden");
  updateStatusLabel.textContent = "Mise à jour dispo";
  updateStatusLabel.classList.remove("checking");
});

window.anomia.onUpdateNotAvailable(() => {
  updateStatusLabel.textContent = "✓ À jour";
  updateStatusLabel.classList.remove("checking");
});

window.anomia.onUpdateProgress(({ percent }) => {
  updateOverlay.classList.remove("hidden"); // sécurité si l'event arrive avant "available"
  updateProgressTrack.classList.remove("hidden");
  updateProgressFill.style.width = `${Math.round(percent)}%`;
  updateProgressLabel.textContent = `${Math.round(percent)}%`;
});

window.anomia.onUpdateDownloaded(({ version }) => {
  updateOverlay.classList.remove("hidden");
  updateMessage.textContent = `Mise à jour v${version} prête. Installe-la pour pouvoir te connecter au serveur.`;
  updateProgressTrack.classList.add("hidden");
  updateProgressLabel.textContent = "";
  updateDownloadBtn.classList.add("hidden");
  updateInstallBtn.classList.remove("hidden");
  updateRetryBtn.classList.add("hidden");
});

window.anomia.onUpdateError(({ message }) => {
  // Seulement affiché si une mise à jour était déjà en cours (overlay visible) -
  // une simple absence de connexion au démarrage ne doit jamais bloquer le launcher.
  if (updateOverlay.classList.contains("hidden")) return;
  updateMessage.textContent = `Erreur pendant la mise à jour : ${message}`;
  updateProgressTrack.classList.add("hidden");
  updateDownloadBtn.classList.add("hidden");
  updateInstallBtn.classList.add("hidden");
  updateRetryBtn.classList.remove("hidden");
});

updateDownloadBtn.addEventListener("click", () => {
  updateDownloadBtn.classList.add("hidden");
  updateMessage.textContent = `Téléchargement de la v${pendingUpdateVersion} en cours…`;
  updateProgressTrack.classList.remove("hidden");
  updateProgressFill.style.width = "0%";
  window.anomia.downloadUpdate();
});
updateInstallBtn.addEventListener("click", () => window.anomia.installUpdate());
updateRetryBtn.addEventListener("click", async () => {
  updateMessage.textContent = "Nouvelle tentative…";
  updateRetryBtn.classList.add("hidden");
  await window.anomia.retryUpdateCheck();
});

// --- Admin (lecture seule) ---
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "a") {
    document.getElementById("admin-overlay").classList.remove("hidden");
    document.getElementById("admin-passphrase").focus();
  }
});

document.getElementById("admin-cancel").addEventListener("click", () => {
  document.getElementById("admin-overlay").classList.add("hidden");
  document.getElementById("admin-passphrase").value = "";
});

async function tryUnlockAdmin() {
  const input = document.getElementById("admin-passphrase");
  const result = await window.anomia.unlockAdmin(input.value);
  input.value = "";
  document.getElementById("admin-overlay").classList.add("hidden");

  if (result.ok) {
    document.getElementById("nav-admin").classList.remove("hidden");
    goToView("admin");
  } else if (result.error) {
    await showInfo("Accès staff", `<p>${result.error}</p>`);
  } else {
    await showInfo("Accès staff", `<p>Code incorrect.</p>`);
  }
}
document.getElementById("admin-submit").addEventListener("click", tryUnlockAdmin);
document.getElementById("admin-passphrase").addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryUnlockAdmin();
});

async function refreshAdminStats() {
  const stats = await window.anomia.getAdminStats();
  document.getElementById("admin-players").textContent =
    stats.players !== null ? `${stats.players}/${stats.maxPlayers ?? "?"}` : "—";
  document.getElementById("admin-ping").textContent =
    typeof stats.avgPing === "number" ? `${stats.avgPing} ms` : "Indisponible";
  document.getElementById("admin-resources").textContent =
    stats.resourceCount !== null ? stats.resourceCount : "—";

  const txBtn = document.getElementById("btn-open-txadmin");
  if (stats.txAdminUrl) {
    txBtn.classList.remove("hidden");
    txBtn.onclick = () => window.anomia.openExternal(stats.txAdminUrl);
  }
}
