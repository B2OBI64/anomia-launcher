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
  window.getLauncherSettings = () => S;
  const ready = api.getSettings().then((s) => { S = s || {}; }).catch(() => {});
  function save(patch) { Object.assign(S, patch); try { api.setSettings(patch); } catch (e) { /* ignore */ } }
  const esc = (t) => (typeof escapeHtml === "function" ? escapeHtml(String(t == null ? "" : t)) : String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const fmtDur = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };

  // ---------- Thèmes ----------
  const THEMES = { default: "#8b5cf6", neon: "#22d3ee", minecraft: "#5cb85c", retro: "#f59e0b", gold: "#facc15", matrix: "#00ff41", b2logo: "#a78bfa", anomia: "#2dd4bf", cubic: "#f97316", noel: "#ef4444", subman: "#a855f7" };
  const THEME_LABELS = { gold: "Or", matrix: "Matrix", anomia: "Anomia", cubic: "Cubique", noel: "Noël", subman: "Subman" };
  function applyTheme(name, persist) {
    if (!THEMES[name] || (name === "subman" && !S.isSub && !allThemes())) name = "default";
    document.documentElement.setAttribute("data-theme", name);
    applyAccentColor(THEMES[name]);
    const cp = $("color-picker"), hx = $("color-picker-hex");
    if (cp) cp.value = THEMES[name];
    if (hx) hx.textContent = THEMES[name].toUpperCase();
    document.querySelectorAll(".theme-chip").forEach((c) => c.classList.toggle("active", c.dataset.theme === name));
    syncFx();
    if (persist) { save({ theme: name, accentColor: THEMES[name] }); }
  }
  // Les admins ont tous les thèmes débloqués automatiquement (état mémorisé pour le prochain démarrage)
  const allThemes = () => Boolean(S.themesAll);
  window.addEventListener("admin-themes", (e) => {
    const v = Boolean(e.detail);
    if (v === allThemes()) return;
    S.themesAll = v; save({ themesAll: v }); refreshThemeChips();
    if (!v) { const cur = document.documentElement.getAttribute("data-theme"); if (cur === "subman" && !S.isSub) applyTheme("default", true); }
  });
  function refreshThemeChips() {
    const lr = $("theme-chips") && $("theme-chips").querySelector('[data-theme="subman"]');
    if (lr) lr.classList.toggle("hidden", !(S.isSub || allThemes()));
    ["gold", "matrix", "anomia", "cubic", "noel"].forEach((t) => {
      const chip = $("theme-chips") && $("theme-chips").querySelector(`[data-theme="${t}"]`);
      if (chip) chip.classList.toggle("hidden", !(allThemes() || (S.unlockedThemes || []).includes(t)));
    });
  }
  document.querySelectorAll(".theme-chip").forEach((c) => c.addEventListener("click", () => { applyTheme(c.dataset.theme, true); if (window.launcherAch) window.launcherAch.unlock("themeSwitch"); }));
  // un accent choisi à la main sort du thème (les couleurs restent libres)
  document.querySelectorAll(".accent-swatch").forEach((b) => b.addEventListener("click", () => { document.documentElement.setAttribute("data-theme", "custom"); document.querySelectorAll(".theme-chip").forEach((c) => c.classList.remove("active")); save({ theme: "custom" }); }));

  // ---------- Fond animé ----------
  const fx = $("fx-bg");
  let fxOn = false, fxRaf = 0, parts = [];
  function fxResize() { fx.width = window.innerWidth; fx.height = window.innerHeight; }
  const RAIN_CHARS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789<>{}[]/=+*;:".split("");
  let rain = [], snow = [];
  const pong = { balls: [], l: 0, r: 0 };
  const LOGO_SRC = ["../assets/kannibaventure.png", "../assets/anomia-logo.png", "../assets/logo.png"] // 0 = KannibAventure, 1 = Anomia, 2 = Kannibal Team;
  const LOGO_IMGS = LOGO_SRC.map((src) => { const i = new Image(); i.src = src; return i; });
  function fxLoop() {
    if (!fxOn) return;
    const ctx = fx.getContext("2d");
    ctx.clearRect(0, 0, fx.width, fx.height);
    if (document.documentElement.getAttribute("data-theme") === "noel") {
      // Neige douce
      ctx.fillStyle = document.documentElement.getAttribute("data-mode") === "light" ? "#8aa4bd" : "#ffffff";
      snow.forEach((f) => {
        f.y += f.vy; f.x += Math.sin((f.y + f.ph) / 40) * 0.4;
        if (f.y > fx.height + 6) { f.y = -6; f.x = Math.random() * fx.width; }
        ctx.globalAlpha = f.a; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
      });
      ctx.globalAlpha = 1;
      fxRaf = requestAnimationFrame(fxLoop);
      return;
    }
    if (document.documentElement.getAttribute("data-theme") === "subman") {
      // Subman : pong ! Les logos Anomia (gauche) et KannibAventure (droite) sont les raquettes, les logos Kannibal Team sont les balles
      const PS = 74, BS = 34, W = fx.width, H = fx.height;
      const clampY = (y, s) => Math.max(s / 2, Math.min(H - s / 2, y));
      const respawn = (b) => { b.x = W / 2; b.y = H * (0.2 + Math.random() * 0.6); const sp = 3 + Math.random() * 1.5; b.vx = (Math.random() < 0.5 ? -1 : 1) * sp; b.vy = (Math.random() - 0.5) * 4; };
      if (!pong.balls.length) { pong.balls = [0, 1, 2].map(() => { const b = {}; respawn(b); b.x = W * (0.3 + Math.random() * 0.4); return b; }); pong.l = H / 2; pong.r = H / 2; }
      pong.balls.forEach((b) => {
        b.x += b.vx; b.y += b.vy;
        if (b.y < BS / 2) { b.y = BS / 2; b.vy = Math.abs(b.vy); } else if (b.y > H - BS / 2) { b.y = H - BS / 2; b.vy = -Math.abs(b.vy); }
        const lx = 60, rx = W - 60;
        if (b.vx < 0 && b.x < lx + PS / 2) { if (Math.abs(b.y - pong.l) < PS / 2 + 6) { b.vx = Math.abs(b.vx); b.vy += (b.y - pong.l) * 0.06; } else if (b.x < -BS) respawn(b); }
        if (b.vx > 0 && b.x > rx - PS / 2) { if (Math.abs(b.y - pong.r) < PS / 2 + 6) { b.vx = -Math.abs(b.vx); b.vy += (b.y - pong.r) * 0.06; } else if (b.x > W + BS) respawn(b); }
        b.vy = Math.max(-6, Math.min(6, b.vy));
      });
      // Les raquettes suivent la balle la plus proche qui vient vers elles (vitesse limitée : elles ratent parfois)
      const follow = (cur, side) => {
        const cand = pong.balls.filter((b) => (side === "l" ? b.vx < 0 : b.vx > 0)).sort((a, c) => (side === "l" ? a.x - c.x : c.x - a.x))[0];
        const ty = cand ? cand.y : H / 2;
        return clampY(cur + Math.max(-4.2, Math.min(4.2, ty - cur)), PS);
      };
      pong.l = follow(pong.l, "l"); pong.r = follow(pong.r, "r");
      const draw = (img, x, y, s, a) => { if (!img.complete || !img.naturalWidth) return; ctx.globalAlpha = a; ctx.drawImage(img, x - s / 2, y - s / 2, s, s); };
      draw(LOGO_IMGS[1], 60, pong.l, PS, 0.8); draw(LOGO_IMGS[0], W - 60, pong.r, PS, 0.8);
      pong.balls.forEach((b) => draw(LOGO_IMGS[2], b.x, b.y, BS, 0.7));
      ctx.globalAlpha = 1;
      fxRaf = requestAnimationFrame(fxLoop);
      return;
    }
    if (document.documentElement.getAttribute("data-theme") === "matrix") {
      // Pluie de code façon Matrix : discrète pour ne pas gêner la lecture
      const light = document.documentElement.getAttribute("data-mode") === "light";
      ctx.font = "14px 'Mono', monospace";
      rain.forEach((c, i) => {
        c.y += c.speed;
        if (c.y - c.len * 16 > fx.height) { c.y = -Math.random() * 300; c.speed = 1.2 + Math.random() * 2.6; c.len = 8 + Math.floor(Math.random() * 14); }
        if (Math.random() < 0.08) c.glyphs[Math.floor(Math.random() * c.glyphs.length)] = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
        for (let k = 0; k < c.len; k++) {
          const y = c.y - k * 16;
          if (y < -16 || y > fx.height + 16) continue;
          ctx.globalAlpha = k === 0 ? 0.55 : Math.max(0.03, 0.3 * (1 - k / c.len));
          ctx.fillStyle = light ? (k === 0 ? "#0b5d1f" : "#0a8a2c") : (k === 0 ? "#d6ffe0" : "#00ff41");
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
  window.addEventListener("zen", (e) => { if (e.detail) setAnimatedBg(true); else syncFx(); });
  function syncFx() { setAnimatedBg(Boolean(S.animatedBg) || ["matrix", "noel", "subman"].includes(document.documentElement.getAttribute("data-theme"))); }
  function setAnimatedBg(on) {
    fxOn = on; fx.style.display = on ? "block" : "none";
    cancelAnimationFrame(fxRaf);
    if (on) {
      fxResize();
      snow = Array.from({ length: 90 }, () => ({ x: Math.random() * fx.width, y: Math.random() * fx.height, vy: 0.5 + Math.random() * 1.2, r: 1 + Math.random() * 2.2, a: 0.25 + Math.random() * 0.5, ph: Math.random() * 100 }));
      pong.balls = [];
      rain = Array.from({ length: Math.ceil(fx.width / 16) }, () => ({ y: -Math.random() * fx.height, speed: 1.2 + Math.random() * 2.6, len: 8 + Math.floor(Math.random() * 14), glyphs: Array.from({ length: 24 }, () => RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)]) }));
      parts = Array.from({ length: 55 }, () => ({ x: Math.random() * fx.width, y: Math.random() * fx.height, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 0.8 + Math.random() * 1.8, a: 0.12 + Math.random() * 0.3 }));
      fxLoop();
    }
  }
  window.addEventListener("resize", () => { if (fxOn) fxResize(); });
  document.addEventListener("visibilitychange", () => { if (fxOn) { cancelAnimationFrame(fxRaf); if (!document.hidden) fxLoop(); } });

  // ---------- Rôle abonné (thème « Pluie de logos ») ----------
  async function checkSubRole() {
    let r; try { r = await api.checkSub(); } catch (e) { r = null; }
    if (!r || !r.ok) return; // hors ligne / pas connecté : on garde le dernier état connu
    if (Boolean(S.isSub) !== r.sub) { save({ isSub: r.sub }); }
    S.isSub = r.sub; refreshThemeChips();
    if (!r.sub && !allThemes() && document.documentElement.getAttribute("data-theme") === "subman") applyTheme("default", true);
  }
  window.checkSubRole = checkSubRole;
  setTimeout(checkSubRole, 3000); setTimeout(checkSubRole, 12000); setInterval(checkSubRole, 180000);
  document.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest("#btn-settings")) checkSubRole(); });

  // ---------- Options ----------
  function applyHideOffline(on) { document.body.classList.toggle("hide-offline", on); }
  function applyStreamerMode(on) {
    streamerMode = on;
    document.body.classList.toggle("streamer-mode", on);
    if (typeof loadHomeMe === "function") loadHomeMe();
    if (!$("profile-panel").classList.contains("hidden")) fillProfilePanel();
  }
  $("opt-auto-pause").addEventListener("change", (e) => { save({ autoPause: e.target.checked }); $("opt-auto-pause-min").disabled = !e.target.checked; window.dispatchEvent(new Event("autopause-changed")); });
  $("opt-auto-pause-min").addEventListener("change", (e) => { save({ autoPauseMin: Number(e.target.value) }); window.dispatchEvent(new Event("autopause-changed")); });
  $("opt-animated-bg").addEventListener("change", (e) => { save({ animatedBg: e.target.checked }); syncFx(); });
  $("opt-session-summary").addEventListener("change", (e) => save({ sessionSummary: e.target.checked }));
  api.onSessionEnded((d) => {
    if (!d || S.sessionSummary === false) return;
    const h = Math.floor(d.seconds / 3600), mn = Math.floor((d.seconds % 3600) / 60);
    const tod = d.todaySeconds || 0, th = Math.floor(tod / 3600), tm = Math.floor((tod % 3600) / 60);
    showInfo(`Session ${esc(d.label)} terminée`, `<div style="text-align:center;"><div style="font-size:34px;font-weight:700;color:var(--teal);">${h ? h + " h " : ""}${String(mn).padStart(h ? 2 : 1, "0")}${h ? "" : " min"}</div><p style="color:var(--text-dim);margin-top:6px;">de jeu sur ${esc(d.label)}</p>${tod > d.seconds + 60 ? `<p style="margin-top:10px;font-size:13px;">Aujourd'hui au total : <b>${th ? th + " h " : ""}${tm} min</b></p>` : ""}</div>`);
  });
  $("opt-hide-offline").addEventListener("change", (e) => { save({ hideOffline: e.target.checked }); applyHideOffline(e.target.checked); });
  $("opt-streamer-mode").addEventListener("change", (e) => { save({ streamerMode: e.target.checked }); applyStreamerMode(e.target.checked); });

  // KannibAventure : mémoire, dossier, journal, réparation
  $("opt-kb-mem").addEventListener("change", (e) => save({ kbMemoryGb: Number(e.target.value) }));
  $("kb-open-folder").addEventListener("click", () => api.openKbFolder());
  $("kb-open-log").addEventListener("click", async () => { const r = await api.openKbLog(); if (r && !r.ok) { $("kb-opt-msg").textContent = r.reason; } });
  $("kb-repair").addEventListener("click", async () => {
    const msg = $("kb-opt-msg"), btn = $("kb-repair");
    btn.disabled = true; msg.textContent = "Réparation…";
    api.onKbLaunchProgress((p) => { if (p && p.label) msg.textContent = p.label + (p.percent != null ? ` · ${p.percent}%` : ""); });
    let r; try { r = await api.repairKannibAventure(); } catch (e) { r = { ok: false, reason: e.message }; }
    btn.disabled = false;
    msg.textContent = r && r.ok ? "Tout est en ordre ✓ (mods et fichiers du jeu vérifiés)." : "Échec : " + ((r && r.reason) || "erreur inconnue");
  });


  // ---------- Ordre des serveurs : maintiens le clic sur un logo et déplace-le (comme sur Discord) ----------
  function applyServerOrder() {
    const bar = $("server-bar"); if (!bar) return;
    const order = Array.isArray(S.serverOrder) ? S.serverOrder : [];
    const logos = [...bar.querySelectorAll(".server-logo")];
    const rank = (b) => { const i = order.indexOf(b.dataset.server); return i < 0 ? 999 + logos.indexOf(b) : i; };
    logos.sort((a, b) => rank(a) - rank(b)).forEach((b) => bar.appendChild(b));
  }
  let suppressClick = false;
  function enableServerDrag() {
    const bar = $("server-bar"); if (!bar || bar.dataset.dragReady) return;
    bar.dataset.dragReady = "1";
    bar.addEventListener("dragstart", (e) => e.preventDefault()); // empêche le glisser natif de l'image (qui annule nos événements)
    bar.addEventListener("click", (e) => { if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); suppressClick = false; } }, true);
    bar.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest(".server-logo");
      if (!btn || e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY;
      let dragging = false;
      const timer = setTimeout(() => {
        dragging = true; btn.classList.add("dragging");
      }, 250);
      const cleanup = () => { clearTimeout(timer); document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); };
      const move = (ev) => {
        if (!dragging) { if (Math.abs(ev.clientX - sx) > 6 || Math.abs(ev.clientY - sy) > 6) cleanup(); return; }
        const others = [...bar.querySelectorAll(".server-logo")].filter((b) => b !== btn);
        let before = null;
        for (const o of others) { const r = o.getBoundingClientRect(); if (ev.clientX < r.left + r.width / 2) { before = o; break; } }
        if (before) bar.insertBefore(btn, before); else bar.appendChild(btn);
        btn.style.transform = "";
        const r = btn.getBoundingClientRect();
        btn.style.transform = `translateX(${ev.clientX - (r.left + r.width / 2)}px) scale(1.08)`;
      };
      const up = () => {
        const was = dragging; cleanup();
        if (!was) return;
        btn.classList.remove("dragging"); btn.style.transform = "";
        suppressClick = true; setTimeout(() => { suppressClick = false; }, 300);
        save({ serverOrder: [...bar.querySelectorAll(".server-logo")].map((b) => b.dataset.server) });
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    });
  }
  if (typeof renderServerBar === "function") {
    const _renderServerBar = renderServerBar;
    renderServerBar = function () { _renderServerBar(); ready.then(() => { applyServerOrder(); enableServerDrag(); }); };
  }
  ready.then(() => { applyServerOrder(); enableServerDrag(); }); // si la barre a déjà été dessinée avant le chargement de ce fichier


  // ---------- Temps de jeu KannibAventure ----------
  const fmtSec = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : s >= 60 ? `${Math.floor(s / 60)} min` : s > 0 ? "< 1 min" : "0");
  let kbPlay = null;
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest || !e.target.closest("#kbs-time-item")) return;
    const r = kbPlay || {};
    const rows = [["Aujourd'hui", r.day], ["Cette semaine (7 jours)", r.week], ["Ce mois-ci (30 jours)", r.month], ["Cette année (12 mois)", r.year], ["Total", r.total]]
      .map(([l, s]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:13px;"><span style="color:var(--text-dim);">${l}</span><span style="color:var(--teal);font-weight:700;">${fmtSec(s || 0)}</span></div>`).join("");
    showInfo("Temps de jeu · KannibAventure", `<div>${rows}</div>`);
  });
  async function loadKbPlaytime() {
    try {
      const r = await api.getKbPlaytime();
      if (!r || !r.ok) return;
      ["day", "week", "month", "year", "total"].forEach((k) => { const el = $("kbp-" + k); if (el) el.textContent = fmtSec(r[k] || 0); });
      const t = $("kbs-time"); if (t) t.textContent = fmtSec(r.total || 0);
      kbPlay = r;
    } catch (e) { /* ignore */ }
  }

  // ---------- État de KannibAventure (public) + maintenance propre à ce serveur ----------
  let kbMaintenance = false;
  async function loadKbState() {
    if (document.body.classList.contains("is-offline")) { const s0 = $("kbs-status"); if (s0) s0.textContent = "HORS LIGNE (TOI)"; return; }
    let r; try { r = await api.getKbStatus(); } catch (e) { r = null; }
    const st = $("kbs-status"); if (!st || !r || !r.ok) return;
    kbMaintenance = !!r.maintenance;
    const kb = typeof getServer === "function" ? getServer("kannibaventure") : null;
    $("kb-maintenance-banner").classList.toggle("hidden", !kbMaintenance);
    st.classList.remove("maintenance-active");
    if (kbMaintenance) { st.textContent = "MAINTENANCE"; st.classList.add("maintenance-active"); }
    else if (r.online) st.textContent = "EN LIGNE";
    else st.textContent = kb && kb.status !== "online" ? "BIENTÔT" : "HORS LIGNE";
    $("kbs-players").textContent = r.online ? `${r.players}/${r.maxPlayers}` : "—";
    $("kbs-ping").textContent = r.online && r.latencyMs != null ? `${r.latencyMs} ms` : "—";
    $("kbs-ping").closest(".telemetry-item").classList.toggle("hidden", r.latencyMs == null);
    $("kbs-version").textContent = (kb && kb.minecraftVersion) || (r.online && r.version) || "—";
    refreshKbConnect();
    updateKbMaintUi();
  }
  function updateKbMaintUi() {
    const s = $("kbadm-maint-status"), b = $("kbadm-maint-btn"); if (!s || !b) return;
    s.textContent = kbMaintenance ? "Maintenance : 🛠️ activée (les joueurs ne peuvent pas lancer le jeu)" : "Maintenance : ✓ désactivée";
    b.textContent = kbMaintenance ? "Désactiver la maintenance" : "Activer la maintenance";
  }
  document.addEventListener("click", async (e) => {
    if (!e.target || e.target.id !== "kbadm-maint-btn") return;
    const enabling = !kbMaintenance;
    const ok = await showConfirm(enabling ? "Activer la maintenance de KannibAventure" : "Désactiver la maintenance", enabling ? "<p>Les joueurs verront un bandeau de maintenance et ne pourront plus lancer le jeu depuis le launcher (le staff en service peut toujours). Continuer ?</p>" : "<p>KannibAventure redevient accessible à tous. Continuer ?</p>");
    if (!ok) return;
    const r = await api.toggleKbMaintenance(enabling);
    if (r && r.ok) { kbMaintenance = enabling; updateKbMaintUi(); $("kb-maintenance-banner").classList.toggle("hidden", !kbMaintenance); refreshKbConnect(); }
    else showInfo("Erreur", `<p>${esc((r && r.error) || "Erreur inconnue")}</p>`);
  });


  // ---------- Codes secrets / Konami ----------
  async function sha256(t) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const SECRET_HASHES = {
    "0b1f9e283a118939988d52447fe3bab4bc62ed8fd7acd62fe5796f9e5b376135": "gold",
    "7fa062c60ccc0f469427e8eecc53250bb252fbf0800503124136fb13f646745c": "gold",
    "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918": "matrix",
    "8f0b49be84aba883a225569f87359227261e79b4d76cff56888ca4ab9c7a15ee": "fx:creeper",
    "4f3c4172a4fe308cebc840da665171f534849b1fca101eaf635d68fb453393db": "cubic"
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
      if (SECRET_HASHES[h] === "fx:creeper") { msg.textContent = "Sssssss…"; creeperBoom(); }
      else if (SECRET_HASHES[h]) { if (SECRET_HASHES[h] === "matrix" && window.launcherAch) window.launcherAch.unlock("error404"); const fresh = unlockTheme(SECRET_HASHES[h]); { const lb = THEME_LABELS[SECRET_HASHES[h]] || "secret"; msg.textContent = fresh ? `✨ Thème ${lb} débloqué et appliqué !` : `Thème ${lb} déjà débloqué (réappliqué).`; } }
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

  // ---------- Easter eggs 1.7.4 ----------
  function creeperBoom() {
    const d = document.createElement("div"); d.className = "creeper-boom"; d.textContent = "💥";
    if (window.launcherAch) window.launcherAch.egg("creeper", "💥", "Sssssss… BOUM.");
    document.body.appendChild(d); document.body.classList.add("shake");
    setTimeout(() => { d.remove(); document.body.classList.remove("shake"); }, 1700);
  }
  // Séquence ↑ ↓ ← → ↑ ↓ ← → : thème Anomia
  const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  let apos = 0;
  document.addEventListener("keydown", (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || "")) return;
    apos = e.key === ARROWS[apos] ? apos + 1 : (e.key === ARROWS[0] ? 1 : 0);
    if (apos === ARROWS.length) { apos = 0; if (unlockTheme("anomia") && typeof showInfo === "function") showInfo("Combinaison secrète !", "<p>✦ Tu as débloqué le thème <b>Anomia</b>. Retrouve-le dans les options, section Ambiance.</p>"); }
  });
  // 10 clics sur le logo B2 : mode arc-en-ciel pendant 10 s
  let logoClicks = 0, logoTimer = null;
  const tl = document.querySelector(".titlebar-logo");
  if (tl) tl.addEventListener("click", () => {
    logoClicks++; clearTimeout(logoTimer); logoTimer = setTimeout(() => { logoClicks = 0; }, 2500);
    if (logoClicks >= 10) { logoClicks = 0; document.documentElement.classList.add("rainbow-mode"); setTimeout(() => document.documentElement.classList.remove("rainbow-mode"), 10000); }
  });
  function dateEasterEggs() {
    const now = new Date();
    if (now.getMonth() === 11 && now.getDate() === 24 && unlockTheme("noel") && typeof showInfo === "function")
      showInfo("Joyeux réveillon ! 🎄", "<p>Le thème <b>Noël</b> vient d'être débloqué (neige incluse). Retrouve-le dans les options, section Ambiance.</p>");
    const h = now.getHours(), key = now.toISOString().slice(0, 10);
    if (h >= 3 && h < 5 && S.nightSeen !== key) { save({ nightSeen: key }); if (typeof showInfo === "function") showInfo("Il est tard…", "<p>🌙 Il est entre 3 h et 5 h du matin. Même les Creepers dorment à cette heure. Va te reposer !</p>"); }
  }

  // ---------- Accueil Anomia ----------
  async function renderAnomiaHome() {
    try { const news = await api.getNews(); const el = $("ah-t-news"); if (el && Array.isArray(news) && news[0] && news[0].title) el.textContent = news[0].title; } catch (e) { /* ignore */ }
    const anomia = typeof getServer === "function" ? getServer("anomia") : null;
    const dBtn = $("ah-discord"), rBtn = $("ah-rules");
    if (anomia && anomia.discordInvite) dBtn.onclick = () => api.openExternal(anomia.discordInvite); else dBtn.classList.add("hidden");
    rBtn.onclick = () => goToView("rules");
    $("ah-me-open").onclick = () => { const p = $("profile-panel"); if (p.classList.contains("hidden")) toggleProfilePanel(); };
    // Dernière actu
    // Discord en ligne
    try {
      const comm = await api.getDiscordCommunities();
      const a = (comm || []).find((c) => /anomia/i.test(c.name || ""));
      const chip = $("ah-discord-chip");
      if (a && a.online != null) { chip.textContent = `● ${a.online} en ligne sur Discord`; chip.classList.remove("hidden"); } else chip.classList.add("hidden");
    } catch (e) { /* ignore */ }
    // Streamers en live
    const live = (typeof STREAMER_DATA !== "undefined" ? STREAMER_DATA : []).filter((s) => s.live);
    const bar = $("ah-livebar"), lchip = $("ah-live-chip");
    if (live.length) {
      const s = live[0];
      lchip.textContent = `● ${s.displayName || s.channel} en live`; lchip.classList.remove("hidden");
      $("ah-livebar-text").textContent = `● ${s.displayName || s.channel} est en live${s.game ? " sur " + s.game : ""} · ${Number(s.viewers) || 0} viewers`;
      $("ah-livebar-btn").onclick = () => { selectStreamer(s); selectServer("hub"); };
      bar.classList.remove("hidden");
    } else { bar.classList.add("hidden"); lchip.classList.add("hidden"); }
    // Carte "mon profil"
    const me = $("ah-me");
    if (typeof discordProfile !== "undefined" && discordProfile) {
      $("ah-me-avatar").src = discordProfile.avatar || "../assets/logo.png";
      $("ah-me-name").textContent = streamerMode ? "Joueur" : (discordProfile.username || "Joueur");
      me.classList.remove("hidden");
      let r; try { r = await getAchData(); } catch (e) { r = null; }
      if (r && r.ok && r.linked) {
        const list = r.list || [], un = list.filter((d) => r.achievements && r.achievements[d.key]).length, secs = r.playtimeSeconds || 0;
        $("ah-me-hours").textContent = secs >= 3600 ? `${Math.floor(secs / 3600)} h` : `${Math.floor(secs / 60)} min`;
        $("ah-me-ach").textContent = `${un}/${list.length}`;
        const ta = $("ah-t-ach"); if (ta) ta.textContent = `${un}/${list.length} débloqués`;
        $("ah-me-line").textContent = "Ton suivi Anomia";
      } else { $("ah-me-hours").textContent = "—"; $("ah-me-ach").textContent = "—"; $("ah-me-line").textContent = "Connecte-toi une fois en jeu pour activer ton suivi."; }
    } else me.classList.add("hidden");
  }

  // ---------- Admin KannibAventure ----------
  let kbTimer = null;
  async function loadKbAdmin() {
    const msg = $("kbadm-msg"), grid = $("kbadm-grid");
    let r; try { r = await api.getKbStatus(); } catch (e) { r = { ok: false, error: "Erreur." }; }
    if (!r.ok) { msg.textContent = r.error || "Indisponible."; msg.classList.remove("hidden"); grid.classList.add("hidden"); return; }
    kbMaintenance = !!r.maintenance; updateKbMaintUi();
    if (!r.online) {
      msg.textContent = `Serveur hors ligne ou injoignable (${r.error || "pas de réponse"}). Normal tant qu'il n'est pas ouvert.`;
      msg.classList.remove("hidden"); grid.classList.add("hidden"); $("kbadm-names").innerHTML = ""; return;
    }
    msg.classList.add("hidden"); grid.classList.remove("hidden");
    grid.innerHTML = [["Statut", "En ligne"], ["Joueurs", `${r.players}/${r.maxPlayers}`], ["Latence", `${r.latencyMs} ms`], ["Version", r.version || "?"]]
      .map(([l, v]) => `<div class="health-item"><span>${l}</span><b>${esc(v)}</b></div>`).join("");
    $("kbadm-names").innerHTML = r.names && r.names.length ? `<div class="health-stops"><b>Joueurs connectés</b><span>${r.names.map(esc).join(", ")}</span></div>` : "";
  }
  $("kbadm-refresh").addEventListener("click", loadKbAdmin);
  // Admin en service : peut "rejoindre" KannibAventure même avant l'ouverture (copie l'adresse du serveur)
  window.refreshKbConnect = () => refreshKbConnect();
  function refreshKbConnect() {
    const b = $("kb-connect"), kb = typeof getServer === "function" ? getServer("kannibaventure") : null;
    if (!b || !kb) return;
    if (document.body.classList.contains("is-offline")) { b.disabled = true; b.textContent = "Hors ligne"; b.onclick = null; return; }
    const kbAdm = window.isKbAdmin && window.isKbAdmin();
    const canPlay = (kbAdm || kb.status === "online") && kb.serverAddress;
    if (kbMaintenance && !kbAdm) { b.disabled = true; b.textContent = "Serveur en maintenance"; b.onclick = null; return; }
    if (!canPlay) { b.disabled = true; b.textContent = kb.connectLabel || "Bientôt"; b.onclick = null; return; }
    if (window.__citizen && window.__citizen.kannibaventure === false && !kbAdm) { b.disabled = true; b.textContent = "Rôles requis"; b.title = "Rejoins le Discord pour passer ta douane"; b.onclick = null; return; }
    b.title = "";
    b.disabled = false; b.textContent = kbAdm && kb.status !== "online" ? "Se connecter (admin)" : "Se connecter";
    b.onclick = async () => {
      if (typeof discordProfile !== "undefined" && !discordProfile && await api.isDiscordConfigured()) { showInfo("Connexion Discord requise", "<p>Lie ton compte Discord avant de rejoindre le serveur.</p>"); return; }
      b.disabled = true; b.textContent = "Lancement de Minecraft…";
      // Connexion directe : installe NeoForge + mods si besoin, puis lance Minecraft dans le serveur (repli : mode classique)
      let fallbackReason = null;
      api.onKbLaunchProgress((p) => {
        if (!p) return;
        b.classList.add("kb-loading"); b.style.setProperty("--kb-pct", (p.percent != null ? p.percent : 100) + "%");
        b.textContent = (p.label || "Préparation…") + (p.percent != null ? ` · ${p.percent}%` : "");
      });
      let d; try { d = await api.launchKannibAventureDirect(); } catch (e) { d = { ok: false, fallback: true, reason: e.message }; }
      if (d && d.ok) {
        b.disabled = false; b.classList.remove("kb-loading"); refreshKbConnect();
        showInfo("Minecraft démarre", `<p>Connexion directe au serveur en version <b>${esc(d.version)}</b>${d.player ? " avec le compte <b>" + esc(d.player) + "</b>" : ""}.</p>`);
        return;
      }
      if (d && d.fallback === false) { b.disabled = false; refreshKbConnect(); return; }
      fallbackReason = (d && d.reason) || "raison inconnue";
      b.classList.remove("kb-loading");
      let r; try { r = await api.launchKannibAventure(); } catch (e) { r = { ok: false, error: e.message }; }
      b.disabled = false; refreshKbConnect();
      if (!r || !r.ok) { showInfo("Impossible de lancer Minecraft", `<p>${esc((r && r.error) || "Erreur inconnue")}</p><p style="margin-top:8px;color:var(--text-dim);font-size:12px;">Installe le Minecraft Launcher officiel, puis relance KannibAventure depuis le launcher.</p>`); return; }
      showInfo("Minecraft se lance", `${fallbackReason ? '<p style="color:#fbbf24;font-size:12px;">Connexion directe impossible (' + esc(fallbackReason) + '). Mode classique :</p>' : ""}<p>Profil <b>KannibAventure</b> (version <b>${esc(r.version)}</b>) préparé${r.server === "ajoute" || r.server === "deja" ? ", serveur ajouté à ta liste Multijoueur" : ""}.</p><p style="margin-top:8px;">Dans le Minecraft Launcher : clique sur <b>Jouer</b>, puis Multijoueur → <b>KannibAventure</b>.</p>${r.profile ? "" : '<p style="margin-top:8px;color:var(--text-dim);font-size:12px;">Profil non créé automatiquement : lance Minecraft une première fois, puis recommence.</p>'}`);
    };
  }
  function refreshKbAdminTab() {
    refreshKbConnect();
    const tabs = $("tabbar-tabs");
    if (!tabs) return;
    const existing = tabs.querySelector('[data-view="kb-admin"]');
    if (currentServerId === "kannibaventure" && window.isKbAdmin && window.isKbAdmin()) {
      if (!existing) {
        const btn = document.createElement("button"); btn.className = "tab-item"; btn.dataset.view = "kb-admin"; btn.textContent = "Admin";
        btn.addEventListener("click", () => goToView("kb-admin")); tabs.appendChild(btn);
      }
    } else if (existing) existing.remove();
  }
  const _applyStaffRole = applyStaffRole, _clearStaffRole = clearStaffRole;
  applyStaffRole = function (r) { _applyStaffRole(r); refreshKbAdminTab(); };
  clearStaffRole = function () { _clearStaffRole(); refreshKbAdminTab(); };

  // ---------- Démarrage ----------
  function setOnline(on) {
    $("offline-banner").classList.toggle("hidden", on !== false);
    document.body.classList.toggle("is-offline", on === false);
    refreshKbConnect(); if (typeof updateConnectButtonState === "function") updateConnectButtonState();
    if (on === false) { const s = $("kbs-status"); if (s) { s.textContent = "HORS LIGNE (TOI)"; } }
    else if (currentServerId === "kannibaventure") loadKbState();
  }
  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("online", () => { setOnline(true); streamersFetchedAt = 0; if (typeof loadStreamers === "function") loadStreamers(); });
  api.isOnline().then(setOnline).catch(() => {});
  api.onNetworkStatus((on) => { const was = !$("offline-banner").classList.contains("hidden"); setOnline(on); if (on && was) { streamersFetchedAt = 0; if (typeof loadStreamers === "function") loadStreamers(); } });

  // ---------- Reprendre où tu en étais ----------
  const _selectServer = selectServer, _goToView = goToView;
  let restoring = false;
  selectServer = function (id) { _selectServer(id); document.body.dataset.server = id; if (id === "kannibaventure") loadKbState(); refreshKbAdminTab(); if (!restoring) save({ lastServer: id, lastView: null }); };
  goToView = function (name) { _goToView(name); if (!restoring && name !== "admin" && (currentServerId !== "hub" || name.startsWith("hub-"))) save({ lastView: name }); onViewShown(name); };
  window.restoreLast = async function () {
    await ready;
    restoring = true;
    try {
      const id = S.lastServer;
      if (id && id !== "hub" && getServer(id)) {
        selectServer(id);
        const tab = (getServer(id).tabs || []).find((t) => t.view === S.lastView);
        if (tab) goToView(tab.view);
      } else {
        selectServer("hub");
        if (S.lastView && S.lastView.startsWith("hub-") && HUB_TABS.some((t) => t.view === S.lastView)) goToView(S.lastView);
      }
    } finally { restoring = false; }
  };

  function onViewShown(name) {
    if (name === "home") { renderAnomiaHome(); }
    if (name === "kb-settings") { const m = $("opt-kb-mem"); if (m) m.value = String(S.kbMemoryGb || 4); }
    if (name === "kb-home") { loadKbPlaytime(); loadKbState(); }
    if (name === "kb-admin") { loadKbAdmin(); clearInterval(kbTimer); kbTimer = setInterval(() => { if (!$("view-kb-admin").classList.contains("hidden")) loadKbAdmin(); }, 15000); } else if (kbTimer) { clearInterval(kbTimer); kbTimer = null; }
    if (name === "admin") { startHealthLoop(); } else stopHealthLoop();
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
    if (!staffRole) return;
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
  function startHealthLoop() { stopHealthLoop(); if (!staffRole) return; loadHealth(); healthTimer = setInterval(loadHealth, 15000); }
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
    if (S.theme === "logorain") S.theme = "default";
    const theme = THEMES[S.theme] ? S.theme : (S.theme === "custom" ? "custom" : "default");
    if (theme === "custom") { document.documentElement.setAttribute("data-theme", "custom"); } else applyTheme(theme, false);
    refreshThemeChips();
    dateEasterEggs();
    $("opt-animated-bg").checked = Boolean(S.animatedBg); syncFx();
    $("opt-auto-pause").checked = S.autoPause !== false; $("opt-auto-pause-min").value = String(S.autoPauseMin || 5); $("opt-auto-pause-min").disabled = S.autoPause === false;
    window.dispatchEvent(new Event("autopause-changed"));
    $("opt-session-summary").checked = S.sessionSummary !== false;
    $("opt-hide-offline").checked = Boolean(S.hideOffline); applyHideOffline(Boolean(S.hideOffline));
    $("opt-kb-mem").value = String(S.kbMemoryGb || 4);
    $("opt-streamer-mode").checked = Boolean(S.streamerMode); streamerMode = Boolean(S.streamerMode);
    document.body.classList.toggle("streamer-mode", streamerMode);
    // Quoi de neuf : pastille tant que la version n'a pas été vue, ouverture automatique après une mise à jour
    if (appVersion && S.lastSeenVersion !== appVersion) {
      $("whatsnew-dot").classList.remove("hidden");
      if (S.onboardingSeen) setTimeout(() => { if (S.lastSeenVersion !== appVersion) openWhatsNew(); }, 2500);
    }
  })();
})();
