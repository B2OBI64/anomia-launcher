# Mise à jour 1.7.0

## Launcher
1. Remplace le dossier du projet par ce zip (la version est déjà 1.7.0, au-dessus de ta 1.6.9).
2. `npm run dist:win:publish` (avec GH_TOKEN).
3. Pour les prochaines versions : ajoute une entrée en haut de `src/changelog.json` (version, date, title, items) et mets à jour `release-notes.md`. Le launcher affiche « Quoi de neuf » automatiquement après la mise à jour.

## Serveur FiveM (optionnel, pour activer les nouveautés liées au serveur)
- **b2_stats** (nouveau) : copie `fivem-resources/b2_stats`, ajoute `ensure b2_stats` dans server.cfg. Convars facultatifs : `anomia_stats_record_seed`, `anomia_stats_record_date_seed` (pour ton record historique).
- **b2_twitchstatus** : remplace et `restart b2_twitchstatus` (route /videos pour « Revoir le dernier stream »).
- **b2_staffpanel** : remplace et restart (route /health, « Santé du serveur » réservée aux admins).
- **b2_achievements** : restart (temps de jeu).

## Codes secrets (thème Or)
`bobi64` ou `kannibal` dans Options > Code secret, ou code Konami (↑↑↓↓←→←→ B A) sur le launcher.

## Discord (IDs fournis)
- Discord principal « Kannibal Team » : id `445112343064477696`, invitation https://discord.gg/nABGrX9Hu2 (déjà dans le launcher).
- Rôle requis pour se connecter à Anomia : `1434849042319278231`. Côté serveur FiveM (server.cfg) :
  `setr anomia_discord_guild_id "ID_DU_DISCORD_QUI_CONTIENT_CE_ROLE"` et `setr anomia_discord_role_id "1434849042319278231"`
- Rôle de connexion Minecraft : `1370879305097154692` (enregistré dans config.js, à utiliser quand le serveur Minecraft vérifiera l'accès).

## Accès admin par rôle Discord (IMPORTANT)
- Le rôle `1112002757004632215` du Discord Kannibal Team (`445112343064477696`) donne l'accès admin automatiquement dès que la personne est connectée avec Discord dans le launcher. Sans ce rôle : aucun accès admin. Le code admin n'existe plus (ni dans le launcher, ni côté serveur pour le launcher).
- Le modo garde un code : `setr anomia_mod_passphrase "CODE_MODO"`.
- Le serveur FiveM vérifie le rôle (b2_staffpanel remplacé, puis `restart b2_staffpanel`). Il faut :
  1. `setr anomia_discord_bot_token "..."` (déjà là pour b2_discordcheck)
  2. le bot présent sur le Discord Kannibal Team (droit de lire les membres)
  3. facultatif : `set anomia_staff_guild_id` / `set anomia_staff_role_id` (valeurs par défaut = celles ci-dessus)
- Le serveur Anomia doit être allumé pour que l'onglet Admin s'ouvre (la vérification passe par lui). Tu peux le laisser allumé en `/maintenance on`.
- La maintenance depuis le launcher passe maintenant par b2_staffpanel (b2_maintenance doit rester installé : la commande /maintenance est utilisée).
- Les gens déjà connectés à Discord dans le launcher doivent se reconnecter une fois (le launcher garde le jeton chiffré pour prouver son identité).

## Si l'onglet Admin n'apparaît pas
Clique sur ton avatar (profil) : une ligne « ⚠ Staff : … » dit pourquoi. Ctrl+Alt+A l'affiche aussi. Causes possibles : jamais reconnecté à Discord depuis la 1.7.0 (cas le plus courant), serveur éteint, `b2_staffpanel` pas remplacé/redémarré, `anomia_discord_bot_token` absent, bot absent de Kannibal Team ou intent « Server Members » désactivé (portail développeur Discord > Bot), ou rôle manquant. La console du serveur affiche aussi la cause.

## 1.7.4
- KannibAventure : adresse `185.44.80.33:25615` dans config.js (`serverAddress` / `serverPort`). L'onglet Admin du serveur interroge le serveur Minecraft directement (protocole public), sans plugin.
- Easter eggs (secrets, à ne pas révéler) : code `creeper` (explosion), combinaison ↑ ↓ ← → ↑ ↓ ← → (thème Anomia), 24 décembre (thème Noël avec neige, débloqué à l'ouverture du launcher ce jour-là), code `cube` (thème Cubique), 10 clics sur le logo B2 en haut à gauche (mode arc-en-ciel), lancement entre 3 h et 5 h du matin (message). Déjà existants : `admin` (Matrix), `bobi64`/`kannibal` et Konami (Or).

## 1.7.6
- Thème Noël (neige) débloqué le 24 décembre ; le thème Cubique passe sur le code secret `cube`.
- Admin en service : bouton Se connecter actif même en maintenance / serveur en pause, et « Rejoindre (admin) » sur KannibAventure (copie l'adresse 185.44.80.33:25615). Côté serveur FiveM, b2_maintenance laisse déjà passer les ACE admin ; pour la whitelist Discord, l'admin doit avoir le rôle requis côté b2_discordcheck (ou ajoute-le à son compte).
- KannibAventure : « Se connecter » crée/met à jour un profil « KannibAventure » (version `minecraftVersion` de config.js, 1.21.1), l'ajoute en tête de la liste Multijoueur (servers.dat, sauvegarde .b2bak) puis ouvre le Minecraft Launcher officiel. Quand tu auras choisi le mod loader, renseigne `minecraftVersionId` dans config.js (ex. fabric-loader-x.y.z-1.21.1). La connexion automatique au serveur n'est pas possible avec le launcher officiel (voir message).

## Connexion directe KannibAventure (admins, bêta)
- Avant de compiler : lance `npm install` une fois (nouvelles dépendances `minecraft-launcher-core` et `msmc`).
- Premier clic sur « Se connecter (admin) » : fenêtre de connexion Microsoft (compte Minecraft Java), puis le jeton est mémorisé chiffré.
- Nécessite Java 25 (installé par le Minecraft Launcher officiel ou à part) et NeoForge 26.1.2.122 déjà installé sur le PC (version « neoforge-26.1.2.122 »). Sinon repli automatique sur l'ancien mode (profil + serveur dans la liste).
- Le téléchargement du jeu au premier lancement peut prendre quelques minutes. Les mods doivent être présents dans le dossier mods.
- Thème Noël v3 (24 décembre) : gris clair, guirlande lumineuse, bordures bonbon, bonnet, neige, boutons rouges, angles carrés.
