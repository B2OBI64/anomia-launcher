# b2_pingstats

Petite ressource FiveM qui expose le **ping moyen** des joueurs connectés,
sans jamais exposer leurs pseudos ou identifiants — juste deux nombres :

```json
{ "avgPing": 42, "players": 12 }
```

C'est ce que le launcher Anomia va lire pour afficher le "Ping moyen" dans
le bandeau télémétrie de l'accueil, sans avoir besoin d'activer
`sv_endpointprivacy false` (qui exposerait la liste complète des joueurs).

## Installation côté serveur

1. Copie le dossier `b2_pingstats` dans ton dossier `resources/` (ex:
   `resources/[b2]/b2_pingstats/`, selon ta convention habituelle)
2. Dans ton `server.cfg`, ajoute :
   ```
   ensure b2_pingstats
   ```
3. Redémarre le serveur, ou lance `refresh` puis `start b2_pingstats` depuis
   la console/txAdmin
4. Vérifie dans la console que tu vois le message :
   ```
   [b2_pingstats] Endpoint prêt sur /b2_pingstats/ (ping moyen, sans données joueur individuelles)
   ```

## Vérifier que ça marche

Ouvre dans un navigateur (ou `curl`) :
```
http://185.44.80.32:30140/b2_pingstats/
```
Tu dois voir un JSON du type `{"avgPing":38,"players":7}`.

Si ça ne répond pas :
- Vérifie que la ressource est bien démarrée (`ensure` dans le `server.cfg` + resmon/txAdmin)
- Vérifie qu'aucun pare-feu ne bloque le port du jeu en HTTP (le même port que celui utilisé pour `dynamic.json`/`info.json`, donc s'ils fonctionnent déjà, ça doit passer aussi)

## Côté launcher

Le launcher est déjà configuré pour appeler cet endpoint en priorité pour le
ping (voir `config.js` → `server.pingStatsUrl`). Si la ressource n'est pas
installée, il retombe simplement sur "Indisponible" comme avant — rien à
casser si tu ne l'installes pas tout de suite.
