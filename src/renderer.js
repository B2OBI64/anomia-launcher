// ============================================================
// ANOMIA LAUNCHER — renderer
// ============================================================

let discordProfile = null; // profil Discord connecté (déclaré en haut : utilisé par l'accueil)
// État de l'accueil (déclaré en haut : utilisé dès l'initialisation)
let STREAMER_DATA = [];
let manualPick = null; // chaîne choisie à la main (reste jusqu'au rechargement)
let streamersFetchedAt = 0;
let featuredNow = null;
const CHANNEL_RE = /^[A-Za-z0-9_]{1,25}$/;
let profileShowcaseKeys = null; // succès choisis pour le profil (null = automatique : les 3 plus rares)
let achCache = { at: 0, promise: null };
let streamerMode = false; // mode présentation : masque pseudo/avatar
let chosenTitleKey = ""; // titre choisi par le joueur
let isAdminUnlocked = false; // admin complet (bypass connexion, maintenance)
let staffRole = null; // "admin" | "mod"
let staffScopes = { anomia: false, kb: false };
// Rôle « citoyen » par serveur : true / false / null (inconnu). Bloque le bouton de connexion si false.
const citizen = { anomia: null, kannibaventure: null };
const CITIZEN_TIP = "Rejoins le Discord pour passer ta douane";
window.__citizen = citizen;
window.isKbAdmin = () => staffRole === "admin" && !!staffScopes.kb;
async function refreshCitizen() {
  if (typeof discordProfile === "undefined" || !discordProfile) { citizen.anomia = null; citizen.kannibaventure = null; }
  else {
    for (const sv of ["anomia", "kannibaventure"]) {
      try { const r = await window.anomia.checkCitizen(sv); citizen[sv] = r && typeof r.citizen === "boolean" ? r.citizen : null; } catch { citizen[sv] = null; }
    }
  }
  try { updateConnectButtonState(); } catch {}
  try { if (window.refreshKbConnect) window.refreshKbConnect(); } catch {}
}
window.refreshCitizen = refreshCitizen;
setInterval(() => { refreshCitizen(); }, 120000);

// --- Thème : mode sombre/clair + couleur d'accent (appliqués le plus tôt possible) ---
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}
function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}
function darkenHex(hex, amount = 0.35) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(Math.round(r * (1 - amount)), Math.round(g * (1 - amount)), Math.round(b * (1 - amount)));
}

const GS_MODES = ["light", "black", "dark"];
const GS_LABELS = { light: "Fond clair", black: "Fond noir", dark: "Fond noir violet" };
let currentBgMode = "dark";
const systemDarkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function applyMode(mode) {
  if (!GS_MODES.includes(mode)) mode = "dark"; // ancien mode « auto » → noir violet
  const previous = currentBgMode;
  currentBgMode = mode;
  if (mode === "light" || mode === "black") {
    document.documentElement.setAttribute("data-mode", mode);
  } else {
    document.documentElement.removeAttribute("data-mode");
  }
  const sw = document.getElementById("bg-options");
  if (sw) {
    sw.style.setProperty("--i", String(GS_MODES.indexOf(mode)));
    if (previous !== mode) { // effet « liquide » : le verre s'étire pendant le déplacement
      sw.classList.remove("moving"); void sw.offsetWidth; sw.classList.add("moving");
    }
    sw.querySelectorAll(".gs-btn").forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  const cap = document.getElementById("gs-caption");
  if (cap) cap.textContent = GS_LABELS[mode];
}
// Mode automatique : suit le thème de Windows en direct


function applyAccentColor(hex) {
  const root = document.documentElement;
  const { r, g, b } = hexToRgb(hex);
  root.style.setProperty("--teal", hex);
  root.style.setProperty("--teal-dim", darkenHex(hex, 0.35));
  root.style.setProperty("--teal-glow", `rgba(${r}, ${g}, ${b}, 0.35)`);
  root.style.setProperty("--border", `rgba(${r}, ${g}, ${b}, 0.16)`);
  root.style.setProperty("--border-strong", `rgba(${r}, ${g}, ${b}, 0.32)`);

  document.querySelectorAll(".accent-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.color.toLowerCase() === hex.toLowerCase());
  });
}

window.anomia.getSettings().then((settings) => {
  profileShowcaseKeys = Array.isArray(settings.profileShowcase) ? settings.profileShowcase.slice(0, 3) : null;
  applyMode(settings.mode || "dark");
  // B2 Launcher : nouvelle identité violette. Une seule fois, on remplace l'ancien accent par défaut
  // (teal Anomia) par le violet B2 ; le joueur peut ensuite choisir librement une autre couleur.
  if (!settings.themeV2) {
    settings.accentColor = "#8b5cf6";
    window.anomia.setSettings({ accentColor: "#8b5cf6", themeV2: true });
  }
  const accent = settings.accentColor || "#8b5cf6";
  applyAccentColor(accent);
  document.getElementById("color-picker").value = accent;
  document.getElementById("color-picker-hex").textContent = accent.toUpperCase();
});

// --- Contrôles fenêtre ---
document.getElementById("btn-min").addEventListener("click", () => window.anomia.minimize());
document.getElementById("btn-max").addEventListener("click", () => window.anomia.maximize());
document.getElementById("btn-close").addEventListener("click", () => window.anomia.close());

// --- Version affichée ---
window.anomia.getAppVersion().then((v) => {
  document.getElementById("app-version").textContent = `v${v}`;
});

// --- Navigation : barre des serveurs (haut) + onglets du serveur sélectionné ---
const views = document.querySelectorAll(".view");
let SERVERS = [];
let HUB = { slides: [], slideIntervalMs: 6500 };
let TWITCH = { channel: "b2obi64", displayName: "B2OBI64", url: "https://twitch.tv/b2obi64", fallbackStreamers: [] };
let currentServerId = "hub";
// Catégories de l'accueil (même principe que les onglets d'Anomia et de KannibAventure)
const HUB_TABS = [
  { view: "hub", label: "Accueil" },
  { view: "hub-community", label: "Communauté" },
  { view: "hub-players", label: "Joueurs" },
  { view: "hub-news", label: "Actualités" },
  { view: "hub-media", label: "Média" },
  { view: "hub-clips", label: "Clips" },
  { view: "hub-ach", label: "Succès" }
];

function getServer(id) {
  return SERVERS.find((s) => s.id === id) || null;
}

function goToView(name) {
  document.querySelectorAll(".tab-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
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
  if (name === "hub") { loadStreamers(); loadHomeMe(); loadDiscordCommunities(); startHubSlider(); } else { stopHubSlider(); }
  if (name === "hub-community") loadDiscordCommunities();
  if (name === "hub-clips") loadClips();
  if (name === "hub-players") loadHubPlayers();
  if (name === "hub-news") loadHubNews();
  if (name === "hub-media") loadHubMedia();
  if (name === "hub-ach") loadHubAch();
  if (name === "kb-media") loadKbMedia();
  if (name === "staff") loadStaff();
  if (name === "achievements") loadAchievements();
  if (name === "rules") loadRules();
  if (name === "map") loadMap();
  if (name === "media") loadMedia();
  if (name === "admin") { refreshAdminStats(); refreshStaffPlayers(); }
  if (name === "kb-devlog") loadKbDevlog();
  if (name === "kb-rules") loadKbRules();
  if (name === "kb-faq") loadKbFaq();
  if (name === "faq") loadAnomiaFaq();
  if (name === "kb-files") refreshKbFiles();
  if (name === "kb-map") initKbMap();
}

function selectServer(id) {
  currentServerId = id;
  document.querySelectorAll(".server-btn").forEach((b) => b.classList.toggle("active", b.dataset.server === id));

  const tabbar = document.getElementById("tabbar");
  const navAdmin = document.getElementById("nav-admin");

  const tabsEl = document.getElementById("tabbar-tabs");
  const buildTabs = (tabs) => {
    tabsEl.innerHTML = "";
    tabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = "tab-item";
      btn.dataset.view = tab.view;
      btn.textContent = tab.label;
      btn.addEventListener("click", () => goToView(tab.view));
      tabsEl.appendChild(btn);
    });
  };

  if (id === "hub") {
    tabbar.classList.remove("hidden");
    tabbar.style.setProperty("--server-color", "var(--teal)");
    document.getElementById("tabbar-server").textContent = "KANNIBAL";
    buildTabs(HUB_TABS);
    navAdmin.style.display = "none";
    goToView("hub");
    return;
  }

  const server = getServer(id);
  if (!server) return;
  tabbar.classList.remove("hidden");
  tabbar.style.setProperty("--server-color", server.color || "var(--teal)");
  document.getElementById("tabbar-server").textContent = server.name.toUpperCase();
  buildTabs(server.tabs || []);
  // L'onglet Admin n'existe que pour Anomia (il reste masqué tant que le code staff n'est pas saisi)
  navAdmin.style.display = id === "anomia" ? "" : "none";

  const first = (server.tabs || [])[0];
  if (first) goToView(first.view);
}

document.getElementById("nav-admin").addEventListener("click", () => goToView("admin"));
document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => goToView(btn.dataset.goto));
});

function renderServerBar() {
  const bar = document.getElementById("server-bar");
  bar.innerHTML = `
    <button class="server-btn" data-server="hub" title="Accueil">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>
    </button>
    <span class="server-sep"></span>
  `;
  SERVERS.forEach((srv) => {
    const btn = document.createElement("button");
    btn.className = `server-btn server-logo status-${srv.status || "online"}`;
    btn.dataset.server = srv.id;
    btn.title = srv.name;
    btn.style.setProperty("--server-color", srv.color || "var(--teal)");
    btn.innerHTML = `<img src="${srv.logo}" alt="${escapeHtml(srv.name)}" />`;
    bar.appendChild(btn);
  });
  bar.querySelectorAll(".server-btn").forEach((b) => {
    b.addEventListener("click", () => selectServer(b.dataset.server));
  });
}

// --- Slider de l'accueil ---
let hubIndex = 0;
let hubTimer = null;

function renderHubSlider() {
  const slidesEl = document.getElementById("hub-slides");
  const dotsEl = document.getElementById("hub-dots");
  slidesEl.innerHTML = "";
  dotsEl.innerHTML = "";
  (HUB.slides || []).forEach((slide, i) => {
    const srv = getServer(slide.serverId);
    const el = document.createElement("div");
    el.className = "hub-slide";
    el.style.setProperty("--server-color", (srv && srv.color) || "var(--teal)");
    el.innerHTML = `
      <div class="hub-slide-text">
        <span class="hub-tag">${escapeHtml(slide.tag || "")}</span>
        <h2>${escapeHtml(slide.title || (srv && srv.name) || "")}</h2>
        <p>${escapeHtml(slide.text || "")}</p>
        <button class="hub-cta">${escapeHtml(slide.button || "Voir")}</button>
      </div>
      ${srv ? `<img class="hub-slide-logo" src="${srv.logo}" alt="" />` : ""}
    `;
    el.querySelector(".hub-cta").addEventListener("click", () => selectServer(slide.serverId));
    slidesEl.appendChild(el);

    const dot = document.createElement("button");
    dot.className = "hub-dot";
    dot.setAttribute("aria-label", `Slide ${i + 1}`);
    dot.addEventListener("click", () => { showHubSlide(i); startHubSlider(); });
    dotsEl.appendChild(dot);
  });
  showHubSlide(0);
}

function showHubSlide(i) {
  const slides = document.querySelectorAll(".hub-slide");
  if (!slides.length) return;
  hubIndex = (i + slides.length) % slides.length;
  slides.forEach((s, idx) => s.classList.toggle("active", idx === hubIndex));
  document.querySelectorAll(".hub-dot").forEach((d, idx) => d.classList.toggle("active", idx === hubIndex));
}

function startHubSlider() {
  stopHubSlider();
  if ((HUB.slides || []).length < 2) return;
  hubTimer = setInterval(() => showHubSlide(hubIndex + 1), HUB.slideIntervalMs || 6500);
}
function stopHubSlider() {
  if (hubTimer) { clearInterval(hubTimer); hubTimer = null; }
}
document.getElementById("hub-prev").addEventListener("click", () => { showHubSlide(hubIndex - 1); startHubSlider(); });
document.getElementById("hub-next").addEventListener("click", () => { showHubSlide(hubIndex + 1); startHubSlider(); });

window.anomia.getServers().then((cfg) => {
  SERVERS = cfg.servers || [];
  HUB = cfg.hub || HUB;
  if (cfg.twitch) TWITCH = cfg.twitch;
  initTwitchPanel();
  renderServerBar();
  renderHubSlider();
  if (typeof restoreLast === "function") restoreLast(); else selectServer("hub");
  updateConnectButtonState(); // applique l'état "en pause" d'Anomia si besoin
});

// --- Pages KannibAventure ---
let kbDevlogLoaded = false;
async function loadKbDevlog() {
  if (kbDevlogLoaded) return;
  const list = document.getElementById("kb-devlog-list");
  const data = await window.anomia.getKbContent("devlog");
  list.innerHTML = "";
  if (!Array.isArray(data) || !data.length) {
    list.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Le journal de développement arrive bientôt.</p>`;
    return;
  }
  kbDevlogLoaded = true;
  data.forEach((item) => list.appendChild(renderNewsCard(item)));
}

let kbRulesLoaded = false;
async function loadKbRules() {
  if (kbRulesLoaded) return;
  const container = document.getElementById("kb-rules-content");
  const data = await window.anomia.getKbContent("rules");
  const raw = data && data.content;
  if (!raw) {
    container.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Règlement pas encore disponible.</p>`;
    return;
  }
  kbRulesLoaded = true;
  container.innerHTML = formatRules(raw);
  const setAll = (open) => container.querySelectorAll("details.rules-chapter").forEach((d) => { d.open = open; });
  const openBtn = document.getElementById("rules-open-all");
  const closeBtn = document.getElementById("rules-close-all");
  if (openBtn) openBtn.addEventListener("click", () => setAll(true));
  if (closeBtn) closeBtn.addEventListener("click", () => setAll(false));
}

