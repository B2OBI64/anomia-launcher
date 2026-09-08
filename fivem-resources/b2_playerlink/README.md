# b2_playerlink

Construit automatiquement le lien "ID Discord ↔ citizenid" à chaque
connexion d'un joueur, dans une nouvelle table indépendante. Sert de base
au système de succès (voir `b2_achievements`).

## Sécurité pour tes joueurs — à lire avant d'installer

Cette ressource **ne modifie jamais** tes tables existantes (`players`,
`player_vehicles`, `player_houses`, etc.). Elle **lit uniquement** le
`citizenid` déjà présent dans QBCore, et l'écrit dans **une toute nouvelle
table** (`anomia_discord_links`) qu'elle crée elle-même au premier
démarrage. Aucune progression, aucun personnage, aucun argent, aucun
véhicule ou logement n'est touché de quelque façon que ce soit.

## Installation

1. Copie le dossier `b2_playerlink` dans tes `resources/`
2. Dans ton `server.cfg`, ajoute (après `qb-core` ET après `oxmysql`) :
   ```
   ensure b2_playerlink
   ```
3. `refresh` + `start b2_playerlink`

La table `anomia_discord_links` se crée toute seule au démarrage.

## Comment ça se peuple

Automatiquement, à chaque connexion normale d'un joueur (dès que son
personnage est chargé) — aucune action de leur part. Un joueur qui ne
s'est jamais reconnecté depuis l'installation de cette ressource n'aura
son lien créé qu'à sa **prochaine** connexion, pas de rattrapage rétroactif
pour les sessions passées (normal, l'info n'existait pas avant).
