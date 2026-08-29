// ============================================================
// ANOMIA LAUNCHER — renderer
// ============================================================

let isAdminUnlocked = false;

// --- Thème (appliqué le plus tôt possible pour éviter un flash) ---
window.anomia.getSettings().then((settings) => {
  const theme = settings.theme || "teal";
  if (theme !== "teal") document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll(".theme-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
});

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
  if (name === "twitch") loadStreamers();
  if (name === "staff") loadStaff();
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
  window.anomia.openExternal("https://discord.gg/ECBhuTMw7n");
});

// --- Connexion serveur ---
document.getElementById("btn-connect").addEventListener("click", async (e) => {
  if (discordProfile && discordProfile.allowed === false) {
    await showInfo(
      "Accès refusé",
      `<p>Tu dois avoir le rôle whitelist sur le Discord d'Anomia pour te connecter. Rejoins-nous et refais une demande d'accès.</p>`
    );
    return;
  }

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const dot = document.createElement("span");
  dot.className = "ripple-dot";
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${e.clientX - rect.left - size / 2}px`;
  dot.style.top = `${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(dot);
  setTimeout(() => dot.remove(), 550);

  window.anomia.connect();
});

// --- Statut serveur (polling) ---
let lastJobStats = {};
let lastServerOnline = false;
let lastServerMaintenance = false;

function updateConnectButtonState() {
  const btn = document.getElementById("btn-connect");
  // Le bouton reste utilisable si : le serveur est en ligne ET (pas en
  // maintenance OU l'admin s'est identifié avec le code d'accès staff).
  const canConnect = lastServerOnline && (!lastServerMaintenance || isAdminUnlocked);
  btn.disabled = !canConnect;

  if (!lastServerOnline) {
    btn.textContent = "Serveur hors ligne";
  } else if (lastServerMaintenance && !isAdminUnlocked) {
    btn.textContent = "Serveur en maintenance";
  } else {
    btn.textContent = "Se connecter";
  }
}

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
  lastServerOnline = Boolean(status.online);
  lastServerMaintenance = Boolean(status.maintenance);

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

  updateConnectButtonState();
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

// --- Streamers Twitch ---
function renderStreamerCard(streamer) {
  const el = document.createElement("div");
  el.className = `streamer-card ${streamer.live ? "live" : ""}`;
  const avatar = streamer.avatarUrl || "../assets/logo.png";
  el.innerHTML = `
    <div class="streamer-avatar-wrap">
      <img src="${avatar}" alt="" class="streamer-avatar" />
    </div>
    <span class="streamer-name">${escapeHtml(streamer.displayName || streamer.channel)}</span>
    <span class="streamer-status">
      <span class="streamer-status-dot ${streamer.live ? "live" : ""}"></span>
      ${streamer.live ? "En live" : "Hors ligne"}
    </span>
    ${streamer.live ? `<span class="streamer-viewers">${streamer.viewers} viewer${streamer.viewers > 1 ? "s" : ""}</span>` : ""}
  `;
  el.addEventListener("click", () => openStreamerModal(streamer));
  return el;
}

function openStreamerModal(streamer) {
  const overlay = document.getElementById("streamer-overlay");
  const thumbnail = document.getElementById("streamer-modal-thumbnail");
  const avatar = document.getElementById("streamer-modal-avatar");
  const name = document.getElementById("streamer-modal-name");
  const status = document.getElementById("streamer-modal-status");
  const title = document.getElementById("streamer-modal-title");
  const bio = document.getElementById("streamer-modal-bio");
  const openBtn = document.getElementById("streamer-modal-open");

  avatar.src = streamer.avatarUrl || "../assets/logo.png";
  name.textContent = streamer.displayName || streamer.channel;

  if (streamer.live) {
    status.textContent = `En live · ${streamer.viewers} viewer${streamer.viewers > 1 ? "s" : ""}`;
    status.classList.add("live");
  } else {
    status.textContent = "Hors ligne";
    status.classList.remove("live");
  }

  if (streamer.live && streamer.thumbnailUrl) {
    thumbnail.src = `${streamer.thumbnailUrl}?t=${Date.now()}`; // évite le cache d'une vieille miniature
    thumbnail.classList.remove("hidden");
  } else {
    thumbnail.classList.add("hidden");
  }

  if (streamer.live && streamer.title) {
    title.textContent = streamer.title;
    title.classList.remove("hidden");
  } else {
    title.classList.add("hidden");
  }

  bio.textContent = streamer.bio || "Aucune bio renseignée.";
  openBtn.onclick = () => window.anomia.openExternal(`https://twitch.tv/${streamer.channel}`);

  overlay.classList.remove("hidden");
}

document.getElementById("streamer-close").addEventListener("click", () => {
  document.getElementById("streamer-overlay").classList.add("hidden");
});

// --- Fermeture générique des fenêtres normales : clic en dehors, ou touche Échap ---
// (jamais appliqué à update-overlay, qui doit rester bloquant tant que la mise à jour n'est pas faite)
const DISMISSABLE_OVERLAYS = ["confirm-overlay", "info-overlay", "admin-overlay", "streamer-overlay", "settings-overlay", "staff-overlay"];

DISMISSABLE_OVERLAYS.forEach((id) => {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  DISMISSABLE_OVERLAYS.forEach((id) => {
    document.getElementById(id)?.classList.add("hidden");
  });
});

let streamersLoaded = false;
async function loadStreamers() {
  if (streamersLoaded) return;
  streamersLoaded = true;
  const grid = document.getElementById("streamer-grid");
  const result = await window.anomia.getTwitchStatus();

  if (!result.ok) {
    grid.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Statut Twitch indisponible pour le moment.</p>`;
    streamersLoaded = false; // permet de réessayer au prochain passage sur l'onglet
    return;
  }

  grid.innerHTML = "";
  if (!result.streamers.length) {
    grid.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Aucun streamer configuré.</p>`;
    return;
  }

  // Les lives en premier
  const sorted = [...result.streamers].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0));
  sorted.forEach((s) => grid.appendChild(renderStreamerCard(s)));
}

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

