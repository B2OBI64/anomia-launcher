# b2_twitchstatus

Vérifie quels streamers de ta liste sont actuellement en live sur Twitch,
avec leur avatar et leur nombre de viewers — pour l'onglet Twitch du
launcher. Les clés API Twitch restent 100% côté serveur, jamais exposées
aux joueurs.

## 1. Créer une application Twitch (une seule fois)

1. Va sur https://dev.twitch.tv/console/apps (connecte-toi avec ton compte Twitch)
2. **Register Your Application**
   - Name : `Anomia Twitch Status` (ou ce que tu veux, doit être unique sur Twitch)
   - OAuth Redirect URLs : `http://localhost` (obligatoire pour valider le formulaire, pas utilisé ici)
   - Category : `Application Integration`
3. **Create**, puis ouvre l'appli créée
4. Copie le **Client ID** affiché
5. Clique **New Secret** pour générer le **Client Secret**, copie-le aussi
   (il ne sera plus jamais affiché en clair après, garde-le précieusement)

## 2. Installation côté serveur

1. Copie le dossier `b2_twitchstatus` dans tes `resources/`
2. Dans ton `server.cfg`, ajoute :
   ```
   setr anomia_twitch_client_id "TON_CLIENT_ID"
   setr anomia_twitch_client_secret "TON_CLIENT_SECRET"
   setr anomia_twitch_channels "b2obi64,toto_le_byr,romaintititox17"
   ensure b2_twitchstatus
   ```
   (la liste `anomia_twitch_channels` est séparée par des virgules, sans
   espace obligatoire, sans le `twitch.tv/` — juste le pseudo)
3. Redémarre le serveur, ou `refresh` + `start b2_twitchstatus`

## Ajouter/retirer un streamer plus tard

Modifie juste la ligne `anomia_twitch_channels` dans `server.cfg`, puis
`restart b2_twitchstatus` — pas besoin de toucher au launcher.

## Vérifier que ça marche

```
http://185.44.80.32:30140/b2_twitchstatus/
```
Tu dois voir un tableau JSON avec un objet par streamer configuré.

## Limites

- Les résultats sont mis en cache 60 secondes côté serveur pour ne pas
  spammer l'API Twitch — normal si le statut met jusqu'à 1 minute à se
  mettre à jour après le début d'un live
- Si un pseudo Twitch est mal orthographié dans `anomia_twitch_channels`,
  ce streamer apparaîtra juste comme "hors ligne" en permanence (Twitch ne
  renvoie rien pour un pseudo qui n'existe pas)
