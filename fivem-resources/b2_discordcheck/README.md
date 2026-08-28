# b2_discordcheck

Vérifie si un joueur a le rôle whitelist Discord requis, **avant** que le
launcher tente de lancer FiveM. C'est une vérification préalable côté
launcher — ton check txAdmin existant reste actif et fait foi de toute façon,
ceci n'est qu'un message d'erreur plus rapide et plus clair pour le joueur.

## Installation

1. Copie le dossier `b2_discordcheck` dans tes `resources/`
2. Dans ton `server.cfg`, ajoute **ces 3 lignes** (remplace par tes vraies valeurs) :
   ```
   setr anomia_discord_bot_token "TON_TOKEN_BOT_DISCORD"
   setr anomia_discord_guild_id "ID_DE_TON_SERVEUR_DISCORD"
   setr anomia_discord_role_id "ID_DU_ROLE_WHITELIST"
   ```
   **Important** : utilise le même token que ton bot "Anomia News Bot"
   (celui déjà utilisé pour les patch-notes). Il te faut juste ajouter une
   permission côté serveur Discord : le bot doit pouvoir lire les membres
   du serveur (`Server Members Intent`, à activer dans le Developer Portal
   Discord, onglet Bot, section Privileged Gateway Intents — normalement déjà
   fait si txAdmin utilise le même bot).
3. Ajoute :
   ```
   ensure b2_discordcheck
   ```
4. Redémarre le serveur, ou `refresh` + `start b2_discordcheck`

## Récupérer les IDs

- **Mode développeur Discord** : Réglages utilisateur → Avancé → active
- **ID du serveur** : clic droit sur le nom du serveur → Copier l'ID
- **ID du rôle** : Réglages du serveur → Rôles → clic droit sur le rôle whitelist → Copier l'ID

## Vérifier que ça marche

```
http://185.44.80.32:30140/b2_discordcheck/?discordId=TON_ID_DISCORD
```

Réponse attendue si t'as le rôle : `{"allowed":true}`
Sinon : `{"allowed":false,"reason":"missing_role"}`

## Sécurité

Le token du bot ne quitte **jamais** ce fichier `server.cfg` — il reste
100% côté serveur. Le launcher n'envoie que l'ID Discord du joueur (une
information publique, pas un secret) et reçoit juste `true`/`false` en retour.