let anomiaFaqLoaded = false;
async function loadAnomiaFaq() {
  if (anomiaFaqLoaded) return;
  const list = document.getElementById("faq-list");
  const data = await window.anomia.getKbContent("anomiafaq");
  list.innerHTML = "";
  if (!Array.isArray(data) || !data.length) { list.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">F.A.Q bientôt disponible.</p>`; return; }
  anomiaFaqLoaded = true;
  data.forEach((item) => {
    const d = document.createElement("details");
    d.className = "kb-faq-item";
    d.innerHTML = `<summary>${escapeHtml(item.q || "")}</summary><p>${escapeHtml(item.a || "")}</p>`;
    list.appendChild(d);
  });
}

let kbFaqLoaded = false;
async function loadKbFaq() {
  if (kbFaqLoaded) return;
  const list = document.getElementById("kb-faq-list");
  const data = await window.anomia.getKbContent("faq");
  list.innerHTML = "";
  if (!Array.isArray(data) || !data.length) {
    list.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">FAQ bientôt disponible.</p>`;
    return;
  }
  kbFaqLoaded = true;
  data.forEach((item) => {
    const d = document.createElement("details");
    d.className = "kb-faq-item";
    d.innerHTML = `<summary>${escapeHtml(item.q || "")}</summary><p>${escapeHtml(item.a || "")}</p>`;
    list.appendChild(d);
  });
}

// --- KannibAventure : installateur de mods ---
const KB_STATUS_LABEL = { ok: "À jour", missing: "À installer", outdated: "À mettre à jour" };
let kbInstalling = false;

function formatBytes(n) {
  if (!n) return "";
  if (n > 1048576) return `${(n / 1048576).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(n / 1024))} Ko`;
}

async function refreshKbFiles() {
  const state = await window.anomia.getKbModsState();
  const meta = document.getElementById("kb-files-meta");
  const loaderLabel = state.loader ? `${state.loader}${state.loaderVersion ? " " + state.loaderVersion : ""}` : "à définir";
  meta.innerHTML = `
    <span class="kb-chip">Minecraft ${escapeHtml(state.minecraft || "—")}</span>
    <span class="kb-chip">Chargeur : ${escapeHtml(loaderLabel)}</span>
    <span class="kb-chip">${state.mods.length} mod${state.mods.length > 1 ? "s" : ""}</span>`;
  document.getElementById("kb-files-notes").textContent = state.notes || "";
  document.getElementById("kb-folder-path").textContent = state.folder + (state.folderExists ? "" : "  (sera créé)");

  const list = document.getElementById("kb-mod-list");
  list.innerHTML = "";
  state.mods.forEach((mod) => {
    const row = document.createElement("div");
    row.className = "kb-mod-row";
    row.innerHTML = `<span class="kb-mod-name">${escapeHtml(mod.name)}</span>
      <span class="kb-mod-size">${formatBytes(mod.size)}</span>
      <span class="kb-mod-status ${mod.status}">${KB_STATUS_LABEL[mod.status] || ""}</span>`;
    list.appendChild(row);
  });

  const btn = document.getElementById("kb-install-btn");
  const needs = state.mods.filter((m) => m.status !== "ok").length;
  if (!state.mods.length) {
    btn.disabled = true;
    btn.textContent = "Liste des mods indisponible";
  } else if (!needs) {
    btn.disabled = kbInstalling;
    btn.textContent = "Tout est à jour · Réparer / revérifier";
  } else {
    btn.disabled = kbInstalling;
    btn.textContent = `Installer / mettre à jour (${needs})`;
  }
}

document.getElementById("kb-folder-change").addEventListener("click", () => { window.anomia.chooseKbModsFolder(); });

document.getElementById("kb-install-btn").addEventListener("click", async () => {
  if (kbInstalling) return;
  kbInstalling = true;
  const btn = document.getElementById("kb-install-btn");
  const fill = document.getElementById("kb-progress-fill");
  const label = document.getElementById("kb-progress-label");
  btn.disabled = true;
  btn.textContent = "Installation…";
  fill.style.width = "0%";
  window.anomia.onKbModsProgress((p) => {
    if (!p) return;
    fill.style.width = p.percent != null ? `${p.percent}%` : "100%";
    label.textContent = p.label || "";
  });
  const result = await window.anomia.installKbMods();
  kbInstalling = false;
  if (result && result.ok) {
    fill.style.width = "100%";
    label.textContent = result.message || "Terminé.";
  } else {
    label.textContent = "";
    await showInfo("Installation impossible", `<p>${escapeHtml((result && result.error) || "Erreur inconnue.")}</p>`);
  }
  refreshKbFiles();
});

// --- KannibAventure : carte d'exploration (global / personnelle) ---
// Zoom : molette quand la souris est sur la carte. Déplacement : clic gauche maintenu + mouvement.
let kbMapMode = "global";
const kbMap = { scale: 1, x: 0, y: 0, dragging: false, startX: 0, startY: 0, inited: false };
const KB_MAP_MIN = 0.2;
const KB_MAP_MAX = 8;

function kbMapApply() {
  const world = document.getElementById("kb-map-world");
  world.style.transform = `translate(${kbMap.x}px, ${kbMap.y}px) scale(${kbMap.scale})`;
  document.getElementById("kb-map-zoomlabel").textContent = `${Math.round(kbMap.scale * 100)}%`;
}

function kbMapReset() {
  const stage = document.getElementById("kb-map-stage");
  kbMap.scale = 1;
  kbMap.x = stage.clientWidth / 2;
  kbMap.y = stage.clientHeight / 2;
  kbMapApply();
}

// Zoom centré sur un point de la carte (cx, cy en pixels, relatifs à la zone d'affichage)
function kbMapZoomAt(factor, cx, cy) {
  const next = Math.min(KB_MAP_MAX, Math.max(KB_MAP_MIN, kbMap.scale * factor));
  const ratio = next / kbMap.scale;
  kbMap.x = cx - (cx - kbMap.x) * ratio;
  kbMap.y = cy - (cy - kbMap.y) * ratio;
  kbMap.scale = next;
  kbMapApply();
}

function initKbMap() {
  document.getElementById("kb-map-hint").textContent = kbMapMode === "global"
    ? "Zones découvertes par toute la communauté"
    : "Zones que tu as découvertes toi-même";
  if (!kbMap.inited) {
    kbMap.inited = true;
    const stage = document.getElementById("kb-map-stage");

    stage.addEventListener("wheel", (e) => {
      e.preventDefault(); // la molette zoome la carte au lieu de faire défiler la page
      const rect = stage.getBoundingClientRect();
      kbMapZoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    stage.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.target.closest(".kb-map-controls")) return;
      kbMap.dragging = true;
      kbMap.startX = e.clientX - kbMap.x;
      kbMap.startY = e.clientY - kbMap.y;
      stage.classList.add("dragging");
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!kbMap.dragging) return;
      kbMap.x = e.clientX - kbMap.startX;
      kbMap.y = e.clientY - kbMap.startY;
      kbMapApply();
    });
    window.addEventListener("mouseup", () => {
      kbMap.dragging = false;
      stage.classList.remove("dragging");
    });

    const center = () => ({ cx: stage.clientWidth / 2, cy: stage.clientHeight / 2 });
    document.getElementById("kb-map-zoom-in").addEventListener("click", () => { const c = center(); kbMapZoomAt(1.4, c.cx, c.cy); });
    document.getElementById("kb-map-zoom-out").addEventListener("click", () => { const c = center(); kbMapZoomAt(1 / 1.4, c.cx, c.cy); });
    document.getElementById("kb-map-reset").addEventListener("click", kbMapReset);
  }
  kbMapReset(); // la vue est visible à ce stade : on peut mesurer la zone et centrer
}
document.querySelectorAll("#kb-map-toggle .kb-toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    kbMapMode = btn.dataset.mode;
    document.querySelectorAll("#kb-map-toggle .kb-toggle-btn").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("kb-map-hint").textContent = kbMapMode === "global"
      ? "Zones découvertes par toute la communauté"
      : "Zones que tu as découvertes toi-même";
  });
});

document.getElementById("kb-discord").addEventListener("click", () => {
  const srv = getServer("kannibaventure");
  if (srv && srv.discordInvite) {
    window.anomia.openExternal(srv.discordInvite);
  } else {
    showInfo("Discord KannibAventure", "<p>Le lien du Discord sera disponible très bientôt.</p>");
  }
});

// --- Discord ---
document.getElementById("btn-discord").addEventListener("click", () => {
  window.anomia.openExternal((TWITCH && TWITCH.discordInvite) || "https://discord.gg/nABGrX9Hu2");
});

// --- Connexion serveur ---
document.getElementById("btn-connect").addEventListener("click", async (e) => {
  // Important : on capture le bouton et la position du clic tout de suite,
  // avant le moindre "await" - une fois qu'on a attendu quelque chose,
  // e.currentTarget redevient null (comportement normal des événements DOM),
  // ce qui faisait planter le code silencieusement avant même d'atteindre
  // la connexion à FiveM.
  const btn = e.currentTarget;
  const clickX = e.clientX;
  const clickY = e.clientY;

  const discordRequired = await window.anomia.isDiscordConfigured();

  if (discordRequired && !discordProfile) {
    await showInfo(
      "Connexion Discord requise",
      `<p>Tu dois lier ton compte Discord avant de pouvoir te connecter au serveur. Utilise le bouton « Lier Discord » en haut à droite.</p>`
    );
    return;
  }

  if (discordProfile && discordProfile.allowed === false && !isAdminUnlocked) {
    await showInfo(
      "Accès refusé",
      `<p>Tu dois avoir le rôle whitelist sur le Discord d'Anomia pour te connecter. Rejoins-nous et refais une demande d'accès.</p>`
    );
    return;
  }

  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const dot = document.createElement("span");
  dot.className = "ripple-dot";
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${clickX - rect.left - size / 2}px`;
  dot.style.top = `${clickY - rect.top - size / 2}px`;
  btn.appendChild(dot);
  setTimeout(() => dot.remove(), 550);

  window.anomia.connect();
});

window.anomia.onConnectError((message) => {
  showInfo("Impossible de lancer FiveM", `<p>Le launcher n'a pas réussi à démarrer FiveM automatiquement : ${escapeHtml(message)}</p><p style="margin-top:8px;color:var(--text-faint);font-size:12px;">Essaie de rejoindre le serveur manuellement depuis FiveM directement.</p>`);
});

// --- Statut serveur (polling) ---
let lastJobStats = {};
let lastAvgPingMs = null;
let lastServerOnline = false;
let lastServerClients = 0;
let lastServerMax = 0;
let lastServerMaintenance = false;

function updateConnectButtonState() {
  const btn = document.getElementById("btn-connect");
  const heroEl = document.getElementById("ah-hero");
  const anomiaSrv = getServer("anomia");
  if (heroEl && anomiaSrv) {
    heroEl.classList.toggle("paused", anomiaSrv.status !== "online");
    const pc = document.getElementById("ah-paused-chip");
    if (pc) pc.textContent = `🗓 Retour prévu en ${anomiaSrv.connectLabel || "2027"}`;
  }

  if (document.body.classList.contains("is-offline")) {
    btn.disabled = true; btn.textContent = "📡 Hors ligne";
    const st0 = document.getElementById("status-text"); if (st0) st0.textContent = "Tu es hors ligne";
    const tm0 = document.getElementById("tm-status"); if (tm0) tm0.textContent = "HORS LIGNE";
    return;
  }
  // Serveur en pause (ex. Anomia jusqu'en 2027) : bouton grisé avec la date, sans connexion possible
  const anomia = getServer("anomia");
  if (anomia && anomia.status !== "online" && !isAdminUnlocked) {
    btn.disabled = true;
    btn.textContent = `🔒 ${anomia.connectLabel || "Bientôt"}`;
    const st = document.getElementById("status-text");
    const sd = document.getElementById("status-dot");
    const tm = document.getElementById("tm-status");
    if (st) st.textContent = `En pause · retour en ${anomia.connectLabel || "—"}`;
    if (sd) sd.className = "status-dot maintenance";
    if (tm) tm.textContent = "EN PAUSE";
    return;
  }

  // Rôle Citoyen requis (sauf admin) : bouton bloqué
  if (citizen.anomia === false && !isAdminUnlocked) {
    btn.disabled = true; btn.textContent = "Rôles requis"; btn.title = CITIZEN_TIP;
    return;
  }
  btn.title = "";
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
  if (document.body.classList.contains("is-offline")) { updateConnectButtonState(); return; }
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
  lastServerClients = status.clients || 0;
  lastServerMax = status.maxClients || 0;
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
      lastAvgPingMs = status.avgPing;
    } else {
      const pings = (status.players || []).map((p) => p.ping).filter((p) => typeof p === "number" && p > 0);
      if (pings.length) {
        lastAvgPingMs = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        tmPing.textContent = `${lastAvgPingMs} ms`;
      } else {
        lastAvgPingMs = null;
        tmPing.textContent = "Indisponible";
      }
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
    lastAvgPingMs = null;
    maintenanceBanner.classList.add("hidden");
  }

  updateConnectButtonState();
}
refreshStatus();
setInterval(refreshStatus, 30000);

// --- Temps de jeu (affiché sur l'accueil) ---
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

let lastPlaytimeStats = { day: 0, week: 0, month: 0, year: 0 };

async function refreshPlaytime() {
  lastPlaytimeStats = await window.anomia.getPlaytime();
  document.getElementById("tm-playtime").textContent = formatDuration(lastPlaytimeStats.week);
}
refreshPlaytime();
setInterval(refreshPlaytime, 60000);

