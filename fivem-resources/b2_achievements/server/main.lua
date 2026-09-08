-- ============================================================
-- b2_achievements
--
-- Vérifie les succès d'un joueur (a un métier / possède un véhicule /
-- possède un logement) à partir de son ID Discord - fonctionne même si
-- le joueur n'est pas connecté au serveur, en interrogeant directement la
-- base de données QBCore (lecture seule, aucune écriture dans ces tables).
--
-- Dépend de b2_playerlink pour retrouver le citizenid à partir de l'ID
-- Discord (voir cette ressource).
--
-- URL exposée (même port que le jeu) :
--   GET http://IP:PORT/b2_achievements/?discordId=123456789012345678
--
-- Réponse JSON :
--   { "linked": true, "achievements": { "hasJob": true, "hasVehicle": true, "hasHouse": false } }
--   { "linked": false }   -- ID Discord jamais vu (le joueur ne s'est pas encore reconnecté depuis l'installation)
-- ============================================================

local function findCitizenId(discordId, cb)
    exports.oxmysql:execute(
        "SELECT citizenid FROM anomia_discord_links WHERE discord_id = ? ORDER BY updated_at DESC LIMIT 1",
        { discordId },
        function(rows)
            if rows and rows[1] then
                cb(rows[1].citizenid)
            else
                cb(nil)
            end
        end
    )
end

local function checkAchievements(citizenid, cb)
    local result = { hasJob = false, hasVehicle = false, hasHouse = false }
    local pending = 3

    local function done()
        pending = pending - 1
        if pending == 0 then cb(result) end
    end

    exports.oxmysql:execute("SELECT job FROM players WHERE citizenid = ? LIMIT 1", { citizenid }, function(rows)
        if rows and rows[1] and rows[1].job then
            local ok, job = pcall(json.decode, rows[1].job)
            if ok and job and job.name and job.name ~= "unemployed" then
                result.hasJob = true
            end
        end
        done()
    end)

    exports.oxmysql:execute("SELECT COUNT(*) as cnt FROM player_vehicles WHERE citizenid = ?", { citizenid }, function(rows)
        if rows and rows[1] and tonumber(rows[1].cnt) and tonumber(rows[1].cnt) > 0 then
            result.hasVehicle = true
        end
        done()
    end)

    exports.oxmysql:execute("SELECT COUNT(*) as cnt FROM player_houses WHERE citizenid = ?", { citizenid }, function(rows)
        if rows and rows[1] and tonumber(rows[1].cnt) and tonumber(rows[1].cnt) > 0 then
            result.hasHouse = true
        end
        done()
    end)
end

SetHttpHandler(function(req, res)
    local discordId = req.headers["x-discord-id"]
    if not discordId then
        local query = req.path:match("%?(.*)")
        if query then
            discordId = query:match("discordId=([^&]+)")
        end
    end

    if not discordId or discordId == "" then
        res.writeHead(400, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
        res.send(json.encode({ error = "missing_discord_id" }))
        return
    end

    findCitizenId(discordId, function(citizenid)
        if not citizenid then
            res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
            res.send(json.encode({ linked = false }))
            return
        end

        checkAchievements(citizenid, function(achievements)
            res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
            res.send(json.encode({ linked = true, achievements = achievements }))
        end)
    end)
end)

print("[b2_achievements] Pret. Depend de b2_playerlink pour le lien Discord <-> citizenid.")
