// Charge séquentiellement les sous-fichiers puis lance le dashboard
(function () {
  const base = "js/maxime/";

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error("Chargement: " + src));
      document.body.appendChild(s);
    });
  }

  // ordre important
  loadScript(base + "utils.js")
    .then(() => loadScript(base + "data.js"))
    .then(() => loadScript(base + "layout.js"))
    .then(() => loadScript(base + "chartMekko.js"))
    .then(() => {
      // Exécuter le dashboard
      window.Maxime.dashboard();
    })
    .catch(err => {
      const host = document.querySelector("#viz-container");
      if (host) host.innerHTML = `<div class="viz-card"><pre>${err.message}</pre></div>`;
      console.error(err);
    });
})();
