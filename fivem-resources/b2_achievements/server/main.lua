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

-- Date d'anniversaire du serveur (succès "serverBirthday" : se connecter ce jour-là).
-- Anniversaire = 3 juillet.
-- Pour changer la date, modifie month (mois) et day (jour).
local SERVER_BIRTHDAY = { month = 7, day = 3 } -- création du serveur : 03/07/2025

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
        playtime500h = false,
        vehicleCollector3 = false,
        vehicleCollector5 = false,
        houseCollector2 = false,
        millionaire = false,
        newLife = false,
        licenceMoto = false,
        licenceCamion = false,
        licenceBateau = false,
        licenceAvion = false,
        licenceHelicoptere = false,
        firstKO = false,
        firstComa = false,
        firstInvoicePaid = false,
        playtime1000h = false,
        drivingDistance10000 = false,
        loginStreak30 = false,
        serverBirthday = false
    }
    local pending = 10

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
                    if total >= 1000000 then result.millionaire = true end
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

    -- player_vehicles : possession + distance parcourue.
    -- La distance vient de b2_hud (table b2_hud_odometer, km par plaque) : l'ancienne
    -- colonne player_vehicles.drivingdistance n'est plus alimentée. On garde la
    -- colonne comme repli (on prend la plus grande des deux valeurs).
    exports.oxmysql:execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(drivingdistance),0) as totalDistance, " ..
        "COALESCE(SUM((SELECT o.km FROM b2_hud_odometer o WHERE o.plate = REPLACE(UPPER(pv.plate), ' ', '') LIMIT 1)),0) as hudKm " ..
        "FROM player_vehicles pv WHERE pv.citizenid = ?",
        { citizenid },
        function(rows)
            if rows and rows[1] then
                local cnt = tonumber(rows[1].cnt) or 0
                local legacyKm = (tonumber(rows[1].totalDistance) or 0) / 1000
                local hudKm = tonumber(rows[1].hudKm) or 0
                local totalDistanceKm = math.max(legacyKm, hudKm)

                if cnt > 0 then result.hasVehicle = true end
                if cnt >= 3 then result.vehicleCollector3 = true end
                if cnt >= 5 then result.vehicleCollector5 = true end
                if totalDistanceKm >= 100 then result.drivingDistance100 = true end
                if totalDistanceKm >= 500 then result.drivingDistance500 = true end
                if totalDistanceKm >= 1000 then result.drivingDistance1000 = true end
                if totalDistanceKm >= 10000 then result.drivingDistance10000 = true end
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
        if rows and rows[1] and tonumber(rows[1].cnt) then
            local cnt = tonumber(rows[1].cnt)
            if cnt > 0 then result.hasHouse = true end
            if cnt >= 2 then result.houseCollector2 = true end
        end
        done()
    end)

    -- newLife : le même joueur (même license) a créé plus d'un personnage
    exports.oxmysql:execute(
        "SELECT COUNT(*) as cnt FROM players WHERE license = (SELECT license FROM players WHERE citizenid = ? LIMIT 1)",
        { citizenid },
        function(rows)
            if rows and rows[1] and tonumber(rows[1].cnt) and tonumber(rows[1].cnt) > 1 then
                result.newLife = true
            end
            done()
        end
    )

    -- Permis (via b2_autoecole_permis - table dédiée de la ressource b2_autoecole,
    -- pratique_valide = permis réellement obtenu, pas juste la théorie réussie)
    exports.oxmysql:execute(
        "SELECT permis_type FROM b2_autoecole_permis WHERE citizenid = ? AND pratique_valide = 1",
        { citizenid },
        function(rows)
            local obtained = {}
            if rows then
                for _, row in ipairs(rows) do obtained[row.permis_type] = true end
            end
            result.licenceMoto = obtained.moto or false
            result.licenceCamion = obtained.camion or false
            result.licenceBateau = obtained.bateau or false
            result.licenceAvion = obtained.avion or false
            result.licenceHelicoptere = obtained.helicoptere or false
            done()
        end
    )

    -- Première facture payée (b2_facturation : statut 'payée' côté destinataire)
    exports.oxmysql:execute(
        "SELECT COUNT(*) as cnt FROM b2_factures WHERE destinataire_id = ? AND statut = 'payée'",
        { citizenid },
        function(rows)
            if rows and rows[1] and (tonumber(rows[1].cnt) or 0) > 0 then result.firstInvoicePaid = true end
            done()
        end
    )

    -- Premier K.O. / premier coma (événements remontés par wasabi_ambulance, voir plus bas)
    exports.oxmysql:execute(
        "SELECT event_key FROM anomia_achievement_events WHERE citizenid = ?",
        { citizenid },
        function(rows)
            if rows then
                for _, row in ipairs(rows) do
                    if row.event_key == "ko" then result.firstKO = true end
                    if row.event_key == "coma" then result.firstComa = true end
                end
            end
            done()
        end
    )

    -- Jours de connexion : série de 30 jours consécutifs + connexion le jour de l'anniversaire
    exports.oxmysql:execute(
        "SELECT DATE_FORMAT(login_day, '%Y-%m-%d') AS d FROM anomia_login_days WHERE citizenid = ? ORDER BY login_day ASC",
        { citizenid },
        function(rows)
            if rows then
                local streak, best, prev = 0, 0, nil
                for _, row in ipairs(rows) do
                    local y, mo, d = tostring(row.d):match("^(%d+)-(%d+)-(%d+)$")
                    if y then
                        local t = os.time({ year = tonumber(y), month = tonumber(mo), day = tonumber(d), hour = 12 })
                        if prev and math.floor((t - prev) / 86400 + 0.5) == 1 then
                            streak = streak + 1
                        else
                            streak = 1
                        end
                        if streak > best then best = streak end
                        prev = t
                        if SERVER_BIRTHDAY and tonumber(mo) == SERVER_BIRTHDAY.month and tonumber(d) == SERVER_BIRTHDAY.day then
                            result.serverBirthday = true
                        end
                    end
                end
                if best >= 30 then result.loginStreak30 = true end
            end
            done()
        end
    )

    -- temps de jeu cumulé (suivi côté serveur par b2_playerlink, pas par le launcher)
    exports.oxmysql:execute("SELECT playtime_seconds FROM anomia_discord_links WHERE citizenid = ? LIMIT 1", { citizenid }, function(rows)
        if rows and rows[1] then
            local seconds = tonumber(rows[1].playtime_seconds) or 0
            if seconds >= 3600 then result.playtime1h = true end
            if seconds >= 36000 then result.playtime10h = true end
            if seconds >= 360000 then result.playtime100h = true end
            if seconds >= 1800000 then result.playtime500h = true end
            if seconds >= 3600000 then result.playtime1000h = true end
        end
        done()
    end)
