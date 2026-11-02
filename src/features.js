// ============================================================
// B2 Launcher 1.7.0 : fonctionnalités additionnelles
// (chargé après renderer.js, dont il réutilise les fonctions globales)
// ============================================================
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const api = window.anomia;
  let S = {};            // copie locale des réglages
  let appVersion = "";
  const ready = api.getSettings().then((s) => { S = s || {}; }).catch(() => {});
  function save(patch) { Object.assign(S, patch); try { api.setSettings(patch); } catch (e) { /* ignore */ } }
  const esc = (t) => (typeof escapeHtml === "function" ? escapeHtml(String(t == null ? "" : t)) : String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const fmtDur = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };

  // ---------- Thèmes ----------
  const THEMES = { default: "#8b5cf6", neon: "#22d3ee", minecraft: "#5cb85c", retro: "#f59e0b", gold: "#facc15", matrix: "#00ff41" };
  const THEME_LABELS = { gold: "Or", matrix: "Matrix" };
  function applyTheme(name, persist) {
    if (!THEMES[name]) name = "default";
    document.documentElement.setAttribute("data-theme", name);
    applyAccentColor(THEMES[name]);
    const cp = $("color-picker"), hx = $("color-picker-hex");
    if (cp) cp.value = THEMES[name];
    if (hx) hx.textContent = THEMES[name].toUpperCase();
    document.querySelectorAll(".theme-chip").forEach((c) => c.classList.toggle("active", c.dataset.theme === name));
    syncFx();
    if (persist) save({ theme: name, accentColor: THEMES[name] });
  }
  function refreshThemeChips() {
    ["gold", "matrix"].forEach((t) => {
      const chip = $("theme-chips") && $("theme-chips").querySelector(`[data-theme="${t}"]`);
      if (chip) chip.classList.toggle("hidden", !(S.unlockedThemes || []).includes(t));
    });
  }
  document.querySelectorAll(".theme-chip").forEach((c) => c.addEventListener("click", () => applyTheme(c.dataset.theme, true)));
  // un accent choisi à la main sort du thème (les couleurs restent libres)
  document.querySelectorAll(".accent-swatch").forEach((b) => b.addEventListener("click", () => { document.documentElement.setAttribute("data-theme", "custom"); document.querySelectorAll(".theme-chip").forEach((c) => c.classList.remove("active")); save({ theme: "custom" }); }));

  // ---------- Fond animé ----------
  const fx = $("fx-bg");
  let fxOn = false, fxRaf = 0, parts = [];
  function fxResize() { fx.width = window.innerWidth; fx.height = window.innerHeight; }
  const RAIN_CHARS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789<>{}[]/=+*;:".split("");
  let rain = [];
  function fxLoop() {
    if (!fxOn) return;
    const ctx = fx.getContext("2d");
    ctx.clearRect(0, 0, fx.width, fx.height);
    if (document.documentElement.getAttribute("data-theme") === "matrix") {
      // Pluie de code façon Matrix : discrète pour ne pas gêner la lecture
      ctx.font = "14px 'Mono', monospace";
      rain.forEach((c, i) => {
        c.y += c.speed;
        if (c.y - c.len * 16 > fx.height) { c.y = -Math.random() * 300; c.speed = 1.2 + Math.random() * 2.6; c.len = 8 + Math.floor(Math.random() * 14); }
        if (Math.random() < 0.08) c.glyphs[Math.floor(Math.random() * c.glyphs.length)] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
        for (let k = 0; k < c.len; k++) {
          const y = c.y - k * 16;
          if (y < -16 || y > fx.height + 16) continue;
          ctx.globalAlpha = k === 0 ? 0.55 : Math.max(0.03, 0.3 * (1 - k / c.len));
          ctx.fillStyle = k === 0 ? "#d6ffe0" : "#00ff41";
          ctx.fillText(c.glyphs[k % c.glyphs.length], i * 16, y);
        }
      });
      ctx.globalAlpha = 1;
      fxRaf = requestAnimationFrame(fxLoop);
      return;
    }
    const col = (getComputedStyle(document.documentElement).getPropertyValue("--teal") || "#8b5cf6").trim();
    ctx.fillStyle = col;
    parts.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -5) p.x = fx.width + 5; if (p.x > fx.width + 5) p.x = -5;
      if (p.y < -5) p.y = fx.height + 5; if (p.y > fx.height + 5) p.y = -5;
      ctx.globalAlpha = p.a; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    });
    ctx.globalAlpha = 1;
    fxRaf = requestAnimationFrame(fxLoop);
  }
  function syncFx() { setAnimatedBg(Boolean(S.animatedBg) || document.documentElement.getAttribute("data-theme") === "matrix"); }
  function setAnimatedBg(on) {
    fxOn = on; fx.style.display = on ? "block" : "none";
    cancelAnimationFrame(fxRaf);
    if (on) {
      fxResize();
      rain = Array.from({ length: Math.ceil(fx.width / 16) }, () => ({ y: -Math.random() * fx.height, speed: 1.2 + Math.random() * 2.6, len: 8 + Math.floor(Math.random() * 14), glyphs: Array.from({ length: 24 }, () => RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)]) }));
      parts = Array.from({ length: 55 }, () => ({ x: Math.random() * fx.width, y: Math.random() * fx.height, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 0.8 + Math.random() * 1.8, a: 0.12 + Math.random() * 0.3 }));
      fxLoop();
    }
  }
  window.addEventListener("resize", () => { if (fxOn) fxResize(); });
  document.addEventListener("visibilitychange", () => { if (fxOn) { cancelAnimationFrame(fxRaf); if (!document.hidden) fxLoop(); } });

  // ---------- Options ----------
  function applyHideOffline(on) { document.body.classList.toggle("hide-offline", on); }
  function applyStreamerMode(on) {
    streamerMode = on;
    document.body.classList.toggle("streamer-mode", on);
    if (typeof loadHomeMe === "function") loadHomeMe();
    if (!$("profile-panel").classList.contains("hidden")) fillProfilePanel();
  }
  $("opt-animated-bg").addEventListener("change", (e) => { save({ animatedBg: e.target.checked }); syncFx(); });
  $("opt-hide-offline").addEventListener("change", (e) => { save({ hideOffline: e.target.checked }); applyHideOffline(e.target.checked); });
  $("opt-streamer-mode").addEventListener("change", (e) => { save({ streamerMode: e.target.checked }); applyStreamerMode(e.target.checked); });

  // ---------- Codes secrets / Konami ----------
  async function sha256(t) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const SECRET_HASHES = {
    "0b1f9e283a118939988d52447fe3bab4bc62ed8fd7acd62fe5796f9e5b376135": "gold",
    "7fa062c60ccc0f469427e8eecc53250bb252fbf0800503124136fb13f646745c": "gold",
    "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918": "matrix"
  };
  function unlockTheme(name) {
    const list = new Set(S.unlockedThemes || []); const fresh = !list.has(name); list.add(name);
    save({ unlockedThemes: [...list] }); refreshThemeChips(); applyTheme(name, true);
    return fresh;
  }
  async function trySecret() {
    const input = $("secret-code"), msg = $("secret-code-msg");
    const code = input.value.trim().toLowerCase(); input.value = "";
    if (!code) return;
    try {
      const h = await sha256(code);
      if (SECRET_HASHES[h]) { const fresh = unlockTheme(SECRET_HASHES[h]); { const lb = THEME_LABELS[SECRET_HASHES[h]] || "secret"; msg.textContent = fresh ? `✨ Thème ${lb} débloqué et appliqué !` : `Thème ${lb} déjà débloqué (réappliqué).`; } }
      else msg.textContent = "Ce code ne donne rien… pour l'instant.";
    } catch (e) { msg.textContent = "Code impossible à vérifier."; }
  }
  $("secret-code-btn").addEventListener("click", trySecret);
  $("secret-code").addEventListener("keydown", (e) => { if (e.key === "Enter") trySecret(); });
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let kpos = 0;
  document.addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = k === KONAMI[kpos] ? kpos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) { kpos = 0; if (unlockTheme("gold") && typeof showInfo === "function") showInfo("Code Konami !", "<p>✨ Tu as débloqué le thème <b>Or</b>. Retrouve-le dans les options, section Ambiance.</p>"); }
  });

  // ---------- Hors ligne ----------
  function setOnline(on) { $("offline-banner").classList.toggle("hidden", on !== false); }
  api.isOnline().then(setOnline).catch(() => {});
  api.onNetworkStatus((on) => { const was = !$("offline-banner").classList.contains("hidden"); setOnline(on); if (on && was) { streamersFetchedAt = 0; if (typeof loadStreamers === "function") loadStreamers(); } });

  // ---------- Reprendre où tu en étais ----------
  const _selectServer = selectServer, _goToView = goToView;
  let restoring = false;
  selectServer = function (id) { _selectServer(id); if (!restoring) save({ lastServer: id, lastView: null }); };
  goToView = function (name) { _goToView(name); if (!restoring && currentServerId !== "hub" && name !== "admin") save({ lastView: name }); onViewShown(name); };
  window.restoreLast = async function () {
    await ready;
    restoring = true;
    try {
      const id = S.lastServer;
      if (id && id !== "hub" && getServer(id)) {
        selectServer(id);
        const tab = (getServer(id).tabs || []).find((t) => t.view === S.lastView);
        if (tab) goToView(tab.view);
      } else selectServer("hub");
    } finally { restoring = false; }
  };

  function onViewShown(name) {
    if (name === "home") loadAnomiaStats();
    if (name === "admin") { startHealthLoop(); } else stopHealthLoop();
  }

  // ---------- Anomia en chiffres ----------
  async function loadAnomiaStats() {
    let r; try { r = await api.getAnomiaStats(); } catch (e) { r = null; }
    const box = $("anomia-stats");
    if (!r || !r.ok || !r.stats) { box.classList.add("hidden"); return; }
    const s = r.stats;
    $("as-hours").textContent = s.totalHours != null ? Number(s.totalHours).toLocaleString("fr-FR") : "—";
    $("as-players").textContent = s.players != null ? Number(s.players).toLocaleString("fr-FR") : "—";
    $("as-record").textContent = s.recordPlayers != null ? String(s.recordPlayers) : "—";
    $("as-record-label").textContent = s.recordDate ? `RECORD · ${esc(s.recordDate)}` : "RECORD DE CONNECTÉS";
    $("as-note").textContent = "Chiffres cumulés depuis l'ouverture du serveur.";
    box.classList.remove("hidden");
  }

  // ---------- Dernier VOD ----------
  let vodUrl = null;
  async function updateVod() {
    const card = $("vod-card"); if (!card) return;
    const s = featuredNow, isMe = s && (s.channel || "").toLowerCase() === myChannelKey();
    if (!s || s.live || !isMe) { card.classList.add("hidden"); return; }
    let r; try { r = await api.getLastVideo(); } catch (e) { r = null; }
    if (!r || !r.ok) { card.classList.add("hidden"); return; }
    const v = r.video; vodUrl = v.url;
    const th = $("vod-thumb");
    if (typeof v.thumbnailUrl === "string" && /^https:\/\//.test(v.thumbnailUrl)) th.style.backgroundImage = `url("${v.thumbnailUrl.replace(/"/g, "%22")}")`;
    const d = v.createdAt ? new Date(v.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "";
    $("vod-meta").textContent = [d, v.duration, v.title].filter(Boolean).join(" · ");
    card.classList.remove("hidden");
  }
  $("vod-card").addEventListener("click", () => { if (vodUrl) api.openExternal(vodUrl); });
  $("vod-card").addEventListener("keydown", (e) => { if (e.key === "Enter" && vodUrl) api.openExternal(vodUrl); });
  const _renderFeatured = renderFeatured;
  renderFeatured = function () { _renderFeatured(); updateVod(); };

  // ---------- Santé du serveur (admin) ----------
  let healthTimer = null;
  const fmtUp = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d} j ${h} h` : `${h} h ${String(m).padStart(2, "0")}`; };
  async function loadHealth() {
    if (!isAdminUnlocked) return;
    const msg = $("health-msg"), grid = $("health-grid");
    let r; try { r = await api.getServerHealth(); } catch (e) { r = { ok: false, error: "Erreur." }; }
    if (!r.ok) { msg.textContent = r.error || "Indisponible."; msg.classList.remove("hidden"); grid.classList.add("hidden"); $("health-stops").innerHTML = ""; return; }
    const h = r.health;
    msg.classList.add("hidden"); grid.classList.remove("hidden");
    const cls = (v, a, b) => (v < a ? "ping-good" : v < b ? "ping-mid" : "ping-bad");
    const miss = h.resourcesTotal - h.resourcesStarted;
    grid.innerHTML = [
      ["En ligne depuis", fmtUp(h.uptimeSeconds || 0), ""],
      ["Joueurs", `${h.players}/${h.maxClients || "?"}`, ""],
      ["Ping moyen", `${h.avgPing} ms`, cls(h.avgPing, 80, 150)],
      ["Ping max", `${h.maxPing} ms`, cls(h.maxPing, 120, 250)],
      ["Ressources", `${h.resourcesStarted}/${h.resourcesTotal}`, miss > 0 ? "ping-mid" : "ping-good"]
    ].map(([l, v, c]) => `<div class="health-item"><span>${l}</span><b class="${c}">${esc(v)}</b></div>`).join("");
    const stops = h.recentStops || [];
    $("health-stops").innerHTML = stops.length
      ? `<div class="health-stops"><b>Ressources arrêtées récemment</b>${stops.map((s) => `<span>${esc(s.name)} · il y a ${fmtDur(s.secondsAgo * 1000)}</span>`).join("")}</div>`
      : `<p class="health-ok">✓ Aucune ressource arrêtée depuis le démarrage.</p>`;
  }
  function startHealthLoop() { stopHealthLoop(); if (!isAdminUnlocked) return; loadHealth(); healthTimer = setInterval(loadHealth, 15000); }
  function stopHealthLoop() { if (healthTimer) { clearInterval(healthTimer); healthTimer = null; } }
  $("health-refresh").addEventListener("click", loadHealth);

  // ---------- Profil : jeu en cours + titres ----------
  async function updateGameLine() {
    const el = $("pp-game"); if (!el) return;
    let g; try { g = await api.getGameState(); } catch (e) { g = null; }
    if (g && g.running && g.since) { el.textContent = `🎮 En jeu sur ${g.game || "Anomia"} depuis ${fmtDur(Date.now() - g.since)}`; el.classList.remove("hidden"); }
    else el.classList.add("hidden");
  }
  setInterval(() => { if (!$("profile-panel").classList.contains("hidden")) updateGameLine(); }, 30000);

  function populateTitleSelect() {
    const sel = $("pp-title-select"); if (!sel) return;
    sel.innerHTML = `<option value="">Automatique (le plus prestigieux)</option>`;
    const r = ppResult; if (!r) return;
    (r.list || []).filter((d) => r.achievements && r.achievements[d.key]).forEach((d) => {
      const o = document.createElement("option"); o.value = d.key; o.textContent = d.label; sel.appendChild(o);
    });
    sel.value = (r.achievements && r.achievements[chosenTitleKey]) ? chosenTitleKey : "";
  }
  $("pp-title-select").addEventListener("change", (e) => {
    chosenTitleKey = e.target.value; save({ chosenTitle: chosenTitleKey });
    refreshAchievementTitle();
  });
  const _fillProfilePanel = fillProfilePanel;
  fillProfilePanel = async function () { await _fillProfilePanel(); populateTitleSelect(); updateGameLine(); };

  // ---------- Bloc-notes ----------
  let notes = [], curNote = null, noteTimer = null;
  const TAGS = { general: "Général", anomia: "Anomia", kannibaventure: "KannibAventure" };
  function renderNotesList() {
    const q = ($("notes-search").value || "").trim().toLowerCase();
    const list = $("notes-list"); list.innerHTML = "";
    const shown = notes.filter((n) => !q || (n.title + " " + n.body).toLowerCase().includes(q)).sort((a, b) => b.updatedAt - a.updatedAt);
    shown.forEach((n) => {
      const el = document.createElement("button");
      el.className = "note-item" + (curNote && curNote.id === n.id ? " active" : "");
      el.innerHTML = `<b>${esc(n.title || "Sans titre")}</b><small class="tag-${n.tag}">${TAGS[n.tag] || "Général"}</small>`;
      el.addEventListener("click", () => openNote(n.id));
      list.appendChild(el);
    });
    $("notes-empty").classList.toggle("hidden", notes.length > 0);
    $("notes-editor").classList.toggle("hidden", !curNote);
  }
  function openNote(id) { curNote = notes.find((n) => n.id === id) || null; if (curNote) { $("notes-title").value = curNote.title; $("notes-tag").value = curNote.tag; $("notes-body").value = curNote.body; $("notes-saved").textContent = ""; } renderNotesList(); }
  function flushNotes() { clearTimeout(noteTimer); noteTimer = null; return api.setNotes(notes).then((r) => { $("notes-saved").textContent = r && r.ok ? "Enregistré ✓" : "Enregistrement impossible"; }).catch(() => {}); }
  function touchNote() {
    if (!curNote) return;
    curNote.title = $("notes-title").value; curNote.tag = $("notes-tag").value; curNote.body = $("notes-body").value; curNote.updatedAt = Date.now();
    $("notes-saved").textContent = "…";
    clearTimeout(noteTimer); noteTimer = setTimeout(() => { flushNotes(); renderNotesList(); }, 600);
  }
  ["notes-title", "notes-body"].forEach((id) => $(id).addEventListener("input", touchNote));
  $("notes-tag").addEventListener("change", touchNote);
  $("notes-search").addEventListener("input", renderNotesList);
  $("notes-new").addEventListener("click", () => {
    const n = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: "", tag: "general", body: "", updatedAt: Date.now() };
    notes.unshift(n); curNote = n; openNote(n.id); flushNotes(); $("notes-title").focus();
  });
  $("notes-delete").addEventListener("click", async () => {
    if (!curNote) return;
    const ok = typeof showConfirm === "function" ? await showConfirm("Supprimer la note", "Cette note sera supprimée définitivement.") : true;
    if (!ok) return;
    notes = notes.filter((n) => n.id !== curNote.id); curNote = null; flushNotes(); renderNotesList();
  });
  $("btn-notes").addEventListener("click", async () => {
    try { notes = await api.getNotes(); } catch (e) { notes = []; }
    curNote = null; renderNotesList(); $("notes-overlay").classList.remove("hidden");
    if (notes.length) openNote(notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
  });
  $("notes-close").addEventListener("click", async () => { if (noteTimer) await flushNotes(); $("notes-overlay").classList.add("hidden"); });

  // ---------- Quoi de neuf ----------
  async function openWhatsNew() {
    let log; try { log = await api.getChangelog(); } catch (e) { log = []; }
    const box = $("whatsnew-list"); box.innerHTML = "";
    (Array.isArray(log) ? log : []).forEach((v, i) => {
      const el = document.createElement("div");
      el.className = "wn-version" + (v.version === appVersion ? " current" : "");
      el.innerHTML = `<div class="wn-head"><b>v${esc(v.version)}</b>${v.version === appVersion ? '<em>version installée</em>' : ""}<span>${esc(v.date || "")}</span></div>${v.title ? `<div class="wn-title">${esc(v.title)}</div>` : ""}<ul>${(v.items || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
      box.appendChild(el);
    });
    if (!box.children.length) box.innerHTML = `<p style="color:var(--text-dim);">Aucune note de version disponible.</p>`;
    $("whatsnew-overlay").classList.remove("hidden");
    $("whatsnew-dot").classList.add("hidden");
    save({ lastSeenVersion: appVersion });
  }
  $("btn-whatsnew").addEventListener("click", openWhatsNew);
  $("whatsnew-close").addEventListener("click", () => $("whatsnew-overlay").classList.add("hidden"));

  // ---------- Versions précédentes ----------
  $("settings-versions").addEventListener("click", async () => {
    $("settings-overlay").classList.add("hidden");
    $("versions-overlay").classList.remove("hidden");
    const box = $("versions-list"); box.textContent = "Chargement…";
    let r; try { r = await api.listReleases(); } catch (e) { r = null; }
    if (!r || !r.ok) { box.textContent = (r && r.error) || "Impossible de récupérer la liste."; return; }
    box.innerHTML = "";
    r.releases.forEach((rel) => {
      const row = document.createElement("div"); row.className = "version-row";
      const isCur = rel.tag.replace(/^v/, "") === r.current;
      row.innerHTML = `<span><b>${esc(rel.tag)}</b> <small>${esc(rel.date)}${isCur ? " · installée" : ""}</small></span>`;
      const btn = document.createElement("button"); btn.className = "btn-copy"; btn.textContent = isCur ? "Actuelle" : "Télécharger"; btn.disabled = isCur;
      btn.addEventListener("click", () => api.openExternal(rel.installer || rel.page));
      row.appendChild(btn); box.appendChild(row);
    });
    if (!r.releases.length) box.textContent = "Aucune version publiée trouvée.";
  });
  $("versions-close").addEventListener("click", () => $("versions-overlay").classList.add("hidden"));

  // ---------- Fermeture des overlays avec Échap ----------
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["versions-overlay", "whatsnew-overlay"].forEach((id) => $(id).classList.add("hidden"));
  });

  // ---------- Démarrage ----------
  (async function init() {
    await ready;
    try { appVersion = await api.getAppVersion(); } catch (e) { appVersion = ""; }
    chosenTitleKey = S.chosenTitle || "";
    const theme = THEMES[S.theme] ? S.theme : (S.theme === "custom" ? "custom" : "default");
    if (theme === "custom") { document.documentElement.setAttribute("data-theme", "custom"); } else applyTheme(theme, false);
    refreshThemeChips();
    $("opt-animated-bg").checked = Boolean(S.animatedBg); syncFx();
    $("opt-hide-offline").checked = Boolean(S.hideOffline); applyHideOffline(Boolean(S.hideOffline));
    $("opt-streamer-mode").checked = Boolean(S.streamerMode); streamerMode = Boolean(S.streamerMode);
    document.body.classList.toggle("streamer-mode", streamerMode);
    // Quoi de neuf : pastille tant que la version n'a pas été vue, ouverture automatique après une mise à jour
    if (appVersion && S.lastSeenVersion !== appVersion) {
      $("whatsnew-dot").classList.remove("hidden");
      if (S.onboardingSeen) setTimeout(() => { if (S.lastSeenVersion !== appVersion) openWhatsNew(); }, 2500);
    }
  })();
})();