// --- Auto-update (obligatoire, bouton unique télécharger+installer) ---
const updateOverlay = document.getElementById("update-overlay");
const updateMessage = document.getElementById("update-message");
const updateChangelog = document.getElementById("update-changelog");
const updateChangelogText = document.getElementById("update-changelog-text");
const updateProgressTrack = document.getElementById("update-progress-track");
const updateProgressFill = document.getElementById("update-progress-fill");
const updateProgressLabel = document.getElementById("update-progress-label");
const updateDownloadBtn = document.getElementById("update-download-btn");
const updateRetryBtn = document.getElementById("update-retry-btn");
const updateStatusLabel = document.getElementById("update-status");
let pendingUpdateVersion = null;
let updateFlowActive = false; // true seulement entre "update-available" et la fin du process

function setUpdateChangelog(notes) {
  if (notes && notes.trim()) {
    updateChangelogText.textContent = notes.trim();
    updateChangelog.classList.remove("hidden");
  } else {
    updateChangelog.classList.add("hidden");
  }
}

window.anomia.onUpdateAvailable(({ version, releaseNotes }) => {
  updateFlowActive = true;
  pendingUpdateVersion = version;
  updateOverlay.classList.remove("hidden");
  updateMessage.textContent = `Une nouvelle version (v${version}) est disponible. Le serveur nécessite la dernière version pour te connecter.`;
  setUpdateChangelog(releaseNotes);
  updateProgressTrack.classList.add("hidden");
  updateProgressLabel.textContent = "";
  updateDownloadBtn.classList.remove("hidden");
  updateDownloadBtn.disabled = false;
  updateDownloadBtn.textContent = "Télécharger et installer";
  updateRetryBtn.classList.add("hidden");
  updateStatusLabel.textContent = "Mise à jour dispo";
  updateStatusLabel.classList.remove("checking");
});

window.anomia.onUpdateNotAvailable(() => {
  updateStatusLabel.textContent = "✓ À jour";
  updateStatusLabel.classList.remove("checking");
});

