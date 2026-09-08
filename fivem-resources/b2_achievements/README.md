# b2_achievements

Vérifie si un joueur a un métier, possède un véhicule, ou possède un
logement — à partir de son ID Discord, même s'il n'est pas connecté au
serveur au moment où le launcher vérifie. Uniquement de la **lecture**,
aucune table QBCore n'est jamais modifiée.

## Prérequis

**`b2_playerlink` doit être installée et avoir tourné au moins une fois**
pour un joueur avant que ses succès puissent être vérifiés (voir son
README) — sans ça, cette ressource répond juste `{"linked": false}`.

## Installation

1. Copie le dossier `b2_achievements` dans tes `resources/`
2. Dans `server.cfg`, ajoute (après `b2_playerlink`) :
   ```
   ensure b2_achievements
   ```
3. `refresh` + `start b2_achievements`

## Vérifier que ça marche

Une fois qu'au moins un joueur s'est reconnecté depuis l'installation de
`b2_playerlink`, teste avec son vrai ID Discord :
```
http://185.44.80.32:30140/b2_achievements/?discordId=SON_ID_DISCORD
```
Réponse attendue : `{"linked":true,"achievements":{"hasJob":true,"hasVehicle":false,"hasHouse":true}}`
(les valeurs dépendent évidemment de ce que ce joueur possède réellement)
