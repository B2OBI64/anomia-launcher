-- ============================================================
-- b2_pingstats
--
-- Expose UNIQUEMENT des statistiques agregees (ping moyen, nombre
-- de joueurs, population par job) via un endpoint HTTP custom, pense
-- pour le launcher Anomia. Ne renvoie JAMAIS de pseudo, d'identifiant,
-- ni aucune donnee individuelle de joueur - seulement des nombres agreges.
--
-- URL exposee (meme port que le jeu) :
--   http://IP:PORT/b2_pingstats/
--
-- Reponse JSON :
--   { "avgPing": 42, "players": 12, "jobs": { "Police": 5, "EMS": 2, "Civils": 41 }, "maintenance": false }
-- ============================================================

local MAINTENANCE_CONVAR = "anomia_maintenance" -- même convar que b2_maintenance

local QBCoreCache = nil
local function getQBCore()
    if not QBCoreCache then
        local ok, core = pcall(function() return exports['qb-core']:GetCoreObject() end)
        if ok then QBCoreCache = core end
    end
    return QBCoreCache
end

-- Association job QBCore (nom interne, voir qb-core/shared/jobs.lua) -> catégorie
-- affichée dans le launcher. Modifie cette table pour ajuster le regroupement -
-- tout job non listé ici tombe automatiquement dans "Autres".
local JOB_CATEGORIES = {
    unemployed = "Civils",
    police = "Police",
    ambulance = "EMS",
    bennys = "Mécano",
    maisonnette10 = "Maisonnette 10",
    bahamas = "Bahamas",
    henhouse = "Hen House",
    newsjob = "Journaliste",
    taxi = "Taxi",
    gouvernement = "Gouvernement",
    prisonier = "Prisonnier",
    tatoueur = "Tatoueur",
    garbage = "Éboueur",
    mineur = "Mineur",
    electrician = "Électricien"
}
-- Filet de sécurité : tout job pas encore listé ci-dessus (nouveau job ajouté
-- au serveur, custom, etc.) tombe ici plutôt que d'être compté sous un nom brut.
local DEFAULT_CATEGORY = "Autres"

local function computeJobCounts()
    -- Pour chaque catégorie : combien sont EN SERVICE, et combien sont connectés
    -- avec ce job en ce moment (peu importe le statut de service). Le launcher
    -- affiche ça sous la forme "2/10" (en service / employés connectés).
    local counts = {}
    local QBCore = getQBCore()
    if not QBCore then return counts end

    local ok, players = pcall(function() return QBCore.Functions.GetPlayers() end)
    if not ok then return counts end

    for _, playerId in ipairs(players) do
        local Player = QBCore.Functions.GetPlayer(playerId)
        if Player and Player.PlayerData and Player.PlayerData.job then
            local job = Player.PlayerData.job
            local category = JOB_CATEGORIES[job.name] or DEFAULT_CATEGORY

            counts[category] = counts[category] or { onDuty = 0, total = 0 }
            counts[category].total = counts[category].total + 1

            -- Les jobs sans concept de service (ex: unemployed) ont onduty=true
            -- par défaut, donc comptés comme "en service" naturellement.
            if job.onduty ~= false then
                counts[category].onDuty = counts[category].onDuty + 1
            end
        end
    end

    return counts
end

local function computeStats()
    local players = GetPlayers()
    local total = 0
    local count = 0

    for _, playerId in ipairs(players) do
        local ping = GetPlayerPing(playerId)
        if ping and ping > 0 then
            total = total + ping
            count = count + 1
        end
    end

    return {
        avgPing = count > 0 and math.floor(total / count) or 0,
        players = #players,
        jobs = computeJobCounts(),
        maintenance = GetConvar(MAINTENANCE_CONVAR, "false") == "true"
    }
end

SetHttpHandler(function(req, res)
    local stats = computeStats()

    res.writeHead(200, {
        ['Content-Type'] = 'application/json',
        -- Necessaire pour que le launcher (origine http://localhost:PORT) puisse lire la reponse
        ['Access-Control-Allow-Origin'] = '*'
    })
    res.send(json.encode(stats))
end)

print('[b2_pingstats] Endpoint pret sur /b2_pingstats/ (ping moyen + population par job + etat maintenance, sans donnees joueur individuelles)')
