// ============================================================
// 2.0.5 : amis, notifications Windows, journal de dev admin
// ============================================================
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const api = window.anomia;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const settings = () => (typeof window.getLauncherSettings === "function" ? window.getLauncherSettings() : {}) || {};
  const saveSetting = (p) => { Object.assign(settings(), p); try { api.setSettings(p); } catch (e) { /* ignore */ } };

  // ---------- Notifications ----------
  const NOTIF_TYPES = [
    ["eventNew", "Nouvel événement publié", "Alerte quand un admin crée un événement."],
    ["eventStart", "Un événement commence", "Alerte au moment où un événement auquel tu participes démarre."],
    ["friendOnline", "Un ami se connecte", "Alerte quand un de tes amis apparaît en ligne."],
    ["friendRequest", "Demande d'ami reçue", "Alerte quand quelqu'un t'ajoute en ami."],
    ["announcement", "Nouvelle annonce importante", "Alerte quand une annonce est publiée dans l'accueil."],
    ["sessionEnd", "Fin d'une session de jeu", "Résumé de ta session quand tu fermes le jeu."],
  ];
  const nconf = () => settings().notifs || {};
  const notifOn = (t) => nconf().master === true && nconf()[t] === true;
  // Centre de notifications : garde l'historique (même si les notifications Windows sont désactivées)
  const ICON = { eventStart: "📅", eventNew: "🗓️", friendOnline: "🟢", friendRequest: "👋", announcement: "📢", sessionEnd: "🎮", update: "⬆️" };
  let center = [];
  try { center = JSON.parse(localStorage.getItem("notifCenter") || "[]").slice(0, 50); } catch (e) { center = []; }
  const saveCenter = () => { try { localStorage.setItem("notifCenter", JSON.stringify(center.slice(0, 50))); } catch (e) { /* ignore */ } };
  const ago = (ts) => { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`; };
  function renderCenter() {
    const unread = center.filter((n) => !n.read).length, b = $("nc-badge");
    b.textContent = unread > 9 ? "9+" : String(unread); b.classList.toggle("hidden", !unread);
    $("nc-list").innerHTML = center.length ? center.map((n) => `<div class="nc-item${n.read ? "" : " unread"}" data-nid="${n.id}" role="button" tabindex="0"><span class="nc-ico">${ICON[n.type] || "🔔"}</span><span class="nc-txt"><b>${esc(n.title)}</b><small>${esc(n.body || "")}</small></span><em>${ago(n.t)}</em><span class="nc-del" data-del="${n.id}" title="Supprimer cette notification" role="button">&#10005;</span></div>`).join("") : `<p class="hc-empty">Aucune notification pour le moment.</p>`;
  }
  function addCenter(type, title, body) {
    const last = center[0];
    if (last && last.type === type && last.title === title && last.body === body && Date.now() - last.t < 60000) return;
    center.unshift({ id: Date.now() + Math.floor(Math.random() * 1000), type, title, body: body || "", t: Date.now(), read: false });
    center = center.slice(0, 50); saveCenter(); renderCenter();
  }
  function goFor(type) {
    if (type === "eventStart" || type === "eventNew") selectServer("events");
    else if (type === "friendOnline" || type === "friendRequest") selectServer("friends");
    else selectServer("hub");
  }
  function notify(type, title, body) {
    addCenter(type, title, body);
    if (notifOn(type)) { try { api.notify({ type, title, body }); } catch (e) { /* ignore */ } }
  }
  window.__nc = addCenter;
  const panel = $("nc-panel");
  $("btn-notifs-center").addEventListener("click", (e) => { e.stopPropagation(); renderCenter(); panel.classList.toggle("hidden"); });
  document.addEventListener("click", (e) => { if (!panel.classList.contains("hidden") && !panel.contains(e.target)) panel.classList.add("hidden"); });
  $("nc-read").addEventListener("click", () => { center.forEach((n) => { n.read = true; }); saveCenter(); renderCenter(); });
  $("nc-clear").addEventListener("click", () => { center = []; saveCenter(); renderCenter(); });
  $("nc-list").addEventListener("click", (e) => {
    const d = e.target.closest("[data-del]");
    if (d) { e.stopPropagation(); center = center.filter((x) => String(x.id) !== d.dataset.del); saveCenter(); renderCenter(); return; }
    const b = e.target.closest("[data-nid]"); if (!b) return;
    const n = center.find((x) => String(x.id) === b.dataset.nid); if (!n) return;
    n.read = true; saveCenter(); renderCenter(); panel.classList.add("hidden"); goFor(n.type);
  });
  setInterval(renderCenter, 60000); renderCenter();
  window.__notify = notify;
  function setNotif(patch) { saveSetting({ notifs: Object.assign({}, nconf(), patch) }); }
  function openNotifModal() {
    const ov = document.createElement("div"); ov.className = "modal-overlay";
    const n = nconf();
    ov.innerHTML = `<div class="modal-box glass" style="max-width:480px;"><button class="modal-close" aria-label="Fermer">&#10005;</button><h3>Notifications Windows</h3>
      <p class="settings-hint" style="font-size:12px;color:var(--text-dim);margin:0 0 10px;">Désactivées par défaut. Elles n'apparaissent que tant que le launcher est ouvert (réduit dans la barre des tâches).</p>
      <label class="opt-row"><input type="checkbox" id="nt-master" ${n.master ? "checked" : ""} /><span><strong>Activer les notifications</strong></span></label>
      <div id="nt-list" class="nt-list${n.master ? "" : " off"}">${NOTIF_TYPES.map(([k, t, d]) => `<label class="opt-row"><input type="checkbox" data-nt="${k}" ${n[k] ? "checked" : ""} /><span>${esc(t)}<small>${esc(d)}</small></span></label>`).join("")}</div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    ov.querySelector(".modal-close").addEventListener("click", close);
    ov.querySelector("#nt-master").addEventListener("change", (e) => {
      const on = e.target.checked, p = { master: on };
      if (on && !NOTIF_TYPES.some(([k]) => nconf()[k])) NOTIF_TYPES.forEach(([k]) => { p[k] = true; });
      setNotif(p); ov.querySelector("#nt-list").classList.toggle("off", !on);
      NOTIF_TYPES.forEach(([k]) => { ov.querySelector(`[data-nt="${k}"]`).checked = nconf()[k] === true; });
    });
    ov.querySelectorAll("[data-nt]").forEach((c) => c.addEventListener("change", () => setNotif({ [c.dataset.nt]: c.checked })));
  }
  $("opt-notifs").addEventListener("click", openNotifModal);
  if (api.onNotifyClicked) api.onNotifyClicked((type) => goFor(type));

  // ---------- Amis ----------
  const fr = { me: null, friends: [], incoming: [], outgoing: [], known: null, reqKnown: null };
  const PLACE = { launcher: "Dans le launcher", anomia: "Joue à Anomia RP", kb: "Joue à KannibAventure" };
  function updateBadge() {
    const n = fr.friends.filter((f) => f.online).length, b = $("fr-badge");
    b.textContent = String(n); b.classList.toggle("hidden", n === 0);
    const q = $("fr-req-dot"); if (q) q.classList.toggle("hidden", !fr.incoming.length);
  }
  function render() {
    updateBadge();
    $("fr-invis").checked = settings().friendsInvisible === true;
    const on = fr.friends.filter((f) => f.online), off = fr.friends.filter((f) => !f.online);
    const row = (f) => `<div class="fr-row"><span class="fr-dot ${f.online ? "on" : ""}"></span><div class="fr-name"><b>${esc(f.name)}</b><small>${f.online ? esc(PLACE[f.s] || PLACE.launcher) : "Hors ligne"}</small></div><button class="btn-copy" data-fr="remove" data-uid="${esc(f.uid)}">Retirer</button></div>`;
    $("fr-online").innerHTML = on.map(row).join("") || `<p class="hc-empty">Aucun ami en ligne.</p>`;
    $("fr-offline").innerHTML = off.map(row).join("");
    $("fr-off-title").classList.toggle("hidden", !off.length);
    const reqs = fr.incoming.map((r) => `<div class="fr-row"><div class="fr-name"><b>${esc(r.name)}</b><small>Veut devenir ton ami</small></div><button class="btn-connect" data-fr="accept" data-uid="${esc(r.uid)}">Accepter</button><button class="btn-copy" data-fr="decline" data-uid="${esc(r.uid)}">Refuser</button></div>`).join("")
      + fr.outgoing.map((r) => `<div class="fr-row"><div class="fr-name"><b>${esc(r.name)}</b><small>Demande envoyée</small></div><button class="btn-copy" data-fr="cancel" data-uid="${esc(r.uid)}">Annuler</button></div>`).join("");
    $("fr-reqs").innerHTML = reqs; $("fr-req-title").classList.toggle("hidden", !reqs);
    $("fr-hint").classList.toggle("hidden", !!fr.me);
  }
  function detect(first) {
    const nowOn = new Set(fr.friends.filter((f) => f.online).map((f) => f.uid));
    const reqs = new Set(fr.incoming.map((r) => r.uid));
    if (fr.known) fr.friends.forEach((f) => { if (f.online && !fr.known.has(f.uid)) notify("friendOnline", f.name, "vient de se connecter (" + (PLACE[f.s] || PLACE.launcher).toLowerCase() + ")."); });
    if (fr.reqKnown) fr.incoming.forEach((r) => { if (!fr.reqKnown.has(r.uid)) notify("friendRequest", "Demande d'ami", r.name + " veut t'ajouter en ami."); });
    fr.known = nowOn; fr.reqKnown = reqs;
  }
  async function loadFriends() {
    if (!(window.friendsAvailable && window.friendsAvailable())) { fr.friends = []; fr.incoming = []; fr.outgoing = []; fr.known = null; fr.reqKnown = null; return; }
    let r; try { r = await api.friendsCall("list", {}); } catch (e) { r = null; }
    if (!r || !r.ok || !r.body) return;
    fr.me = r.body.me || null; fr.friends = r.body.friends || []; fr.incoming = r.body.incoming || []; fr.outgoing = r.body.outgoing || [];
    detect(); render();
  }
  window.loadFriends = async function () { await loadFriends(); if (window.friendsAvailable && window.friendsAvailable()) loadDirectory(); };
  const ERR = { not_found: "Joueur introuvable.", self: "C'est toi !", ambiguous: "Plusieurs joueurs correspondent.", already_friends: "Vous êtes déjà amis.", too_many: "Limite d'amis atteinte.", bad_name: "Pseudo invalide.", discord_required: "Connecte ton compte Discord pour utiliser les amis." };
  async function act(action, params) {
    const r = await api.friendsCall(action, params);
    await loadFriends(); return r;
  }
  // Annuaire : tous les membres des Discords Anomia + KannibAventure (pas seulement ceux qui utilisent le launcher)
  const dir = { members: [], t: 0, error: null };
  async function loadDirectory(force) {
    if (!force && Date.now() - dir.t < 5 * 60000 && dir.members.length) { renderMembers(); return; }
    let r; try { r = await api.friendsCall("directory", {}); } catch (e) { r = null; }
    if (r && r.ok && r.body) { dir.members = r.body.members || []; dir.error = r.body.error || null; dir.t = Date.now(); }
    renderMembers();
  }
  function renderMembers() {
    const q = ($("fr-add").value || "").trim().toLowerCase().replace(/^@/, "");
    const list = dir.members.filter((m) => m.rel !== "f" && (!q || (m.name || "").toLowerCase().includes(q) || (m.u || "").toLowerCase().includes(q)));
    const shown = list.slice(0, 40);
    $("fr-members").innerHTML = shown.map((m) => {
      const status = m.on ? `<span class="fr-tag on">En ligne</span>` : m.l ? `<span class="fr-tag">Sur le launcher</span>` : `<span class="fr-tag off">Pas sur le launcher</span>`;
      const btn = m.rel === "o" ? `<button class="btn-copy" disabled>Demande envoyée</button>` : m.rel === "i" ? `<button class="btn-connect" data-fr="accept" data-uid="${esc(m.uid)}">Accepter</button>` : `<button class="btn-copy" data-fr="addm" data-uid="${esc(m.uid)}">Ajouter</button>`;
      return `<div class="fr-row ${m.l ? "" : "dim"}"><span class="fr-dot ${m.on ? "on" : ""}"></span><div class="fr-name"><b>${esc(m.name)}</b><small>@${esc(m.u || "?")} ${status}</small></div>${btn}</div>`;
    }).join("");
    $("fr-members-note").textContent = dir.error === "members_intent" ? "Impossible de lister les membres : active l'option « Server Members Intent » du bot Discord."
      : dir.error && !dir.members.length ? "Liste des membres indisponible pour le moment."
      : list.length > 40 ? `${list.length - 40} autres membres : affine ta recherche.` : (!list.length ? "Aucun membre trouvé." : "");
  }
  $("fr-add").addEventListener("input", renderMembers);
  $("view-friends").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fr]"); if (!b || b.disabled) return;
    const a = b.dataset.fr === "addm" ? "add" : b.dataset.fr, msg = $("fr-msg");
    const r = await act(a, { uid: b.dataset.uid });
    if (a === "add") {
      const m = dir.members.find((x) => x.uid === b.dataset.uid);
      if (r && r.ok) { if (m) m.rel = (r.body && r.body.accepted) ? "f" : "o"; msg.style.color = "var(--teal)"; msg.textContent = (r.body && r.body.accepted) ? "Vous êtes maintenant amis !" : "Demande envoyée."; }
      else { msg.style.color = ""; msg.textContent = ERR[r && r.body && r.body.error] || "Impossible d'ajouter ce joueur."; }
    } else if (a === "accept" || a === "decline") { const m = dir.members.find((x) => x.uid === b.dataset.uid); if (m) m.rel = a === "accept" ? "f" : ""; }
    renderMembers();
  });
  $("fr-invis").addEventListener("change", (e) => saveSetting({ friendsInvisible: e.target.checked }));
  setInterval(loadFriends, 45000);
  setTimeout(loadFriends, 6000);

  // ---------- Notification : début d'événement (inscrit) + nouvelle annonce ----------
  const evNotified = new Set(); let annKnown = null, evKnown = null;
  async function checkEventsAndAnnounces() {
    try {
      const r = await api.eventsCall("list", {});
      if (r && r.ok && r.body) (r.body.events || []).forEach((e) => {
        if (evKnown && !evKnown.has(e.id)) notify("eventNew", "Nouvel événement", e.title);
        const t = e.startsAt * 1000, d = Date.now() - t;
        if (e.mine && d >= 0 && d < 15 * 60000 && !evNotified.has(e.id)) { evNotified.add(e.id); notify("eventStart", "Événement en cours", e.title + " commence maintenant !"); }
      });
      if (r && r.ok && r.body) evKnown = new Set((r.body.events || []).map((e) => e.id));
    } catch (e) { /* ignore */ }
    try {
      const t = await api.getTeaser();
      const list = (t && t.announcements) || [];
      const ids = new Set(list.filter((x) => x.sid).map((x) => x.sid));
      if (annKnown) list.forEach((x) => { if (x.sid && !annKnown.has(x.sid)) notify("announcement", "Annonce importante", x.title || "Une nouvelle annonce vient d'être publiée."); });
      annKnown = ids;
    } catch (e) { /* ignore */ }
  }
  setInterval(checkEventsAndAnnounces, 60000);
  setTimeout(checkEventsAndAnnounces, 9000);

  // ---------- Journal de dev KannibAventure : création par les admins KB ----------
  function refreshDevAdmin() { const el = $("kb-dev-admin"); if (el) el.classList.toggle("hidden", !(window.isKbAdmin && window.isKbAdmin())); }
  window.refreshDevAdmin = refreshDevAdmin;
  $("kb-dev-new").addEventListener("click", () => {
    const ov = document.createElement("div"); ov.className = "modal-overlay";
    ov.innerHTML = `<div class="modal-box glass poll-form" style="max-width:520px;"><button class="modal-close" aria-label="Fermer">&#10005;</button><h3>Nouvelle entrée du journal</h3>
      <label>Étiquette</label><input type="text" id="dv-tag" maxlength="20" value="MODS" placeholder="MODS, MAJ, ANNONCE…" />
      <label>Titre</label><input type="text" id="dv-t" maxlength="90" />
      <label>Contenu</label><textarea id="dv-c" maxlength="3000" rows="6"></textarea>
      <p id="dv-msg" style="color:#f87171;font-size:12px;min-height:16px;"></p>
      <div class="poll-actions"><button class="btn-connect" id="dv-ok">Publier</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove(), msg = ov.querySelector("#dv-msg");
    ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
    ov.querySelector(".modal-close").addEventListener("click", close);
    ov.querySelector("#dv-ok").addEventListener("click", async () => {
      const title = ov.querySelector("#dv-t").value.trim(), content = ov.querySelector("#dv-c").value.trim();
      if (!title || !content) { msg.textContent = "Titre et contenu obligatoires."; return; }
      const b = ov.querySelector("#dv-ok"); b.disabled = true;
      const r = await api.adminContent("kbdevlog", "create", { tag: ov.querySelector("#dv-tag").value.trim().toUpperCase() || "ANNONCE", title, content });
      if (r && r.ok) { close(); window.reloadKbDevlog(); } else { b.disabled = false; msg.textContent = (r && r.body && r.body.error) === "kb_admin_only" ? "Réservé aux admins KannibAventure." : "Impossible de publier."; }
    });
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-devdel]"); if (!b) return;
    if (!confirm("Supprimer cette entrée du journal ?")) return;
    const r = await api.adminContent("kbdevlog", "delete", { id: b.dataset.devdel }); if (r && r.ok) window.reloadKbDevlog();
  });
  // ---------- Partenaire OxygenServ ----------
  const PARTNER_URL = "https://www.oxygenserv.com/?ref=b2obi64", PARTNER_DISCORD = "https://discord.com/invite/dCnx3yYHFV";
  ["partner-link", "partner-btn", "partner-pill"].forEach((id) => { const el = $(id); if (el) el.addEventListener("click", () => api.openExternal(PARTNER_URL)); });
  $("partner-discord").addEventListener("click", () => api.openExternal(PARTNER_DISCORD));
  $("partner-code").addEventListener("click", () => {
    const b = $("partner-code"), done = () => { b.classList.add("ok"); b.querySelector("i").textContent = "✓ copié !"; setTimeout(() => { b.classList.remove("ok"); b.querySelector("i").textContent = "⧉ copier"; }, 2000); };
    try { navigator.clipboard.writeText("B2OBI64").then(done, done); } catch (e) { done(); }
  });
})();