end

-- Événements ponctuels (premier K.O., premier coma) : ne peuvent pas se déduire
-- de la base, donc remontés en direct par wasabi_ambulance (b2_customize.lua).
CreateThread(function()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS `anomia_achievement_events` (
            `citizenid` VARCHAR(50) NOT NULL,
            `event_key` VARCHAR(30) NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`citizenid`, `event_key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]], {})
end)

CreateThread(function()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS `anomia_login_days` (
            `citizenid` VARCHAR(50) NOT NULL,
            `login_day` DATE NOT NULL,
            PRIMARY KEY (`citizenid`, `login_day`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]], {})
end)

local ALLOWED_EVENTS = { ko = true, coma = true }

RegisterNetEvent("b2_achievements:server:event", function(eventKey)
    local src = source
    if type(eventKey) ~= "string" or not ALLOWED_EVENTS[eventKey] then return end
    local ok, QBCore = pcall(function() return exports['qb-core']:GetCoreObject() end)
    if not ok or not QBCore then return end
    local Player = QBCore.Functions.GetPlayer(src)
    if not Player or not Player.PlayerData or not Player.PlayerData.citizenid then return end
    exports.oxmysql:execute(
        "INSERT IGNORE INTO anomia_achievement_events (citizenid, event_key) VALUES (?, ?)",
        { Player.PlayerData.citizenid, eventKey }
    )
end)

CreateThread(function()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS b2_hud_odometer (
            plate VARCHAR(12) NOT NULL PRIMARY KEY,
            km FLOAT NOT NULL DEFAULT 0
        )
    ]], {})
end)

-- Historique : date de premier déblocage de chaque succès, par joueur
CreateThread(function()
    exports.oxmysql:execute([[
        CREATE TABLE IF NOT EXISTS `anomia_achievements_unlocked` (
            `citizenid` VARCHAR(50) NOT NULL,
            `achievement_key` VARCHAR(50) NOT NULL,
            `unlocked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`citizenid`, `achievement_key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ]], {}, function()
        print("[b2_achievements] Table anomia_achievements_unlocked prête (historique des dates de déblocage).")
    end)
end)

-- Enregistre (une seule fois, la première fois) la date de chaque succès
-- actuellement débloqué, puis renvoie les dates connues pour ce joueur.
local function recordAndFetchUnlockDates(citizenid, achievements, cb)
    local unlockedKeys = {}
    for key, value in pairs(achievements) do
        if value == true then table.insert(unlockedKeys, key) end
    end

    if #unlockedKeys == 0 then
        cb({})
        return
    end

    local pending = #unlockedKeys
    for _, key in ipairs(unlockedKeys) do
        exports.oxmysql:execute(
            "INSERT IGNORE INTO anomia_achievements_unlocked (citizenid, achievement_key) VALUES (?, ?)",
            { citizenid, key },
            function()
                pending = pending - 1
                if pending == 0 then
                    exports.oxmysql:execute(
                        "SELECT achievement_key, unlocked_at FROM anomia_achievements_unlocked WHERE citizenid = ?",
                        { citizenid },
                        function(rows)
                            local dates = {}
                            if rows then
                                for _, row in ipairs(rows) do
                                    dates[row.achievement_key] = row.unlocked_at
                                end
                            end
                            cb(dates)
                        end
                    )
                end
            end
        )
    end
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
            recordAndFetchUnlockDates(citizenid, achievements, function(unlockedAt)
                res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
                res.send(json.encode({ linked = true, achievements = achievements, unlockedAt = unlockedAt }))
            end)
        end)
    end)
end)

print("[b2_achievements] Pret (etendu). Depend de b2_playerlink pour le lien Discord <-> citizenid et le temps de jeu.")
