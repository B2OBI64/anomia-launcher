-- ============================================================
-- b2_staffpanel
--
-- Donne au B2 Launcher (version staff) :
--   GET /b2_staffpanel/role     -> { role = "admin" | "mod" | nil }
--   GET /b2_staffpanel/players  -> liste des joueurs connectes (staff uniquement)
--
-- Authentification : en-tete  x-staff-code  (le code tape dans le launcher).
-- Configure 2 codes dans server.cfg (convars privees, jamais dans le launcher) :
--   setr anomia_admin_passphrase "CODE_ADMIN"     (deja utilise par b2_maintenance)
--   setr anomia_mod_passphrase   "CODE_MODO"
-- Les modos voient la liste des joueurs. Les admins ont en plus la maintenance.
--   GET /b2_staffpanel/health   -> sante du serveur (admin uniquement)
-- Lecture seule : aucune action (kick/ban...) n'est possible depuis le launcher.
-- ============================================================

local failures = {} -- anti brute-force : 8 essais ratés / minute / adresse

local function getRole(code)
    if not code or code == "" then return nil end
    local admin = GetConvar("anomia_admin_passphrase", "")
    local mod = GetConvar("anomia_mod_passphrase", "")
    if admin ~= "" and code == admin then return "admin" end
    if mod ~= "" and code == mod then return "mod" end
    return nil
end

local function throttled(addr)
    local now = os.time()
    local f = failures[addr]
    if f and now - f.since > 60 then failures[addr] = nil f = nil end
    return f and f.count >= 8
end

local function noteFailure(addr)
    local now = os.time()
    local f = failures[addr]
    if not f then failures[addr] = { since = now, count = 1 } else f.count = f.count + 1 end
end

local function send(res, status, body)
    res.writeHead(status, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
    res.send(json.encode(body))
end

local function getCore()
    local ok, core = pcall(function() return exports['qb-core']:GetCoreObject() end)
    if ok then return core end
    return nil
end

-- Sante du serveur (admin uniquement) : ce que FXServer permet de lire depuis Lua.
-- La RAM/CPU reels de la machine restent visibles dans txAdmin.
local startedAt = os.time()
local recentStops = {} -- derniers arrets de ressources (peuvent trahir un crash)

AddEventHandler("onResourceStop", function(name)
    table.insert(recentStops, 1, { name = name, at = os.time() })
    while #recentStops > 8 do table.remove(recentStops) end
end)

local function buildHealth()
    local ids = GetPlayers()
    local sum, max = 0, 0
    for _, id in ipairs(ids) do
        local p = GetPlayerPing(id) or 0
        sum = sum + p
        if p > max then max = p end
    end
    local total, started = GetNumResources(), 0
    for i = 0, total - 1 do
        local rname = GetResourceByFindIndex(i)
        if rname and GetResourceState(rname) == "started" then started = started + 1 end
    end
    local stops = {}
    for _, s in ipairs(recentStops) do
        table.insert(stops, { name = s.name, secondsAgo = os.time() - s.at })
    end
    return {
        uptimeSeconds = os.time() - startedAt,
        players = #ids,
        maxClients = GetConvarInt("sv_maxclients", 0),
        avgPing = #ids > 0 and math.floor(sum / #ids) or 0,
        maxPing = max,
        resourcesStarted = started,
        resourcesTotal = total,
        recentStops = stops
    }
end

local function buildPlayers()
    local core = getCore()
    local list = {}
    for _, id in ipairs(GetPlayers()) do
        local entry = {
            id = tonumber(id),
            name = GetPlayerName(id) or "?",
            ping = GetPlayerPing(id) or 0,
            job = nil,
            onDuty = nil,
            character = nil
        }
        if core then
            local ok, player = pcall(function() return core.Functions.GetPlayer(tonumber(id)) end)
            if ok and player and player.PlayerData then
                local pd = player.PlayerData
                entry.job = pd.job and (pd.job.label or pd.job.name) or nil
                entry.onDuty = pd.job and pd.job.onduty or nil
                if pd.charinfo then
                    entry.character = ((pd.charinfo.firstname or "") .. " " .. (pd.charinfo.lastname or "")):match("^%s*(.-)%s*$")
                end
            end
        end
        table.insert(list, entry)
    end
    table.sort(list, function(a, b) return a.id < b.id end)
    return list
end

SetHttpHandler(function(req, res)
    local addr = tostring(req.address or "?")
    if throttled(addr) then
        send(res, 429, { error = "too_many_attempts" })
        return
    end

    local role = getRole(req.headers["x-staff-code"])
    if not role then
        noteFailure(addr)
        send(res, 403, { error = "invalid_code" })
        return
    end

    local path = tostring(req.path or "")
    if path:find("health", 1, true) then
        if role ~= "admin" then
            send(res, 403, { error = "admin_only" })
            return
        end
        send(res, 200, { role = role, health = buildHealth() })
        return
    end
    if path:find("players", 1, true) then
        send(res, 200, { role = role, players = buildPlayers(), maxClients = GetConvarInt("sv_maxclients", 0) })
    else
        send(res, 200, { role = role })
    end
end)

print("[b2_staffpanel] Pret. Verifie anomia_admin_passphrase et anomia_mod_passphrase dans server.cfg.")
