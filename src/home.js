// ============================================================
// 2.0.5 : accueil personnalisable (ordre, largeur et hauteur des cadres)
// ============================================================
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const api = window.anomia;
  const layoutEl = document.querySelector("#view-hub .hub-layout");
  if (!layoutEl) return;
  const IDS = ["polls-panel", "hub-slider", "teaser-panel", "twitch-panel", "music-panel", "partner-panel", "streamer-rail"]; // ordre par défaut (colonne de 3 + zone de 9)
  const DEF_W = { "polls-panel": 3, "teaser-panel": 3, "music-panel": 3, "partner-panel": 3, "hub-slider": 9, "twitch-panel": 9, "streamer-rail": 9 };
  const settings = () => (typeof window.getLauncherSettings === "function" ? window.getLauncherSettings() : {}) || {};
  let L = null, editing = false;
  const clean = (l) => {
    if (!l || typeof l !== "object") return null;
    const order = Array.isArray(l.order) ? l.order.filter((x) => IDS.includes(x)) : [];
    IDS.forEach((x) => { if (!order.includes(x)) order.push(x); });
    const w = {}, h = {};
    IDS.forEach((x) => { const a = Number(l.w && l.w[x]), b = Number(l.h && l.h[x]); w[x] = a >= 2 && a <= 12 ? Math.round(a) : DEF_W[x]; if (b >= 60 && b <= 1200) h[x] = Math.round(b); });
    return { order, w, h };
  };
  const persist = () => { settings().homeLayout = L; try { api.setSettings({ homeLayout: L }); } catch (e) { /* ignore */ } };
  function apply() {
    const on = !!L || editing;
    layoutEl.classList.toggle("hub-grid", on);
    layoutEl.classList.toggle("hub-editing", editing);
    $("home-reset").classList.toggle("hidden", !editing);
    $("home-done").classList.toggle("hidden", !editing);
    $("home-bar").classList.toggle("hidden", !editing);
    $("home-help").classList.toggle("hidden", !editing);
    IDS.forEach((id) => {
      const el = $(id); if (!el) return;
      el.draggable = editing;
      if (!on) { el.style.order = ""; el.style.gridColumn = ""; el.style.removeProperty("height"); return; }
      const cur = L || clean({});
      el.style.order = String(cur.order.indexOf(id));
      el.style.gridColumn = `span ${cur.w[id]}`;
      if (cur.h[id]) el.style.setProperty("height", cur.h[id] + "px", "important"); else el.style.removeProperty("height");
    });
  }
  function ensureL() { if (!L) L = clean({}); }
  // --- grips de redimensionnement ---
  IDS.forEach((id) => {
    const el = $(id); if (!el) return;
    const g = document.createElement("span"); g.className = "hub-grip"; g.title = "Tirer pour redimensionner";
    el.appendChild(g);
    g.addEventListener("pointerdown", (e) => {
      if (!editing) return; e.preventDefault(); e.stopPropagation(); ensureL();
      const colW = (layoutEl.clientWidth + 16) / 12, startX = e.clientX, startY = e.clientY, w0 = L.w[id], h0 = el.getBoundingClientRect().height;
      g.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        L.w[id] = Math.max(2, Math.min(12, Math.round(w0 + (ev.clientX - startX) / colW)));
        L.h[id] = Math.max(60, Math.min(1200, Math.round(h0 + (ev.clientY - startY))));
        apply();
      };
      const up = () => { g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); persist(); };
      g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up);
    });
  });
  // --- glisser-déposer pour réordonner ---
  let dragId = null;
  layoutEl.addEventListener("dragstart", (e) => {
    if (!editing) return; const b = e.target.closest && e.target.closest("[draggable=true]"); if (!b || !IDS.includes(b.id)) return;
    dragId = b.id; b.classList.add("hub-dragging"); try { e.dataTransfer.setData("text/plain", b.id); e.dataTransfer.effectAllowed = "move"; } catch (x) { /* ignore */ }
  });
  layoutEl.addEventListener("dragover", (e) => { if (editing && dragId) e.preventDefault(); });
  layoutEl.addEventListener("drop", (e) => {
    if (!editing || !dragId) return; e.preventDefault();
    const t = e.target.closest && IDS.map($).find((el) => el && el.contains(e.target));
    if (t && t.id !== dragId) { ensureL(); const o = L.order.filter((x) => x !== dragId); o.splice(o.indexOf(t.id), 0, dragId); L.order = o; apply(); persist(); }
  });
  layoutEl.addEventListener("dragend", () => { IDS.forEach((id) => $(id) && $(id).classList.remove("hub-dragging")); dragId = null; });
  // --- boutons ---
  function edit() { ensureL(); editing = true; apply(); }
  function reset() { L = null; editing = false; persist(); apply(); }
  const so = $("opt-home-edit"), sr = $("opt-home-reset");
  if (so) so.addEventListener("click", () => { if (typeof selectServer === "function") selectServer("hub"); if (typeof goToView === "function") goToView("hub"); edit(); });
  if (sr) sr.addEventListener("click", () => { reset(); sr.textContent = "✓ Accueil remis par défaut"; setTimeout(() => { sr.textContent = "Remettre par défaut"; }, 2500); });
  $("home-done").addEventListener("click", () => { editing = false; persist(); apply(); });
  $("home-reset").addEventListener("click", () => { L = null; editing = false; persist(); apply(); });
  // Les cadres masqués (sondages, annonce, musique) restent masqués ; en édition on les affiche en fantôme pour pouvoir les placer
  window.__homeLayout = { apply, edit, reset, get: () => L, isEditing: () => editing };
  (async function init() {
    for (let i = 0; i < 20 && !settings().__loaded; i++) { try { const s = await api.getSettings(); Object.assign(settings(), s || {}); settings().__loaded = true; } catch (e) { break; } }
    L = settings().homeLayout ? clean(settings().homeLayout) : null; apply();
  })();
})();