window.anomia.onUpdateProgress(({ percent }) => {
  // Ne montre JAMAIS cette fenêtre bloquante en dehors d'un vrai cycle de mise à
  // jour en cours - évite qu'un événement isolé/tardif ne bloque tout le launcher
  // (bug corrigé : ça pouvait rendre l'appli totalement inutilisable).
  if (!updateFlowActive) return;
  updateOverlay.classList.remove("hidden");
  updateProgressTrack.classList.remove("hidden");
  updateProgressFill.style.width = `${Math.round(percent)}%`;
  updateProgressLabel.textContent = `${Math.round(percent)}%`;
});

window.anomia.onUpdateDownloaded(({ version, releaseNotes }) => {
  if (!updateFlowActive) return;
  updateOverlay.classList.remove("hidden");
  setUpdateChangelog(releaseNotes);
  updateProgressTrack.classList.add("hidden");
  updateProgressLabel.textContent = "";
  updateRetryBtn.classList.add("hidden");
  updateMessage.textContent = `Mise à jour v${version} téléchargée. Installation en cours…`;
  updateDownloadBtn.textContent = "Installation en cours…";
  updateDownloadBtn.disabled = true;
  // Installation automatique juste après le téléchargement, sans clic supplémentaire.
  setTimeout(() => window.anomia.installUpdate(), 900);
});

window.anomia.onUpdateError(({ message }) => {
  // Seulement affiché si une mise à jour était déjà en cours (overlay visible) -
  // une simple absence de connexion au démarrage ne doit jamais bloquer le launcher.
  if (!updateFlowActive || updateOverlay.classList.contains("hidden")) return;
  updateMessage.textContent = `Erreur pendant la mise à jour : ${message}`;
  updateProgressTrack.classList.add("hidden");
  updateDownloadBtn.classList.add("hidden");
  updateRetryBtn.classList.remove("hidden");
});

updateDownloadBtn.addEventListener("click", () => {
  updateDownloadBtn.disabled = true;
  updateDownloadBtn.textContent = "Téléchargement en cours…";
  updateMessage.textContent = `Téléchargement de la v${pendingUpdateVersion} en cours…`;
  updateProgressTrack.classList.remove("hidden");
  updateProgressFill.style.width = "0%";
  window.anomia.downloadUpdate();
});
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
    isAdminUnlocked = true;
    document.getElementById("nav-admin").classList.remove("hidden");
    updateConnectButtonState();
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

// --- Connexion Discord (pré-vérification avant de se connecter) ---
let discordProfile = null;

function renderDiscordSlot() {
  const slot = document.getElementById("discord-auth-slot");

  if (!discordProfile) {
    slot.innerHTML = `<button class="ext-link discord-connect-btn" id="btn-discord-auth">Se connecter avec Discord</button>`;
    document.getElementById("btn-discord-auth").addEventListener("click", () => {
      window.anomia.startDiscordAuth();
    });
    return;
  }

  const dotClass = discordProfile.allowed === false ? "denied" : "allowed";
  const avatarSrc = discordProfile.avatar || "../assets/logo.png";
  slot.innerHTML = `
    <div class="discord-profile" title="${discordProfile.allowed === false ? "Rôle whitelist manquant" : "Connecté"}">
      <img src="${avatarSrc}" alt="" />
      <span class="discord-profile-name">${escapeHtml(discordProfile.username || "Joueur")}</span>
      <span class="discord-profile-dot ${dotClass}"></span>
    </div>
  `;
}

async function initDiscordAuth() {
  const configured = await window.anomia.isDiscordConfigured();
  if (!configured) {
    document.getElementById("discord-auth-slot").style.display = "none";
    return;
  }

  discordProfile = await window.anomia.getDiscordProfile();
  renderDiscordSlot();

  window.anomia.onDiscordConnected((profile) => {
    discordProfile = profile;
    renderDiscordSlot();
    if (profile.allowed === false) {
      showInfo(
        "Rôle whitelist manquant",
        `<p>Ton compte Discord est bien lié, mais tu n'as pas encore le rôle whitelist requis. Tu ne pourras pas te connecter au serveur tant que ce n'est pas fait.</p>`
      );
    }
  });

  window.anomia.onDiscordError(({ message }) => {
    showInfo("Connexion Discord", `<p>Erreur : ${escapeHtml(message)}</p>`);
  });
}
initDiscordAuth();

