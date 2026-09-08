fx_version 'cerulean'
game 'gta5'

author 'Anomia'
description 'Verifie les succes d un joueur (job, vehicule, logement) a partir de son ID Discord, meme hors ligne.'
version '1.0.0'

dependencies {
    'oxmysql'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}
