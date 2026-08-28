# b2_maintenance

Bloque la connexion des joueurs non-admin quand le serveur est en maintenance,
et prévient le launcher Anomia (via `b2_pingstats`) pour qu'il l'affiche avant
même que le joueur clique "Se connecter".

## Installation

1. Copie le dossier `b2_maintenance` dans tes `resources/`
2. Dans ton `server.cfg`, ajoute (après `qb-core`, avant les jobs/scripts qui en dépendent) :
   ```
   ensure b2_maintenance
   ```
3. Redémarre le serveur, ou `refresh` + `start b2_maintenance`

## Utilisation

Depuis la console serveur, ou en jeu si tu as la permission ACE `admin` :

```
/maintenance on     -- active le mode maintenance (bloque les non-admins)
/maintenance off    -- désactive le mode maintenance
/maintenance        -- affiche l'état actuel
```

L'état est stocké dans un convar (`anomia_maintenance`), donc il persiste tant
que le serveur tourne, même si tu redémarres la ressource. Il repasse à
`false` par défaut si tu redémarres le serveur entier — si tu veux qu'il reste
activé après un reboot complet, ajoute dans ton `server.cfg` :
```
setr anomia_maintenance true
```
et retire/mets `false` quand tu veux rouvrir.

## Comment le launcher le voit

`b2_pingstats` lit ce même convar et l'expose dans son endpoint public
(`{"maintenance": true/false, ...}`). Pas besoin de configurer quoi que ce
soit côté launcher, c'est déjà branché — voir `fivem-resources/b2_pingstats/README.md`.
