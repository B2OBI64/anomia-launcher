# b2_pingstats

Petite ressource FiveM qui expose le **ping moyen** et la **population par job**
des joueurs connectés, sans jamais exposer leurs pseudos ou identifiants —
juste des nombres agrégés :

```json
{ "avgPing": 42, "players": 12, "jobs": { "Police": {"onDuty":2,"total":10}, "Mécano": {"onDuty":1,"total":5} }, "maintenance": false }
```

C'est ce que le launcher Anomia va lire pour afficher le "Ping moyen" dans le
bandeau télémétrie de l'accueil, la population par job via le bouton dédié,
et un bandeau "Serveur en maintenance" (voir `fivem-resources/b2_maintenance/`)
avant même que le joueur clique "Se connecter". Aucun besoin d'activer
`sv_endpointprivacy false` (qui exposerait la liste complète des joueurs).

## Personnaliser le regroupement des jobs

Ouvre `server/main.lua`, table `JOB_CATEGORIES` en haut du fichier : chaque
ligne associe un nom interne QBCore (celui de `qb-core/shared/jobs.lua`) à une
catégorie affichée dans le launcher. Elle contient déjà tous tes jobs actuels.
Si tu ajoutes un nouveau job côté serveur plus tard, il tombera automatiquement
dans "Autres" tant que tu ne l'ajoutes pas ici :

```lua
local JOB_CATEGORIES = {
    unemployed = "Civils",
    police = "Police",
    ambulance = "EMS",
    bennys = "Mécano",
    -- ... etc, ajoute ta nouvelle ligne ici
}
```

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
   [b2_pingstats] Endpoint prêt sur /b2_pingstats/ (ping moyen + population par job, sans données joueur individuelles)
   ```
   Si tu vois un message d'erreur mentionnant `qb-core`, vérifie que `b2_pingstats` démarre bien APRÈS `qb-core` dans ton `server.cfg` (la ligne `dependency '/qb-core'` du manifest s'en occupe normalement automatiquement).

## Vérifier que ça marche

Ouvre dans un navigateur (ou `curl`) :
```
http://185.44.80.32:30140/b2_pingstats/
```
Tu dois voir un JSON du type `{"avgPing":38,"players":7,"jobs":{"Police":{"onDuty":2,"total":3},"Civils":{"onDuty":4,"total":4}}}`.

Si ça ne répond pas :
- Vérifie que la ressource est bien démarrée (`ensure` dans le `server.cfg` + resmon/txAdmin)
- Vérifie qu'aucun pare-feu ne bloque le port du jeu en HTTP (le même port que celui utilisé pour `dynamic.json`/`info.json`, donc s'ils fonctionnent déjà, ça doit passer aussi)

## Côté launcher

Le launcher est déjà configuré pour appeler cet endpoint en priorité pour le
ping (voir `config.js` → `server.pingStatsUrl`). Si la ressource n'est pas
installée, il retombe simplement sur "Indisponible" comme avant — rien à
casser si tu ne l'installes pas tout de suite.
