-- ============================================================
-- b2_achievements
--
-- Vérifie les succès d'un joueur à partir de son ID Discord - fonctionne
-- même si le joueur n'est pas connecté au serveur, en interrogeant
-- directement la base de données QBCore (lecture seule, aucune écriture
-- dans ces tables).
--
-- Dépend de b2_playerlink pour retrouver le citizenid à partir de l'ID
-- Discord, ET pour le temps de jeu cumulé (voir cette ressource).
--
-- URL exposée (même port que le jeu) :
--   GET http://IP:PORT/b2_achievements/?discordId=123456789012345678
--
-- Réponse JSON :
--   { "linked": true, "achievements": { "hasJob": true, ... } }
--   { "linked": false }
-- ============================================================

-- Jobs considérés "publics/services", exclus du succès "monté en grade"
-- (une promotion en police/EMS/gouvernement n'est pas une progression
-- entrepreneuriale au même titre qu'une entreprise privée)
local PUBLIC_JOBS = { unemployed = true, police = true, ambulance = true, gouvernement = true }

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
    local result = {
        firstCharacter = true, -- vrai dès qu'on a un citizenid, donc toujours vrai ici
        hasJob = false,
        hasVehicle = false,
        hasHouse = false,
        tutorialDone = false,
        money30k = false,
        money100k = false,
        jobPromotion = false,
        drivingDistance100 = false,
        drivingDistance500 = false,
        drivingDistance1000 = false,
        customizedVehicle = false,
        playtime1h = false,
        playtime10h = false,
        playtime100h = false,
        playtime500h = false
    }
    local pending = 4

    local function done()
        pending = pending - 1
        if pending == 0 then cb(result) end
    end

    -- players : job, argent, tutoriel (metadata)
    exports.oxmysql:execute("SELECT job, money, metadata FROM players WHERE citizenid = ? LIMIT 1", { citizenid }, function(rows)
        if rows and rows[1] then
            local row = rows[1]

            if row.job then
                local ok, job = pcall(json.decode, row.job)
                if ok and job and job.name then
                    if job.name ~= "unemployed" then
                        result.hasJob = true
                    end
                    if not PUBLIC_JOBS[job.name] and job.grade and tonumber(job.grade.level) and tonumber(job.grade.level) > 0 then
                        result.jobPromotion = true
                    end
                end
            end

            if row.money then
                local ok, money = pcall(json.decode, row.money)
                if ok and money then
                    local total = (tonumber(money.cash) or 0) + (tonumber(money.bank) or 0)
                    if total >= 30000 then result.money30k = true end
                    if total >= 100000 then result.money100k = true end
                end
            end

            if row.metadata then
                local ok, metadata = pcall(json.decode, row.metadata)
                if ok and metadata and metadata.tutorial_done then
                    result.tutorialDone = true
                end
            end
        end
        done()
    end)

    -- player_vehicles : possession, distance parcourue, personnalisation
    exports.oxmysql:execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(drivingdistance),0) as totalDistance FROM player_vehicles WHERE citizenid = ?",
        { citizenid },
        function(rows)
            if rows and rows[1] then
                local cnt = tonumber(rows[1].cnt) or 0
                local totalDistanceMeters = tonumber(rows[1].totalDistance) or 0
                local totalDistanceKm = totalDistanceMeters / 1000

                if cnt > 0 then result.hasVehicle = true end
                if totalDistanceKm >= 100 then result.drivingDistance100 = true end
                if totalDistanceKm >= 500 then result.drivingDistance500 = true end
                if totalDistanceKm >= 1000 then result.drivingDistance1000 = true end
            end
            done()
        end
    )

    exports.oxmysql:execute("SELECT mods FROM player_vehicles WHERE citizenid = ?", { citizenid }, function(rows)
        if rows then
            for _, row in ipairs(rows) do
                if row.mods and #row.mods > 2 then -- plus que juste "{}" ou "[]"
                    result.customizedVehicle = true
                    break
                end
            end
        end
        done()
    end)

    -- player_houses
    exports.oxmysql:execute("SELECT COUNT(*) as cnt FROM player_houses WHERE citizenid = ?", { citizenid }, function(rows)
        if rows and rows[1] and tonumber(rows[1].cnt) and tonumber(rows[1].cnt) > 0 then
            result.hasHouse = true
        end
        done()
    end)

    -- temps de jeu cumulé (suivi côté serveur par b2_playerlink, pas par le launcher)
    exports.oxmysql:execute("SELECT playtime_seconds FROM anomia_discord_links WHERE citizenid = ? LIMIT 1", { citizenid }, function(rows)
        if rows and rows[1] then
            local seconds = tonumber(rows[1].playtime_seconds) or 0
            if seconds >= 3600 then result.playtime1h = true end
            if seconds >= 36000 then result.playtime10h = true end
            if seconds >= 360000 then result.playtime100h = true end
            if seconds >= 1800000 then result.playtime500h = true end
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

print("[b2_achievements] Pret (etendu). Depend de b2_playerlink pour le lien Discord <-> citizenid et le temps de jeu.")
