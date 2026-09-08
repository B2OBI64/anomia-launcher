-- ============================================================
-- b2_playerlink
--
-- Enregistre automatiquement le lien "ID Discord <-> citizenid" à chaque
-- connexion d'un joueur, dans une TOUTE NOUVELLE table indépendante
-- (anomia_discord_links) créée par cette ressource.
--
-- IMPORTANT : cette ressource ne modifie JAMAIS les tables QBCore
-- existantes (players, player_vehicles, player_houses, etc.) - elle se
-- contente de LIRE le citizenid déjà présent et de l'écrire dans sa propre
-- table à part. Aucun risque pour la progression des joueurs.
--
-- Ce lien sert uniquement au système de succès (voir b2_achievements) :
-- le launcher connaît l'ID Discord du joueur (connexion OAuth), et a besoin
-- de retrouver son citizenid pour vérifier ses succès même hors ligne.
-- ============================================================

local function getQBCore()
    local ok, core = pcall(function() return exports['qb-core']:GetCoreObject() end)
    if ok then return core end
    return nil
end

CreateThread(function()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS `anomia_discord_links` (
            `citizenid` VARCHAR(50) NOT NULL,
            `discord_id` VARCHAR(32) NOT NULL,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`citizenid`),
            INDEX `idx_discord_id` (`discord_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]], {}, function()
        print("[b2_playerlink] Table anomia_discord_links prête.")
    end)
end)

local function extractDiscordId(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        local discordId = id:match("^discord:(%d+)$")
        if discordId then return discordId end
    end
    return nil
end

AddEventHandler("QBCore:Server:OnPlayerLoaded", function(src)
    local QBCore = getQBCore()
    if not QBCore then return end

    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not Player.PlayerData or not Player.PlayerData.citizenid then return end

    local discordId = extractDiscordId(src)
    if not discordId then return end -- joueur sans Discord lié à son compte Rockstar, rien à faire

    exports.oxmysql:execute(
        "INSERT INTO anomia_discord_links (citizenid, discord_id) VALUES (?, ?) " ..
        "ON DUPLICATE KEY UPDATE discord_id = VALUES(discord_id), updated_at = CURRENT_TIMESTAMP",
        { Player.PlayerData.citizenid, discordId }
    )
end)

print("[b2_playerlink] Prêt. Le lien Discord <-> citizenid se construit automatiquement au fil des connexions.")
