// ============================================================
// Musique : onglet « Musique » (albums), lecteur en bas, carte du lecteur sur l'accueil
// (chargé après features.js)
// ============================================================
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const api = window.anomia;
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const settings = () => (typeof window.getLauncherSettings === "function" ? window.getLauncherSettings() : {}) || {};
  const saveSetting = (patch) => { try { api.setSettings(patch); } catch (e) { /* ignore */ } Object.assign(settings(), patch); };
  const isSub = () => Boolean(settings().isSub) || Boolean(settings().themesAll);
  let AUTO_CLOSE_MS = 60 * 1000; // le lecteur se ferme après 1 minute sans musique

  const M = { base: "", albums: [], filter: "Tout", queue: [], idx: -1, repeat: 0, active: false, view: "", detail: null };
  const audio = new Audio();
  audio.preload = "none";
  let closeTimer = null;

  const url = (rel) => (/^https:\/\//i.test(rel) ? rel : M.base + rel);
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const locked = (al) => Boolean(al.subOnly) && !isSub();
  const coverStyle = (al) => `background-image:url('${esc(url(al.cover)).replace(/'/g, "%27")}')`;
  const findAlbum = (id) => M.albums.find((a) => a.id === id);
  const cur = () => (M.idx >= 0 ? M.queue[M.idx] : null);

  // ---------- File de lecture : tous les titres jouables, dans l'ordre d'affichage ----------
  function buildQueue() {
    M.queue = [];
    M.albums.forEach((al) => { if (!locked(al)) al.tracks.forEach((t) => M.queue.push({ album: al, track: t })); });
  }

  // ---------- Lecture ----------
  function startCloseTimer() { clearTimeout(closeTimer); closeTimer = setTimeout(closePlayer, AUTO_CLOSE_MS); }
  function clearCloseTimer() { clearTimeout(closeTimer); closeTimer = null; }
  function playAt(i) {
    if (i < 0 || i >= M.queue.length) return;
    M.idx = i; M.active = true;
    const it = cur();
    audio.src = url(it.track.file);
    audio.play().catch(() => {});
    setMediaSession(it);
    clearCloseTimer();
    updateUI();
  }
  function playTrack(albumId, trackId) {
    buildQueue();
    const i = M.queue.findIndex((q) => q.album.id === albumId && q.track.id === trackId);
    if (i >= 0) playAt(i);
  }
  function toggle() {
    if (!cur()) { buildQueue(); if (M.queue.length) playAt(0); return; }
    if (audio.paused) { audio.play().catch(() => {}); } else audio.pause();
  }
  function next(auto) {
    if (!M.queue.length) return;
    if (M.idx + 1 < M.queue.length) playAt(M.idx + 1);
    else if (M.repeat === 1 || !auto) playAt(0);
    else { audio.pause(); audio.currentTime = 0; startCloseTimer(); updateUI(); }
  }
  function prev() {
    if (!M.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    playAt(M.idx > 0 ? M.idx - 1 : M.queue.length - 1);
  }
  function cycleRepeat() { M.repeat = (M.repeat + 1) % 3; updateUI(); }
  function closePlayer() {
    clearCloseTimer();
    audio.pause(); audio.removeAttribute("src"); try { audio.load(); } catch (e) { /* ignore */ }
    M.active = false; M.idx = -1;
    updateUI(); refreshGrid();
  }
  audio.addEventListener("play", () => { clearCloseTimer(); updateUI(); });
  audio.addEventListener("pause", () => { if (M.active && !audio.ended) startCloseTimer(); updateUI(); });
  audio.addEventListener("ended", () => {
    if (M.repeat === 2) { audio.currentTime = 0; audio.play().catch(() => {}); } else next(true);
  });
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("error", () => { if (M.active) { audio.pause(); startCloseTimer(); updateUI(); } });
  function setMediaSession(it) {
    try {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.track.title, artist: it.album.artist || "", album: it.album.title, artwork: [{ src: url(it.album.cover), sizes: "600x600", type: "image/jpeg" }] });
      navigator.mediaSession.setActionHandler("play", () => audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => next(false));
      navigator.mediaSession.setActionHandler("previoustrack", () => prev());
    } catch (e) { /* non bloquant */ }
  }

  // ---------- Interface du lecteur (barre du bas + carte de l'accueil) ----------
  function updateProgress() {
    const d = audio.duration || (cur() && cur().track.duration) || 0, t = audio.currentTime || 0, pct = d ? Math.min(100, (t / d) * 100) : 0;
    ["mb", "mh"].forEach((p) => {
      const bar = $(p + "-prog"); if (bar && bar.firstElementChild) bar.firstElementChild.style.width = pct + "%";
      const c = $(p + "-cur"), du = $(p + "-dur"); if (c) c.textContent = fmt(t); if (du) du.textContent = fmt(d);
    });
  }
  function updateUI() {
    const it = cur(), playing = M.active && !audio.paused;
    const showBar = M.active && M.view === "hub-music", showCard = M.active && M.view === "hub";
    $("music-bar").classList.toggle("hidden", !showBar);
    $("music-panel").classList.toggle("hidden", !showCard);
    document.body.classList.toggle("music-bar-on", showBar);
    const dot = $("mu-dot"); if (dot) dot.classList.toggle("hidden", !playing);
    if (it) {
      ["mb", "mh"].forEach((p) => {
        const cv = $(p + "-cover"); if (cv) cv.style.backgroundImage = `url("${url(it.album.cover).replace(/"/g, "%22")}")`;
        $(p + "-title").textContent = it.track.title; $(p + "-artist").textContent = it.album.artist ? `${it.album.artist} · ${it.album.source || ""}` : (it.album.source || "");
      });
    }
    document.querySelectorAll("[data-mu=toggle]").forEach((b) => { b.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;"; });
    document.querySelectorAll("[data-mu=repeat]").forEach((b) => { b.classList.toggle("on", M.repeat > 0); b.innerHTML = M.repeat === 2 ? "&#128258;" : "&#128257;"; b.title = ["Répétition : désactivée", "Répétition : tous les titres", "Répétition : ce titre"][M.repeat]; });
    updateProgress();
    refreshGrid();
    if (M.detail) renderDetail(M.detail);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mu]"); if (!b) return;
    const a = b.dataset.mu;
    if (a === "toggle") toggle(); else if (a === "next") next(false); else if (a === "prev") prev(); else if (a === "repeat") cycleRepeat();
  });
  [["mb-prog"], ["mh-prog"]].forEach(([id]) => {
    const el = $(id); if (!el) return;
    el.addEventListener("click", (e) => { const r = el.getBoundingClientRect(), d = audio.duration; if (d) audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d; });
  });
  $("mb-close").addEventListener("click", closePlayer);
  $("mh-close").addEventListener("click", closePlayer);
  $("mb-vol").addEventListener("input", (e) => { audio.volume = e.target.value / 100; saveSetting({ musicVolume: +e.target.value }); });
  $("mb-dl").addEventListener("click", () => { const it = cur(); if (it) downloadTrack(it.album, it.track); });

  // ---------- Téléchargement ----------
  async function downloadTrack(al, t) {
    if (locked(al)) return;
    const r = await api.downloadMusic(url(t.file), t.title);
    if (r && r.ok) showInfo("Musique enregistrée", `<p>« ${esc(t.title)} » a été enregistrée sur ton PC.</p>`);
    else if (r && !r.canceled) showInfo("Téléchargement impossible", `<p>${esc((r && r.error) || "Erreur inconnue")}</p>`);
  }
  async function downloadMany(list) {
    const items = list.filter((x) => !locked(x.album)).map((x) => ({ url: url(x.track.file), name: x.track.title }));
    if (!items.length) { showInfo("Rien à télécharger", `<p>Aucune musique disponible pour toi dans cette liste.</p>`); return; }
    const r = await api.downloadAllMusic(items);
    if (r && r.ok) showInfo("Musiques enregistrées", `<p>${r.done} musique${r.done > 1 ? "s" : ""} enregistrée${r.done > 1 ? "s" : ""}${r.failed ? ` (${r.failed} en échec)` : ""}.</p>`);
    else if (r && !r.canceled) showInfo("Téléchargement impossible", `<p>${esc((r && r.error) || "Erreur inconnue")}</p>`);
  }
  $("music-dl-all").addEventListener("click", () => downloadMany(visibleAlbums().flatMap((al) => al.tracks.map((t) => ({ album: al, track: t })))));

  // ---------- Grille d'albums ----------
  const visibleAlbums = () => M.albums.filter((a) => M.filter === "Tout" || a.source === M.filter);
  function renderFilter() {
    const sources = ["Tout", ...Array.from(new Set(M.albums.map((a) => a.source).filter(Boolean)))];
    $("music-filter").innerHTML = sources.map((s) => `<button class="mu-chip${s === M.filter ? " on" : ""}" data-f="${esc(s)}">${esc(s)}</button>`).join("");
  }
  function renderGrid() {
    const list = visibleAlbums(), grid = $("music-grid");
    $("music-empty").classList.toggle("hidden", list.length > 0);
    grid.innerHTML = list.map((al) => {
      const lk = locked(al), playingHere = M.active && cur() && cur().album.id === al.id && !audio.paused;
      return `<div class="mu-card${lk ? " locked" : ""}${cur() && cur().album.id === al.id && M.active ? " on" : ""}" data-al="${esc(al.id)}">
        <div class="mu-cover" style="${coverStyle(al)}">${lk ? `<span class="mu-lock">&#128274; Abonné</span>` : `<button class="mu-fab" data-play="${esc(al.id)}" aria-label="Lecture">${playingHere ? "&#10074;&#10074;" : "&#9654;"}</button>`}</div>
        <div class="mu-name">${esc(al.title)}</div><div class="mu-sub">${esc(al.artist || "")}${al.artist && al.source ? " · " : ""}${esc(al.source || "")}</div></div>`;
    }).join("");
  }
  function refreshGrid() { if (M.view === "hub-music" && !M.detail) renderGrid(); }
  $("music-filter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; M.filter = b.dataset.f; renderFilter(); renderGrid(); });
  $("music-grid").addEventListener("click", (e) => {
    const fab = e.target.closest("[data-play]");
    if (fab) {
      e.stopPropagation();
      const al = findAlbum(fab.dataset.play); if (!al || locked(al)) return;
      if (cur() && cur().album.id === al.id && M.active) toggle(); else playTrack(al.id, al.tracks[0].id);
      return;
    }
    const card = e.target.closest("[data-al]"); if (card) openDetail(card.dataset.al);
  });

  // ---------- Page d'un album ----------
  function openDetail(id) { M.detail = id; $("music-list-view").classList.add("hidden"); $("music-detail").classList.remove("hidden"); renderDetail(id); window.scrollTo(0, 0); const c = $("content"); if (c) c.scrollTop = 0; }
  function closeDetail() { M.detail = null; $("music-detail").classList.add("hidden"); $("music-list-view").classList.remove("hidden"); renderGrid(); }
  function renderDetail(id) {
    const al = findAlbum(id), box = $("music-detail"); if (!al) { closeDetail(); return; }
    const lk = locked(al), here = M.active && cur() && cur().album.id === al.id, playing = here && !audio.paused;
    const total = al.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    box.innerHTML = `<button class="mu-back" id="mu-back">&#8592; Retour à Musique</button>
      <div class="mu-det"><div class="mu-det-cover" style="${coverStyle(al)}">${lk ? `<span class="mu-lock big">&#128274;</span>` : ""}</div>
        <div class="mu-det-info"><span class="section-eyebrow">// ${al.tracks.length > 1 ? "ALBUM" : "TITRE"}</span><h1 class="mu-det-title">${esc(al.title)}</h1>
        <div class="mu-det-meta">${esc(al.artist || "")}${al.artist && al.source ? " · " : ""}${esc(al.source || "")} · ${al.tracks.length > 1 ? al.tracks.length + " titres · " : ""}${fmt(total)}</div></div></div>
      ${lk ? `<p class="mu-locked-msg">&#128274; Cette musique est réservée aux abonnés Twitch de la chaîne. Abonne-toi, puis relie ton Discord pour la débloquer.</p>` : ""}
      <div class="mu-det-acts"><button class="mu-bigplay" id="mu-det-play" ${lk ? "disabled" : ""}>${playing ? "&#10074;&#10074;" : "&#9654;"}</button><button class="mu-ghost" id="mu-det-dl" ${lk ? "disabled" : ""}>&#11015; Télécharger${al.tracks.length > 1 ? " l'album" : ""}</button></div>
      <div class="mu-tracks">${al.tracks.map((t, i) => { const on = here && cur().track.id === t.id; return `<div class="mu-trk${on ? " on" : ""}" data-t="${esc(t.id)}"><span class="mu-n">${on && playing ? "&#9835;" : i + 1}</span><span class="mu-tt"><b>${esc(t.title)}</b><small>${esc(al.artist || "")}</small></span><span class="mu-d">${fmt(t.duration)}</span><button class="mu-tdl" data-dl="${esc(t.id)}" ${lk ? "disabled" : ""} title="Télécharger">&#11015;</button></div>`; }).join("")}</div>`;
  }
  $("music-detail").addEventListener("click", (e) => {
    const al = findAlbum(M.detail); if (!al) return;
    if (e.target.closest("#mu-back")) return closeDetail();
    if (locked(al)) return;
    if (e.target.closest("#mu-det-play")) { if (M.active && cur() && cur().album.id === al.id) toggle(); else playTrack(al.id, al.tracks[0].id); return; }
    if (e.target.closest("#mu-det-dl")) { if (al.tracks.length === 1) downloadTrack(al, al.tracks[0]); else downloadMany(al.tracks.map((t) => ({ album: al, track: t }))); return; }
    const dl = e.target.closest("[data-dl]"); if (dl) { const t = al.tracks.find((x) => x.id === dl.dataset.dl); if (t) downloadTrack(al, t); return; }
    const row = e.target.closest("[data-t]"); if (row) { if (M.active && cur() && cur().track.id === row.dataset.t && cur().album.id === al.id) toggle(); else playTrack(al.id, row.dataset.t); }
  });

  // ---------- Chargement et navigation ----------
  async function loadMusic() {
    let d; try { d = await api.getMusic(); } catch (e) { d = null; }
    if (!d || !Array.isArray(d.albums)) return;
    M.base = d.base || ""; M.albums = d.albums.filter((a) => a && a.id && Array.isArray(a.tracks) && a.tracks.length);
    if (!M.albums.some((a) => a.source === M.filter) && M.filter !== "Tout") M.filter = "Tout";
    buildQueue(); renderFilter(); if (!M.detail) renderGrid();
  }
  const _goToView = goToView;
  goToView = function (name) {
    _goToView(name);
    const was = M.view;
    M.view = name;
    if (name === "hub-music") { if (was !== "hub-music" && M.detail) closeDetail(); loadMusic(); }
    updateUI();
  };
  const _selectServer = selectServer;
  selectServer = function (id) { _selectServer(id); M.view = id === "hub" ? "hub" : (id === "music" ? "hub-music" : ""); updateUI(); };

  // ---------- Réglage : couper la musique quand le jeu se lance (désactivé par défaut) ----------
  function onGameLaunch(e) {
    if (!settings().musicPauseOnLaunch || !M.active || audio.paused) return;
    const btn = e.target.closest("#btn-connect, #kb-connect"); if (!btn || btn.disabled) return;
    audio.pause();
  }
  document.addEventListener("click", onGameLaunch, true);
  (async function init() {
    try { const s = await api.getSettings(); Object.assign(settings(), s || {}); } catch (e) { /* ignore */ }
    const cb = $("opt-music-pause"); cb.checked = Boolean(settings().musicPauseOnLaunch);
    cb.addEventListener("change", (e) => saveSetting({ musicPauseOnLaunch: e.target.checked }));
    const v = Number.isFinite(settings().musicVolume) ? settings().musicVolume : 70;
    $("mb-vol").value = String(v); audio.volume = v / 100;
    M.view = typeof currentServerId === "string" && currentServerId === "hub" ? "hub" : "";
    loadMusic();
  })();
  window.__music = { audio, state: M, playTrack, closePlayer, loadMusic, setAutoClose: (ms) => { AUTO_CLOSE_MS = ms; } };
})();
