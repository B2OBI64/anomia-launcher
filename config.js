// ============================================================
// ANOMIA LAUNCHER - CONFIGURATION
// Modifie uniquement ce fichier pour adapter le launcher.
// ============================================================

module.exports = {
  // --- Connexion serveur FiveM ---
  server: {
    ip: "185.44.80.32",
    port: 30140,
    cfxCode: "8pqgm4", // code cfx.re/join/xxxxx
    // Le launcher interroge directement le serveur FiveM (endpoint HTTP natif de FXServer),
    // ce qui est plus fiable que l'API officielle CFX (souvent bloquée pour les requêtes
    // faites depuis un script/une appli, protection Cloudflare anti-bot).
    // Nécessite que le serveur n'ait pas sv_endpointprivacy activé.
    directInfoUrl: "http://185.44.80.32:30140/info.json",
    directDynamicUrl: "http://185.44.80.32:30140/dynamic.json",
    directPlayersUrl: "http://185.44.80.32:30140/players.json",
    // Endpoint custom (ressource b2_pingstats, voir fivem-resources/b2_pingstats/README.md)
    // qui donne le ping moyen sans exposer la liste des joueurs. Prioritaire sur players.json.
    pingStatsUrl: "http://185.44.80.32:30140/b2_pingstats/",
    // Endpoint custom (ressource b2_discordcheck) qui vérifie si un joueur a le
    // rôle whitelist Discord requis, avant même de tenter de lancer FiveM.
    discordCheckUrl: "http://185.44.80.32:30140/b2_discordcheck/",
    // Endpoint custom (ressource b2_twitchstatus) qui donne le statut live des streamers Anomia
    twitchStatusUrl: "http://185.44.80.32:30140/b2_twitchstatus/",
    // Repli si les endpoints directs sont injoignables (pare-feu, endpoint privacy, etc.)
    fallbackStatusApiUrl: "https://servers-frontend.fivem.net/api/servers/single/8pqgm4"
  },

  // --- Connexion Discord (pré-vérification avant de lancer FiveM) ---
  // Reste totalement inactif tant que clientId n'est pas rempli - aucun joueur
  // n'est bloqué en attendant.
  //
  // Pour l'activer :
  // 1. Va sur discord.com/developers/applications -> ton appli "Anomia News Bot"
  // 2. Onglet OAuth2 -> copie le "Client ID" (visible aussi sur la page General Information)
  // 3. Toujours dans OAuth2 -> Redirects -> ajoute EXACTEMENT :
  //      http://localhost:47823/oauth-callback.html
  //    (le port doit correspondre pile à discordAuth.redirectPort ci-dessous)
  discordAuth: {
    clientId: "REMPLACE_MOI",
    redirectPort: 47823
  },

  // --- Discord ---
  discord: {
    inviteUrl: "https://discord.gg/ECBhuTMw7n"
  },

  // --- News / Changelog ---
  // Source locale de secours (src/news.json), utilisée si la source distante
  // est injoignable ou vide.
  //
  // Pour lire tes patch-notes automatiquement depuis Discord (voir
  // discord-news-sync/README.md pour la mise en place), remplace remoteUrl
  // par l'URL brute GitHub une fois ton repo créé, exemple :
  // "https://raw.githubusercontent.com/TON_USER/anomia-launcher-news/main/news.json"
  news: {
    remoteUrl: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/news.json",
    localFallback: "src/news.json"
  },

  // --- Assets custom ---
  assets: {
    // URL d'un manifest.json listant les fichiers attendus (voir src/manifest-example.json pour le format)
    manifestUrl: "https://REMPLACE_MOI/anomia-assets/manifest.json",
    // Dossier local de stockage des assets téléchargés (relatif au dossier userData d'Electron)
    localFolder: "assets-cache"
  },

  // --- Galerie média (screenshots partagés par les joueurs) ---
  // Même principe que les news : source locale de secours, remplaçable par une
  // URL distante synchronisée depuis un salon Discord (voir discord-news-sync/README.md).
  media: {
    remoteUrl: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/media.json",
    localFallback: "src/media.json"
  },

  // --- Détection FiveM ---
  fivem: {
    // Au-delà de ce nombre de jours sans mise à jour de FiveM.exe, on affiche un avertissement
    // "peut-être obsolète" (heuristique - FiveM se met à jour lui-même à chaque lancement,
    // donc ce n'est qu'une estimation, pas une vraie lecture de numéro de version).
    staleWarningDays: 30,
    downloadUrl: "https://fivem.net/"
  },

  // --- Onglet admin (lecture seule) ---
  // L'onglet est caché par défaut. Ctrl+Alt+A ouvre une invite de code d'accès.
  // Ne JAMAIS mettre le mot de passe en clair ici : génère son hash avec
  //   node -e "console.log(require('crypto').createHash('sha256').update('TON_MOT_DE_PASSE').digest('hex'))"
  // et colle uniquement le résultat ci-dessous.
  admin: {
    passphraseHash: null, // ex: "3a7bd3e2360a3d..." — tant que c'est null, l'onglet reste inaccessible
    // Optionnel : lien vers ton panel txAdmin, pour un accès rapide (redémarrage/logs se font là-bas,
    // txAdmin a déjà sa propre authentification sécurisée - le launcher ne la duplique pas)
    txAdminUrl: null
  }
};
