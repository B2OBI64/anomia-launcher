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
            `discord_id` VARCHAR(32) NOT NULL DEFAULT '',
            `playtime_seconds` INT(11) NOT NULL DEFAULT 0,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`citizenid`),
            INDEX `idx_discord_id` (`discord_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]], {}, function()
        print("[b2_playerlink] Table anomia_discord_links prête.")
        -- Ajoute la colonne playtime_seconds si la table existait déjà sans (mise à jour d'une version précédente)
        exports.oxmysql:execute("ALTER TABLE anomia_discord_links ADD COLUMN IF NOT EXISTS playtime_seconds INT(11) NOT NULL DEFAULT 0", {})
    end)
end)

local function extractDiscordId(src)
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        local discordId = id:match("^discord:(%d+)$")
        if discordId then return discordId end
    end
    return nil
end

RegisterNetEvent("QBCore:Server:OnPlayerLoaded")
AddEventHandler("QBCore:Server:OnPlayerLoaded", function()
    -- Important : cet event est déclenché côté client (réseau), donc on doit
    -- utiliser RegisterNetEvent (pas juste AddEventHandler) pour que FiveM
    -- l'autorise à s'exécuter - sinon il est bloqué silencieusement par
    -- sécurité ("was not safe for net" dans les logs).
    local src = source
    print(("[b2_playerlink] Événement OnPlayerLoaded déclenché (source=%s)"):format(tostring(src)))

    local QBCore = getQBCore()
    if not QBCore then
        print("[b2_playerlink] ÉCHEC : impossible de récupérer l'objet QBCore (exports['qb-core'] indisponible).")
        return
    end

    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not Player.PlayerData or not Player.PlayerData.citizenid then
        print(("[b2_playerlink] ÉCHEC : joueur ou citizenid introuvable pour la source %s"):format(tostring(src)))
        return
    end

    local discordId = extractDiscordId(src)
    if not discordId then
        print(("[b2_playerlink] ÉCHEC : aucun identifiant Discord trouvé pour citizenid=%s (le joueur n'a peut-être pas Discord ouvert/lié à son client FiveM)"):format(Player.PlayerData.citizenid))
        return
    end

    print(("[b2_playerlink] Lien trouvé : citizenid=%s <-> discord=%s -> enregistrement en cours..."):format(Player.PlayerData.citizenid, discordId))

    exports.oxmysql:execute(
        "INSERT INTO anomia_discord_links (citizenid, discord_id) VALUES (?, ?) " ..
        "ON DUPLICATE KEY UPDATE discord_id = VALUES(discord_id), updated_at = CURRENT_TIMESTAMP",
        { Player.PlayerData.citizenid, discordId },
        function(affectedRows)
            print(("[b2_playerlink] SUCCÈS : lien enregistré pour citizenid=%s (lignes affectées: %s)"):format(Player.PlayerData.citizenid, tostring(affectedRows)))
        end
    )
end)

print("[b2_playerlink] Prêt. Le lien Discord <-> citizenid se construit automatiquement au fil des connexions.")

-- ============================================================
-- Temps de jeu cumulé, suivi CÔTÉ SERVEUR (pas par le launcher desktop) -
-- fiable peu importe le PC utilisé par le joueur, contrairement à un
-- suivi qui serait fait uniquement dans le launcher (qui, lui, ne reflète
-- que le temps passé sur CE PC précis avec CE launcher précis).
-- ============================================================
local PLAYTIME_TICK_MS = 60000 -- une minute

CreateThread(function()
    while true do
        Wait(PLAYTIME_TICK_MS)

        local QBCore = getQBCore()
        if QBCore then
            local ok, players = pcall(function() return QBCore.Functions.GetPlayers() end)
            if ok then
                for _, src in ipairs(players) do
                    local Player = QBCore.Functions.GetPlayer(src)
                    if Player and Player.PlayerData and Player.PlayerData.citizenid then
                        local discordId = extractDiscordId(src) or ""
                        exports.oxmysql:execute(
                            "INSERT INTO anomia_discord_links (citizenid, discord_id, playtime_seconds) VALUES (?, ?, 60) " ..
                            "ON DUPLICATE KEY UPDATE " ..
                            "playtime_seconds = playtime_seconds + 60, " ..
                            "discord_id = IF(VALUES(discord_id) != '', VALUES(discord_id), discord_id), " ..
                            "updated_at = CURRENT_TIMESTAMP",
                            { Player.PlayerData.citizenid, discordId }
                        )
                    end
                end
            end
        end
    end
end)
