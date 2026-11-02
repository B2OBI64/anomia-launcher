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
