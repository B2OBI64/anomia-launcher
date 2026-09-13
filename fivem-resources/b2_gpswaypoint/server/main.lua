-- ============================================================
-- b2_gpswaypoint
--
-- Reçoit une demande du launcher ("pose ce point GPS chez ce joueur"),
-- retrouve son citizenid via anomia_discord_links (voir b2_playerlink),
-- vérifie s'il est ACTUELLEMENT connecté au serveur, et si oui lui envoie
-- l'event pour poser le point GPS in-game.
--
-- Si le joueur n'est pas en jeu au moment de la demande, répond une erreur
-- claire - c'est le launcher qui affiche le message adapté au joueur.
--
-- URL exposée (même port que le jeu) :
--   POST http://IP:PORT/b2_gpswaypoint/   body JSON: { "discordId": "...", "x": 123.4, "y": -567.8 }
-- ============================================================

local function getQBCore()
    local ok, core = pcall(function() return exports['qb-core']:GetCoreObject() end)
    if ok then return core end
    return nil
end

local function findOnlineSourceByCitizenId(citizenid)
    local QBCore = getQBCore()
    if not QBCore then return nil end

    local ok, players = pcall(function() return QBCore.Functions.GetPlayers() end)
    if not ok then return nil end

    for _, src in ipairs(players) do
        local Player = QBCore.Functions.GetPlayer(src)
        if Player and Player.PlayerData and Player.PlayerData.citizenid == citizenid then
            return src
        end
    end
    return nil
end

SetHttpHandler(function(req, res)
    if req.method ~= "POST" then
        res.writeHead(405, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
        res.send(json.encode({ error = "method_not_allowed" }))
        return
    end

    req.setDataHandler(function(body)
        local ok, data = pcall(json.decode, body)
        if not ok or not data or not data.discordId or not data.x or not data.y then
            res.writeHead(400, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
            res.send(json.encode({ error = "invalid_body" }))
            return
        end

        exports.oxmysql:execute(
            "SELECT citizenid FROM anomia_discord_links WHERE discord_id = ? ORDER BY updated_at DESC LIMIT 1",
            { data.discordId },
            function(rows)
                if not rows or not rows[1] then
                    res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
                    res.send(json.encode({ ok = false, reason = "not_linked" }))
                    return
                end

                local src = findOnlineSourceByCitizenId(rows[1].citizenid)
                if not src then
                    res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
                    res.send(json.encode({ ok = false, reason = "not_online" }))
                    return
                end

                TriggerClientEvent("b2_gpswaypoint:set", src, tonumber(data.x), tonumber(data.y))
                res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
                res.send(json.encode({ ok = true }))
            end
        )
    end)
end)

print("[b2_gpswaypoint] Pret. Depend de b2_playerlink pour retrouver le citizenid depuis l'ID Discord.")
