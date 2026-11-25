// ============================================================
// Accueil personnalisable : placement libre (colonne, ligne), largeur et hauteur de chaque cadre
// Grille de 12 colonnes × lignes de 10 px ; les cadres qui se chevauchent sont repoussés vers le bas.
// ============================================================
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const api = window.anomia;
  const layoutEl = document.querySelector("#view-hub .hub-layout");
  if (!layoutEl) return;
  const IDS = ["polls-panel", "hub-slider", "teaser-panel", "twitch-panel", "music-panel", "partner-panel", "streamer-rail"];
  const ROW = 10, GAP = 12, COLS = 12;
  const settings = () => (typeof window.getLauncherSettings === "function" ? window.getLauncherSettings() : {}) || {};
  let L = null, editing = false;

  const clean = (l) => {
    if (!l || l.v !== 2 || typeof l.items !== "object") return null;
    const items = {};
    for (const id of IDS) {
      const o = l.items[id]; if (!o) return null;
      const w = Math.max(2, Math.min(COLS, Math.round(+o.w) || 3)), c = Math.max(1, Math.min(COLS - w + 1, Math.round(+o.c) || 1));
      items[id] = { c, r: Math.max(1, Math.round(+o.r) || 1), w, h: Math.max(6, Math.min(200, Math.round(+o.h) || 10)) };
    }
    return { v: 2, items };
  };
  const persist = () => { settings().homeLayout = L; try { api.setSettings({ homeLayout: L }); } catch (e) { /* ignore */ } };
  const colStep = () => (layoutEl.clientWidth + GAP) / COLS;

  function apply() {
    const on = !!L || editing;
    layoutEl.classList.toggle("hub-grid", on);
    layoutEl.classList.toggle("hub-editing", editing);
    $("home-bar").classList.toggle("hidden", !editing);
    $("home-reset").classList.toggle("hidden", !editing);
    $("home-done").classList.toggle("hidden", !editing);
    $("home-help").classList.toggle("hidden", !editing);
    let bottom = 0;
    IDS.forEach((id) => {
      const el = $(id); if (!el) return;
      if (!on || !L) { el.style.gridColumn = ""; el.style.gridRow = ""; return; }
      const o = L.items[id];
      el.style.gridColumn = `${o.c} / span ${o.w}`;
      el.style.gridRow = `${o.r} / span ${o.h}`;
      bottom = Math.max(bottom, o.r + o.h);
    });
    layoutEl.style.minHeight = editing && L ? (bottom + 14) * ROW + "px" : "";
  }

  // Positions de départ : même disposition que l'accueil d'origine (colonne de 3 à gauche, 9 colonnes à droite), hauteurs mesurées
  function seed() {
    layoutEl.classList.remove("hub-grid", "hub-editing");
    IDS.forEach((id) => { const el = $(id); if (el) { el.style.gridColumn = ""; el.style.gridRow = ""; } });
    const hRows = (id) => { const el = $(id), r = el && el.getBoundingClientRect(); return r && r.height ? Math.max(6, Math.ceil((r.height + GAP) / ROW)) : 10; };
    const items = {}, shown = (id) => { const el = $(id); return !!el && !el.classList.contains("hidden"); };
    const col = (ids, c, w) => { let y = 1; ids.filter(shown).forEach((id) => { const h = hRows(id); items[id] = { c, r: y, w, h }; y += h; }); return y; };
    // gauche : annonce + partenaire | milieu : serveurs, Twitch, streamers | droite : sondages + musique
    const y1 = col(["teaser-panel", "partner-panel"], 1, 3);
    let y2 = 1; ["hub-slider", "twitch-panel", "streamer-rail"].forEach((id) => { const h = hRows(id); items[id] = { c: 4, r: y2, w: 6, h }; y2 += h; });
    const y3 = col(["polls-panel", "music-panel"], 10, 3);
    // cadres masqués pour l'instant : rangés en bas à leur colonne, à toi de les placer
    let yb = Math.max(y1, y2, y3);
    [["teaser-panel", 1], ["partner-panel", 1], ["polls-panel", 10], ["music-panel", 10]].filter(([id]) => !items[id]).forEach(([id, c]) => { const h = id === "music-panel" ? 30 : 12; items[id] = { c, r: yb, w: 3, h }; yb += h; });
    L = { v: 2, items };
  }

  const overlap = (a, b) => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h;
  function resolve(movedId) {
    const placed = [L.items[movedId]];
    IDS.filter((id) => id !== movedId).sort((x, y) => L.items[x].r - L.items[y].r || L.items[x].c - L.items[y].c).forEach((id) => {
      const o = L.items[id];
      for (let k = 0; k < 60; k++) { const hit = placed.find((p) => overlap(o, p)); if (!hit) break; o.r = hit.r + hit.h; }
      placed.push(o);
    });
  }

  // --- déplacement (clic maintenu sur un cadre) et redimensionnement (coin) ---
  function startGesture(e, id, mode) {
    if (!editing || e.button > 0) return;
    e.preventDefault();
    const el = $(id), o = L.items[id], start = { x: e.clientX, y: e.clientY, c: o.c, r: o.r, w: o.w, h: o.h }, step = colStep();
    el.setPointerCapture(e.pointerId); el.classList.add("hub-dragging");
    const mv = (ev) => {
      const dc = Math.round((ev.clientX - start.x) / step), dr = Math.round((ev.clientY - start.y) / ROW);
      if (mode === "move") { o.c = Math.max(1, Math.min(COLS - o.w + 1, start.c + dc)); o.r = Math.max(1, start.r + dr); }
      else { o.w = Math.max(2, Math.min(COLS - o.c + 1, start.w + dc)); o.h = Math.max(6, Math.min(200, start.h + dr)); }
      apply();
    };
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      el.classList.remove("hub-dragging"); resolve(id); apply(); persist();
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }
  IDS.forEach((id) => {
    const el = $(id); if (!el) return;
    const g = document.createElement("span"); g.className = "hub-grip"; g.title = "Tirer pour redimensionner"; el.appendChild(g);
    g.addEventListener("pointerdown", (e) => { e.stopPropagation(); startGesture(e, id, "resize"); });
    el.addEventListener("pointerdown", (e) => { if (e.target === g) return; startGesture(e, id, "move"); });
  });

  // --- boutons ---
  function edit() { if (!L) seed(); editing = true; apply(); }
  function reset() { L = null; editing = false; layoutEl.style.minHeight = ""; persist(); apply(); }
  const so = $("opt-home-edit"), sr = $("opt-home-reset");
  if (so) so.addEventListener("click", () => {
    if (typeof selectServer === "function") selectServer("hub");
    if (typeof goToView === "function") goToView("hub");
    setTimeout(edit, 60);
  });
  if (sr) sr.addEventListener("click", () => { reset(); sr.textContent = "✓ Accueil remis par défaut"; setTimeout(() => { sr.textContent = "Remettre par défaut"; }, 2500); });
  $("home-done").addEventListener("click", () => { editing = false; persist(); apply(); });
  $("home-reset").addEventListener("click", reset);
  window.addEventListener("resize", () => { if (L && !editing) apply(); });
  window.__homeLayout = { apply, edit, reset, get: () => L, isEditing: () => editing };
  (async function init() {
    try { const s = await api.getSettings(); Object.assign(settings(), s || {}); } catch (e) { /* ignore */ }
    L = clean(settings().homeLayout); apply();
  })();
})();