// --- Réglages (thème + temps de jeu) ---
document.getElementById("btn-settings").addEventListener("click", async () => {
  document.getElementById("settings-overlay").classList.remove("hidden");
  const { seconds } = await window.anomia.getPlaytime();
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  document.getElementById("settings-playtime").textContent = h > 0 ? `${h}h ${m}min` : `${m} min`;
});

document.getElementById("settings-close").addEventListener("click", () => {
  document.getElementById("settings-overlay").classList.add("hidden");
});

document.querySelectorAll(".theme-option").forEach((btn) => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.theme;
    document.querySelectorAll(".theme-option").forEach((b) => b.classList.toggle("active", b === btn));
    if (theme === "teal") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    window.anomia.setSettings({ theme });
  });
});

// --- Page Staff ---
function renderStaffCard(member) {
  const el = document.createElement("div");
  el.className = "staff-card";
  const avatar = member.avatarUrl || "../assets/logo.png";
  el.innerHTML = `
    <img src="${avatar}" alt="" class="staff-avatar" />
    <span class="staff-name">${escapeHtml(member.name || "")}</span>
    <span class="staff-role">${escapeHtml(member.role || "")}</span>
  `;
  el.addEventListener("click", () => openStaffModal(member));
  return el;
}

function openStaffModal(member) {
  document.getElementById("staff-modal-avatar").src = member.avatarUrl || "../assets/logo.png";
  document.getElementById("staff-modal-name").textContent = member.name || "";
  document.getElementById("staff-modal-role").textContent = member.role || "";
  document.getElementById("staff-modal-bio").textContent = member.bio || "Aucune bio renseignée.";
  document.getElementById("staff-overlay").classList.remove("hidden");
}

document.getElementById("staff-close").addEventListener("click", () => {
  document.getElementById("staff-overlay").classList.add("hidden");
});

// Ordre d'affichage fixe des catégories. Une catégorie sans aucun membre
// n'affiche tout simplement rien (ni titre, ni section vide).
const STAFF_CATEGORY_ORDER = ["Admin", "Modo", "Helper", "Admin Discord", "Modo Discord"];

let staffLoaded = false;
async function loadStaff() {
  if (staffLoaded) return;
  staffLoaded = true;
  const container = document.getElementById("staff-grid");
  const staff = await window.anomia.getStaff();
  container.innerHTML = "";

  if (!staff.length) {
    container.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Équipe pas encore renseignée.</p>`;
    staffLoaded = false;
    return;
  }

  STAFF_CATEGORY_ORDER.forEach((category) => {
    const members = staff.filter((m) => m.category === category);
    if (members.length === 0) return; // catégorie vide -> on n'affiche rien du tout

    const section = document.createElement("div");
    section.className = "staff-category";
    section.innerHTML = `<span class="section-eyebrow">// ${escapeHtml(category.toUpperCase())}</span>`;

    const grid = document.createElement("div");
    grid.className = "staff-grid";
    members.forEach((m) => grid.appendChild(renderStaffCard(m)));

    section.appendChild(grid);
    container.appendChild(section);
  });
}

// --- Compte à rebours du prochain redémarrage programmé ---
let restartCountdownInterval = null;

