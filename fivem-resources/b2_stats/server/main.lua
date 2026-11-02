-- ============================================================
-- b2_stats  ->  http://IP:PORT/b2_stats/
--
-- Renvoie les chiffres de toute la vie du serveur :
--   totalHours      heures jouees par la communaute (somme des temps de jeu suivis par b2_playerlink)
--   players         joueurs ayant lie leur compte Discord (donc ayant joue depuis b2_playerlink)
--   recordPlayers   record de joueurs connectes en meme temps (releve par cette ressource)
--   recordDate      date de ce record
--
-- IMPORTANT : le record est releve a partir de l'installation de cette ressource.
-- Pour partir d'un record deja connu, ajoute dans server.cfg :
--   setr anomia_stats_record_seed "42"
--   setr anomia_stats_record_date_seed "2026-03-14"
-- ============================================================

local KVP_RECORD = "peak_players"
local KVP_DATE = "peak_date"

local function getRecord()
    local rec = tonumber(GetResourceKvpString(KVP_RECORD)) or 0
    local date = GetResourceKvpString(KVP_DATE)
    local seed = tonumber(GetConvar("anomia_stats_record_seed", "0")) or 0
    if seed > rec then
        rec = seed
        date = GetConvar("anomia_stats_record_date_seed", "")
        if date == "" then date = nil end
    end
    return rec, date
end

-- Releve du record toutes les 30 s
CreateThread(function()
    while true do
        Wait(30000)
        local count = #GetPlayers()
        local rec = getRecord()
        if count > rec then
            SetResourceKvp(KVP_RECORD, tostring(count))
            SetResourceKvp(KVP_DATE, os.date("%Y-%m-%d"))
        end
    end
end)

local cache = { data = nil, expiresAt = 0 }

local function compute(cb)
    if cache.data and GetGameTimer() < cache.expiresAt then cb(cache.data) return end
    exports.oxmysql:execute("SELECT COUNT(*) AS players, COALESCE(SUM(playtime_seconds), 0) AS seconds FROM anomia_discord_links", {}, function(rows)
        local players, seconds = 0, 0
        if rows and rows[1] then
            players = tonumber(rows[1].players) or 0
            seconds = tonumber(rows[1].seconds) or 0
        end
        local rec, date = getRecord()
        local data = {
            totalHours = math.floor(seconds / 3600),
            players = players,
            recordPlayers = rec,
            recordDate = date
        }
        cache.data = data
        cache.expiresAt = GetGameTimer() + 10 * 60 * 1000
        cb(data)
    end)
end

SetHttpHandler(function(req, res)
    compute(function(data)
        res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
        res.send(json.encode(data))
    end)
end)

print("[b2_stats] Pret. Ajoute 'ensure b2_stats' dans server.cfg (apres oxmysql et b2_playerlink).")
