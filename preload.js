const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("anomia", {
  // Fenêtre
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  // Serveur
  getServerStatus: () => ipcRenderer.invoke("server:status"),
  connect: () => ipcRenderer.send("server:connect"),

  // News
  getNews: () => ipcRenderer.invoke("news:get"),

  // Liens externes
  openExternal: (url) => ipcRenderer.send("shell:openExternal", url),

  // Assets
  checkAssets: () => ipcRenderer.invoke("assets:check"),
  onAssetsProgress: (callback) => {
    ipcRenderer.removeAllListeners("assets:progress");
    ipcRenderer.on("assets:progress", (event, payload) => callback(payload));
  },

  // Cache FiveM
  getCacheInfo: () => ipcRenderer.invoke("cache:info"),
  clearCache: () => ipcRenderer.invoke("cache:clear"),

  // Version de l'app (pour affichage, toujours juste)
  getAppVersion: () => ipcRenderer.invoke("app:version"),

  // Galerie média
  getMedia: () => ipcRenderer.invoke("media:get"),

  // Diagnostic réseau
  diagnoseNetwork: () => ipcRenderer.invoke("network:diagnose"),

  // Détection FiveM
  checkFiveM: () => ipcRenderer.invoke("fivem:check"),

  // Admin (lecture seule)
  unlockAdmin: (passphrase) => ipcRenderer.invoke("admin:unlock", passphrase),
  getAdminStats: () => ipcRenderer.invoke("admin:stats"),

  // Auto-update
  installUpdate: () => ipcRenderer.send("update:install"),
  retryUpdateCheck: () => ipcRenderer.invoke("update:retry"),
  onUpdateAvailable: (callback) => {
    ipcRenderer.removeAllListeners("update:available");
    ipcRenderer.on("update:available", (event, payload) => callback(payload));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.removeAllListeners("update:progress");
    ipcRenderer.on("update:progress", (event, payload) => callback(payload));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.removeAllListeners("update:downloaded");
    ipcRenderer.on("update:downloaded", (event, payload) => callback(payload));
  },
  onUpdateError: (callback) => {
    ipcRenderer.removeAllListeners("update:error");
    ipcRenderer.on("update:error", (event, payload) => callback(payload));
  }
});
