fx_version 'cerulean'
game 'gta5'

author 'Anomia'
description 'Expose un ping moyen et une population par job agreges via HTTP, sans jamais exposer la liste des joueurs (vie privee).'
version '1.1.0'

dependency '/qb-core'

server_scripts {
    'server/main.lua'
}
