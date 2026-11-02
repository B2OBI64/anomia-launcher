fx_version 'cerulean'
game 'gta5'

author 'B2'
description 'Statistiques de toute la vie du serveur Anomia (heures jouees, joueurs, record de connectes) pour le B2 Launcher.'
version '1.0.0'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}