document.getElementById("tm-playtime-item").addEventListener("click", async () => {
  const rows = [
    ["Aujourd'hui", lastPlaytimeStats.day],
    ["Cette semaine", lastPlaytimeStats.week],
    ["Ce mois-ci", lastPlaytimeStats.month],
    ["Cette année", lastPlaytimeStats.year]
  ]
    .map(
      ([label, seconds]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:13px;">
        <span style="color:var(--text-dim);">${label}</span>
        <span style="color:var(--teal);font-weight:700;">${formatDuration(seconds)}</span>
      </div>`
    )
    .join("");
  await showInfo("Temps de jeu", `<div>${rows}</div>`);
});

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
  setupNewsClamp(list);
}

// Onglet Actualités : la 1re actu est mise en avant (pleine largeur), les autres sont en 2 colonnes.
// Les textes longs sont repliés avec « Lire la suite ».
function setupNewsClamp(list) {
  requestAnimationFrame(() => {
    list.querySelectorAll(".news-card").forEach((card, i) => {
      const body = card.querySelector(".news-body");
      if (!body) return;
      const limit = i === 0 ? 260 : 150;
      if (body.scrollHeight <= limit + 24) return;
      body.style.setProperty("--clamp", limit + "px");
      body.classList.add("clamped");
      const btn = document.createElement("button");
      btn.className = "news-more";
      btn.textContent = "Lire la suite";
      btn.addEventListener("click", () => {
        const open = body.classList.toggle("clamped");
        btn.textContent = open ? "Lire la suite" : "Réduire";
      });
      card.appendChild(btn);
    });
  });
}
loadNews();

// --- Streamers Twitch ---
function renderStreamerCard(streamer) {
  const el = document.createElement("div");
  el.className = `streamer-card known ${streamer.live ? "live" : ""}`;
  el.dataset.channel = (streamer.channel || "").toLowerCase();
  el.title = streamer.live ? `${streamer.displayName || streamer.channel} - en live${streamer.game ? " · " + streamer.game : ""}` : (streamer.displayName || streamer.channel);
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
    ${streamer.live && streamer.game ? `<span class="streamer-game">${escapeHtml(streamer.game)}</span>` : ""}
  `;
  el.addEventListener("click", () => selectStreamer(streamer));
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
  openBtn.onclick = () => { window.anomia.openExternal(`https://twitch.tv/${streamer.channel}`); if (streamer.live && window.launcherAch) window.launcherAch.unlock("viewer"); };

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

// --- Panneau chaîne Twitch (accueil) ---
// --- Streamer mis en avant (ma chaîne par défaut, ou un streamer en live si je ne le suis pas) ---

function myChannelKey() { return (TWITCH.channel || "").toLowerCase(); }

function pickFeatured() {
  if (manualPick) {
    const m = STREAMER_DATA.find((s) => (s.channel || "").toLowerCase() === manualPick);
    if (m) return m;
    if (manualPick === myChannelKey()) return { channel: TWITCH.channel, displayName: TWITCH.displayName, live: false, isFallback: true };
  }
  const me = STREAMER_DATA.find((s) => (s.channel || "").toLowerCase() === myChannelKey());
  if (me && me.live) return me;
  const others = STREAMER_DATA.filter((s) => s.live && (s.channel || "").toLowerCase() !== myChannelKey()).sort((a, b) => (b.viewers || 0) - (a.viewers || 0));
  if (others.length) return others[0];
  return me || { channel: TWITCH.channel, displayName: TWITCH.displayName, live: false, isFallback: true };
}

function renderFeatured() {
  const s = pickFeatured();
  const changed = !featuredNow || (featuredNow.channel || "").toLowerCase() !== (s.channel || "").toLowerCase();
  featuredNow = s;
  if (changed) { // petit fondu quand on passe d'un streamer à l'autre
    const panel = document.getElementById("twitch-panel");
    panel.classList.remove("swap"); void panel.offsetWidth; panel.classList.add("swap");
  }
  // Miniature du live en fond (floutée) quand le streamer est en direct
  const bg = document.getElementById("twitch-bg");
  const thumb = s.live && typeof s.thumbnailUrl === "string" && /^https:\/\//.test(s.thumbnailUrl) ? s.thumbnailUrl : null;
  if (thumb) {
    const url = `${thumb}${thumb.includes("?") ? "&" : "?"}t=${Math.floor(Date.now() / 60000)}`; // se renouvelle chaque minute
    if (bg.dataset.src !== thumb) { bg.dataset.src = thumb; bg.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`; }
    bg.classList.add("on");
  } else {
    bg.classList.remove("on");
    bg.dataset.src = "";
  }
  const isMe = (s.channel || "").toLowerCase() === myChannelKey();
  document.getElementById("twitch-panel-tag").textContent = isMe ? "// TWITCH" : "// EN LIVE SUR LA COMMUNAUTÉ";
  document.getElementById("twitch-panel-name").textContent = s.displayName || s.channel;
  document.getElementById("twitch-panel-logo").src = (isMe ? "../assets/logo.png" : s.avatarUrl) || "../assets/logo.png";
  document.getElementById("twitch-panel-text").textContent = s.live && s.title ? s.title : (isMe ? "Retrouve les lives, les annonces et la communauté." : (s.live ? "En direct maintenant." : "Hors ligne pour le moment."));
  const badge = document.getElementById("twitch-live-badge");
  if (s.live) {
    const v = Number(s.viewers) || 0;
    badge.textContent = `● EN LIVE · ${v} viewer${v > 1 ? "s" : ""}${s.game ? " · " + s.game : ""}`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
  document.getElementById("twitch-watch").textContent = s.live ? "Regarder le stream" : (isMe ? "Regarder sur Twitch" : "Voir la chaîne");
  document.getElementById("twitch-discord").textContent = isMe ? "Discord de la communauté" : `Retour à ${TWITCH.displayName || TWITCH.channel}`;
  document.querySelectorAll("#streamer-grid .streamer-card").forEach((c) => c.classList.toggle("selected", c.dataset.channel === (s.channel || "").toLowerCase()));
}

function initTwitchPanel() {
  document.getElementById("twitch-watch").addEventListener("click", () => {
    const ch = featuredNow && featuredNow.channel;
    if (ch && CHANNEL_RE.test(ch)) { window.anomia.openExternal(`https://twitch.tv/${ch}`); if (featuredNow.live && window.launcherAch) window.launcherAch.unlock("viewer"); }
  });
  document.getElementById("twitch-discord").addEventListener("click", () => {
    const isMe = featuredNow && (featuredNow.channel || "").toLowerCase() === myChannelKey();
    if (isMe) { if (TWITCH.discordInvite) window.anomia.openExternal(TWITCH.discordInvite); }
    else { manualPick = myChannelKey(); renderFeatured(); }
  });
  renderFeatured();
}

function selectStreamer(s) {
  manualPick = (s.channel || "").toLowerCase();
  renderFeatured();
}

// Carte neutre (statut live indisponible)
function renderFallbackStreamerCard(s) {
  const el = document.createElement("div");
  el.className = "streamer-card";
  el.dataset.channel = (s.channel || "").toLowerCase();
  el.innerHTML = `
    <div class="streamer-avatar-wrap"><img src="../assets/logo.png" alt="" class="streamer-avatar" /></div>
    <span class="streamer-name">${escapeHtml(s.displayName || s.channel)}</span>
    <span class="streamer-status">Voir la chaîne</span>`;
  el.addEventListener("click", () => selectStreamer(s));
  return el;
}

async function loadStreamers() {
  if (Date.now() - streamersFetchedAt < 45000) return; // pas de requête en rafale
  streamersFetchedAt = Date.now();
  const grid = document.getElementById("streamer-grid");
  const result = await window.anomia.getTwitchStatus();

  if (!result.ok) {
    // Statut live indisponible (ex. serveur Anomia arrêté) : on affiche quand même les chaînes
    STREAMER_DATA = [];
    grid.innerHTML = "";
    (TWITCH.fallbackStreamers || []).forEach((s) => grid.appendChild(renderFallbackStreamerCard(s)));
    streamersFetchedAt = 0; // réessaie au prochain passage
    renderFeatured();
    return;
  }

  STREAMER_DATA = (result.streamers || []).filter((s) => s && CHANNEL_RE.test(s.channel || ""));
  grid.innerHTML = "";
  if (!STREAMER_DATA.length) {
    grid.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Aucun streamer configuré.</p>`;
    renderFeatured();
    return;
  }
  // Les lives en premier
  [...STREAMER_DATA].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0)).forEach((s) => grid.appendChild(renderStreamerCard(s)));
  renderFeatured();
}
// Actualisation automatique du live toutes les minutes tant que l'accueil est ouvert
setInterval(() => {
  const v = document.getElementById("view-hub");
  if (v && !v.classList.contains("hidden")) loadStreamers();
}, 60000);

// Données de succès partagées (accueil, profil, carte) : une seule requête toutes les 60 s
function getAchData(force) {
  if (force || !achCache.promise || Date.now() - achCache.at > 60000) {
    achCache.at = Date.now();
    achCache.promise = window.anomia.getAchievements().catch(() => null);
  }
  return achCache.promise;
}

// --- Accueil : résumé personnel + message de bienvenue ---
let homeAchResult = null;

function welcomeMessage(name) {
  const now = new Date();
  const h = now.getHours();
  if (now.getDate() === 3 && now.getMonth() === 6) return { t: `Joyeux anniversaire d'Anomia, ${name} ! 🎂`, s: "Connecte-toi en jeu aujourd'hui pour débloquer un succès secret." };
  const hello = h < 6 ? "Encore debout" : h < 18 ? "Salut" : "Bonsoir";
  return { t: `${hello} ${name} !`, s: "Content de te revoir sur le Kannibal Launcher." };
}

// État du résumé (affiché dans le bandeau tournant du haut)
let meState = null; // { greeting, hours, ach } ou null si pas connecté à Discord
async function loadHomeMe() {
  if (!discordProfile) { meState = null; renderTicker(); return; }
  const name = streamerMode ? "Joueur" : (discordProfile.username || "Joueur");
  meState = { greeting: welcomeMessage(name).t, hours: "—", ach: "—" };
  renderTicker();

  let r;
  try { r = await getAchData(); } catch (e) { r = null; }
  if (r && r.ok && r.linked) {
    homeAchResult = r;
    const list = r.list || [];
    const unlocked = list.filter((d) => r.achievements && r.achievements[d.key]).length;
    const secs = r.playtimeSeconds || 0;
    meState.hours = secs >= 3600 ? `${Math.floor(secs / 3600)} h` : `${Math.floor(secs / 60)} min`;
    meState.ach = `${unlocked}/${list.length}`;
  } else {
    homeAchResult = null;
  }
  renderTicker();
}

// --- Bandeau tournant du haut : résumé > Discord > Anomia > KannibAventure > ... ---
let tickerIndex = -1;
let tickerComm = []; // communautés Discord (membres en ligne)

async function refreshTickerCommunities() {
  try { tickerComm = (await window.anomia.getDiscordCommunities()) || []; } catch (e) { tickerComm = []; }
}

function buildTickerSlides() {
  const slides = [];
  if (meState) {
    slides.push({ key: "me", html: `
      <div class="tk-me-left"><strong>${escapeHtml(meState.greeting)}</strong><span><b>${escapeHtml(meState.ach)}</b> succès</span></div>
      <div class="tk-me-hours"><b>${escapeHtml(meState.hours)}</b><small>TEMPS DE JEU</small></div>` });
  }
  const main = tickerComm.find((c) => c.main && c.online !== null);
  if (main) {
    slides.push({ key: "discord", html: `
      <img class="tk-logo" src="${escapeHtml(main.logo || "../assets/logo.png")}" alt="" />
      <div class="tk-count"><b><i class="tk-dot"></i>${Number(main.online)} connecté${main.online > 1 ? "s" : ""}</b><small>SUR LE DISCORD</small></div>` });
  }
  const anomia = getServer("anomia");
  if (anomia) {
    // Anomia est en pause : on annonce le retour au lieu du nombre de joueurs
    const body = anomia.status === "online" && lastServerOnline
      ? `<b><i class="tk-dot"></i>${Number(lastServerClients)}${lastServerMax ? "/" + Number(lastServerMax) : ""} connecté${lastServerClients > 1 ? "s" : ""}</b><small>SUR ANOMIA RP</small>`
      : `<b>Prévue ${escapeHtml(anomia.connectLabel || "2027")}</b><small>RETOUR D'ANOMIA RP</small>`;
    slides.push({ key: "anomia", html: `<img class="tk-logo" src="${escapeHtml(anomia.logo || "../assets/anomia-logo.png")}" alt="" /><div class="tk-count">${body}</div>` });
  }
  const kb = getServer("kannibaventure");
  if (kb) {
    const kop = window.kbOpening ? window.kbOpening() : { open: kb.status === "online" };
    const body = kop.open
      ? `<b><i class="tk-dot"></i>Serveur ouvert</b><small>KANNIBAVENTURE</small>`
      : kop.scheduled
        ? `<b>${escapeHtml(kop.label)}</b><small>${kop.isSub ? "ACCÈS ABONNÉ DANS" : "OUVERTURE DANS"}</small>`
        : `<b>${escapeHtml(kb.connectLabel || "Bientôt")}</b><small>OUVERTURE DE KANNIBAVENTURE</small>`;
    slides.push({ key: "kb", html: `<img class="tk-logo" src="${escapeHtml(kb.logo || "../assets/kannibaventure.png")}" alt="" /><div class="tk-count">${body}</div>` });
  }
  return slides;
}

function renderTicker(advance) {
  const el = document.getElementById("ticker");
  if (!el) return;
  const slides = buildTickerSlides();
  if (!slides.length) { el.innerHTML = ""; return; }
  if (advance) tickerIndex = (tickerIndex + 1) % slides.length;
  else if (tickerIndex < 0 || tickerIndex >= slides.length) tickerIndex = 0;
  const slide = slides[tickerIndex];
  if (advance || el.dataset.key !== slide.key) {
    el.dataset.key = slide.key;
    el.innerHTML = `<div class="tk">${slide.html}</div>`; // le nouveau bloc rejoue l'animation de fondu
  } else {
    el.firstElementChild.innerHTML = slide.html; // même diapo : simple mise à jour des chiffres
  }
}
refreshTickerCommunities().then(() => renderTicker());
setInterval(refreshTickerCommunities, 5 * 60 * 1000);
setInterval(() => renderTicker(true), 4500);

// --- Accueil : Discords (membres en ligne + rejoindre) ---
let discordCommLoaded = false;
async function loadDiscordCommunities() {
  if (discordCommLoaded) return;
  const section = document.getElementById("discord-section");
  const grid = document.getElementById("discord-grid");
  let list;
  try { list = await window.anomia.getDiscordCommunities(); } catch (e) { list = []; }
  if (!list || !list.length) { section.classList.add("hidden"); return; }
  discordCommLoaded = true;
  grid.innerHTML = "";
  list.forEach((c) => {
    const el = document.createElement("div");
    el.className = "discord-card";
    if (c.color && /^#[0-9a-fA-F]{6}$/.test(c.color)) el.style.setProperty("--dc", c.color);
    const counts = c.online !== null
      ? `<span class="discord-online"><i></i>${c.online} en ligne</span><span class="discord-members">${c.members !== null ? c.members + " membres" : ""}</span>`
      : `<span class="discord-members">Rejoins le Discord</span>`;
    const logoHtml = c.logo ? `<img class="discord-logo" src="${escapeHtml(c.logo)}" alt="" />` : "";
    el.innerHTML = `<div class="discord-head">${logoHtml}<span class="discord-name">${escapeHtml(c.name)}</span></div><div class="discord-counts">${counts}</div><button class="btn-copy">Rejoindre</button>`;
    el.querySelector("button").addEventListener("click", () => window.anomia.openExternal(c.url));
    grid.appendChild(el);
  });
  section.classList.remove("hidden");
}

// --- Clips Twitch de la communauté ---
let clipsLoaded = false;
function formatClipDuration(sec) {
  const s = Math.round(sec || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function loadClips() {
  if (clipsLoaded) return;
  const section = document.getElementById("clip-grid");
  const empty = document.getElementById("clips-empty");
  const grid = document.getElementById("clip-grid");
  let result;
  try { result = await window.anomia.getTwitchClips(); } catch (e) { result = { ok: false }; }
  // Indisponible (serveur arrêté, Twitch non configuré...) : la section reste simplement cachée
  if (!result || !result.ok || !result.clips || !result.clips.length) { empty.classList.remove("hidden"); return; }
  empty.classList.add("hidden");
  clipsLoaded = true;
  grid.innerHTML = "";
  result.clips.forEach((c) => {
    const el = document.createElement("div");
    el.className = "clip-card";
    const thumb = c.thumbnailUrl && /^https:\/\//.test(c.thumbnailUrl) ? c.thumbnailUrl : "";
    el.innerHTML = `
      <div class="clip-thumb" ${thumb ? `style="background-image:url('${escapeHtml(thumb)}')"` : ""}>
        <span class="clip-duration">${formatClipDuration(c.duration)}</span>
        <span class="clip-play">▶</span>
      </div>
      <div class="clip-info">
        <span class="clip-title">${escapeHtml(c.title || "Clip")}</span>
        <span class="clip-meta">Clippé par ${escapeHtml(c.creator || "?")} · ${Number(c.views || 0)} vue${c.views > 1 ? "s" : ""}</span>
      </div>`;
    el.addEventListener("click", () => window.anomia.openExternal(c.url));
    grid.appendChild(el);
  });
}

// --- Assets : la vérification des fichiers custom a été retirée (Anomia n'en a pas) ---

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

// --- Détail du ping (clic sur la carte télémétrie "Ping moyen") ---
document.getElementById("tm-ping-item").addEventListener("click", async () => {
  if (!lastServerOnline || lastAvgPingMs === null) {
    await showInfo("Ping moyen", `<p style="color:var(--text-dim);">Aucune donnée disponible pour le moment (serveur hors ligne, ou ressource b2_pingstats pas installée).</p>`);
    return;
  }
  const quality = lastAvgPingMs < 60 ? "Excellent" : lastAvgPingMs < 120 ? "Bon" : lastAvgPingMs < 200 ? "Correct" : "Élevé";
  await showInfo(
    "Ping moyen",
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-family:var(--font-mono);font-size:13px;">
      <span style="color:var(--text-dim);">Latence moyenne du serveur</span>
      <span style="color:var(--teal);font-weight:700;">${lastAvgPingMs} ms</span>
    </div>
    <p style="color:var(--text-faint);font-size:11px;margin-top:8px;">${quality} — recalculé toutes les 30 secondes</p>`
  );
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
function renderMediaItem(item, list) {
  const el = document.createElement("div");
  el.className = "media-item";
  const badge = item.serverLabel ? `<span class="media-srv media-srv-${escapeHtml(item.serverId || "")}">${escapeHtml(item.serverLabel)}</span>` : "";
  el.innerHTML = `
    <img src="${escapeHtml(item.url)}" alt="" loading="lazy" />
    ${badge}
    <div class="media-item-author">${escapeHtml(item.author || "")}${item.date ? " · " + escapeHtml(item.date) : ""}</div>
  `;
  el.addEventListener("click", () => { if (window.openLightbox) window.openLightbox(list, list.indexOf(item)); else window.anomia.openExternal(item.url); });
  return el;
}

function fillMediaGrid(grid, items, emptyText) {
  grid.innerHTML = "";
  if (!items.length) { grid.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">${emptyText}</p>`; return; }
  items.forEach((item) => grid.appendChild(renderMediaItem(item, items)));
}

let mediaLoaded = false;
async function loadMedia() {
  if (mediaLoaded) return;
  mediaLoaded = true;
  const media = await window.anomia.getMedia();
  fillMediaGrid(document.getElementById("media-grid"), media || [], "Aucun media partagé pour le moment.");
}

let kbMediaLoaded = false;
async function loadKbMedia() {
  if (kbMediaLoaded) return;
  const media = await window.anomia.getKbMedia();
  if (media && media.length) kbMediaLoaded = true;
  fillMediaGrid(document.getElementById("kb-media-grid"), media || [], "La galerie de KannibAventure arrive bientôt.");
}

// --- Accueil : filtres Tous / Anomia / KannibAventure (actualités + média) ---
const HUB_SOURCES = [{ id: "all", label: "Tous" }, { id: "anomia", label: "Anomia RP" }, { id: "kannibaventure", label: "KannibAventure" }];
function renderHubFilter(el, current, onPick) {
  el.innerHTML = "";
  HUB_SOURCES.forEach((s) => {
    const b = document.createElement("button");
    b.className = "hub-chip" + (s.id === current ? " active" : "");
    b.textContent = s.label;
    b.addEventListener("click", () => onPick(s.id));
    el.appendChild(b);
  });
}
const SRC_LABEL = { anomia: "Anomia RP", kannibaventure: "KannibAventure" };

let hubMediaFilter = "all", hubMediaData = null;
async function loadHubMedia() {
  const grid = document.getElementById("hub-media-grid");
  if (!hubMediaData) {
    const [a, k] = await Promise.all([window.anomia.getMedia().catch(() => []), window.anomia.getKbMedia().catch(() => [])]);
    const tag = (arr, id) => (arr || []).map((m) => Object.assign({}, m, { serverId: id, serverLabel: SRC_LABEL[id] }));
    hubMediaData = tag(a, "anomia").concat(tag(k, "kannibaventure")).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  }
  const draw = () => {
    renderHubFilter(document.getElementById("hub-media-filter"), hubMediaFilter, (id) => { hubMediaFilter = id; draw(); });
    const items = hubMediaData.filter((m) => hubMediaFilter === "all" || m.serverId === hubMediaFilter);
    fillMediaGrid(grid, items, "Aucun media pour le moment.");
  };
  draw();
}

let hubNewsFilter = "all", hubNewsData = null;
async function loadHubNews() {
  const list = document.getElementById("hub-news-list");
  if (!hubNewsData) {
    const [a, k] = await Promise.all([window.anomia.getNews().catch(() => []), window.anomia.getKbContent("devlog").catch(() => [])]);
    const tag = (arr, id) => (Array.isArray(arr) ? arr : []).map((n) => Object.assign({}, n, { serverId: id }));
    hubNewsData = tag(a, "anomia").concat(tag(k, "kannibaventure")).sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  }
  const draw = () => {
    renderHubFilter(document.getElementById("hub-news-filter"), hubNewsFilter, (id) => { hubNewsFilter = id; draw(); });
    list.innerHTML = "";
    const items = hubNewsData.filter((n) => hubNewsFilter === "all" || n.serverId === hubNewsFilter);
    if (!items.length) { list.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Aucune actualité pour le moment.</p>`; return; }
    items.forEach((n) => {
      const card = renderNewsCard(n);
      const s = document.createElement("span");
      s.className = "news-srv news-srv-" + n.serverId;
      s.textContent = SRC_LABEL[n.serverId];
      card.insertBefore(s, card.firstChild);
      list.appendChild(card);
    });
    setupNewsClamp(list);
  };
  draw();
}

// --- Accueil : tous les succès par catégorie (Anomia, KannibAventure, Launcher) ---
function achBadgeEl(def, got, at) {
  const unlocked = Boolean(got[def.key]);
  const isSecretLocked = def.secret && !unlocked;
  let dateLabel = "";
  if (unlocked && at) {
    const d = new Date(typeof at === "string" ? at.replace(" ", "T") : at);
    if (!Number.isNaN(d.getTime())) dateLabel = `<span class="achievement-date">Débloqué le ${d.toLocaleDateString("fr-FR")}</span>`;
  }
  const rarity = RARITY_LABELS[def.rarity] ? def.rarity : "bronze";
  const el = document.createElement("div");
  el.className = `achievement-badge rarity-${rarity} ${unlocked ? "unlocked" : ""}`;
  el.innerHTML = `
    <div class="achievement-icon">${isSecretLocked ? "❓" : (ACHIEVEMENT_ICONS[def.key] || "🏆")}</div>
    <span class="achievement-name">${isSecretLocked ? "???" : escapeHtml(def.label)}</span>
    <span class="achievement-desc">${isSecretLocked ? "Succès secret" : escapeHtml(def.description)}</span>
    <span class="achievement-rarity">${isSecretLocked ? "Secret" : RARITY_LABELS[rarity]}</span>
    <span class="achievement-status">${unlocked ? "Débloqué" : "Verrouillé"}</span>
    ${dateLabel}`;
  return el;
}

const EGG_HINTS = [
  "Fais le Konami code : une petite surprise t'attend.",
  "Tape « kannibal » au clavier, juste pour voir…",
  "Le logo en haut à gauche adore qu'on insiste.",
  "Certains codes secrets font exploser des choses…",
  "Il paraît que le launcher cache des secrets. Combien en trouveras-tu ?"
];

async function loadHubAch() {
  const box = document.getElementById("hub-ach-content");
  const hint = document.getElementById("egg-hint");
  if (hint) hint.textContent = "💡 " + EGG_HINTS[Math.floor(Math.random() * EGG_HINTS.length)];
  let r = null;
  try { r = await getAchData(); } catch (e) { r = null; }
  const linked = Boolean(r && r.ok && r.linked);
  let list, got, at;
  if (linked) { list = r.list || []; got = r.achievements || {}; at = r.unlockedAt || {}; }
  else {
    let s = { list: [], unlocked: {} };
    try { s = await window.anomia.getLauncherAchState(); } catch (e) { /* ignore */ }
    list = s.list || []; got = s.unlocked || {}; at = s.unlocked || {};
  }
  let kb = { list: [], unlocked: {}, linked: false, hasServerData: false };
  try { kb = await window.anomia.getKbAchSelf(); } catch (e) { /* ignore */ }
  const kbGot = kb.unlocked || {};
  const kbNote = !kb.list.length ? "" : !kb.linked ? "Lance KannibAventure depuis le launcher (connexion Microsoft) pour suivre tes avancements Minecraft." : !kb.hasServerData ? "Avancements Minecraft pas encore synchronisés : seules tes heures de jeu comptent pour l'instant." : "";
  const groups = [
    { id: "anomia", name: "Anomia RP", defs: list.filter((d) => d.category !== "launcher" && d.category !== "kannibaventure"), note: linked ? "" : (r && r.notConnected ? "Connecte-toi avec Discord pour suivre tes succès Anomia." : "Connecte-toi une fois en jeu sur Anomia pour activer le suivi.") },
    { id: "kannibaventure", name: "KannibAventure", defs: kb.list || [], note: kbNote, got: kbGot },
    { id: "launcher", name: "Launcher", defs: list.filter((d) => d.category === "launcher"), note: "" }
  ];
  box.innerHTML = "";
  groups.forEach((g) => {
    const sec = document.createElement("div");
    sec.className = "ach-cat-block";
    const gg = g.got || got;
    const n = g.defs.filter((d) => gg[d.key]).length;
    const pct = g.defs.length ? Math.round(100 * n / g.defs.length) : 0;
    sec.innerHTML = `<div class="ach-cat-head"><h2>${g.name}</h2><span>${g.defs.length ? n + " / " + g.defs.length : "—"}</span></div><div class="hc-bar"><div style="width:${pct}%"></div></div>`;
    if (g.note) {
      const p = document.createElement("p"); p.className = "hc-empty"; p.textContent = g.note; sec.appendChild(p);
    }
    if (g.defs.length) {
      const grid = document.createElement("div"); grid.className = "achievements-grid";
      g.defs.forEach((d) => grid.appendChild(achBadgeEl(d, gg, g.got ? null : at[d.key])));
      sec.appendChild(grid);
    }
    box.appendChild(sec);
  });
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

// --- Auto-update : automatique au démarrage ; ensuite (session longue) « Mettre à jour maintenant » ou « Plus tard » ---
const updateOverlay = document.getElementById("update-overlay");
const updateMessage = document.getElementById("update-message");
const updateChangelog = document.getElementById("update-changelog");
const updateChangelogText = document.getElementById("update-changelog-text");
const updateProgressTrack = document.getElementById("update-progress-track");
const updateProgressFill = document.getElementById("update-progress-fill");
const updateProgressLabel = document.getElementById("update-progress-label");
const updateDownloadBtn = document.getElementById("update-download-btn");
const updateDownloadBtnLabel = updateDownloadBtn.querySelector(".btn-neon-label");
const updateRetryBtn = document.getElementById("update-retry-btn");
const updateStatusLabel = document.getElementById("update-status");
let pendingUpdateVersion = null;
const LAUNCH_AT = Date.now(); // mise à jour automatique seulement au démarrage
let updateFlowActive = false; // true seulement entre "update-available" et la fin du process

function setUpdateChangelog(notes) {
  if (notes && notes.trim()) {
    updateChangelogText.textContent = notes.trim();
    updateChangelog.classList.remove("hidden");
  } else {
    updateChangelog.classList.add("hidden");
  }
}

const updateLaterBtn = document.getElementById("update-later-btn");
let updateDownloading = false;
window.anomia.onUpdateAvailable(async ({ version, releaseNotes }) => {
  updateFlowActive = true;
  pendingUpdateVersion = version;
  updateDownloading = false;
  document.getElementById("up-to").textContent = `v${version}`;
  try { document.getElementById("up-from").textContent = `v${await window.anomia.getAppVersion()}`; } catch (e) { /* ignore */ }
  document.getElementById("update-title").textContent = "Nouvelle version disponible";
  updateMessage.textContent = "Tu peux mettre à jour maintenant ou plus tard : rien n'est obligatoire.";
  setUpdateChangelog(releaseNotes);
  updateProgressTrack.classList.add("hidden");
  updateProgressLabel.textContent = "";
  updateDownloadBtn.classList.remove("hidden");
  updateDownloadBtn.disabled = false;
  updateDownloadBtnLabel.textContent = "Mettre à jour maintenant";
  updateRetryBtn.classList.add("hidden");
  updateLaterBtn.classList.remove("hidden");
  updateStatusLabel.textContent = "Mise à jour dispo";
  updateStatusLabel.classList.remove("checking");
  updateStatusLabel.classList.add("clickable");
  // Si le joueur a déjà choisi « Plus tard » pour cette version, on ne rouvre pas la fenêtre (le badge du haut reste cliquable)
  let st = {}; try { st = (await window.anomia.getSettings()) || {}; } catch (e) { /* ignore */ }
  // Au démarrage du launcher : téléchargement + installation automatiques, sans clic
  if (Date.now() - LAUNCH_AT < 120000) {
    updateDownloading = true;
    updateOverlay.classList.remove("hidden");
    updateMessage.textContent = `Mise à jour v${version} : téléchargement et installation automatiques…`;
    updateLaterBtn.classList.add("hidden");
    updateDownloadBtn.classList.add("hidden");
    updateProgressTrack.classList.remove("hidden");
    updateProgressFill.style.width = "0%";
    window.anomia.downloadUpdate();
    return;
  }
  if (st.skippedUpdate !== version) updateOverlay.classList.remove("hidden");
});

updateLaterBtn.addEventListener("click", () => {
  if (pendingUpdateVersion) window.anomia.setSettings({ skippedUpdate: pendingUpdateVersion });
  updateOverlay.classList.add("hidden");
});
updateStatusLabel.addEventListener("click", () => {
  if (pendingUpdateVersion && updateFlowActive && !updateDownloading) updateOverlay.classList.remove("hidden");
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
  updateDownloading = true;
  updateLaterBtn.classList.add("hidden");
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
  updateDownloadBtnLabel.textContent = "Installation en cours…";
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
  updateLaterBtn.classList.remove("hidden");
  updateDownloading = false;
});

updateDownloadBtn.addEventListener("click", () => {
  updateDownloadBtn.disabled = true;
  updateDownloading = true;
  updateLaterBtn.classList.add("hidden");
  updateDownloadBtnLabel.textContent = "Téléchargement en cours…";
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
    if (staffRole) { selectServer("anomia"); goToView("admin"); return; }
    document.getElementById("admin-reason").textContent = discordProfile && lastStaffReason && STAFF_REASONS[lastStaffReason] ? "Accès admin Discord : " + STAFF_REASONS[lastStaffReason] : "";
    document.getElementById("admin-overlay").classList.remove("hidden");
    document.getElementById("admin-passphrase").focus();
  }
});

document.getElementById("admin-cancel").addEventListener("click", () => {
  document.getElementById("admin-overlay").classList.add("hidden");
  document.getElementById("admin-passphrase").value = "";
});

function applyStaffRole(result) {
  staffRole = result.role || "mod";
  staffScopes = { anomia: !!(result.scopes && result.scopes.anomia), kb: !!(result.scopes && result.scopes.kb) };
  isAdminUnlocked = staffRole === "admin" && staffScopes.anomia; // droits admin sur Anomia
  document.getElementById("admin-only-block").classList.toggle("hidden", !(staffRole === "mod" || isAdminUnlocked));
  const mb = document.getElementById("admin-maint-block"); if (mb) mb.classList.toggle("hidden", !isAdminUnlocked);
  document.getElementById("admin-title").textContent = isAdminUnlocked ? "Tableau de bord · Admin" : "Tableau de bord · Modération";
  document.getElementById("nav-admin").classList.remove("hidden");
  updateConnectButtonState();
}

function clearStaffRole() {
  staffRole = null;
  staffScopes = { anomia: false, kb: false };
  isAdminUnlocked = false;
  document.getElementById("nav-admin").classList.add("hidden");
  if (currentServerId === "anomia" && !document.getElementById("view-admin").classList.contains("hidden")) goToView("home");
  updateConnectButtonState();
}

// Admin : détecté automatiquement via le rôle Discord (Kannibal Team), sans code à taper.
const STAFF_REASONS = {
  no_token: "Reconnecte-toi avec Discord (clique ici) pour activer l'accès staff.",
  token_expired: "Ta session Discord a expiré : reconnecte-toi (clique ici).",
  bad_token: "Session Discord invalide : reconnecte-toi (clique ici).",
  server_down: "Serveur Anomia injoignable (éteint ?) : l'accès admin est vérifié par lui.",
  no_bot_token: "Serveur : anomia_discord_bot_token manquant dans le server.cfg.",
  bot_error: "Serveur : le bot ne peut pas lire les membres de Kannibal Team (bot absent du serveur ou intent « Server Members » désactivé).",
  not_in_guild: "Ton compte Discord n'est pas dans les serveurs Kannibal Team / Anomia / KannibAventure.",
  missing_role: "Tu n'as pas de rôle fondateur/admin sur Kannibal Team, Anomia ou KannibAventure.",
  server_outdated: "Le serveur n'a pas la nouvelle version de b2_staffpanel (remplace la ressource puis restart b2_staffpanel).",
  throttled: "Trop d'essais, réessaie dans une minute."
};
let lastStaffReason = null;
let adminVerified = false; // rôle admin Discord confirmé par le serveur
let adminOnDuty = false;   // admin en service : interface admin visible
function updateDutyButton() {
  const b = document.getElementById("pp-duty");
  if (!b) return;
  b.classList.toggle("hidden", !(discordProfile && adminVerified)); // jamais visible pour un joueur
  b.textContent = adminOnDuty ? "🟢 En service — se mettre hors service" : "⚪ Hors service — prendre mon service";
  b.classList.toggle("on", adminOnDuty);
}
document.getElementById("pp-duty").addEventListener("click", async () => {
  if (!adminVerified) return;
  const next = !adminOnDuty;
  const ok = await showConfirm(next ? "Prendre ton service" : "Quitter ton service", next
    ? "Le launcher va redémarrer et afficher l'interface admin."
    : "Le launcher va redémarrer et reprendre l'affichage normal (joueur).");
  if (!ok) return;
  await window.anomia.setSettings({ adminOnDuty: next });
  window.anomia.relaunchApp();
});
function showStaffReason() {
  const el = document.getElementById("pp-staff");
  if (!el) return;
  const loud = ["no_token", "token_expired", "bad_token", "server_down", "no_bot_token", "bot_error", "server_outdated"].includes(lastStaffReason);
  if (discordProfile && loud) { el.textContent = "⚠ Staff : " + STAFF_REASONS[lastStaffReason]; el.classList.remove("hidden"); }
  else el.classList.add("hidden");
}
document.getElementById("pp-staff").addEventListener("click", () => {
  if (["no_token", "token_expired", "bad_token"].includes(lastStaffReason)) window.anomia.startDiscordAuth();
});
async function autoStaffUnlock() {
  if (!discordProfile) { lastStaffReason = null; clearStaffRole(); showStaffReason(); return; }
  try {
    const r = await window.anomia.unlockAdmin("");
    if (r && r.ok && r.role === "admin") {
      lastStaffReason = null;
      // Admin vérifié : l'interface admin n'apparaît que s'il a pris son service
      const st = await window.anomia.getSettings();
      adminVerified = true; adminOnDuty = Boolean(st && st.adminOnDuty);
      if (adminOnDuty) applyStaffRole(r);
      updateDutyButton();
      window.dispatchEvent(new CustomEvent("admin-themes", { detail: true }));
    }
    else if (r && r.ok && r.role === "mod") {
      // Modérateur reconnu par son rôle Discord (serveur Anomia) : accès à la liste des joueurs, sans système de service
      lastStaffReason = null; adminVerified = false; updateDutyButton(); applyStaffRole(r);
      window.dispatchEvent(new CustomEvent("admin-themes", { detail: false }));
    }
    else {
      adminVerified = false; updateDutyButton(); lastStaffReason = (r && r.reason) || "invalid_code"; if (staffRole === "admin") clearStaffRole();
      if (["missing_role", "not_in_guild"].includes(lastStaffReason)) window.dispatchEvent(new CustomEvent("admin-themes", { detail: false })); }
  } catch (e) { lastStaffReason = "server_down"; }
  showStaffReason();
}

async function tryUnlockAdmin() {
  const input = document.getElementById("admin-passphrase");
  const result = await window.anomia.unlockAdmin(input.value);
  input.value = "";
  document.getElementById("admin-overlay").classList.add("hidden");

  if (result.ok) {
    applyStaffRole(result);
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

// --- Joueurs en ligne (staff) ---
let staffPlayers = [];
function pingClass(p) { return p < 80 ? "ping-good" : p < 150 ? "ping-mid" : "ping-bad"; }

function renderStaffPlayers() {
  const msg = document.getElementById("staff-players-msg");
  const table = document.getElementById("staff-players-table");
  const body = document.getElementById("staff-players-body");
  const q = (document.getElementById("staff-players-search").value || "").trim().toLowerCase();
  const rows = staffPlayers.filter((p) =>
    !q || [p.id, p.name, p.character, p.job].some((v) => String(v == null ? "" : v).toLowerCase().includes(q)));
  body.innerHTML = "";
  if (!rows.length) {
    table.classList.add("hidden");
    msg.classList.remove("hidden");
    msg.textContent = staffPlayers.length ? "Aucun joueur ne correspond à la recherche." : "Aucun joueur connecté.";
    return;
  }
  msg.classList.add("hidden");
  table.classList.remove("hidden");
  rows.forEach((p) => {
    const tr = document.createElement("tr");
    const duty = p.onDuty === true ? " (en service)" : "";
    tr.innerHTML = `<td>${Number(p.id)}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.character || "—")}</td><td>${escapeHtml((p.job || "—") + duty)}</td><td class="${pingClass(p.ping)}">${Number(p.ping) || 0} ms</td>`;
    body.appendChild(tr);
  });
}

async function refreshStaffPlayers() {
  const msg = document.getElementById("staff-players-msg");
  let r;
  try { r = await window.anomia.getStaffPlayers(); } catch (e) { r = { ok: false, error: "Erreur inconnue." }; }
  const count = document.getElementById("staff-players-count");
  if (!r || !r.ok) {
    staffPlayers = [];
    document.getElementById("staff-players-table").classList.add("hidden");
    msg.classList.remove("hidden");
    msg.textContent = (r && r.error) || "Liste indisponible.";
    count.textContent = "";
    return;
  }
  staffPlayers = r.players;
  count.textContent = `(${r.players.length}${r.maxClients ? "/" + r.maxClients : ""})`;
  renderStaffPlayers();
}
document.getElementById("staff-players-search").addEventListener("input", renderStaffPlayers);
// Actualisation automatique toutes les 10 s tant que l'onglet staff est affiché
setInterval(() => {
  if (!staffRole) return;
  const v = document.getElementById("view-admin");
  if (v && !v.classList.contains("hidden")) refreshStaffPlayers();
}, 10000);

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

  updateMaintenanceButtonDisplay();
}

function updateMaintenanceButtonDisplay() {
  const statusEl = document.getElementById("admin-maintenance-status");
  const btn = document.getElementById("btn-toggle-maintenance");
  if (lastServerMaintenance) {
    statusEl.textContent = "Statut actuel : 🛠️ Maintenance activée";
    btn.textContent = "Désactiver la maintenance";
  } else {
    statusEl.textContent = "Statut actuel : ✓ Serveur normal";
    btn.textContent = "Activer la maintenance";
  }
}

document.getElementById("btn-toggle-maintenance").addEventListener("click", async () => {
  const enabling = !lastServerMaintenance;
  const confirmed = await showConfirm(
    enabling ? "Activer la maintenance" : "Désactiver la maintenance",
    enabling
      ? "Tous les joueurs (sauf le staff) seront bloqués à la connexion, et verront un bandeau de maintenance dans leur launcher. Continuer ?"
      : "Le serveur redevient accessible à tous normalement. Continuer ?"
  );
  if (!confirmed) return;

  const result = await window.anomia.toggleMaintenance(enabling);
  if (result.ok) {
    lastServerMaintenance = enabling;
    updateMaintenanceButtonDisplay();
    await showInfo("Maintenance", `<p>Mode maintenance ${enabling ? "activé" : "désactivé"}. Ça se répercute chez tous les joueurs dans les 30 prochaines secondes (délai de rafraîchissement normal du launcher).</p>`);
  } else {
    await showInfo("Erreur", `<p>${escapeHtml(result.error || "Erreur inconnue")}</p>`);
  }
});

// --- Connexion Discord (pré-vérification avant de se connecter) ---


function renderDiscordSlot() {
  const slot = document.getElementById("discord-auth-slot");
  loadHomeMe(); // le résumé de l'accueil suit l'état de connexion Discord

  if (!discordProfile) {
    closeProfilePanel();
    slot.innerHTML = `
      <button class="ext-link discord-connect-btn" id="btn-discord-auth">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span class="nav-label">Lier Discord</span>
      </button>`;
    document.getElementById("btn-discord-auth").addEventListener("click", () => {
      window.anomia.startDiscordAuth();
    });
    return;
  }

  const dotClass = discordProfile.allowed === false ? "denied" : "allowed";
  const avatarSrc = discordProfile.avatar || "../assets/logo.png";
  slot.innerHTML = `
    <button class="discord-profile" id="btn-profile-toggle" title="Mon profil" aria-label="Ouvrir mon profil" aria-expanded="false">
      <img src="${avatarSrc}" alt="" class="discord-profile-avatar" />
      <span class="discord-profile-badge ${dotClass}"></span>
    </button>
  `;
  document.getElementById("btn-profile-toggle").addEventListener("click", toggleProfilePanel);
  if (!document.getElementById("profile-panel").classList.contains("hidden")) fillProfilePanel(); // panneau déjà ouvert : on le met à jour
  refreshAchievementTitle();
}

async function initDiscordAuth() {
  const configured = await window.anomia.isDiscordConfigured();
  if (!configured) {
    document.getElementById("discord-auth-slot").style.display = "none";
    return;
  }

  discordProfile = await window.anomia.getDiscordProfile();
  renderDiscordSlot();
  autoStaffUnlock(); refreshCitizen();

  window.anomia.onDiscordConnected((profile) => {
    discordProfile = profile;
    renderDiscordSlot();
    autoStaffUnlock(); refreshCitizen();
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

// --- Réglages (mode sombre/clair + couleur d'accent) ---
document.getElementById("btn-settings").addEventListener("click", () => {
  document.getElementById("settings-overlay").classList.remove("hidden");
});

document.getElementById("settings-close").addEventListener("click", () => {
  document.getElementById("settings-overlay").classList.add("hidden");
});

document.getElementById("settings-diag").addEventListener("click", async () => {
  const msg = document.getElementById("settings-diag-msg");
  msg.textContent = "Création du rapport…";
  try {
    const r = await window.anomia.createDiagnosticReport();
    msg.textContent = r && r.ok
      ? "Rapport créé : le dossier s'est ouvert, envoie le .zip au staff."
      : "Échec de la création du rapport.";
  } catch (e) {
    msg.textContent = "Échec de la création du rapport.";
  }
});

document.getElementById("settings-replay-tour").addEventListener("click", () => {
  document.getElementById("settings-overlay").classList.add("hidden");
  startTour();
});

document.querySelectorAll(".gs-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyMode(btn.dataset.mode);
    window.anomia.setSettings({ mode: btn.dataset.mode });
  });
});

document.querySelectorAll(".accent-swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    const color = btn.dataset.color;
    applyAccentColor(color);
    syncColorPicker(color);
    window.anomia.setSettings({ accentColor: color });
  });
});

// --- Sélecteur de couleur personnalisée : vrai picker souris (natif) ---
function syncColorPicker(hex) {
  const picker = document.getElementById("color-picker");
  const hexLabel = document.getElementById("color-picker-hex");
  picker.value = hex;
  hexLabel.textContent = hex.toUpperCase();
}

const colorPicker = document.getElementById("color-picker");
colorPicker.addEventListener("input", () => {
  applyAccentColor(colorPicker.value);
  document.getElementById("color-picker-hex").textContent = colorPicker.value.toUpperCase();
});
colorPicker.addEventListener("change", () => {
  window.anomia.setSettings({ accentColor: colorPicker.value });
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

// --- Succès ---
const ACHIEVEMENT_ICONS = {
  secretSeeker: "🕵️", polyvalent: "🎭", viewer: "📺", kbHours1: "⏱️", kbHours10: "⏱️", kbHours25: "⏱️", kbHours50: "⏱️", kbHours100: "⌛", kbHours250: "⌛", kbAdvNether: "🔥", kbAdvDiamond: "💎", kbAdvTrade: "🤝", kbAdvBeacon: "🔆", kbAdvEnd: "🌌", kbAdvElytra: "🪽", kbAdvWither: "💀", kbAdvDragon: "🐉", kbAdvHunter: "🗡️", kbAdvCount10: "📜", kbAdvCount30: "📚", kbAdvCount60: "🎓", error404: "🚫", hunter3: "🎯", hunter10: "🏹", hunter25: "👑", tourDone: "🧭", themeSwitch: "🎨",
  firstCharacter: "🧍", tutorialDone: "🎓", hasJob: "💼", hasVehicle: "🚗", hasHouse: "🏠",
  jobPromotion: "📈", money30k: "💵", money100k: "💰",
  drivingDistance100: "🛣️", drivingDistance500: "🛣️", drivingDistance1000: "🛣️",
  playtime1h: "⏱️", playtime10h: "⏱️", playtime100h: "⏱️", playtime500h: "⏱️",
  customizedVehicle: "🎨",
  vehicleCollector3: "🚙", vehicleCollector5: "🏎️",
  houseCollector2: "🏘️", millionaire: "💎", newLife: "🔄",
  licenceMoto: "🏍️", licenceCamion: "🚚", licenceBateau: "⛵", licenceAvion: "✈️", licenceHelicoptere: "🚁",
  firstKO: "🥊", firstComa: "🚑", firstInvoicePaid: "🧾",
  playtime1000h: "👑", drivingDistance10000: "🌍", loginStreak30: "📅", serverBirthday: "🎂"
};

const RARITY_LABELS = { bronze: "Bronze", silver: "Argent", gold: "Or", secret: "Secret" };

let achievementsLoaded = false;
async function loadAchievements() {
  if (achievementsLoaded) return;
  achievementsLoaded = true;
  const content = document.getElementById("achievements-content");
  const result = await window.anomia.getAchievements();

  if (!result.ok && result.notConnected) {
    content.innerHTML = `
      <div class="achievements-locked-msg">
        <p>Lie ton compte Discord pour débloquer et suivre tes succès.</p>
        <button class="btn-connect" id="achievements-discord-btn">Lier Discord</button>
      </div>`;
    document.getElementById("achievements-discord-btn").addEventListener("click", () => {
      window.anomia.startDiscordAuth();
    });
    achievementsLoaded = false; // retenter une fois connecté
    return;
  }

  if (!result.ok) {
    content.innerHTML = `<div class="achievements-locked-msg"><p>${escapeHtml(result.error || "Erreur inconnue.")}</p></div>`;
    achievementsLoaded = false;
    return;
  }

  if (!result.linked) {
    content.innerHTML = `<div class="achievements-locked-msg"><p>Reconnecte-toi une fois en jeu sur le serveur pour activer le suivi de tes succès (première fois seulement).</p></div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "achievements-grid";
  (result.list || []).forEach((def) => {
    const unlocked = Boolean(result.achievements && result.achievements[def.key]);
    const isSecretLocked = def.secret && !unlocked;
    const unlockDate = result.unlockedAt && result.unlockedAt[def.key];
    let dateLabel = "";
    if (unlocked && unlockDate) {
      // La date renvoyée par le serveur peut arriver sous différentes formes
      // selon l'encodage MySQL (chaîne "YYYY-MM-DD HH:MM:SS", nombre, etc.) -
      // on gère ça sans plaquer .replace() sur un type qui ne le supporte pas.
      const d = new Date(typeof unlockDate === "string" ? unlockDate.replace(" ", "T") : unlockDate);
      if (!Number.isNaN(d.getTime())) {
        dateLabel = `<span class="achievement-date">Débloqué le ${d.toLocaleDateString("fr-FR")}</span>`;
      }
    }
    const badge = document.createElement("div");
    const rarity = RARITY_LABELS[def.rarity] ? def.rarity : "bronze";
    badge.className = `achievement-badge rarity-${rarity} ${unlocked ? "unlocked" : ""}`;
    badge.innerHTML = `
      <div class="achievement-icon">${isSecretLocked ? "❓" : (ACHIEVEMENT_ICONS[def.key] || "🏆")}</div>
      <span class="achievement-name">${isSecretLocked ? "???" : escapeHtml(def.label)}</span>
      <span class="achievement-desc">${isSecretLocked ? "Succès secret" : escapeHtml(def.description)}</span>
      <span class="achievement-rarity">${isSecretLocked ? "Secret" : RARITY_LABELS[rarity]}</span>
      <span class="achievement-status">${unlocked ? "Débloqué" : "Verrouillé"}</span>
      ${dateLabel}
    `;
    grid.appendChild(badge);
  });
  content.innerHTML = "";
  const shareBtn = document.createElement("button");
  shareBtn.className = "btn-copy btn-share-profile";
  shareBtn.textContent = "👤 Voir mon profil";
  shareBtn.addEventListener("click", () => { const p = document.getElementById("profile-panel"); if (p.classList.contains("hidden")) toggleProfilePanel(); });
  content.appendChild(shareBtn);
  content.appendChild(grid);
}

// --- Profil du joueur (panneau ouvert/fermé en recliquant sur l'avatar) ---
function getShowcaseDefs(result) {
  const list = result.list || [];
  const isUnlocked = (d) => result.achievements && result.achievements[d.key];
  const unlocked = list.filter(isUnlocked);
  if (profileShowcaseKeys === null) {
    return [...unlocked].sort((a, b) => (RARITY_ORDER[b.rarity] || 1) - (RARITY_ORDER[a.rarity] || 1)).slice(0, 3);
  }
  return profileShowcaseKeys.map((k) => unlocked.find((d) => d.key === k)).filter(Boolean).slice(0, 3);
}

let ppResult = null;
let ppEditSelection = [];

function toggleProfilePanel() {
  const panel = document.getElementById("profile-panel");
  const open = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !open);
  const btn = document.getElementById("btn-profile-toggle");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) fillProfilePanel();
}

function closeProfilePanel() {
  document.getElementById("profile-panel").classList.add("hidden");
  const btn = document.getElementById("btn-profile-toggle");
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function ppIcon(d) { return ACHIEVEMENT_ICONS[d.key] || "🏆"; }

function renderPpShowcase() {
  const box = document.getElementById("pp-showcase");
  box.innerHTML = "";
  const defs = ppResult ? getShowcaseDefs(ppResult) : [];
  if (!defs.length) { box.innerHTML = `<p class="pp-empty">Aucun succès affiché. Clique sur « Modifier » pour en choisir.</p>`; return; }
  defs.forEach((d) => {
    const el = document.createElement("div");
    el.className = `pp-ach rarity-${RARITY_LABELS[d.rarity] ? d.rarity : "bronze"}`;
    el.innerHTML = `<span class="pp-ach-icon">${ppIcon(d)}</span><span class="pp-ach-name">${escapeHtml(d.label)}</span><span class="pp-ach-r">${RARITY_LABELS[d.rarity] || "Bronze"}</span>`;
    box.appendChild(el);
  });
}

async function fillProfilePanel() {
  document.getElementById("pp-name").textContent = streamerMode ? "Joueur" : ((discordProfile && discordProfile.username) || "Joueur");
  document.getElementById("pp-avatar").src = (discordProfile && discordProfile.avatar) || "../assets/logo.png";
  let r;
  try { r = await getAchData(); } catch (e) { r = null; }
  const ok = r && r.ok && r.linked;
  ppResult = ok ? r : null;
  if (!ok) {
    ["pp-playtime", "pp-ach", "pp-gold"].forEach((id) => (document.getElementById(id).textContent = "—"));
    document.getElementById("pp-rarity").textContent = "";
    document.getElementById("pp-msg").textContent = r && r.linked === false
      ? "Connecte-toi une fois en jeu pour activer ton suivi."
      : "Statistiques indisponibles pour le moment (serveur éteint ?).";
    document.getElementById("pp-capture").disabled = true;
    renderPpShowcase();
    return;
  }
  document.getElementById("pp-msg").textContent = "";
  document.getElementById("pp-capture").disabled = false;
  const list = r.list || [];
  const unlocked = list.filter((d) => r.achievements && r.achievements[d.key]);
  const counts = { bronze: 0, silver: 0, gold: 0, secret: 0 };
  unlocked.forEach((d) => { counts[RARITY_COLORS[d.rarity] ? d.rarity : "bronze"]++; });
  const secs = r.playtimeSeconds || 0;
  document.getElementById("pp-playtime").textContent = secs >= 3600 ? `${Math.floor(secs / 3600)} h` : `${Math.floor(secs / 60)} min`;
  // Détail par serveur : chaque serveur a ses propres données, le total est leur somme
  const fmtH = (n) => (n >= 3600 ? `${Math.floor(n / 3600)} h` : n > 0 ? `${Math.floor(n / 60)} min` : "—");
  const by = r.playtimeByServer || {};
  document.getElementById("pp-servers").innerHTML = SERVERS.map((sv) => `<span><i style="background:${sv.color || "var(--teal)"}"></i>${escapeHtml(sv.name)} ${fmtH(Number(by[sv.id]) || 0)}</span>`).join("");
  document.getElementById("pp-ach").textContent = `${unlocked.length}/${list.length}`;
  document.getElementById("pp-gold").textContent = String(counts.gold + counts.secret);
  document.getElementById("pp-rarity").innerHTML = [["bronze", "Bronze"], ["silver", "Argent"], ["gold", "Or"], ["secret", "Secret"]]
    .map(([k, l]) => `<span><i style="background:${RARITY_COLORS[k]}"></i>${l} ${counts[k]}</span>`).join("");
  renderPpShowcase();
}

function openPpEditor() {
  if (!ppResult) return;
  const list = (ppResult.list || []).filter((d) => ppResult.achievements && ppResult.achievements[d.key]);
  ppEditSelection = getShowcaseDefs(ppResult).map((d) => d.key);
  const grid = document.getElementById("pp-editor-grid");
  grid.innerHTML = "";
  const refresh = () => {
    grid.querySelectorAll(".pp-pick").forEach((el) => el.classList.toggle("on", ppEditSelection.includes(el.dataset.key)));
    document.getElementById("pp-editor-count").textContent = `${ppEditSelection.length}/3 choisis`;
  };
  list.forEach((d) => {
    const el = document.createElement("button");
    el.className = `pp-pick rarity-${RARITY_LABELS[d.rarity] ? d.rarity : "bronze"}`;
    el.dataset.key = d.key;
    el.title = d.description || d.label;
    el.innerHTML = `<span>${ppIcon(d)}</span><em>${escapeHtml(d.label)}</em>`;
    el.addEventListener("click", () => {
      const i = ppEditSelection.indexOf(d.key);
      if (i >= 0) ppEditSelection.splice(i, 1);
      else if (ppEditSelection.length < 3) ppEditSelection.push(d.key);
      refresh();
    });
    grid.appendChild(el);
  });
  if (!list.length) grid.innerHTML = `<p class="pp-empty">Tu n'as pas encore de succès à afficher.</p>`;
  refresh();
  document.getElementById("pp-editor").classList.remove("hidden");
  document.getElementById("pp-edit").textContent = "Annuler";
}

function closePpEditor() {
  document.getElementById("pp-editor").classList.add("hidden");
  document.getElementById("pp-edit").textContent = "Modifier";
}

document.getElementById("pp-edit").addEventListener("click", () => {
  if (document.getElementById("pp-editor").classList.contains("hidden")) openPpEditor(); else closePpEditor();
});
document.getElementById("pp-editor-save").addEventListener("click", () => {
  profileShowcaseKeys = ppEditSelection.slice(0, 3);
  window.anomia.setSettings({ profileShowcase: profileShowcaseKeys });
  closePpEditor();
  renderPpShowcase();
});
document.getElementById("pp-capture").addEventListener("click", () => { if (ppResult) openProfileCard(ppResult); });
document.getElementById("pp-logout").addEventListener("click", async () => {
  const confirmed = await showConfirm("Déconnexion Discord", "Te déconnecter de Discord ? Tu devras te reconnecter pour te connecter au serveur si la whitelist est activée.");
  if (!confirmed) return;
  window.anomia.logoutDiscord();
  discordProfile = null;
  adminVerified = false; updateDutyButton();
  clearStaffRole();
  achCache = { at: 0, promise: null };
  closeProfilePanel();
  closePpEditor();
  renderDiscordSlot();
});

// --- Carte de profil partageable (image PNG pour Discord) ---
const RARITY_COLORS = { bronze: "#cd7f32", silver: "#c0c7d1", gold: "#facc15", secret: "#a855f7" };
const RARITY_ORDER = { secret: 4, gold: 3, silver: 2, bronze: 1 };

function loadImageSafe(src) {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous"; // images distantes : nécessaire pour exporter le canvas
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  let t = String(text);
  while (t.length > 1 && ctx.measureText(t).width > maxWidth) t = t.slice(0, -1);
  return t === String(text) ? t : t.trimEnd() + "…";
}

async function drawProfileCard(result) {
  const canvas = document.getElementById("profile-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const accent = (getComputedStyle(document.documentElement).getPropertyValue("--teal") || "#8b5cf6").trim() || "#8b5cf6";

  const list = result.list || [];
  const unlockedDefs = list.filter((d) => result.achievements && result.achievements[d.key]);
  const counts = { bronze: 0, silver: 0, gold: 0, secret: 0 };
  unlockedDefs.forEach((d) => { counts[RARITY_COLORS[d.rarity] ? d.rarity : "bronze"]++; });
  const top = getShowcaseDefs(result);

  // Fond
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0714"); bg.addColorStop(1, "#1b1033");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 10, W * 0.85, 0, 520);
  glow.addColorStop(0, accent + "55"); glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = accent; ctx.lineWidth = 4; roundRect(ctx, 14, 14, W - 28, H - 28, 22); ctx.stroke();

  // Avatar
  const avatarUrl = !streamerMode && discordProfile && discordProfile.avatar ? discordProfile.avatar.replace("size=64", "size=256") : null;
  const avatar = (avatarUrl && (await loadImageSafe(avatarUrl))) || (await loadImageSafe("../assets/logo.png"));
  const ax = 70, ay = 70, ar = 90;
  ctx.save();
  ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax, ay, ar * 2, ar * 2);
  ctx.restore();
  ctx.strokeStyle = accent; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); ctx.stroke();

  // Nom + titre
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 54px 'Segoe UI', Arial, sans-serif";
  ctx.fillText(fitText(ctx, streamerMode ? "Joueur" : ((discordProfile && discordProfile.username) || "Joueur"), 640), 290, 130);
  ctx.fillStyle = accent;
  ctx.font = "600 26px 'Segoe UI', Arial, sans-serif";
  {
    const tDef = chosenTitleKey && result.achievements && result.achievements[chosenTitleKey] ? list.find((d) => d.key === chosenTitleKey) : null;
    ctx.fillText(fitText(ctx, tDef ? `${tDef.label.toUpperCase()}  ·  ANOMIA RP` : "ANOMIA RP  ·  PROFIL JOUEUR", 640), 292, 175);
  }

  // Stats
  const hours = Math.floor((result.playtimeSeconds || 0) / 3600);
  const stats = [
    [hours > 0 ? `${hours} h` : "—", "TEMPS DE JEU"],
    [`${unlockedDefs.length}/${list.length}`, "SUCCÈS"],
    [`${counts.gold + counts.secret}`, "OR & SECRETS"]
  ];
  stats.forEach(([val, label], i) => {
    const x = 290 + i * 250, y = 215;
    ctx.fillStyle = "rgba(255,255,255,0.06)"; roundRect(ctx, x, y, 230, 96, 14); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "800 40px 'Segoe UI', Arial, sans-serif"; ctx.fillText(val, x + 20, y + 52);
    ctx.fillStyle = "#a99bc8"; ctx.font = "600 15px 'Segoe UI', Arial, sans-serif"; ctx.fillText(label, x + 20, y + 80);
  });

  // Raretés
  ctx.font = "700 20px 'Segoe UI', Arial, sans-serif";
  let rx = 70;
  [["bronze", "Bronze"], ["silver", "Argent"], ["gold", "Or"], ["secret", "Secret"]].forEach(([k, label]) => {
    ctx.fillStyle = RARITY_COLORS[k]; ctx.beginPath(); ctx.arc(rx + 9, 372, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8e0f5"; const t = `${label} ${counts[k]}`; ctx.fillText(t, rx + 26, 380);
    rx += 26 + ctx.measureText(t).width + 34;
  });

  // Meilleurs succès
  ctx.fillStyle = "#a99bc8"; ctx.font = "700 16px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("SUCCÈS MIS EN AVANT", 70, 428);
  if (!top.length) {
    ctx.fillStyle = "#6f6390"; ctx.font = "500 22px 'Segoe UI', Arial, sans-serif";
    ctx.fillText("Aucun succès mis en avant.", 70, 480);
  }
  top.forEach((d, i) => {
    const x = 70 + i * 360, y = 448;
    const rc = RARITY_COLORS[d.rarity] || RARITY_COLORS.bronze;
    ctx.fillStyle = "rgba(255,255,255,0.06)"; roundRect(ctx, x, y, 340, 100, 14); ctx.fill();
    ctx.strokeStyle = rc; ctx.lineWidth = 2.5; roundRect(ctx, x, y, 340, 100, 14); ctx.stroke();
    ctx.font = "46px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
    ctx.fillStyle = "#fff"; ctx.fillText(ACHIEVEMENT_ICONS[d.key] || "🏆", x + 18, y + 64);
    ctx.font = "700 22px 'Segoe UI', Arial, sans-serif";
    ctx.fillText(fitText(ctx, d.label, 235), x + 88, y + 44);
    ctx.fillStyle = rc; ctx.font = "600 16px 'Segoe UI', Arial, sans-serif";
    ctx.fillText((RARITY_LABELS[d.rarity] || "Bronze").toUpperCase(), x + 88, y + 72);
  });

  // Pied
  ctx.fillStyle = "#8f82ad"; ctx.font = "600 18px 'Segoe UI', Arial, sans-serif";
  ctx.fillText("B2 LAUNCHER  ·  twitch.tv/b2obi64", 70, H - 36);
  const dateStr = new Date().toLocaleDateString("fr-FR");
  const dw = ctx.measureText(dateStr).width;
  ctx.fillText(dateStr, W - 70 - dw, H - 36);
}

async function openProfileCard(result) {
  const overlay = document.getElementById("profile-overlay");
  const msg = document.getElementById("profile-msg");
  msg.textContent = "Création de l'image…";
  overlay.classList.remove("hidden");
  try {
    await drawProfileCard(result);
    msg.textContent = "";
  } catch (e) {
    msg.textContent = "Impossible de générer l'image.";
  }
}

function profileCanvasBlob() {
  return new Promise((resolve) => document.getElementById("profile-canvas").toBlob(resolve, "image/png"));
}

document.getElementById("profile-close").addEventListener("click", () => {
  document.getElementById("profile-overlay").classList.add("hidden");
});
document.getElementById("profile-copy").addEventListener("click", async () => {
  const msg = document.getElementById("profile-msg");
  try {
    const blob = await profileCanvasBlob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    msg.textContent = "Image copiée : colle-la directement dans Discord (Ctrl+V).";
  } catch (e) {
    msg.textContent = "Copie impossible, utilise « Enregistrer en PNG ».";
  }
});
document.getElementById("profile-save").addEventListener("click", async () => {
  const msg = document.getElementById("profile-msg");
  try {
    const dataUrl = document.getElementById("profile-canvas").toDataURL("image/png");
    const r = await window.anomia.saveImage(dataUrl, "profil-b2.png");
    if (r && r.ok) msg.textContent = "Image enregistrée.";
    else if (r && r.canceled) msg.textContent = "";
    else msg.textContent = "Échec de l'enregistrement.";
  } catch (e) {
    msg.textContent = "Échec de l'enregistrement (image bloquée ?).";
  }
});

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

// --- Tutoriel guidé (premier lancement + « Revoir le tutoriel ») ---
// Les étapes sont dans src/tour.json : { title, text, selector?, go?:{server,view}, staff? }.
// Pour ajouter une explication, il suffit d'ajouter un bloc dans ce fichier.
let tourSteps = [];
let onboardingStep = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isShown = (el) => el && el.getClientRects().length > 0;

async function startTour() {
  let all = [];
  try { all = await window.anomia.getTour(); } catch (e) { all = []; }
  if (!Array.isArray(all)) all = [];
  const staff = typeof isAdminUnlocked !== "undefined" && isAdminUnlocked;
  tourSteps = all.filter((s) => s && s.text && (!s.staff || staff));
  if (!tourSteps.length) return;
  onboardingStep = 0;
  showOnboardingStep(1);
}

async function showOnboardingStep(dir) {
  dir = dir || 1;
  const overlay = document.getElementById("onboarding-overlay");
  let step = tourSteps[onboardingStep];
  if (!step) { finishOnboarding(); return; }
  if (step.go) {
    try {
      if (step.go.server && currentServerId !== step.go.server) selectServer(step.go.server);
      if (step.go.view) goToView(step.go.view);
    } catch (e) { /* ignore */ }
    await sleep(180);
  }
  const target = step.selector ? document.querySelector(step.selector) : null;
  if (step.selector && !isShown(target)) { // cible absente (ex. serveur sans cet onglet) : on passe
    onboardingStep += dir;
    if (onboardingStep < 0) onboardingStep = 0;
    return showOnboardingStep(dir);
  }
  const tooltip = document.getElementById("onboarding-tooltip");
  const hl = document.getElementById("onboarding-highlight");
  document.getElementById("onboarding-title").textContent = step.title || "";
  document.getElementById("onboarding-text").textContent = step.text;
  document.getElementById("onboarding-progress").textContent = `${onboardingStep + 1}/${tourSteps.length}`;
  document.getElementById("onboarding-next").textContent = onboardingStep === tourSteps.length - 1 ? "Terminer" : "Suivant";
  document.getElementById("onboarding-prev").classList.toggle("hidden", onboardingStep === 0);
  overlay.classList.remove("hidden");
  if (target) {
    const rect = target.getBoundingClientRect();
    hl.classList.remove("none");
    hl.style.cssText = `top:${rect.top - 6}px; left:${rect.left - 6}px; width:${rect.width + 12}px; height:${rect.height + 12}px;`;
    tooltip.classList.remove("center");
    const th = tooltip.offsetHeight || 170;
    let top = rect.bottom + 14;
    if (top + th > window.innerHeight - 10) top = Math.max(10, rect.top - th - 14); // pas la place dessous : au-dessus
    if (top < 10) top = Math.max(10, window.innerHeight - th - 10);
    tooltip.style.cssText = `top:${top}px; left:${Math.max(20, Math.min(rect.left, window.innerWidth - 340))}px;`;
  } else {
    hl.classList.add("none");
    tooltip.style.cssText = "";
    tooltip.classList.add("center");
  }
}

function finishOnboarding() {
  document.getElementById("onboarding-overlay").classList.add("hidden");
  window.anomia.setSettings({ onboardingSeen: true });
  if (window.launcherAch) window.launcherAch.unlock("tourDone");
  try { selectServer("hub"); } catch (e) { /* ignore */ }
}

document.getElementById("onboarding-next").addEventListener("click", () => { onboardingStep++; showOnboardingStep(1); });
document.getElementById("onboarding-prev").addEventListener("click", () => { onboardingStep = Math.max(0, onboardingStep - 1); showOnboardingStep(-1); });
document.getElementById("onboarding-skip").addEventListener("click", finishOnboarding);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.getElementById("onboarding-overlay").classList.contains("hidden")) finishOnboarding(); });
window.openGuide = startTour;

window.anomia.getSettings().then((settings) => {
  if (!settings.onboardingSeen) setTimeout(startTour, 900); // laisse le launcher finir de s'afficher d'abord
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

// --- Règlement ---
function formatRulesLines(lines) {
  let html = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("●")) {
      const bullets = [];
      while (i < lines.length && lines[i].startsWith("●")) {
        bullets.push(lines[i].replace(/^●\s*/, ""));
        i++;
      }
      html += `<ul class="rules-list">${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
      continue;
    }
    if (/^\d+\.\d+\s*—/.test(line)) {
      html += `<h3 class="rules-subsection-title">${escapeHtml(line)}</h3>`;
      i++;
      continue;
    }
    if (line.startsWith("📜") || line.startsWith("📌") || line.startsWith("🏛️")) {
      html += `<p class="rules-highlight">${escapeHtml(line)}</p>`;
      i++;
      continue;
    }
    html += `<p>${escapeHtml(line)}</p>`;
    i++;
  }
  return html;
}

// Chaque chapitre (« 1. TITRE ») devient un menu déroulant ; ce qui précède reste visible en introduction.
function formatRules(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const intro = [];
  const chapters = [];
  let current = null;
  for (const line of lines) {
    if (/^\d+\.\s/.test(line)) {
      current = { title: line, lines: [] };
      chapters.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  let html = formatRulesLines(intro);
  if (chapters.length) {
    html += `<div class="rules-toolbar"><button class="btn-copy" id="rules-open-all">Tout déplier</button><button class="btn-copy" id="rules-close-all">Tout replier</button></div>`;
  }
  chapters.forEach((c) => {
    html += `<details class="rules-chapter"><summary><span class="rules-chapter-title">${escapeHtml(c.title)}</span></summary><div class="rules-chapter-body">${formatRulesLines(c.lines)}</div></details>`;
  });
  return html;
}

let rulesLoaded = false;
async function loadRules() {
  if (rulesLoaded) return;
  rulesLoaded = true;
  const container = document.getElementById("rules-content");
  const raw = await window.anomia.getRules();

  if (!raw) {
    container.innerHTML = `<p style="color:var(--text-dim);font-size:13px;">Règlement pas encore disponible.</p>`;
    rulesLoaded = false;
    return;
  }

  container.innerHTML = formatRules(raw);
}

// --- Carte interactive (pan + zoom + recherche + filtres + GPS) ---
let mapLoaded = false;
let mapState = { scale: 1, x: 0, y: 0 };
let mapDragging = false;
let mapDragStart = { x: 0, y: 0 };
let allMapPoints = [];
let activeMapCategory = "all";

function applyMapTransform(animated) {
  const inner = document.getElementById("map-inner");
  inner.style.transition = animated ? "transform .45s cubic-bezier(.2,.8,.2,1)" : "none";
  inner.style.transform = `translate(${mapState.x}px, ${mapState.y}px) scale(${mapState.scale})`;
}

function zoomToPoint(point) {
  const wrap = document.getElementById("map-wrap");
  const rect = wrap.getBoundingClientRect();
  const targetScale = 2.2;

  // Position du point en pixels sur l'image à l'échelle 1
  const imgWidth = 2200;
  const imgHeight = document.getElementById("map-image").naturalHeight * (imgWidth / document.getElementById("map-image").naturalWidth);
  const pointPxX = (point.x / 100) * imgWidth;
  const pointPxY = (point.y / 100) * imgHeight;

  mapState.scale = targetScale;
  mapState.x = rect.width / 2 - pointPxX * targetScale;
  mapState.y = rect.height / 2 - pointPxY * targetScale;
  applyMapTransform(true);
}

async function openMapPointPopup(point) {
  const canSendGps = typeof point.gameX === "number" && typeof point.gameY === "number";
  const html = `
    <p>${escapeHtml(point.description || "")}</p>
    ${canSendGps ? `<button class="btn-connect" id="map-gps-btn" style="width:100%;margin-top:12px;">Envoyer sur le GPS in-game</button>` : ""}
  `;
  await showInfo(point.label || "Point d'intérêt", html);

  const gpsBtn = document.getElementById("map-gps-btn");
  if (gpsBtn) {
    gpsBtn.addEventListener("click", async () => {
      gpsBtn.disabled = true;
      gpsBtn.textContent = "Envoi…";
      const result = await window.anomia.sendGpsWaypoint(point.gameX, point.gameY);

      if (result.ok) {
        gpsBtn.textContent = "Point GPS envoyé ✓";
      } else if (result.reason === "not_online") {
        await showInfo("Pas connecté au serveur", `<p>Tu dois être connecté au serveur en jeu pour recevoir un point GPS. Connecte-toi d'abord, puis réessaie.</p>`);
        gpsBtn.disabled = false;
        gpsBtn.textContent = "Envoyer sur le GPS in-game";
      } else if (result.reason === "not_connected") {
        await showInfo("Discord requis", `<p>Lie ton compte Discord pour utiliser cette fonction.</p>`);
        gpsBtn.disabled = false;
        gpsBtn.textContent = "Envoyer sur le GPS in-game";
      } else {
        await showInfo("Erreur", `<p>Impossible d'envoyer le point GPS pour le moment.</p>`);
        gpsBtn.disabled = false;
        gpsBtn.textContent = "Envoyer sur le GPS in-game";
      }
    });
  }
}

function renderMapMarkers(points) {
  const container = document.getElementById("map-markers");
  container.innerHTML = "";
  points.forEach((point) => {
    const marker = document.createElement("div");
    marker.className = "map-marker";
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    marker.innerHTML = `
      <span class="map-marker-dot"></span>
      <span class="map-marker-label">${escapeHtml(point.label || "")}</span>
    `;
    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      zoomToPoint(point);
      openMapPointPopup(point);
    });
    container.appendChild(marker);
  });
}

function applyMapFiltersAndSearch() {
  const search = document.getElementById("map-search").value.trim().toLowerCase();
  const filtered = allMapPoints.filter((p) => {
    const matchesCategory = activeMapCategory === "all" || p.category === activeMapCategory;
    const matchesSearch = !search || (p.label || "").toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
  renderMapMarkers(filtered);
}

function renderMapFilters(points) {
  const container = document.getElementById("map-filters");
  const categories = [...new Set(points.map((p) => p.category).filter(Boolean))];

  if (categories.length === 0) {
    container.innerHTML = "";
    return;
  }

  const allBtn = `<button class="map-filter-btn active" data-category="all">Tous</button>`;
  const catBtns = categories.map((cat) => `<button class="map-filter-btn" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join("");
  container.innerHTML = allBtn + catBtns;

  container.querySelectorAll(".map-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".map-filter-btn").forEach((b) => b.classList.toggle("active", b === btn));
      activeMapCategory = btn.dataset.category;
      applyMapFiltersAndSearch();
    });
  });
}

async function loadMap() {
  if (mapLoaded) return;
  mapLoaded = true;

  const wrap = document.getElementById("map-wrap");
  const img = document.getElementById("map-image");

  allMapPoints = await window.anomia.getMapPoints();
  document.getElementById("map-markers").style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%;";

  const setupMarkers = () => {
    renderMapFilters(allMapPoints);
    renderMapMarkers(allMapPoints);
    fitMapToView(); // à l'ouverture : on voit toute la carte
  };
  if (img.complete) setupMarkers();
  else img.addEventListener("load", setupMarkers, { once: true });

  document.getElementById("map-search").addEventListener("input", applyMapFiltersAndSearch);

  // Molette : zoom centré sur le curseur
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const prevScale = mapState.scale;
    const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.min(4, Math.max(mapMinScale, prevScale * delta));

    mapState.x = cursorX - ((cursorX - mapState.x) / prevScale) * newScale;
    mapState.y = cursorY - ((cursorY - mapState.y) / prevScale) * newScale;
    mapState.scale = newScale;
    applyMapTransform(false);
  });

  // Clic-glisser pour se déplacer
  wrap.addEventListener("mousedown", (e) => {
    mapDragging = true;
    wrap.classList.add("dragging");
    mapDragStart = { x: e.clientX - mapState.x, y: e.clientY - mapState.y };
  });
  window.addEventListener("mousemove", (e) => {
    if (!mapDragging) return;
    mapState.x = e.clientX - mapDragStart.x;
    mapState.y = e.clientY - mapDragStart.y;
    applyMapTransform(false);
  });
  window.addEventListener("mouseup", () => {
    mapDragging = false;
    wrap.classList.remove("dragging");
  });

  applyMapTransform(false);
  const fitBtn = document.getElementById("map-fit");
  if (fitBtn) fitBtn.addEventListener("click", () => fitMapToView(true));
  window.addEventListener("resize", () => { if (!document.getElementById("view-map").classList.contains("hidden")) fitMapToView(); });
}

// Cadre toute la carte dans la fenêtre (échelle + centrage)
let mapMinScale = 0.3;
function fitMapToView(animated) {
  const wrap = document.getElementById("map-wrap");
  const img = document.getElementById("map-image");
  const rect = wrap.getBoundingClientRect();
  if (!rect.width || !img.naturalWidth) return;
  const w = 2200; // largeur d'affichage de la carte à l'échelle 1 (voir style.css)
  const h = (w * img.naturalHeight) / img.naturalWidth;
  const scale = Math.min(rect.width / w, rect.height / h);
  mapMinScale = Math.min(0.3, scale * 0.8);
  mapState.scale = scale;
  mapState.x = (rect.width - w * scale) / 2;
  mapState.y = (rect.height - h * scale) / 2;
  applyMapTransform(Boolean(animated));
}

// --- Titre de succès (le plus prestigieux débloqué, affiché près du profil) ---
async function refreshAchievementTitle() {
  const result = await getAchData();
  if (!result || !result.ok || !result.linked || !result.achievements) return;

  const priority = await window.anomia.getAchievementTitlePriority();
  const unlockedKey = (chosenTitleKey && result.achievements[chosenTitleKey]) ? chosenTitleKey : priority.find((key) => result.achievements[key]);
  if (!unlockedKey) return;

  const def = (result.list || []).find((d) => d.key === unlockedKey);
  if (!def) return;

  const titleEl = document.getElementById("achievement-title-badge");
  if (titleEl) titleEl.textContent = def.label;
}


// --- Accueil : joueurs connectés + fiche profil (visible par tout le monde) ---
function playerRow(name, server, extra) {
  const b = document.createElement("button");
  b.className = "player-row";
  b.innerHTML = `<span class="player-dot"></span><b>${escapeHtml(name)}</b><small>${escapeHtml(extra || "")}</small>`;
  b.addEventListener("click", () => openPlayerProfile(server, name));
  return b;
}
async function loadHubPlayers() {
  const a = document.getElementById("pl-anomia"), k = document.getElementById("pl-kb");
  a.innerHTML = k.innerHTML = `<p class="hc-empty">Chargement…</p>`;
  const [st, kb] = await Promise.all([window.anomia.getServerStatus().catch(() => null), window.anomia.getKbPlayers().catch(() => null)]);
  a.innerHTML = "";
  if (!st || !st.online) a.innerHTML = `<p class="hc-empty">Serveur hors ligne.</p>`;
  else if (!st.players || !st.players.length) a.innerHTML = `<p class="hc-empty">${st.clients ? "La liste des joueurs n'est pas publique." : "Personne en ligne."}</p>`;
  else st.players.slice().sort((x, y) => String(x.name).localeCompare(String(y.name))).forEach((p) => a.appendChild(playerRow(p.name, "anomia", p.ping != null ? p.ping + " ms" : "")));
  document.getElementById("pl-anomia-count").textContent = st && st.online ? `(${st.clients ?? (st.players || []).length})` : "";
  k.innerHTML = "";
  if (!kb || !kb.ok) k.innerHTML = `<p class="hc-empty">Statut indisponible pour le moment.</p>`;
  else if (!kb.online) k.innerHTML = `<p class="hc-empty">Serveur hors ligne.</p>`;
  else if (!kb.names.length) k.innerHTML = `<p class="hc-empty">${kb.count ? "Les pseudos ne sont pas communiqués par le serveur." : "Personne en ligne."}</p>`;
  else kb.names.slice().sort((x, y) => x.localeCompare(y)).forEach((n) => k.appendChild(playerRow(n, "kannibaventure")));
  document.getElementById("pl-kb-count").textContent = kb && kb.online ? `(${kb.count})` : "";
}
async function openPlayerProfile(server, name) {
  showInfo(name, `<p class="hc-empty">Chargement de la fiche…</p>`);
  const p = await window.anomia.getPlayerProfile(server, name).catch(() => null);
  const srvName = server === "kannibaventure" ? "KannibAventure" : "Anomia RP";
  if (!p || !p.ok) { showInfo(name, `<p>Fiche indisponible pour le moment.</p>`); return; }
  if (!p.linked) { showInfo(name, `<p style="color:var(--text-dim)">${srvName} · ce joueur n'a pas de profil lié (compte Discord ou Minecraft non synchronisé).</p>`); return; }
  const list = p.list || [], got = p.unlocked || {};
  const done = list.filter((d) => got[d.key]);
  const hours = Math.floor((p.playSec || 0) / 3600);
  const rar = ["gold", "silver", "bronze", "secret"].map((k) => {
    const a = list.filter((d) => d.rarity === k), u = a.filter((d) => got[d.key]).length;
    return a.length ? `<span class="hc-dot rarity-${k}">${RARITY_LABELS[k]} ${u}/${a.length}</span>` : "";
  }).join(" ");
  const order = { gold: 0, silver: 1, bronze: 2, secret: 3 };
  const title = (p.titlePriority || []).map((k) => list.find((d) => d.key === k && got[k])).find(Boolean);
  const top = done.slice().sort((x, y) => (order[x.rarity] ?? 9) - (order[y.rarity] ?? 9)).slice(0, 6)
    .map((d) => `<li>${ACHIEVEMENT_ICONS[d.key] || "🏆"} ${escapeHtml(d.label)}</li>`).join("");
  showInfo(name, `
    <p style="color:var(--text-dim);font-size:12px;margin:0 0 6px">${srvName}${title ? " · « " + escapeHtml(title.label) + " »" : ""}</p>
    <p><b>${done.length}</b> / ${list.length} succès · <b>${hours}</b> h de jeu</p>
    <p style="margin:8px 0">${rar}</p>
    ${top ? `<p style="font-size:12px;color:var(--text-dim);margin:10px 0 4px">Plus beaux succès</p><ul class="player-top">${top}</ul>` : ""}`);
}


// --- État du launcher (réglages) ---
document.getElementById("health-launcher-btn").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget, box = document.getElementById("health-launcher");
  btn.disabled = true; btn.textContent = "Vérification…";
  let r = null;
  try { r = await window.anomia.getLauncherHealth(); } catch (e) { r = null; }
  btn.disabled = false; btn.textContent = "Vérifier à nouveau";
  if (!r) { box.innerHTML = `<p class="hc-empty">Vérification impossible.</p>`; return; }
  const rows = [
    ["Connexion Discord", r.discord.ok, r.discord.ok ? "Connecté" : "Non connecté"],
    ["Hôte Anomia (profils, statut)", r.anomia.ok, r.anomia.ok ? r.anomia.ms + " ms" : "Injoignable"],
    ["GitHub (actus, mises à jour)", r.github.ok, r.github.ok ? r.github.ms + " ms" : "Injoignable"],
    ["FiveM détecté", r.fivem.ok, r.fivem.na ? "Windows uniquement" : (r.fivem.ok ? "Installé" : "Introuvable")]
  ];
  box.innerHTML = rows.map(([n, ok, d]) => `<div class="hl-row"><span class="hl-dot ${ok ? "ok" : "ko"}"></span><b>${n}</b><small>${d}</small></div>`).join("");
});
