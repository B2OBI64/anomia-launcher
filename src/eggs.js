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

  // Indices (visibles sur l'accueil) : on en montre un, au hasard
  const HINTS = [
    "Fais le Konami code : une petite surprise t'attend.",
    "Tape « kannibal » au clavier, juste pour voir…",
    "Le logo en haut à gauche adore qu'on insiste.",
    "Certains codes secrets font exploser des choses…",
    "Il paraît que le launcher cache des secrets. Combien en trouveras-tu ?"
  ];
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
  // Accueil : catégories de succès
  const CATS = { anomia: "Anomia RP", launcher: "Launcher" };
  async function refreshHomeAch() {
    const box = document.getElementById("ach-home-cats"); if (!box) return;
    const hint = document.getElementById("egg-hint");
    if (hint) hint.textContent = "💡 " + HINTS[Math.floor(Math.random() * HINTS.length)];
    let list = [], got = {};
    let r = null;
    try { r = await window.getAchData(); } catch (err) { r = null; }
    if (r && r.ok && r.linked) { list = r.list || []; got = r.achievements || {}; }
    else {
      try { const s = await api.getLauncherAchState(); list = s.list || []; got = s.unlocked || {}; } catch (err) { /* ignore */ }
    }
    const linked = Boolean(r && r.ok && r.linked);
    const groups = { anomia: [], launcher: [] };
    list.forEach((d) => (groups[d.category === "launcher" ? "launcher" : "anomia"]).push(d));
    const row = (name, arr, note) => {
      const n = arr.filter((d) => got[d.key]).length, t = arr.length || 1;
      const rar = ["bronze", "silver", "gold", "secret"].map((k) => {
        const a = arr.filter((d) => d.rarity === k); const u = a.filter((d) => got[d.key]).length;
        return a.length ? `<i class="hc-dot rarity-${k}" title="${RAR[k]} : ${u}/${a.length}">${u}/${a.length}</i>` : "";
      }).join("");
      return `<div class="hc-cat"><div class="hc-cat-top"><b>${name}</b><span>${note || n + "/" + arr.length}</span></div><div class="hc-bar"><div style="width:${Math.round(100 * n / t)}%"></div></div>${note ? "" : `<div class="hc-rar">${rar}</div>`}</div>`;
    };
    box.innerHTML = row(CATS.launcher, groups.launcher) + (linked ? row(CATS.anomia, groups.anomia) : row(CATS.anomia, groups.anomia, "Connecte-toi"));
  }
  window.refreshHomeAch = refreshHomeAch;
  const _go = window.goToView;
  window.goToView = function (n) { _go.apply(this, arguments); if (n === "hub") refreshHomeAch(); };
  const openBtn = document.getElementById("ach-home-open");
  if (openBtn) openBtn.addEventListener("click", () => { try { selectServer("anomia"); goToView("achievements"); } catch (err) { /* ignore */ } });
  refreshHomeAch();

  // Mode pause : on cache toute l'interface, il ne reste que le thème animé
  let zen = false;
  const zenHint = document.getElementById("zen-hint");
  function setZen(on) {
    zen = on; document.body.classList.toggle("zen", on);
    window.dispatchEvent(new CustomEvent("zen", { detail: on }));
    if (on && zenHint) { zenHint.classList.add("show"); setTimeout(() => zenHint.classList.remove("show"), 3500); }
  }
  const zb = document.getElementById("btn-zen");
  if (zb) zb.addEventListener("click", (ev) => { ev.stopPropagation(); setZen(true); });
  ["click", "keydown", "wheel"].forEach((t) => document.addEventListener(t, (ev) => {
    if (!zen) return;
    if (t === "wheel" || (t === "click" && ev.target && ev.target.id === "btn-zen")) return;
    setTimeout(() => setZen(false), 0); ev.stopPropagation(); ev.preventDefault();
  }, true));

  multiClick(".titlebar-brand", 7, () => egg("logo", "👀", "Tu as cliqué sur le logo 7 fois…"));
  multiClick("#app-version", 10, () => egg("version", "🔢", "Un numéro de version très cliqué."));
})();
