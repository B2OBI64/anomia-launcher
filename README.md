# Anomia Launcher

Launcher desktop (Electron) pour le serveur RP Anomia.

## Fonctionnalités incluses

- **Connexion directe** au serveur via `cfx.re/join/8pqgm4` (repli automatique sur `fivem://connect/IP:PORT`)
- **Statut serveur en direct** (joueurs connectés/max, ping moyen) via les endpoints natifs FiveM, avec repli sur l'API CFX. Le ping moyen utilise en priorité la ressource `b2_pingstats` (voir `fivem-resources/b2_pingstats/README.md`) qui l'expose sans jamais divulguer la liste des joueurs
- **Actualités/changelog** — liste locale (`src/news.json`) en secours, ou lues automatiquement depuis un salon Discord (voir `discord-news-sync/README.md`)
- **Streamers Twitch** — cartes avec avatar, statut live/hors ligne et nombre de viewers pour chaque streamer configuré (via `b2_twitchstatus`), clic pour ouvrir la chaîne dans le navigateur
- **Vérification/téléchargement des assets custom** — compare les fichiers locaux à un manifest distant (hash SHA-256) et télécharge ce qui manque ou a changé

## Installation

Prérequis : [Node.js](https://nodejs.org/) 18+.

```bash
cd anomia-launcher
npm install
npm start
```

## Configuration

Tout se règle dans **`config.js`** :

- `server.ip` / `server.port` / `server.cfxCode` — déjà réglés sur `185.44.80.32:30140` / `8pqgm4`
- `twitch.channel` — déjà réglé sur `b2obi64`
- `discord.inviteUrl` — **à compléter** (lien d'invitation Discord)
- `news.remoteUrl` — laisse `null` pour utiliser `src/news.json` en local, ou mets une URL (ex: fichier JSON brut sur GitHub) pour pouvoir mettre à jour les actus sans reconstruire le launcher
- `assets.manifestUrl` — **à compléter** avec l'URL d'un `manifest.json` (format dans `src/manifest-example.json`) hébergé sur ton propre espace (CDN, VPS, GitHub raw, etc.)

## Personnalisation visuelle

- Logo/avatar : dépose une image dans `assets/avatar.png` et remplace le `<div class="avatar-placeholder">` dans `src/index.html` par une balise `<img>`
- Polices Rajdhani : dépose `Rajdhani-SemiBold.ttf` et `Rajdhani-Bold.ttf` dans `assets/fonts/` (déjà référencées dans `style.css`, avec repli propre si absentes)
- Icône de l'app (barre des tâches / installeur) : `assets/icon.ico` (Windows), `assets/icon.icns` (Mac), `assets/icon.png` (Linux) — à fournir avant `npm run dist`

## Générer un installeur

```bash
npm run dist:win     # .exe (NSIS)
npm run dist:mac      # .dmg
npm run dist:linux    # .AppImage
```

Les fichiers sortent dans `dist/`.

## Notes techniques

- Les streamers affichés dans l'onglet Twitch (avatar, live/hors ligne, viewers) sont gérés côté serveur via la ressource `b2_twitchstatus` — voir `fivem-resources/b2_twitchstatus/README.md` pour la mise en place (clé API Twitch) et pour ajouter/retirer un streamer.
- Le statut serveur passe par l'API officielle `servers-frontend.fivem.net` plutôt que par une requête directe à l'IP, pour rester fiable même si le pare-feu OxygenServ bloque les requêtes HTTP directes sur le port de jeu.
- Aucune donnée sensible (mot de passe, token) n'est stockée par le launcher.
