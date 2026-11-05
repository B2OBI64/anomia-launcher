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
--   * MODO  : role Moderateur sur le Discord Anomia (meme en-tete x-discord-token), ou en-tete x-staff-code (code modo, convar privee).
-- Convars (server.cfg, jamais dans le launcher) :
--   setr anomia_discord_bot_token "..."        (deja utilise par b2_discordcheck)
--   set  anomia_staff_guild_id    "445112343064477696"   (Kannibal Team, valeur par defaut)
--   set  anomia_staff_role_id     "1112002757004632215"  (role admin, valeur par defaut)
--   set  anomia_mod_guild_id      "1407312954616975360"  (serveur Discord Anomia, valeur par defaut)
--   set  anomia_mod_role_id       "1434845539094233098"  (role Moderateur, valeur par defaut)
--   setr anomia_mod_passphrase    "CODE_MODO"  (secours, facultatif)
-- Les modos voient la liste des joueurs. Les admins ont en plus la sante du serveur et la maintenance.
--   POST/GET /b2_staffpanel/maintenance/on|off -> bascule la maintenance (admin uniquement)
--   GET /b2_staffpanel/health   -> sante du serveur (admin uniquement)
--   GET /b2_staffpanel/kbstatus -> { kbMaintenance } (public) ; /kbmaintenance/on|off (admin) : maintenance KannibAventure
--   GET /b2_staffpanel/subcheck -> { sub } (en-tete x-discord-token) : role abonne sur Kannibal Team (convar anomia_sub_role_id)
-- Lecture seule : aucune action (kick/ban...) n'est possible depuis le launcher.
-- ============================================================

local failures = {} -- anti brute-force : 8 essais ratés / minute / adresse

local STAFF_GUILD_DEFAULT = "445112343064477696"
local STAFF_ROLE_DEFAULT = "1112002757004632215"
local MOD_GUILD_DEFAULT = "1407312954616975360" -- serveur Discord Anomia
local MOD_ROLE_DEFAULT = "1434845539094233098"  -- role Modérateur Anomia
local SUB_ROLE_DEFAULT = "1433850593759465554"   -- role abonne Twitch sur Kannibal Team (theme "pluie de logos")
local KB_MAINT_KEY = "kb_maintenance"           -- etat de maintenance de KannibAventure (persistant)
local roleCache = {} -- jeton Discord -> { role, expires } (60 s)
-- Statut Minecraft mis en cache (1 requete par minute max, quel que soit le nombre de joueurs du launcher)
-- Convar : set anomia_kb_host "ip:port"  (si absente, le launcher interroge lui-meme le serveur)
local kbCache = { at = 0, data = nil, busy = false }
local function refreshKb(cb)
    local host = GetConvar("anomia_kb_host", "")
    if host == "" then cb(nil) return end
    if kbCache.data and (os.time() - kbCache.at) < 60 then cb(kbCache.data) return end
    if kbCache.busy then cb(kbCache.data) return end
    kbCache.busy = true
    PerformHttpRequest("https://api.mcsrvstat.us/3/" .. host, function(status, body)
        kbCache.busy = false
        local ok, j = pcall(json.decode, body or "")
        if status == 200 and ok and type(j) == "table" then
            kbCache.data = { online = j.online and true or false, players = j.players and j.players.online or 0, maxPlayers = j.players and j.players.max or 0, version = j.version }
            kbCache.at = os.time()
        elseif not kbCache.data then
            kbCache.data = nil
        end
        cb(kbCache.data)
    end, "GET", "", { ["User-Agent"] = "KannibalLauncher/1.0" })
end
local subCache = {}  -- jeton Discord -> { sub, expires } (120 s)

local function getModRole(code)
    if not code or code == "" then return nil end
    local mod = GetConvar("anomia_mod_passphrase", "")
    if mod ~= "" and code == mod then return "mod" end
    return nil
end

-- Lecture du role d'un membre via le bot : cb(hasRole, status)
local function memberHasRole(botToken, guildId, roleId, userId, cb)
    PerformHttpRequest(("https://discord.com/api/v10/guilds/%s/members/%s"):format(guildId, tostring(userId)), function(st, body)
        local ok, member = pcall(json.decode, body or "")
        if st == 200 and ok and member and member.roles then
            for _, r in ipairs(member.roles) do
                if r == roleId then cb(true, st) return end
            end
            cb(false, st)
            return
        end
        if st ~= 404 then
            print(("[b2_staffpanel] Lecture du membre Discord impossible (HTTP %s) : bot present sur le serveur ? Intent membres actif ?"):format(tostring(st)))
        end
        cb(false, st)
    end, "GET", "", { ["Authorization"] = "Bot " .. botToken })
end

