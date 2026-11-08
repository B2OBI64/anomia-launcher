// ============================================================
// B2 LAUNCHER - CONFIGURATION
// Modifie uniquement ce fichier pour adapter le launcher.
// ============================================================

module.exports = {
  // ============================================================
  // B2 LAUNCHER : liste des serveurs de jeu affichés en haut du launcher.
  // Chaque serveur a son logo, sa couleur, son statut et ses onglets.
  //   status : "online" (jouable) | "paused" (en pause, bouton grisé) | "soon" (teaser)
  //   connectLabel : texte du bouton grisé (ex. "2027")
  //   tabs : onglets affichés pour ce serveur (view = id de la section dans index.html)
  // ============================================================
  servers: [
    {
      id: "anomia",
      name: "Anomia RP",
      game: "GTA V · FiveM",
      logo: "../assets/anomia-logo.png",
      color: "#2dd4bf",
      status: "paused",
      connectLabel: "2027",
      discordInvite: "https://discord.gg/ECBhuTMw7n",
      requiredRoleId: "1434849042319278231",
      tabs: [
        { view: "home", label: "Accueil" },
        { view: "news", label: "Actualités" },
        { view: "media", label: "Média" },
        { view: "staff", label: "Staff" },
        { view: "achievements", label: "Succès" },
        { view: "rules", label: "Règlement" },
        { view: "faq", label: "F.A.Q" },
        { view: "map", label: "Carte" },
        { view: "assets", label: "Fichiers" }
      ]
    },
    {
      id: "kannibaventure",
      name: "KannibAventure",
      game: "Minecraft · Java (mods + plugins)",
      logo: "../assets/kannibaventure.png",
      color: "#a855f7",
      status: "soon",
      connectLabel: "Décembre",
      // Minuteur d'ouverture : désactivé pour l'instant (dates secrètes). Format quand on le lancera : opening: { public: "AAAA-MM-JJTHH:MM:SS+01:00", sub: "AAAA-MM-JJTHH:MM:SS+01:00" }
      opening: null,
      // Discord du serveur Minecraft (le rôle d'accès sera renseigné plus tard) :
      discordInvite: "https://discord.gg/fdSjJPRJy4",
      discordGuildId: "1357757210272469212",
      requiredRoleId: "1370879305097154692",
      serverAddress: "185.44.80.33",
      serverPort: 25615,
      minecraftVersion: "26.1.2",
      neoForgeVersion: "26.1.2.122",
      // Hébergement des mods : release GitHub d'un dépôt séparé (contient kb-modpack.json + les .jar)
      modpack: { owner: "B2OBI64", repo: "kannibaventure-mods", tag: "mods" },
      // Quand le mod loader sera choisi, mets ici l'id de version installé (ex. "fabric-loader-0.16.9-1.21.1") :
      minecraftVersionId: "neoforge-26.1.2.122",
      tabs: [
        { view: "kb-home", label: "Accueil" },
        { view: "kb-devlog", label: "Journal de dev" },
        { view: "kb-media", label: "Média" },
        { view: "kb-map", label: "Carte" },
        { view: "kb-files", label: "Fichiers" },
        { view: "kb-settings", label: "Paramètres" },
        { view: "kb-rules", label: "Règlement" },
        { view: "kb-faq", label: "FAQ" }
      ]
    }
  ],

  // --- Accueil global : slider de présentation des serveurs ---
  hub: {
    slides: [
      {
        serverId: "kannibaventure",
        tag: "NOUVEAU SERVEUR MINECRAFT",
        title: "KannibAventure",
        text: "Ouverture prévue en décembre. Suis le journal de développement pour ne rien manquer.",
        button: "Découvrir"
      },
      {
        serverId: "anomia",
        tag: "SERVEUR RP · GTA V",
        title: "Anomia RP",
        text: "Le serveur fait une pause et revient en 2027. Tes succès et le règlement restent consultables.",
        button: "Voir Anomia"
      }
    ],
    slideIntervalMs: 6500
  },

  // --- Discords affichés sur l'accueil (membres en ligne + bouton rejoindre) ---
  // invite = code ou lien d'invitation. Laisse null tant que tu n'as pas le lien : la carte reste masquée.
  discordCommunities: [
    { name: "Kannibal Team", invite: "https://discord.gg/nABGrX9Hu2", color: "#8b5cf6", logo: "../assets/logo.png", main: true }, // Discord principal (Kannibal Team)
    { name: "Anomia RP", invite: "https://discord.gg/ECBhuTMw7n", color: "#2dd4bf", logo: "../assets/anomia-logo.png" },
    { name: "KannibAventure", invite: "https://discord.gg/fdSjJPRJy4", color: "#a855f7", logo: "../assets/kannibaventure.png" }
  ],

  // --- Chaîne Twitch affichée sur l'accueil du B2 Launcher ---
  twitch: {
    channel: "b2obi64",
    displayName: "B2OBI64",
    url: "https://twitch.tv/b2obi64",
    discordInvite: "https://discord.gg/nABGrX9Hu2", // Discord principal (Kannibal Team)
    // Affichés même si le statut live n'est pas joignable (ex. serveur Anomia arrêté)
    fallbackStreamers: [
      { channel: "b2obi64", displayName: "B2OBI64" },
      { channel: "toto_le_byr", displayName: "toto_le_byr" },
      { channel: "romaintititox", displayName: "romaintititox" }
    ]
  },

  // --- Contenu des pages KannibAventure (modifiable sur GitHub sans republier) ---
  kannibaventure: {
    remoteBase: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/src/",
    files: { devlog: "kb-devlog.json", faq: "kb-faq.json", anomiafaq: "anomia-faq.json", rules: "kb-rules.json", mods: "kb-mods.json" }
  },

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
    staffPanelUrl: "http://185.44.80.32:30140/b2_staffpanel/",
    twitchVideosUrl: "http://185.44.80.32:30140/b2_twitchstatus/videos",
    statsUrl: "http://185.44.80.32:30140/b2_stats/",
    twitchClipsUrl: "http://185.44.80.32:30140/b2_twitchstatus/clips",
    // Endpoint réservé aux admins (protégé par le code d'accès) qui active/désactive
    // la maintenance à distance depuis le launcher, sans passer par la console serveur.
    maintenanceToggleUrl: "http://185.44.80.32:30140/b2_maintenance/toggle",
    // Endpoint pour poser un point GPS chez un joueur actuellement connecté en jeu, depuis la carte du launcher
    gpsWaypointUrl: "http://185.44.80.32:30140/b2_gpswaypoint/",
    // Endpoint custom (ressource b2_achievements) qui vérifie les succès d'un joueur via son ID Discord
    achievementsUrl: "http://185.44.80.32:30140/b2_achievements/",
    // Endpoint custom (ressource b2_crashreport) qui relaie les rapports de crash
    // FiveM vers un salon Discord, sans jamais exposer le webhook au launcher.
    crashReportUrl: "http://185.44.80.32:30140/b2_crashreport/",
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
  // Lancement direct de Minecraft (KannibAventure) : application Azure facultative (sinon msmc utilise son identifiant par défaut)
  microsoftAuth: { clientId: null, redirect: null },

  discordAuth: {
    clientId: "1534918391503257721",
    redirectPort: 47823
  },

  // --- Discord ---
  discord: {
    inviteUrl: "https://discord.gg/nABGrX9Hu2",
    // Discord principal "Kannibal Team" : id du serveur (les rôles staff/admin viennent de là)
    mainGuildId: "445112343064477696",
    anomiaGuildId: "1407312954616975360",
    anomiaModRoleId: "1434845539094233098",
    // Rôles requis (vérifiés côté serveur FiveM par b2_discordcheck via les convars, voir GUIDE)
    anomiaRequiredRoleId: "1434849042319278231",
    minecraftRequiredRoleId: "1370879305097154692"
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
    localFallback: "src/media.json",
    // Médias KannibAventure (salon Discord séparé, voir discord-news-sync/README.md)
    kbRemoteUrl: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/kb-media.json",
    kbLocalFallback: "src/kb-media.json"
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
    // Optionnel : lien vers ton panel txAdmin, pour un accès rapide (redémarrage/logs se font là-bas,
    // txAdmin a déjà sa propre authentification sécurisée - le launcher ne la duplique pas)
    txAdminUrl: null
  },

  // --- Page Staff (présentation de l'équipe, visible par tous) ---
  // Même principe que les news/media : source locale de secours, remplaçable
  // par une URL distante. Peut être éditée directement sur GitHub, ou
  // synchronisée depuis Discord plus tard si tu veux (même mécanique que
  // discord-news-sync/).
  staff: {
    remoteUrl: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/staff.json",
    localFallback: "src/staff.json"
  },

  // --- Succès (nécessite d'être connecté avec Discord, voir discordAuth) ---
  // rarity : bronze | silver | gold | secret (violet, visible seulement une fois débloqué)
  // Textes affichés dans le launcher pour chaque succès - modifiables ici
  // sans toucher au reste du code. La logique de calcul (vrai/faux) vit côté
  // serveur dans b2_achievements/server/main.lua.
  achievements: {
    list: [
      { key: "firstCharacter", rarity: "bronze", label: "Premiers pas", description: "Créer ton premier personnage" },
      { key: "tutorialDone", rarity: "bronze", label: "Prêt à jouer", description: "Finir le tutoriel du serveur" },
      { key: "hasJob", rarity: "bronze", label: "Vie active", description: "Avoir ton premier métier" },
      { key: "hasVehicle", rarity: "bronze", label: "Sur la route", description: "Récupérer ta première voiture" },
      { key: "hasHouse", rarity: "silver", label: "Chez soi", description: "Acheter ta première maison" },
      { key: "jobPromotion", rarity: "silver", label: "Ambitieux", description: "Monter de grade dans ton entreprise (privée uniquement)" },
      { key: "money30k", rarity: "bronze", label: "Petit pécule", description: "Avoir récolté 30 000 $" },
      { key: "money100k", rarity: "silver", label: "Bien loti", description: "Avoir récolté 100 000 $" },
      { key: "drivingDistance100", rarity: "bronze", label: "Sur la route", description: "Parcourir 100 km en voiture" },
      { key: "drivingDistance500", rarity: "silver", label: "Grand routier", description: "Parcourir 500 km en voiture" },
      { key: "drivingDistance1000", rarity: "gold", label: "Globe-trotteur", description: "Parcourir 1000 km en voiture" },
      { key: "playtime1h", rarity: "bronze", label: "Premiers instants", description: "Avoir joué 1 heure" },
      { key: "playtime10h", rarity: "silver", label: "Habitué", description: "Avoir joué 10 heures" },
      { key: "playtime100h", rarity: "gold", label: "Pilier", description: "Avoir joué 100 heures" },
      { key: "playtime500h", rarity: "gold", label: "Vétéran", description: "Avoir joué 500 heures" },
      { key: "customizedVehicle", rarity: "secret", label: "Sur mesure", description: "Personnaliser ta voiture", secret: true },
      { key: "vehicleCollector3", rarity: "silver", label: "Collectionneur", description: "Posséder 3 véhicules ou plus" },
      { key: "vehicleCollector5", rarity: "gold", label: "Collectionneur confirmé", description: "Posséder 5 véhicules ou plus" },
      { key: "houseCollector2", rarity: "secret", label: "Magnat de l'immobilier", description: "Posséder 2 logements ou plus", secret: true },
      { key: "millionaire", rarity: "gold", label: "Millionnaire", description: "Avoir 1 000 000 $ cumulés" },
      { key: "newLife", rarity: "secret", label: "Nouvelle vie", description: "Créer un 2ème personnage", secret: true },
      { key: "licenceMoto", rarity: "silver", label: "Deux-roues", description: "Obtenir le permis moto" },
      { key: "licenceCamion", rarity: "silver", label: "Poids lourd", description: "Obtenir le permis camion" },
      { key: "licenceBateau", rarity: "silver", label: "Marin d'eau douce", description: "Obtenir le permis bateau" },
      { key: "licenceAvion", rarity: "gold", label: "Pilote", description: "Obtenir le permis avion" },
      { key: "licenceHelicoptere", rarity: "gold", label: "Aviateur", description: "Obtenir le permis hélicoptère" },
      { key: "firstKO", rarity: "bronze", label: "Premier K.O.", description: "Se faire mettre K.O. pour la première fois" },
      { key: "firstComa", rarity: "bronze", label: "Entre la vie et la mort", description: "Tomber dans le coma pour la première fois" },
      { key: "firstInvoicePaid", rarity: "bronze", label: "Bon contribuable", description: "Payer sa première facture" },
      { key: "playtime1000h", rarity: "gold", label: "Légende vivante", description: "Avoir joué 1 000 heures" },
      { key: "drivingDistance10000", rarity: "gold", label: "Tour du monde", description: "Parcourir 10 000 km en voiture" },
      { key: "loginStreak30", rarity: "gold", label: "Fidèle au poste", description: "Te connecter 30 jours d'affilée" },
      { key: "serverBirthday", rarity: "secret", label: "Joyeux anniversaire !", description: "Te connecter le jour de l'anniversaire du serveur", secret: true }
    ],
    // Succès propres au launcher (stockés en local, aucun serveur requis).
    // Même format que les succès Anomia. "exclusiveTitle" = titre réservé.
    launcher: {
      eggsRequired: 6, // nombre d'easter eggs à trouver pour « Chercheur de secrets »
      eggs: ["konami", "logo", "version", "kannibal", "anomia", "creeper", "noctambule"],
      hunters: [{ key: "hunter3", n: 3 }, { key: "hunter10", n: 10 }, { key: "hunter25", n: 25 }],
      list: [
        { key: "secretSeeker", rarity: "secret", label: "Chercheur de secrets", description: "Trouver des easter eggs cachés dans le launcher", secret: true },
        { key: "tourDone", rarity: "bronze", label: "Visite guidée", description: "Terminer la visite du launcher" },
        { key: "themeSwitch", rarity: "bronze", label: "Coup de peinture", description: "Changer le thème du launcher" },
        { key: "error404", rarity: "secret", label: "Erreur 404", description: "Tu n'es pas admin", secret: true },
        { key: "hunter3", rarity: "bronze", label: "Chasseur de succès", description: "Débloquer 3 succès" },
        { key: "hunter10", rarity: "silver", label: "Chasseur de succès confirmé", description: "Débloquer 10 succès" },
        { key: "hunter25", rarity: "gold", label: "Chasseur de succès d'élite", description: "Débloquer 25 succès" },
        { key: "polyvalent", rarity: "secret", label: "Polyvalent", description: "Jouer au moins une fois sur chacun des serveurs proposés", secret: true },
        { key: "viewer", rarity: "gold", label: "Viewers", description: "Regarder un live depuis le launcher" }
      ],
      exclusiveTitles: ["secretSeeker"]
    },
    // Succès KannibAventure : heures de jeu (launcher + serveur) et avancements Minecraft.
    // « adv » = identifiant d'avancement (natif "minecraft:..." ou d'un mod "modid:...") ; il suffit
    // d'ajouter une ligne pour un nouveau succès lié à un mod. Données fournies par tools/kb-export.
    kannibaventure: {
      list: [
        { key: "kbHours1", rarity: "bronze", label: "Premiers pas", description: "Jouer 1 heure sur KannibAventure", hours: 1 },
        { key: "kbHours10", rarity: "bronze", label: "Aventurier", description: "Jouer 10 heures sur KannibAventure", hours: 10 },
        { key: "kbHours25", rarity: "silver", label: "Baroudeur", description: "Jouer 25 heures sur KannibAventure", hours: 25 },
        { key: "kbHours50", rarity: "silver", label: "Pilier du serveur", description: "Jouer 50 heures sur KannibAventure", hours: 50 },
        { key: "kbHours100", rarity: "gold", label: "Vétéran", description: "Jouer 100 heures sur KannibAventure", hours: 100 },
        { key: "kbHours250", rarity: "gold", label: "Légende de KannibAventure", description: "Jouer 250 heures sur KannibAventure", hours: 250 },
        { key: "kbAdvNether", rarity: "bronze", label: "Bienvenue en enfer", description: "Entrer dans le Nether", adv: "minecraft:story/enter_the_nether" },
        { key: "kbAdvDiamond", rarity: "bronze", label: "Des diamants !", description: "Miner un diamant", adv: "minecraft:story/mine_diamond" },
        { key: "kbAdvTrade", rarity: "bronze", label: "Marchand", description: "Faire un échange avec un villageois", adv: "minecraft:adventure/trade" },
        { key: "kbAdvBeacon", rarity: "silver", label: "Phare de la région", description: "Créer une balise", adv: "minecraft:nether/create_beacon" },
        { key: "kbAdvEnd", rarity: "silver", label: "La fin ?", description: "Entrer dans l'End", adv: "minecraft:story/enter_the_end" },
        { key: "kbAdvElytra", rarity: "gold", label: "Le ciel est la limite", description: "Trouver des élytres", adv: "minecraft:end/elytra" },
        { key: "kbAdvWither", rarity: "gold", label: "Invocateur", description: "Invoquer le Wither", adv: "minecraft:nether/summon_wither" },
        { key: "kbAdvDragon", rarity: "gold", label: "Tueur de dragon", description: "Vaincre l'Ender Dragon", adv: "minecraft:end/kill_dragon" },
        { key: "kbAdvHunter", rarity: "gold", label: "Chasseur de monstres", description: "Éliminer un exemplaire de chaque monstre hostile", adv: "minecraft:adventure/kill_all_mobs" },
        { key: "kbAdvCount10", rarity: "bronze", label: "Historien", description: "Obtenir 10 avancements Minecraft", advCount: 10 },
        { key: "kbAdvCount30", rarity: "silver", label: "Érudit", description: "Obtenir 30 avancements Minecraft", advCount: 30 },
        { key: "kbAdvCount60", rarity: "gold", label: "Encyclopédiste", description: "Obtenir 60 avancements Minecraft", advCount: 60 }
        // Succès liés aux mods : ajouter ici, ex.
        // { key: "kbModXxx", rarity: "silver", label: "…", description: "…", adv: "modid:chemin/de_l_avancement" },
      ]
    },
    // Ordre du plus prestigieux au moins prestigieux - le premier succès
    // débloqué de cette liste est affiché comme "titre" à côté du profil.
    titlePriority: [
      "playtime500h", "millionaire", "vehicleCollector5", "houseCollector2",
      "playtime100h", "money100k", "vehicleCollector3", "drivingDistance1000",
      "playtime10h", "money30k", "jobPromotion", "hasHouse", "hasVehicle",
      "hasJob", "tutorialDone", "playtime1h", "firstCharacter"
    ]
  },

  // --- Règlement du serveur (visible par tous) ---
  // Même principe que les news/media/staff : source locale de secours,
  // remplaçable par une URL distante éditable sans reconstruire le launcher.
  rules: {
    remoteUrl: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/rules.json",
    localFallback: "src/rules.json"
  },

  // --- Carte interactive ---
  // Les points d'intérêt s'ajoutent petit à petit dans map-points.json, sans
  // jamais avoir à reconstruire le launcher. Format d'un point :
  //   {
  //     "x": 45.2, "y": 60.8,          -> position sur L'IMAGE (pourcentage 0-100), pour l'affichage
  //     "gameX": -1037.5, "gameY": -2738.6, -> vraies coordonnées EN JEU, pour le bouton "Envoyer sur le GPS"
  //     "label": "Nom du lieu",
  //     "description": "...",
  //     "category": "boutique"          -> optionnel, sert aux filtres (ex: boutique/spawn/event)
  //   }
  // Pour gameX/gameY : utilise une commande en jeu qui affiche tes coordonnées
  // actuelles (souvent /coords sur les serveurs QBCore), place-toi à l'endroit
  // exact, note les valeurs. Un point sans gameX/gameY reste affichable sur la
  // carte mais n'aura simplement pas le bouton GPS.
  map: {
    remoteUrl: "https://raw.githubusercontent.com/B2OBI64/anomia-launcher/main/map-points.json",
    localFallback: "src/map-points.json"
  }
};
