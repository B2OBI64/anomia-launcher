// Économie de ressources : les actualisations périodiques sont suspendues quand la fenêtre est réduite ou cachée,
// puis une actualisation unique est faite au retour.
(function () {
  const si = window.setInterval.bind(window);
  window.setInterval = function (fn, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    if (typeof fn !== "function" || !(ms >= 2000)) return si.apply(null, arguments);
    return si(function () { if (!document.hidden) return fn.apply(this, arguments); }, ms, ...rest);
  };
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 30000) {
      try { if (typeof refreshStatus === "function") refreshStatus(); } catch (e) { /* ignore */ }
      try { if (typeof refreshPlaytime === "function") refreshPlaytime(); } catch (e) { /* ignore */ }
    }
  });
})();
