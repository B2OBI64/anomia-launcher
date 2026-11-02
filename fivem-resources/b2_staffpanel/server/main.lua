-- ============================================================
-- b2_staffpanel
--
-- Donne au B2 Launcher (version staff) :
--   GET /b2_staffpanel/role     -> { role = "admin" | "mod" | nil }
--   GET /b2_staffpanel/players  -> liste des joueurs connectes (staff uniquement)
--
-- Authentification :
--   * ADMIN : en-tete x-discord-token (jeton Discord du joueur). Le serveur demande a Discord
--     qui est le joueur, puis verifie via le bot qu'il a le role admin sur le Discord Kannibal Team.
--     Sans ce role : aucun acces admin, pas de code de secours.
--   * MODO  : en-tete x-staff-code (code modo, convar privee).
-- Convars (server.cfg, jamais dans le launcher) :
--   setr anomia_discord_bot_token "..."        (deja utilise par b2_discordcheck)
--   set  anomia_staff_guild_id    "445112343064477696"   (Kannibal Team, valeur par defaut)
--   set  anomia_staff_role_id     "1112002757004632215"  (role admin, valeur par defaut)
--   setr anomia_mod_passphrase    "CODE_MODO"
-- Les modos voient la liste des joueurs. Les admins ont en plus la sante du serveur et la maintenance.
--   POST/GET /b2_staffpanel/maintenance/on|off -> bascule la maintenance (admin uniquement)
--   GET /b2_staffpanel/health   -> sante du serveur (admin uniquement)
-- Lecture seule : aucune action (kick/ban...) n'est possible depuis le launcher.
-- ============================================================

local failures = {} -- anti brute-force : 8 essais ratés / minute / adresse

local STAFF_GUILD_DEFAULT = "445112343064477696"
local STAFF_ROLE_DEFAULT = "1112002757004632215"
local roleCache = {} -- jeton Discord -> { role, expires } (60 s)

local function getModRole(code)
    if not code or code == "" then return nil end
    local mod = GetConvar("anomia_mod_passphrase", "")
    if mod ~= "" and code == mod then return "mod" end
    return nil
end

-- Verifie le role admin Discord : cb("admin" | nil)
local function getDiscordRole(token, cb)
    if not token or token == "" or #token > 200 then cb(nil) return end
    local cached = roleCache[token]
    if cached and cached.expires > os.time() then cb(cached.role) return end

    local botToken = GetConvar("anomia_discord_bot_token", "")
    local guildId = GetConvar("anomia_staff_guild_id", STAFF_GUILD_DEFAULT)
    local roleId = GetConvar("anomia_staff_role_id", STAFF_ROLE_DEFAULT)
    if botToken == "" then
        print("[b2_staffpanel] anomia_discord_bot_token manquant : acces admin par role Discord impossible.")
        cb(nil)
        return
    end

    PerformHttpRequest("https://discord.com/api/v10/users/@me", function(status, body)
        local ok, user = pcall(json.decode, body or "")
        if status ~= 200 or not ok or not user or not user.id then cb(nil) return end
        PerformHttpRequest(("https://discord.com/api/v10/guilds/%s/members/%s"):format(guildId, tostring(user.id)), function(st2, body2)
            local ok2, member = pcall(json.decode, body2 or "")
            local role = nil
            if st2 == 200 and ok2 and member and member.roles then
                for _, r in ipairs(member.roles) do
                    if r == roleId then role = "admin" break end
                end
            end
            roleCache[token] = { role = role, expires = os.time() + 60 }
            cb(role)
        end, "GET", "", { ["Authorization"] = "Bot " .. botToken })
    end, "GET", "", { ["Authorization"] = "Bearer " .. token })
end

local function resolveRole(headers, cb)
    local token = headers["x-discord-token"]
    if token and token ~= "" then
        getDiscordRole(token, cb)
        return
    end
    cb(getModRole(headers["x-staff-code"]))
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

    local headers = req.headers or {}
    resolveRole(headers, function(role)
        if not role then
            noteFailure(addr)
            send(res, 403, { error = "invalid_code" })
            return
        end

        local path = tostring(req.path or "")
        if path:find("maintenance", 1, true) then
            if role ~= "admin" then send(res, 403, { error = "admin_only" }) return end
            local state = path:find("/on", 1, true) and "on" or (path:find("/off", 1, true) and "off" or nil)
            if not state then send(res, 400, { error = "bad_state" }) return end
            ExecuteCommand("maintenance " .. state)
            print(("[b2_staffpanel] Maintenance %s demandee depuis le launcher (role Discord admin)."):format(state:upper()))
            send(res, 200, { ok = true, maintenance = state == "on" })
            return
        end
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
end)

print("[b2_staffpanel] Pret. Admin = role Discord (anomia_discord_bot_token requis), modo = anomia_mod_passphrase.")
