# b2_gpswaypoint

Permet au joueur de cliquer un point sur la carte du launcher et de le
poser directement en GPS in-game — **uniquement s'il est déjà connecté au
serveur en jeu** au moment du clic. Si le serveur n'a pas ce joueur en
ligne, le launcher affiche un message d'erreur clair au lieu de rien faire.

## Pourquoi cette limite existe

Le launcher (sur le PC du joueur) ne peut techniquement pas parler
directement au jeu qui tourne — il doit passer par ton serveur, qui lui
sait qui est en ligne et peut lui envoyer un ordre. C'est une vraie
contrainte technique de FiveM, pas un choix arbitraire.

## Installation

1. Copie le dossier `b2_gpswaypoint` dans tes `resources/`
2. Dans `server.cfg`, ajoute (après `b2_playerlink`) :
   ```
   ensure b2_gpswaypoint
   ```
3. `refresh` + `start b2_gpswaypoint`

## Dépendances

A besoin que `b2_playerlink` tourne déjà (pour retrouver le `citizenid`
depuis l'ID Discord du joueur).
