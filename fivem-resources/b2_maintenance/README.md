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

## Bascule depuis le launcher (onglet Admin)

Pour pouvoir activer/désactiver la maintenance directement depuis le
launcher (sans passer par la console), ajoute dans `server.cfg` :
```
setr anomia_admin_passphrase "LE_MEME_CODE_QUE_TU_AS_HASHE_DANS_CONFIG_JS_DU_LAUNCHER"
```
C'est le même code en clair que celui dont tu as généré le hash pour
`config.js → admin.passphraseHash`. Il reste 100% côté serveur, jamais
exposé aux joueurs.

L'état est stocké de façon persistante (via le système `Kvp` de FiveM) : il
reste actif même après un **redémarrage complet du serveur**, pas juste un
restart de la ressource. Pas besoin d'ajouter quoi que ce soit dans
`server.cfg` pour ça — active/désactive uniquement via la commande
`/maintenance on|off`, et ça reste correct quoi qu'il arrive au serveur.

## Comment le launcher le voit

`b2_pingstats` lit ce même convar et l'expose dans son endpoint public
(`{"maintenance": true/false, ...}`). Pas besoin de configurer quoi que ce
soit côté launcher, c'est déjà branché — voir `fivem-resources/b2_pingstats/README.md`.
