const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("anomia", {
  // Fenêtre
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  getKbPlaytime: () => ipcRenderer.invoke("kb:getPlaytime"),
  repairKannibAventure: () => ipcRenderer.invoke("kb:repair"),
  openKbFolder: () => ipcRenderer.invoke("kb:openFolder"),
  openKbLog: () => ipcRenderer.invoke("kb:openLog"),
  launchKannibAventureDirect: () => ipcRenderer.invoke("kb:launchDirect"),
  forgetMicrosoft: () => ipcRenderer.invoke("kb:forgetMicrosoft"),
  onKbLaunchProgress: (cb) => { ipcRenderer.removeAllListeners("kb:launchProgress"); ipcRenderer.on("kb:launchProgress", (e, p) => cb(p)); },
  launchKannibAventure: () => ipcRenderer.invoke("kb:launch"),
  getKbStatus: () => ipcRenderer.invoke("kb:getStatus"),
  relaunchApp: () => ipcRenderer.send("app:relaunch"),

  // B2 Launcher : serveurs et contenu KannibAventure
  getServers: () => ipcRenderer.invoke("servers:get"),
  getKbContent: (name) => ipcRenderer.invoke("kb:getContent", name),

  getKbModsState: () => ipcRenderer.invoke("kbmods:getState"),
  chooseKbModsFolder: () => ipcRenderer.invoke("kbmods:chooseFolder"),
  installKbMods: () => ipcRenderer.invoke("kbmods:install"),
  onKbModsProgress: (callback) => {
    ipcRenderer.removeAllListeners("kbmods:progress");
    ipcRenderer.on("kbmods:progress", (event, payload) => callback(payload));
  },

  // Serveur
  getServerStatus: () => ipcRenderer.invoke("server:status"),
  connect: () => ipcRenderer.send("server:connect"),
  onConnectError: (callback) => {
    ipcRenderer.removeAllListeners("connect:error");
    ipcRenderer.on("connect:error", (event, message) => callback(message));
  },

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
  copyImage: (url) => ipcRenderer.invoke("media:copyImage", url),
  getKbMedia: () => ipcRenderer.invoke("media:getKb"),
  getMedia: () => ipcRenderer.invoke("media:get"),

  // Diagnostic réseau
  diagnoseNetwork: () => ipcRenderer.invoke("network:diagnose"),

  // Détection FiveM
  checkFiveM: () => ipcRenderer.invoke("fivem:check"),

  // Admin (lecture seule)
  unlockAdmin: (passphrase) => ipcRenderer.invoke("admin:unlock", passphrase),
  toggleKbMaintenance: (enable) => ipcRenderer.invoke("admin:toggleKbMaintenance", enable),
  getTour: () => ipcRenderer.invoke("tour:get"),
  checkSub: () => ipcRenderer.invoke("sub:check"),
  checkCitizen: (server) => ipcRenderer.invoke("role:citizen", server),
  pollsCall: (action, params) => ipcRenderer.invoke("polls:call", action, params),
  toggleMaintenance: (enable) => ipcRenderer.invoke("admin:toggleMaintenance", enable),
  isOnline: () => ipcRenderer.invoke("network:isOnline"),
  onSessionEnded: (cb) => { ipcRenderer.removeAllListeners("session:ended"); ipcRenderer.on("session:ended", (e, d) => cb(d)); },
  onNetworkStatus: (cb) => { ipcRenderer.removeAllListeners("network:status"); ipcRenderer.on("network:status", (e, online) => cb(online)); },
  getGameState: () => ipcRenderer.invoke("game:getState"),
  getNotes: () => ipcRenderer.invoke("notes:get"),
  setNotes: (notes) => ipcRenderer.invoke("notes:set", notes),
  getChangelog: () => ipcRenderer.invoke("changelog:get"),
  listReleases: () => ipcRenderer.invoke("releases:list"),
  getAnomiaStats: () => ipcRenderer.invoke("stats:getAnomia"),
  getLastVideo: () => ipcRenderer.invoke("twitch:getLastVideo"),
  getServerHealth: () => ipcRenderer.invoke("admin:getHealth"),
  getStaffPlayers: () => ipcRenderer.invoke("admin:getPlayers"),
  saveImage: (dataUrl, defaultName) => ipcRenderer.invoke("image:save", dataUrl, defaultName),
  getAdminStats: () => ipcRenderer.invoke("admin:stats"),

  // Twitch
  getTwitchStatus: () => ipcRenderer.invoke("twitch:getStatus"),
  getDiscordCommunities: () => ipcRenderer.invoke("discord:getCommunities"),
  getTwitchClips: () => ipcRenderer.invoke("twitch:getClips"),

  // Connexion Discord
  startDiscordAuth: () => ipcRenderer.send("discord:startAuth"),
  getDiscordProfile: () => ipcRenderer.invoke("discord:getProfile"),
  logoutDiscord: () => ipcRenderer.send("discord:logout"),
  isDiscordConfigured: () => ipcRenderer.invoke("discord:isConfigured"),
  onDiscordConnected: (callback) => {
    ipcRenderer.removeAllListeners("discord:connected");
    ipcRenderer.on("discord:connected", (event, payload) => callback(payload));
  },
  onDiscordError: (callback) => {
    ipcRenderer.removeAllListeners("discord:error");
    ipcRenderer.on("discord:error", (event, payload) => callback(payload));
  },

  // Auto-update
  installUpdate: () => ipcRenderer.send("update:install"),
  downloadUpdate: () => ipcRenderer.send("update:download"),
  retryUpdateCheck: () => ipcRenderer.invoke("update:retry"),
  onUpdateAvailable: (callback) => {
    ipcRenderer.removeAllListeners("update:available");
    ipcRenderer.on("update:available", (event, payload) => callback(payload));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.removeAllListeners("update:not-available");
    ipcRenderer.on("update:not-available", (event, payload) => callback(payload));
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
  },

  // Réglages (thème, tour guidé)
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),

  // Temps de jeu hebdomadaire
  getPlaytime: () => ipcRenderer.invoke("playtime:get"),

  // Staff
  getStaff: () => ipcRenderer.invoke("staff:get"),

  // Règlement
  getRules: () => ipcRenderer.invoke("rules:get"),

  // Carte
  getMapPoints: () => ipcRenderer.invoke("map:getPoints"),
  sendGpsWaypoint: (x, y) => ipcRenderer.invoke("map:sendGpsWaypoint", x, y),

  // Succès
  unlockLauncherAch: (k) => ipcRenderer.invoke("launcherAch:unlock", k),
  foundEgg: (id) => ipcRenderer.invoke("launcherAch:egg", id),
  getLauncherAchState: () => ipcRenderer.invoke("launcherAch:state"),
  getKbAchSelf: () => ipcRenderer.invoke("kbAch:getSelf"),
  getPlayerProfile: (server, name) => ipcRenderer.invoke("player:getProfile", server, name),
  getKbPlayers: () => ipcRenderer.invoke("kb:getPlayers"),
  onLauncherAch: (cb) => ipcRenderer.on("launcherAch:new", (e, defs) => cb(defs)),
  getLauncherHealth: () => ipcRenderer.invoke("health:launcher"),
  getAchievements: () => ipcRenderer.invoke("achievements:get"),
  getAchievementTitlePriority: () => ipcRenderer.invoke("achievements:getTitlePriority"),

  // Prochain redémarrage programmé
  getNextRestart: () => ipcRenderer.invoke("server:nextRestart"),

  // Rapports de crash
  sendCrashReport: (crashPath) => ipcRenderer.invoke("crash:send", crashPath),
  createDiagnosticReport: () => ipcRenderer.invoke("diagnostics:createReport"),
  onCrashDetected: (callback) => {
    ipcRenderer.removeAllListeners("crash:detected");
    ipcRenderer.on("crash:detected", (event, payload) => callback(payload));
  }
});
