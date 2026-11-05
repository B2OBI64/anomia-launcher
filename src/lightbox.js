// Visualiseur d'images plein écran, réutilisable (médias d'Anomia, médias KannibAventure…)
// openLightbox(items, index) avec items = [{ url, author, date }]
(function () {
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let items = [], i = 0, root = null;
  function build() {
    root = document.createElement("div");
    root.className = "lb-overlay hidden";
    root.innerHTML = `<button class="lb-close" aria-label="Fermer">✕</button>
      <button class="lb-arrow lb-prev" aria-label="Précédente">‹</button>
      <figure class="lb-fig"><img class="lb-img" alt="" /><figcaption class="lb-cap"><span class="lb-meta"></span>
        <span class="lb-actions"><button class="btn-copy lb-open">Ouvrir</button><button class="btn-copy lb-copy">Copier l'image</button></span></figcaption></figure>
      <button class="lb-arrow lb-next" aria-label="Suivante">›</button>`;
    document.body.appendChild(root);
    root.addEventListener("mousedown", (e) => { if (e.target === root || e.target.classList.contains("lb-fig")) close(); });
    root.querySelector(".lb-close").addEventListener("click", close);
    root.querySelector(".lb-prev").addEventListener("click", () => go(-1));
    root.querySelector(".lb-next").addEventListener("click", () => go(1));
    root.querySelector(".lb-open").addEventListener("click", () => { if (items[i]) window.anomia.openExternal(items[i].url); });
    root.querySelector(".lb-copy").addEventListener("click", async (e) => {
      const b = e.currentTarget; let r; try { r = await window.anomia.copyImage(items[i].url); } catch (err) { r = null; }
      b.textContent = r && r.ok ? "Copiée ✓" : "Impossible"; setTimeout(() => { b.textContent = "Copier l'image"; }, 1600);
    });
    document.addEventListener("keydown", (e) => {
      if (root.classList.contains("hidden")) return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
    });
  }
  function show() {
    const it = items[i]; if (!it) return;
    root.querySelector(".lb-img").src = it.url;
    root.querySelector(".lb-meta").textContent = [it.author, it.date].filter(Boolean).join(" · ") + (items.length > 1 ? `   (${i + 1}/${items.length})` : "");
    const multi = items.length > 1;
    root.querySelector(".lb-prev").style.visibility = multi ? "visible" : "hidden";
    root.querySelector(".lb-next").style.visibility = multi ? "visible" : "hidden";
  }
  function go(d) { if (items.length < 2) return; i = (i + d + items.length) % items.length; show(); }
  function close() { if (root) root.classList.add("hidden"); }
  window.openLightbox = function (list, index) {
    if (!root) build();
    items = (list || []).filter((x) => x && /^https:\/\//i.test(x.url || ""));
    if (!items.length) return;
    i = Math.max(0, Math.min(items.length - 1, index || 0));
    show(); root.classList.remove("hidden");
  };
})();
