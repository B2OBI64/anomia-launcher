fx_version 'cerulean'
game 'gta5'

author 'Anomia'
description 'Enregistre automatiquement le lien Discord <-> citizenid a chaque connexion, pour le systeme de succes. Ne touche jamais aux tables QBCore existantes.'
version '1.0.0'

dependencies {
    'oxmysql'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}
