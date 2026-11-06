// Succès du launcher + easter eggs. Les déblocages sont stockés en local (main.js).
(function () {
  "use strict";
  const api = window.anomia;
  const RAR = { bronze: "Bronze", silver: "Argent", gold: "Or", secret: "Secret" };
  const queue = [];
  let showing = false;

  function toastNext() {
    if (showing || !queue.length) return;
    showing = true;
    const t = queue.shift();
    const el = document.createElement("div");
    el.className = "ach-toast " + (t.rarity ? "rarity-" + t.rarity : "egg-toast");
    el.innerHTML = `<div class="ach-toast-icon">${t.icon}</div><div><b>${t.title}</b><span>${t.sub}</span></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.remove(); showing = false; toastNext(); }, 400); }, 4200);
  }
  function toast(t) { queue.push(t); toastNext(); }

  function announce(defs) {
    (defs || []).forEach((d) => {
      if (typeof ACHIEVEMENT_ICONS !== "undefined") { /* icône déjà définie */ }
      toast({ icon: (typeof ACHIEVEMENT_ICONS !== "undefined" && ACHIEVEMENT_ICONS[d.key]) || "🏆", title: "Succès débloqué : " + d.label, sub: RAR[d.rarity] || "", rarity: d.rarity });
    });
    if (defs && defs.length && typeof getAchData === "function") getAchData(true).then(() => { try { refreshAchievementTitle(); } catch (e) { /* ignore */ } }).catch(() => {});
  }

  async function unlock(key) {
    try { const r = await api.unlockLauncherAch(key); announce(r && r.defs); } catch (e) { /* ignore */ }
  }
  async function egg(id, icon, text) {
    try {
      const r = await api.foundEgg(id);
      if (!r) return;
      if (r.isNew) toast({ icon, title: "Easter egg trouvé !", sub: text });
      announce(r.defs);
    } catch (e) { /* ignore */ }
  }
  window.launcherAch = { unlock, egg };

  // Paliers « Chasseur de succès » : débloqués côté main, annoncés ici à la réception des données
  if (typeof window.getAchData === "function") {
    const _get = window.getAchData;
    window.getAchData = function (force) {
      return _get(force).then((r) => { if (r && r.launcherNewDefs && r.launcherNewDefs.length) { announce(r.launcherNewDefs); r.launcherNewDefs = []; } return r; });
    };
  }

  // Easter egg « noctambule » : launcher ouvert entre 3 h et 5 h du matin
  setTimeout(() => { const h = new Date().getHours(); if (h >= 3 && h < 5) egg("noctambule", "🌙", "Tu ne dors jamais ?"); }, 6000);

  // 1) Konami code
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let kpos = 0;
  // 2) mots tapés au clavier (hors champs de saisie)
  const WORDS = { kannibal: ["🍖", "Le Kannibal Launcher te salue."], anomia: ["🌀", "Anomia reviendra…"] };
  let typed = "";
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) { kpos = 0; typed = ""; return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = k === KONAMI[kpos] ? kpos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) {
      kpos = 0;
      document.body.classList.add("egg-spin"); setTimeout(() => document.body.classList.remove("egg-spin"), 1500);
      egg("konami", "🕹️", "↑ ↑ ↓ ↓ ← → ← → B A");
    }
    if (e.key.length === 1) {
      typed = (typed + k).slice(-10);
      Object.keys(WORDS).forEach((w) => { if (typed.endsWith(w)) { typed = ""; egg(w, WORDS[w][0], WORDS[w][1]); } });
    }
  });

  // 3) clics répétés : logo ×7, version ×10 (fenêtre de 4 s entre clics)
  function multiClick(sel, n, fn) {
    const el = document.querySelector(sel); if (!el) return;
    let c = 0, last = 0;
    el.addEventListener("click", () => {
      const now = Date.now(); c = now - last < 4000 ? c + 1 : 1; last = now;
      if (c >= n) { c = 0; fn(); }
    });
  }
  // Pause automatique : après 5 min sans activité, l'interface disparaît et seul le thème animé reste.
  const IDLE_MS = 5 * 60 * 1000;
  let zen = false, idleTimer = null;
  const zenHint = document.getElementById("zen-hint");
  function setZen(on) {
    if (zen === on) return;
    zen = on; document.body.classList.toggle("zen", on);
    window.dispatchEvent(new CustomEvent("zen", { detail: on }));
    if (on && zenHint) { zenHint.classList.add("show"); setTimeout(() => zenHint.classList.remove("show"), 3500); }
  }
  function armIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(() => setZen(true), IDLE_MS); }
  ["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach((t) => document.addEventListener(t, (ev) => {
    if (zen) {
      // le 1er geste ne fait que réveiller le launcher (il n'active rien dessous)
      if (t === "mousemove" && ev.movementX === 0 && ev.movementY === 0) return;
      setZen(false); ev.stopPropagation(); if (t !== "mousemove") ev.preventDefault();
    }
    armIdle();
  }, true));
  armIdle();
  window.launcherZen = setZen; // test / usage manuel

  // Succès débloqués côté main (ex. « Polyvalent »)
  if (api.onLauncherAch) api.onLauncherAch((defs) => announce(defs));

  multiClick(".titlebar-brand", 7, () => egg("logo", "👀", "Tu as cliqué sur le logo 7 fois…"));
  multiClick("#app-version", 10, () => egg("version", "🔢", "Un numéro de version très cliqué."));
})();