-- Verifie le role Discord : admin (Kannibal Team) puis modo (serveur Anomia). cb("admin" | "mod" | nil, raison)
local function getDiscordRole(token, cb)
    if not token or token == "" or #token > 200 then cb(nil, "bad_token") return end
    local cached = roleCache[token]
    if cached and cached.expires > os.time() then cb(cached.role, cached.reason) return end

    local botToken = GetConvar("anomia_discord_bot_token", "")
    local guildId = GetConvar("anomia_staff_guild_id", STAFF_GUILD_DEFAULT)
    local roleId = GetConvar("anomia_staff_role_id", STAFF_ROLE_DEFAULT)
    local modGuildId = GetConvar("anomia_mod_guild_id", MOD_GUILD_DEFAULT)
    local modRoleId = GetConvar("anomia_mod_role_id", MOD_ROLE_DEFAULT)
    if botToken == "" then
        print("[b2_staffpanel] anomia_discord_bot_token manquant : acces par role Discord impossible.")
        cb(nil, "no_bot_token")
        return
    end

    PerformHttpRequest("https://discord.com/api/v10/users/@me", function(status, body)
        local ok, user = pcall(json.decode, body or "")
        if status ~= 200 or not ok or not user or not user.id then
            print(("[b2_staffpanel] Jeton Discord refuse (HTTP %s)."):format(tostring(status)))
            cb(nil, "token_expired")
            return
        end
        local function finish(role, reason)
            roleCache[token] = { role = role, reason = reason, expires = os.time() + 60 }
            cb(role, reason)
        end
        memberHasRole(botToken, guildId, roleId, user.id, function(isAdmin, st)
            if isAdmin then finish("admin", nil) return end
            local adminReason = (st == 200 and "missing_role") or (st == 404 and "not_in_guild") or "bot_error"
            -- pas admin : verifie le role modo sur le serveur Anomia
            memberHasRole(botToken, modGuildId, modRoleId, user.id, function(isMod)
                if isMod then finish("mod", nil) else finish(nil, adminReason) end
            end)
        end)
    end, "GET", "", { ["Authorization"] = "Bearer " .. token })
end

-- Role abonne : le joueur a-t-il le role sub sur le Discord Kannibal Team ? cb(true|false)
local function checkSub(token, cb)
    if not token or token == "" or #token > 200 then cb(false) return end
    local cached = subCache[token]
    if cached and cached.expires > os.time() then cb(cached.sub) return end
    local botToken = GetConvar("anomia_discord_bot_token", "")
    if botToken == "" then cb(false) return end
    PerformHttpRequest("https://discord.com/api/v10/users/@me", function(status, body)
        local ok, user = pcall(json.decode, body or "")
        if status ~= 200 or not ok or not user or not user.id then cb(false) return end
        memberHasRole(botToken, GetConvar("anomia_staff_guild_id", STAFF_GUILD_DEFAULT), GetConvar("anomia_sub_role_id", SUB_ROLE_DEFAULT), user.id, function(has)
            subCache[token] = { sub = has and true or false, expires = os.time() + 120 }
            cb(has and true or false)
        end)
    end, "GET", "", { ["Authorization"] = "Bearer " .. token })
end

local function resolveRole(headers, cb)
    local token = headers["x-discord-token"]
    if token and token ~= "" then
        getDiscordRole(token, cb)
        return
    end
    cb(getModRole(headers["x-staff-code"]), "invalid_code")
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
    local ppath = tostring(req.path or "")
    -- Routes publiques (aucun role requis)
    if ppath:find("kbstatus", 1, true) then
        local maint = GetResourceKvpString(KB_MAINT_KEY) == "true"
        refreshKb(function(kb) send(res, 200, { kbMaintenance = maint, kb = kb }) end)
        return
    end
    if ppath:find("subcheck", 1, true) then
        checkSub(headers["x-discord-token"], function(has) send(res, 200, { sub = has }) end)
        return
    end
    resolveRole(headers, function(role, reason)
        if not role then
            noteFailure(addr)
            send(res, 403, { error = "invalid_code", reason = reason or "invalid_code" })
            return
        end

        local path = tostring(req.path or "")
        if path:find("kbmaintenance", 1, true) then
            if role ~= "admin" then send(res, 403, { error = "admin_only" }) return end
            local state = path:find("/on", 1, true) and "on" or (path:find("/off", 1, true) and "off" or nil)
            if not state then send(res, 400, { error = "bad_state" }) return end
            SetResourceKvp(KB_MAINT_KEY, state == "on" and "true" or "false")
            print(("[b2_staffpanel] Maintenance KannibAventure %s (role Discord admin)."):format(state:upper()))
            send(res, 200, { ok = true, kbMaintenance = state == "on" })
            return
        end
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
