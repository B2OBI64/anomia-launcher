fx_version 'cerulean'
game 'gta5'

author 'Anomia'
description 'Expose un ping moyen et une population par job agreges via HTTP, sans jamais exposer la liste des joueurs (vie privee).'
version '1.1.1'

-- Pas de "dependency" strict sur qb-core : ça empêcherait carrément la
-- ressource de démarrer si qb-core n'est pas détecté à cet instant précis.
-- Le code (server/main.lua) tente déjà l'accès à qb-core avec un pcall et
-- tolère son absence (jobs vides mais le reste - ping, players - fonctionne
-- quand même). Assure-toi juste que b2_pingstats démarre APRÈS qb-core dans
-- ton server.cfg pour que la population par job fonctionne.

server_scripts {
    'server/main.lua'
}
