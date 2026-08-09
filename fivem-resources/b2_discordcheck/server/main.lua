-- ============================================================
-- b2_discordcheck
--
-- Expose un endpoint HTTP qui vérifie si un ID Discord donné possède
-- le rôle whitelist requis sur ton serveur Discord — pensé pour que
-- le launcher Anomia puisse bloquer le bouton "Se connecter" AVANT
-- même de lancer FiveM, en plus du check déjà fait par txAdmin côté
-- serveur (ceci n'est qu'une vérification préalable côté launcher,
-- txAdmin reste la vraie protection).
--
-- URL exposée (même port que le jeu) :
--   http://IP:PORT/b2_discordcheck/?discordId=123456789012345678
--
-- Réponse JSON :
--   { "allowed": true }
--   { "allowed": false, "reason": "missing_role" }
--   { "allowed": false, "reason": "not_in_guild" }
--   { "allowed": false, "reason": "config_missing" }
-- ============================================================

-- Configure ces 3 convars dans ton server.cfg (ne les mets JAMAIS dans un
-- fichier versionné publiquement) :
--   setr anomia_discord_bot_token "TON_TOKEN_BOT"
--   setr anomia_discord_guild_id "ID_DE_TON_SERVEUR_DISCORD"
--   setr anomia_discord_role_id "ID_DU_ROLE_WHITELIST"

local function getConfig()
    return {
        token = GetConvar("anomia_discord_bot_token", ""),
        guildId = GetConvar("anomia_discord_guild_id", ""),
        roleId = GetConvar("anomia_discord_role_id", "")
    }
end

local function checkRole(discordId, cb)
    local cfg = getConfig()

    if cfg.token == "" or cfg.guildId == "" or cfg.roleId == "" then
        cb({ allowed = false, reason = "config_missing" })
        return
    end

    local url = ("https://discord.com/api/v10/guilds/%s/members/%s"):format(cfg.guildId, discordId)

    PerformHttpRequest(url, function(statusCode, responseText)
        if statusCode == 404 then
            cb({ allowed = false, reason = "not_in_guild" })
            return
        end

        if statusCode ~= 200 then
            cb({ allowed = false, reason = "discord_api_error" })
            return
        end

        local ok, data = pcall(json.decode, responseText)
        if not ok or not data or not data.roles then
            cb({ allowed = false, reason = "discord_api_error" })
            return
        end

        for _, roleId in ipairs(data.roles) do
            if roleId == cfg.roleId then
                cb({ allowed = true })
                return
            end
        end

        cb({ allowed = false, reason = "missing_role" })
    end, "GET", "", {
        ["Authorization"] = "Bot " .. cfg.token
    })
end

SetHttpHandler(function(req, res)
    local discordId = req.headers["x-discord-id"]

    -- Fallback : lit aussi le paramètre ?discordId= dans l'URL si l'en-tête n'est pas fourni
    if not discordId then
        local query = req.path:match("%?(.*)")
        if query then
            discordId = query:match("discordId=([^&]+)")
        end
    end

    if not discordId or discordId == "" then
        res.writeHead(400, { ["Content-Type"] = "application/json", ["Access-Control-Allow-Origin"] = "*" })
        res.send(json.encode({ allowed = false, reason = "missing_discord_id" }))
        return
    end

    checkRole(discordId, function(result)
        res.writeHead(200, {
            ["Content-Type"] = "application/json",
            ["Access-Control-Allow-Origin"] = "*"
        })
        res.send(json.encode(result))
    end)
end)

print("[b2_discordcheck] Pret. Verifie que anomia_discord_bot_token / anomia_discord_guild_id / anomia_discord_role_id sont bien configures dans server.cfg.")