function formatCountdown(msRemaining) {
  if (msRemaining <= 0) return "imminent";
  const totalMinutes = Math.floor(msRemaining / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

async function refreshNextRestart() {
  const banner = document.getElementById("restart-banner");
  const text = document.getElementById("restart-banner-text");
  const iso = await window.anomia.getNextRestart();

  if (restartCountdownInterval) {
    clearInterval(restartCountdownInterval);
    restartCountdownInterval = null;
  }

  if (!iso) {
    banner.classList.add("hidden");
    return;
  }

  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    banner.classList.add("hidden");
    return;
  }

  const tick = () => {
    const remaining = target - Date.now();
    if (remaining <= -5 * 60000) {
      // Redémarrage annoncé mais jamais mis à jour après coup - on masque après 5 min de retard
      banner.classList.add("hidden");
      clearInterval(restartCountdownInterval);
      return;
    }
    text.textContent = `⏱️ Prochain redémarrage dans ${formatCountdown(remaining)}`;
    banner.classList.remove("hidden");
  };

  tick();
  restartCountdownInterval = setInterval(tick, 30000);
}
refreshNextRestart();
setInterval(refreshNextRestart, 5 * 60000); // revérifie la config toutes les 5 min

// --- Tour guidé (premier lancement uniquement, persiste après une mise à jour) ---
const ONBOARDING_STEPS = [
  { selector: '[data-view="home"]', text: "Bienvenue sur le launcher Anomia ! Ici tu retrouves le statut du serveur et le bouton pour te connecter." },
  { selector: '[data-view="news"]', text: "Les patch-notes du serveur, toujours à jour." },
  { selector: '[data-view="twitch"]', text: "Vois en un coup d'œil quels streamers de la communauté sont en live." },
  { selector: '[data-view="staff"]', text: "Découvre l'équipe qui fait tourner Anomia." },
  { selector: "#btn-settings", text: "Personnalise le thème du launcher ici, et retrouve ton temps de jeu de la semaine." }
];
let onboardingStep = 0;

function showOnboardingStep() {
  const overlay = document.getElementById("onboarding-overlay");
  const step = ONBOARDING_STEPS[onboardingStep];
  if (!step) {
    finishOnboarding();
    return;
  }
  const target = document.querySelector(step.selector);
  const tooltip = document.getElementById("onboarding-tooltip");
  document.getElementById("onboarding-text").textContent = step.text;
  document.getElementById("onboarding-progress").textContent = `${onboardingStep + 1}/${ONBOARDING_STEPS.length}`;
  document.getElementById("onboarding-next").textContent =
    onboardingStep === ONBOARDING_STEPS.length - 1 ? "Terminer" : "Suivant";

  if (target) {
    const rect = target.getBoundingClientRect();
    document.getElementById("onboarding-highlight").style.cssText = `
      top:${rect.top - 6}px; left:${rect.left - 6}px; width:${rect.width + 12}px; height:${rect.height + 12}px;
    `;
    const tooltipTop = Math.min(rect.bottom + 14, window.innerHeight - 160);
    tooltip.style.cssText = `top:${tooltipTop}px; left:${Math.max(20, Math.min(rect.left, window.innerWidth - 320))}px;`;
  }
  overlay.classList.remove("hidden");
}

function finishOnboarding() {
  document.getElementById("onboarding-overlay").classList.add("hidden");
  window.anomia.setSettings({ onboardingSeen: true });
}

document.getElementById("onboarding-next").addEventListener("click", () => {
  onboardingStep++;
  showOnboardingStep();
});
document.getElementById("onboarding-skip").addEventListener("click", finishOnboarding);

window.anomia.getSettings().then((settings) => {
  if (!settings.onboardingSeen) {
    onboardingStep = 0;
    setTimeout(showOnboardingStep, 600); // laisse le launcher finir de s'afficher d'abord
  }
});

// --- Rapports de crash FiveM ---
window.anomia.onCrashDetected(async ({ path: crashPath }) => {
  const confirmed = await showConfirm(
    "Crash FiveM détecté",
    "On dirait que FiveM vient de crasher. Tu veux envoyer le rapport à l'équipe pour nous aider à corriger ça ? Seul le texte du log est transmis, jamais tes fichiers persos."
  );
  if (!confirmed) return;

  const result = await window.anomia.sendCrashReport(crashPath);
  if (result.ok) {
    await showInfo("Rapport envoyé", `<p>Merci ! Le rapport de crash a bien été transmis à l'équipe.</p>`);
  } else {
    await showInfo("Erreur", `<p>Impossible d'envoyer le rapport : ${escapeHtml(result.error || "raison inconnue")}</p>`);
  }
});
