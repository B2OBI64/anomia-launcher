-- ============================================================
-- b2_staffpanel
--
-- Donne au B2 Launcher (version staff) :
--   GET /b2_staffpanel/role     -> { role = "admin" | "mod" | nil, scopes = { anomia, kb } }
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
--   GET /b2_staffpanel/rolecheck/anomia|kannibaventure -> { citizen: true|false|null } (role citoyen requis pour jouer)
--   GET /b2_staffpanel/events/list|join|leave|create|delete  -> evenements (create/delete : admin Kannibal Team)
--   GET /b2_staffpanel/friends/ping|list|add|accept|decline|cancel|remove -> amis (compte Discord)
--   GET /b2_staffpanel/announce/list|img|create|delete -> annonces importantes (create/delete : admin Kannibal Team)
--   GET /b2_staffpanel/kbdevlog/list|create|delete -> journal de dev KannibAventure (create/delete : admin KB)
--   GET /b2_staffpanel/polls/list|vote|create|close|delete  -> sondages (list/vote : Discord ; create/close/delete : fondateur/admin Kannibal Team)
--   GET /b2_staffpanel/subcheck -> { sub } (en-tete x-discord-token) : role abonne sur Kannibal Team (convar anomia_sub_role_id)
-- Lecture seule : aucune action (kick/ban...) n'est possible depuis le launcher.
-- ============================================================

local failures = {} -- anti brute-force : 8 essais ratés / minute / adresse

local STAFF_GUILD_DEFAULT = "445112343064477696"
local STAFF_ROLE_DEFAULT = "1112002757004632215"
local MOD_GUILD_DEFAULT = "1407312954616975360" -- serveur Discord Anomia
local MOD_ROLE_DEFAULT = "1434845539094233098"  -- role Modérateur Anomia
local SUB_ROLE_DEFAULT = "1433850593759465554"   -- role abonne Twitch sur Kannibal Team (theme "pluie de logos")
-- Admin du launcher : fondateur + admin de chaque Discord (guild:role). scope : all = tous les serveurs, anomia, kb.
-- Fondateurs et admin Kannibal Team = tous les droits ; admin Anomia = Anomia ; admin KannibAventure = KannibAventure. Ajouts possibles : set anomia_extra_admin_roles "guild:role,guild:role"
local ADMIN_ROLES = {
    { guild = "445112343064477696",  role = "1112002757004632215", scope = "all" }, -- Kannibal Team : fondateur
    { guild = "445112343064477696",  role = "1112001736303984750", scope = "all" }, -- Kannibal Team : administrateur
    { guild = "1407312954616975360", role = "1443623997316006040", scope = "all" }, -- Anomia : fondateur
    { guild = "1407312954616975360", role = "1443624137607352321", scope = "anomia" }, -- Anomia : admin
    { guild = "1357757210272469212", role = "1357760463903133902", scope = "kb" }, -- KannibAventure : administrateur
}
-- Role citoyen requis pour se connecter a chaque serveur
local CITIZEN = {
    anomia = { guild = "1407312954616975360", role = "1434849042319278231", convar = "anomia_citizen_role_id" },
    kannibaventure = { guild = "1357757210272469212", role = "1370879305097154692", convar = "anomia_kb_citizen_role_id" },
}
local function adminRoleList()
    local list = {}
    local g, r = GetConvar("anomia_staff_guild_id", ""), GetConvar("anomia_staff_role_id", "")
    if g ~= "" and r ~= "" then list[#list + 1] = { guild = g, role = r, scope = "all" } end
    for _, e in ipairs(ADMIN_ROLES) do list[#list + 1] = e end
    for guild, role in GetConvar("anomia_extra_admin_roles", ""):gmatch("(%d+):(%d+)") do list[#list + 1] = { guild = guild, role = role, scope = "all" } end
    return list
end
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
            kbCache.data = { online = j.online and true or false, players = j.players and j.players.online or 0, maxPlayers = j.players and j.players.max or 0, version = j.version, list = (function() local l = {} if j.players and type(j.players.list) == "table" then for _, pl in ipairs(j.players.list) do if pl.name then l[#l + 1] = pl.name end end end return l end)() }
            kbCache.at = os.time()
        elseif not kbCache.data then
            kbCache.data = nil
        end
        cb(kbCache.data)
    end, "GET", "", { ["User-Agent"] = "KannibalLauncher/1.0" })
end
-- Succes KannibAventure : donnees poussees par un script sur la machine Minecraft (tools/kb-export/export.py)
-- Convar : set anomia_kb_push_secret "un-long-secret"  (sans elle, la route kbpush est desactivee)
local KB_STATS_KEY = "kb_stats"
local kbStats = { players = {}, at = 0 }
do
    local raw = GetResourceKvpString(KB_STATS_KEY)
    if raw then local ok, j = pcall(json.decode, raw) if ok and type(j) == "table" then kbStats = j end end
end
local function kbPlayerView(p)
    return { name = p.name, adv = p.adv or {}, playTicks = p.playTicks or 0, at = kbStats.at }
end
local function kbFind(uuid, name)
    if uuid and uuid ~= "" then
        local key = tostring(uuid):lower():gsub("-", "")
        local p = kbStats.players[key]
        if p then return p end
    end
    if name and name ~= "" then
        for _, p in pairs(kbStats.players) do
            if p.name and p.name:lower() == name:lower() then return p end
        end
    end
    return nil
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
    if cached and cached.expires > os.time() then cb(cached.role, cached.reason, cached.scopes) return end

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
        local function finish(role, reason, scopes)
            roleCache[token] = { role = role, reason = reason, scopes = scopes, expires = os.time() + 60 }
            cb(role, reason, scopes)
        end
        -- admin = fondateur ou admin sur l'un des 3 Discord (Kannibal Team, Anomia, KannibAventure)
        local list = adminRoleList()
        local i, firstSt = 0, nil
        local scopes = { anomia = false, kb = false, kt = false }
        local isAdmin = false
        local function nextAdmin()
            i = i + 1
            local e = list[i]
            if not e then
                if isAdmin then finish("admin", nil, scopes) return end
                -- pas admin : verifie le role modo sur le serveur Anomia (lecture seule, pas de maintenance)
                memberHasRole(botToken, modGuildId, modRoleId, user.id, function(isMod)
                    if isMod then finish("mod", nil, { anomia = false, kb = false }) return end
                    local st = firstSt
                    finish(nil, (st == 200 and "missing_role") or (st == 404 and "not_in_guild") or "bot_error", nil)
                end)
                return
            end
            memberHasRole(botToken, e.guild, e.role, user.id, function(has, st)
                if has then
                    isAdmin = true
                    if e.scope == "all" or e.scope == "anomia" then scopes.anomia = true end
                    if e.scope == "all" or e.scope == "kb" then scopes.kb = true end
                    if e.guild == STAFF_GUILD_DEFAULT then scopes.kt = true end -- fondateur/admin Kannibal Team : sondages
                end
                if i == 1 then firstSt = st end
                if st == 200 then firstSt = 200 end
                nextAdmin()
            end)
        end
        nextAdmin()
    end, "GET", "", { ["Authorization"] = "Bearer " .. token })
end

-- Role citoyen (requis pour jouer) : cb(true|false|nil) ; nil = verification impossible
local citizenCache = {}
local function checkCitizen(token, server, cb)
    if not token or token == "" or #token > 200 then cb(nil) return end
    local def = CITIZEN[server]
    if not def then cb(nil) return end
    local key = token .. ":" .. server
    local c = citizenCache[key]
    if c and c.expires > os.time() then cb(c.v) return end
    local botToken = GetConvar("anomia_discord_bot_token", "")
    if botToken == "" then cb(nil) return end
    PerformHttpRequest("https://discord.com/api/v10/users/@me", function(status, body)
        local ok, user = pcall(json.decode, body or "")
        if status ~= 200 or not ok or not user or not user.id then cb(nil) return end
        memberHasRole(botToken, def.guild, GetConvar(def.convar, def.role), user.id, function(has, st)
            local v
            if st == 200 then v = has and true or false elseif st == 404 then v = false else v = nil end
            citizenCache[key] = { v = v, expires = os.time() + 60 }
            cb(v)
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

-- ============================================================
-- Sondages (stockes dans le KVP de la ressource)
-- ============================================================
local POLLS_KEY = "b2sp_polls"
local function urldecode(v)
    if not v then return nil end
    return (tostring(v):gsub("+", " "):gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end
local function qparam(path, name)
    local q = tostring(path or ""):match("%?(.*)") or ""
    return urldecode(q:match("[&]?" .. name .. "=([^&]*)"))
end
local function loadPolls()
    local raw = GetResourceKvpString(POLLS_KEY)
    local ok, t = pcall(json.decode, raw or "[]")
    if not ok or type(t) ~= "table" then return {} end
    return t
end
local function savePolls(list) SetResourceKvp(POLLS_KEY, json.encode(list)) end
local function pollClosed(p) return p.closed == true or (p.endsAt and p.endsAt > 0 and os.time() >= p.endsAt) end
-- user Discord depuis le jeton OAuth : cb(id, username|nil)
local function discordUser(token, cb)
    if not token or token == "" or #token > 200 then cb(nil) return end
    PerformHttpRequest("https://discord.com/api/v10/users/@me", function(status, body)
        local ok, u = pcall(json.decode, body or "")
        if status ~= 200 or not ok or not u or not u.id then cb(nil) return end
        cb(tostring(u.id), tostring(u.global_name or u.username or "?"), tostring(u.username or ""))
    end, "GET", "", { ["Authorization"] = "Bearer " .. token })
end
local function pollView(p, uid, withCounts)
    local v = { id = p.id, question = p.question, options = p.options, createdAt = p.createdAt, endsAt = p.endsAt or 0, createdBy = p.createdBy, closed = pollClosed(p) and true or false, myVote = (uid and p.votes[uid]) or nil }
    if withCounts then
        local counts, total = {}, 0
        for i = 1, #p.options do counts[i] = 0 end
        for _, opt in pairs(p.votes) do if counts[opt] then counts[opt] = counts[opt] + 1 total = total + 1 end end
        v.counts, v.total = counts, total
    end
    return v
end
local function handlePolls(req, res, headers)
    local path = tostring(req.path or "")
    local action = path:match("polls/(%a+)") or "list"
    local token = headers["x-discord-token"]
    local function withKt(cb) -- fondateur/admin Kannibal Team uniquement
        getDiscordRole(token, function(role, reason, scopes)
            if role == "admin" and scopes and scopes.kt then cb() else send(res, 403, { error = "kt_admin_only" }) end
        end)
    end
    if action == "list" then
        local function respond(uid, isKt)
            local out, now = {}, os.time()
            for _, p in ipairs(loadPolls()) do
                local closed = pollClosed(p)
                -- les sondages termines restent visibles 3 jours
                if not closed or (now - (p.endsAt and p.endsAt > 0 and p.endsAt or (p.closedAt or now))) < 3 * 86400 then
                    out[#out + 1] = pollView(p, uid, isKt)
                end
            end
            send(res, 200, { polls = out, canManage = isKt and true or false })
        end
        discordUser(token, function(uid)
            if not uid then respond(nil, false) return end
            getDiscordRole(token, function(role, _, scopes) respond(uid, role == "admin" and scopes and scopes.kt) end)
        end)
        return
    end
    if action == "vote" then
        local id, opt = qparam(path, "id"), tonumber(qparam(path, "opt"))
        discordUser(token, function(uid)
            if not uid then send(res, 401, { error = "discord_required" }) return end
            local botToken = GetConvar("anomia_discord_bot_token", "")
            memberHasRole(botToken, STAFF_GUILD_DEFAULT, "0", uid, function(_, st)
                if st ~= 200 then send(res, 403, { error = st == 404 and "not_in_guild" or "unavailable" }) return end
                local list = loadPolls()
                for _, p in ipairs(list) do
                    if p.id == id then
                        if pollClosed(p) then send(res, 409, { error = "closed" }) return end
                        if not opt or opt < 1 or opt > #p.options or opt % 1 ~= 0 then send(res, 400, { error = "bad_option" }) return end
                        if p.votes[uid] then send(res, 409, { error = "already_voted", myVote = p.votes[uid] }) return end
                        p.votes[uid] = opt
                        savePolls(list)
                        send(res, 200, { ok = true, myVote = opt })
                        return
                    end
                end
                send(res, 404, { error = "not_found" })
            end)
        end)
        return
    end
    if action == "create" then
        withKt(function()
            local q = qparam(path, "q")
            local opts = {}
            for raw in tostring(qparam(path, "o") or ""):gmatch("[^|]+") do
                local o = raw:match("^%s*(.-)%s*$")
                if o ~= "" then opts[#opts + 1] = o:sub(1, 80) end
            end
            local endsAt = tonumber(qparam(path, "end")) or 0
            if not q or q:match("^%s*$") or #opts < 2 or #opts > 6 then send(res, 400, { error = "bad_poll" }) return end
            if endsAt ~= 0 and endsAt <= os.time() then send(res, 400, { error = "bad_end" }) return end
            local list = loadPolls()
            if #list >= 30 then table.remove(list, 1) end
            local id = ("%d%04d"):format(os.time(), math.random(0, 9999))
            list[#list + 1] = { id = id, question = q:sub(1, 200), options = opts, createdAt = os.time(), endsAt = endsAt, createdBy = "Kannibal Team", votes = {} }
            savePolls(list)
            send(res, 200, { ok = true, id = id })
        end)
        return
    end
    if action == "close" or action == "delete" then
        withKt(function()
            local id = qparam(path, "id")
            local list = loadPolls()
            for i, p in ipairs(list) do
                if p.id == id then
                    if action == "delete" then table.remove(list, i) else p.closed = true p.closedAt = os.time() end
                    savePolls(list)
                    send(res, 200, { ok = true })
                    return
                end
            end
            send(res, 404, { error = "not_found" })
        end)
        return
    end
    send(res, 400, { error = "bad_action" })
end

-- ============================================================
-- Evenements (stockes dans le KVP) : les admins Kannibal Team creent, les joueurs participent
-- ============================================================
local EVENTS_KEY = "b2sp_events"
local function loadEvents()
    local raw = GetResourceKvpString(EVENTS_KEY)
    local ok, t = pcall(json.decode, raw or "[]")
    if not ok or type(t) ~= "table" then return {} end
    return t
end
local function saveEvents(list) SetResourceKvp(EVENTS_KEY, json.encode(list)) end
local function countGoing(e) local n = 0 for _ in pairs(e.going or {}) do n = n + 1 end return n end
local function handleEvents(req, res, headers)
    local path = tostring(req.path or "")
    local action = path:match("events/(%a+)") or "list"
    local token = headers["x-discord-token"]
    local function withKt(cb)
        getDiscordRole(token, function(role, reason, scopes)
            if role == "admin" and scopes and scopes.kt then cb() else send(res, 403, { error = "kt_admin_only" }) end
        end)
    end
    if action == "list" then
        local function respond(uid, isKt)
            local out, now = {}, os.time()
            for _, e in ipairs(loadEvents()) do
                -- visible jusqu'a 6 h apres le debut
                if (e.startsAt or 0) + 6 * 3600 > now then
                    local v = { id = e.id, title = e.title, desc = e.desc, hasImg = e.hasImg and true or false, startsAt = e.startsAt, max = e.max or 0, going = countGoing(e), mine = (uid and e.going[uid]) and true or false }
                    if isKt then local names = {} for _, n in pairs(e.going) do names[#names + 1] = n end table.sort(names) v.names = names end
                    out[#out + 1] = v
                end
            end
            table.sort(out, function(a, b) return a.startsAt < b.startsAt end)
            send(res, 200, { events = out, canManage = isKt and true or false })
        end
        discordUser(token, function(uid)
            if not uid then respond(nil, false) return end
            getDiscordRole(token, function(role, _, scopes) respond(uid, role == "admin" and scopes and scopes.kt) end)
        end)
        return
    end
    if action == "join" or action == "leave" then
        local id = qparam(path, "id")
        discordUser(token, function(uid, uname)
            if not uid then send(res, 401, { error = "discord_required" }) return end
            local function apply()
                local list = loadEvents()
                for _, e in ipairs(list) do
                    if e.id == id then
                        e.going = e.going or {}
                        if action == "join" then
                            if (e.startsAt or 0) + 6 * 3600 <= os.time() then send(res, 409, { error = "ended" }) return end
                            if not e.going[uid] and (e.max or 0) > 0 and countGoing(e) >= e.max then send(res, 409, { error = "full" }) return end
                            e.going[uid] = uname or "?"
                        else
                            e.going[uid] = nil
                        end
                        saveEvents(list)
                        send(res, 200, { ok = true, going = countGoing(e), mine = e.going[uid] and true or false })
                        return
                    end
                end
                send(res, 404, { error = "not_found" })
            end
            if action == "leave" then apply() return end
            local botToken = GetConvar("anomia_discord_bot_token", "")
            memberHasRole(botToken, STAFF_GUILD_DEFAULT, "0", uid, function(_, st)
                if st ~= 200 then send(res, 403, { error = st == 404 and "not_in_guild" or "unavailable" }) return end
                apply()
            end)
        end)
        return
    end
    if action == "img" then
        local id = qparam(path, "id")
        send(res, 200, { img = GetResourceKvpString("b2sp_evimg_" .. tostring(id or "")) or "" })
        return
    end
    if action == "create" then
        -- corps JSON (POST) : { t, d, at, img }  (img = data URL jpeg/png/webp, 300 Ko max)
        withKt(function()
            req.setDataHandler(function(body)
                local ok, j = pcall(json.decode, body or "")
                if not ok or type(j) ~= "table" then send(res, 400, { error = "bad_body" }) return end
                local t, d, at = tostring(j.t or ""), tostring(j.d or ""), tonumber(j.at) or 0
                local img = tostring(j.img or "")
                if t:match("^%s*$") then send(res, 400, { error = "bad_event" }) return end
                if at <= os.time() then send(res, 400, { error = "bad_date" }) return end
                if img ~= "" and (#img > 300000 or not img:match("^data:image/[%w%+]+;base64,[%w%+/=]+$")) then send(res, 400, { error = "bad_image" }) return end
                local list = loadEvents()
                if #list >= 40 then local old = table.remove(list, 1) DeleteResourceKvp("b2sp_evimg_" .. tostring(old.id)) end
                local id = ("%d%04d"):format(os.time(), math.random(0, 9999))
                list[#list + 1] = { id = id, title = t:sub(1, 80), desc = d:sub(1, 600), startsAt = at, hasImg = img ~= "", going = {}, createdAt = os.time() }
                if img ~= "" then SetResourceKvp("b2sp_evimg_" .. id, img) end
                saveEvents(list)
                send(res, 200, { ok = true, id = id })
            end)
        end)
        return
    end
    if action == "delete" then
        withKt(function()
            local id = qparam(path, "id")
            local list = loadEvents()
            for i, e in ipairs(list) do
                if e.id == id then table.remove(list, i) saveEvents(list) DeleteResourceKvp("b2sp_evimg_" .. tostring(id)) send(res, 200, { ok = true }) return end
            end
            send(res, 404, { error = "not_found" })
        end)
        return
    end
    send(res, 400, { error = "bad_action" })
end

-- ============================================================
-- Amis (presence en memoire + liens en KVP). Reposent sur les comptes Discord relies au launcher.
-- ============================================================
local USERS_KEY = "b2sp_users"          -- uid -> { n = pseudo, u = username, t = derniere activite }
local presence = {}                     -- uid -> { s = "launcher"|"anomia"|"kb", t = os.time(), inv = bool }
local PRESENCE_TTL = 150                -- secondes sans ping => hors ligne
local function loadJsonKey(key, default)
    local ok, t = pcall(json.decode, GetResourceKvpString(key) or "")
    if not ok or type(t) ~= "table" then return default end
    return t
end
local function frKey(uid) return "b2sp_fr_" .. uid end
local function loadFr(uid)
    local t = loadJsonKey(frKey(uid), {})
    t.friends, t.inc, t.out = t.friends or {}, t.inc or {}, t.out or {}
    return t
end
local function saveFr(uid, t) SetResourceKvp(frKey(uid), json.encode(t)) end
local function listHas(l, uid) for _, v in ipairs(l) do if v == uid then return true end end return false end
local function listDel(l, uid) for i, v in ipairs(l) do if v == uid then table.remove(l, i) return end end end
local function userName(users, uid) return (users[uid] and users[uid].n) or "?" end
local function isOnline(uid)
    local p = presence[uid]
    if not p or p.inv then return false end
    return (os.time() - p.t) <= PRESENCE_TTL
end
-- Membres des Discord Anomia + KannibAventure (liste d'amis possibles). Necessite l'intent "Server Members" du bot.
local KB_GUILD_DEFAULT = "1357757210272469212"
local membersCache = { t = 0, map = {}, err = nil }
local membersWait = nil
local function fetchMembers(cb)
    if (os.time() - membersCache.t) < 600 and next(membersCache.map) then cb(membersCache) return end
    if membersWait then membersWait[#membersWait + 1] = cb return end
    membersWait = { cb }
    local function done()
        local w = membersWait membersWait = nil
        for _, f in ipairs(w) do f(membersCache) end
    end
    local botToken = GetConvar("anomia_discord_bot_token", "")
    if botToken == "" then membersCache.err = "no_bot_token" done() return end
    local guilds = { GetConvar("anomia_mod_guild_id", MOD_GUILD_DEFAULT), GetConvar("anomia_kb_guild_id", KB_GUILD_DEFAULT) }
    local map, gi, err = {}, 1, nil
    local function nextPage(after, pages)
        local gid = guilds[gi]
        if not gid then
            membersCache = { t = os.time(), map = map, err = (next(map) == nil) and (err or "empty") or nil }
            done() return
        end
        local url = ("https://discord.com/api/v10/guilds/%s/members?limit=1000%s"):format(gid, after and ("&after=" .. after) or "")
        PerformHttpRequest(url, function(st, body)
            if st ~= 200 then err = (st == 403 and "members_intent") or ("http_" .. tostring(st)) gi = gi + 1 nextPage(nil, 0) return end
            local ok, arr = pcall(json.decode, body or "")
            if not ok or type(arr) ~= "table" then gi = gi + 1 nextPage(nil, 0) return end
            local last
            for _, m in ipairs(arr) do
                local u = m.user
                if u and u.id then
                    last = u.id
                    if not u.bot then
                        local name = (m.nick and m.nick ~= "" and m.nick) or u.global_name or u.username or "?"
                        if not map[u.id] then map[u.id] = { n = tostring(name):sub(1, 40), u = tostring(u.username or ""):sub(1, 40) } end
                    end
                end
            end
            if #arr >= 1000 and last and pages < 9 then nextPage(last, pages + 1) else gi = gi + 1 nextPage(nil, 0) end
        end, "GET", "", { ["Authorization"] = "Bot " .. botToken })
    end
    nextPage(nil, 0)
end
local function handleFriends(req, res, headers)
    local path = tostring(req.path or "")
    local action = path:match("friends/(%a+)") or "list"
    local token = headers["x-discord-token"]
    discordUser(token, function(me, myName, myUser)
        if not me then send(res, 401, { error = "discord_required" }) return end
        local users = loadJsonKey(USERS_KEY, {})
        local u = users[me]
        local now = os.time()
        if not u or u.n ~= myName or u.u ~= myUser or (now - (u.t or 0)) > 3600 then
            users[me] = { n = myName, u = myUser, t = now }
            SetResourceKvp(USERS_KEY, json.encode(users))
        end
        local fr = loadFr(me)
        if action == "ping" then
            local st = qparam(path, "s")
            if st ~= "anomia" and st ~= "kb" then st = "launcher" end
            presence[me] = { s = st, t = now, inv = qparam(path, "inv") == "1" }
            send(res, 200, { ok = true })
            return
        end
        if action == "directory" then
            fetchMembers(function(cache)
                local rel = {}
                for _, id in ipairs(fr.friends) do rel[id] = "f" end
                for _, id in ipairs(fr.out) do rel[id] = "o" end
                for _, id in ipairs(fr.inc) do rel[id] = "i" end
                local out, seen = {}, {}
                local function push(id, n, un)
                    if id == me or seen[id] then return end
                    seen[id] = true
                    local on = isOnline(id)
                    out[#out + 1] = { uid = id, name = n, u = un, l = users[id] and 1 or 0, on = on and 1 or 0, s = on and presence[id].s or nil, rel = rel[id] }
                end
                for id, info in pairs(cache.map) do push(id, info.n, info.u) end
                for id, info in pairs(users) do push(id, info.n, info.u) end
                table.sort(out, function(a, b)
                    if a.on ~= b.on then return a.on > b.on end
                    if a.l ~= b.l then return a.l > b.l end
                    return tostring(a.name):lower() < tostring(b.name):lower()
                end)
                if #out > 3500 then for i = #out, 3501, -1 do out[i] = nil end end
                send(res, 200, { members = out, error = cache.err })
            end)
            return
        end
        if action == "list" then
            local out = { me = { uid = me, name = myName }, friends = {}, incoming = {}, outgoing = {} }
            for _, id in ipairs(fr.friends) do
                local on = isOnline(id)
                out.friends[#out.friends + 1] = { uid = id, name = userName(users, id), online = on, s = on and presence[id].s or nil }
            end
            table.sort(out.friends, function(a, b)
                if a.online ~= b.online then return a.online end
                return tostring(a.name):lower() < tostring(b.name):lower()
            end)
            for _, id in ipairs(fr.inc) do out.incoming[#out.incoming + 1] = { uid = id, name = userName(users, id) } end
            for _, id in ipairs(fr.out) do out.outgoing[#out.outgoing + 1] = { uid = id, name = userName(users, id) } end
            send(res, 200, out)
            return
        end
        local function link(a, b) -- devient amis
            local fa, fb = loadFr(a), loadFr(b)
            listDel(fa.inc, b) listDel(fa.out, b) listDel(fb.inc, a) listDel(fb.out, a)
            if not listHas(fa.friends, b) then fa.friends[#fa.friends + 1] = b end
            if not listHas(fb.friends, a) then fb.friends[#fb.friends + 1] = a end
            saveFr(a, fa) saveFr(b, fb)
        end
        if action == "add" then
            local quid = tostring(qparam(path, "uid") or ""):gsub("%D", "")
            local found, count = nil, 0
            if quid ~= "" then
                if quid == me then send(res, 404, { error = "self" }) return end
                local cm = membersCache.map[quid]
                if not users[quid] and not cm then send(res, 404, { error = "not_found" }) return end
                if not users[quid] then
                    users[quid] = { n = cm.n, u = cm.u, t = 0 }
                    SetResourceKvp(USERS_KEY, json.encode(users))
                end
                found, count = quid, 1
            else
                local q = (qparam(path, "name") or ""):lower():gsub("^@", ""):gsub("^%s+", ""):gsub("%s+$", "")
                if q == "" or #q > 64 then send(res, 400, { error = "bad_name" }) return end
                for id, info in pairs(users) do
                    if id ~= me and ((info.n or ""):lower() == q or (info.u or ""):lower() == q) then found, count = id, count + 1 end
                end
                if count == 0 then
                    local self = ((myName or ""):lower() == q or (myUser or ""):lower() == q)
                    send(res, 404, { error = self and "self" or "not_found" }) return
                end
                if count > 1 then send(res, 409, { error = "ambiguous" }) return end
            end
            if listHas(fr.friends, found) then send(res, 409, { error = "already_friends" }) return end
            if #fr.friends >= 100 then send(res, 409, { error = "too_many" }) return end
            if listHas(fr.inc, found) then link(me, found) send(res, 200, { ok = true, accepted = true, name = userName(users, found) }) return end
            if not listHas(fr.out, found) then
                local ft = loadFr(found)
                if #ft.inc < 50 and not listHas(ft.inc, me) then ft.inc[#ft.inc + 1] = me saveFr(found, ft) end
                fr.out[#fr.out + 1] = found saveFr(me, fr)
            end
            send(res, 200, { ok = true, pending = true, name = userName(users, found) })
            return
        end
        local target = qparam(path, "uid")
        if not target or not users[target] then send(res, 404, { error = "not_found" }) return end
        if action == "accept" then
            if not listHas(fr.inc, target) then send(res, 404, { error = "no_request" }) return end
            link(me, target) send(res, 200, { ok = true }) return
        end
        if action == "decline" or action == "cancel" then
            local ft = loadFr(target)
            listDel(fr.inc, target) listDel(fr.out, target) listDel(ft.inc, me) listDel(ft.out, me)
            saveFr(me, fr) saveFr(target, ft) send(res, 200, { ok = true }) return
        end
        if action == "remove" then
            local ft = loadFr(target)
            listDel(fr.friends, target) listDel(ft.friends, me)
            saveFr(me, fr) saveFr(target, ft) send(res, 200, { ok = true }) return
        end
        send(res, 400, { error = "bad_action" })
    end)
end

-- ============================================================
-- Annonces importantes (creees par les admins Kannibal Team) : fusionnees avec teaser.json dans le launcher
-- ============================================================
local ANN_KEY = "b2sp_ann"
local ANN_HIDDEN_KEY = "b2sp_ann_hidden"
local function handleAnnounce(req, res, headers)
    local path = tostring(req.path or "")
    local action = path:match("announce/(%a+)") or "list"
    local token = headers["x-discord-token"]
    local function withKt(cb)
        getDiscordRole(token, function(role, reason, scopes)
            if role == "admin" and scopes and scopes.kt then cb() else send(res, 403, { error = "kt_admin_only" }) end
        end)
    end
    if action == "list" then
        local function respond(isKt)
            local list = loadJsonKey(ANN_KEY, {})
            local out = {}
            for _, a in ipairs(list) do
                out[#out + 1] = { id = a.id, title = a.title, text = a.text, link = a.link, revealAt = a.revealAt or 0, hasImg = a.hasImg and true or false }
            end
            send(res, 200, { announcements = out, canManage = isKt and true or false, hidden = loadJsonKey(ANN_HIDDEN_KEY, {}) })
        end
        if not token or token == "" then respond(false) return end
        getDiscordRole(token, function(role, _, scopes) respond(role == "admin" and scopes and scopes.kt) end)
        return
    end
    if action == "img" then
        send(res, 200, { img = GetResourceKvpString("b2sp_annimg_" .. tostring(qparam(path, "id") or "")) or "" })
        return
    end
    if action == "create" then
        withKt(function()
            req.setDataHandler(function(body)
                local ok, j = pcall(json.decode, body or "")
                if not ok or type(j) ~= "table" then send(res, 400, { error = "bad_body" }) return end
                local img = tostring(j.img or "")
                if not img:match("^data:image/[%w%+]+;base64,[%w%+/=]+$") or #img > 300000 then send(res, 400, { error = "bad_image" }) return end
                local link = tostring(j.link or "")
                if link ~= "" and not link:match("^https://") then link = "" end
                local list = loadJsonKey(ANN_KEY, {})
                if #list >= 6 then local old = table.remove(list, 1) DeleteResourceKvp("b2sp_annimg_" .. tostring(old.id)) end
                local id = ("%d%04d"):format(os.time(), math.random(0, 9999))
                list[#list + 1] = { id = id, title = tostring(j.title or ""):sub(1, 60), text = tostring(j.text or ""):sub(1, 800), link = link:sub(1, 200), revealAt = math.floor(tonumber(j.at) or 0), hasImg = true, createdAt = os.time() }
                SetResourceKvp("b2sp_annimg_" .. id, img)
                SetResourceKvp(ANN_KEY, json.encode(list))
                send(res, 200, { ok = true, id = id })
            end)
        end)
        return
    end
    if action == "hide" then -- masque une annonce venant du fichier teaser.json (cle = empreinte calculee par le launcher)
        withKt(function()
            local key = tostring(qparam(path, "key") or ""):gsub("[^%w]", ""):sub(1, 40)
            if key == "" then send(res, 400, { error = "bad_key" }) return end
            local hidden = loadJsonKey(ANN_HIDDEN_KEY, {})
            for _, k in ipairs(hidden) do if k == key then send(res, 200, { ok = true }) return end end
            hidden[#hidden + 1] = key
            while #hidden > 60 do table.remove(hidden, 1) end
            SetResourceKvp(ANN_HIDDEN_KEY, json.encode(hidden))
            send(res, 200, { ok = true })
        end)
        return
    end
    if action == "delete" then
        withKt(function()
            local id = qparam(path, "id")
            local list = loadJsonKey(ANN_KEY, {})
            for i, a in ipairs(list) do
                if a.id == id then table.remove(list, i) SetResourceKvp(ANN_KEY, json.encode(list)) DeleteResourceKvp("b2sp_annimg_" .. tostring(id)) send(res, 200, { ok = true }) return end
            end
            send(res, 404, { error = "not_found" })
        end)
        return
    end
    send(res, 400, { error = "bad_action" })
end

-- ============================================================
-- Journal de dev KannibAventure (entrees creees par les admins KB, fusionnees avec kb-devlog.json)
-- ============================================================
local KBDEV_KEY = "b2sp_kbdevlog"
local function handleKbDevlog(req, res, headers)
    local path = tostring(req.path or "")
    local action = path:match("kbdevlog/(%a+)") or "list"
    local token = headers["x-discord-token"]
    local function withKb(cb)
        getDiscordRole(token, function(role, reason, scopes)
            if role == "admin" and scopes and scopes.kb then cb() else send(res, 403, { error = "kb_admin_only" }) end
        end)
    end
    if action == "list" then
        send(res, 200, { entries = loadJsonKey(KBDEV_KEY, {}) })
        return
    end
    if action == "create" then
        withKb(function()
            req.setDataHandler(function(body)
                local ok, j = pcall(json.decode, body or "")
                if not ok or type(j) ~= "table" then send(res, 400, { error = "bad_body" }) return end
                local title, content = tostring(j.title or ""), tostring(j.content or "")
                if title:match("^%s*$") or content:match("^%s*$") then send(res, 400, { error = "bad_entry" }) return end
                local list = loadJsonKey(KBDEV_KEY, {})
                if #list >= 60 then table.remove(list, 1) end
                local id = ("%d%04d"):format(os.time(), math.random(0, 9999))
                list[#list + 1] = { id = id, date = os.date("%Y-%m-%d"), tag = tostring(j.tag or "ANNONCE"):upper():sub(1, 20), title = title:sub(1, 90), content = content:sub(1, 3000) }
                SetResourceKvp(KBDEV_KEY, json.encode(list))
                send(res, 200, { ok = true, id = id })
            end)
        end)
        return
    end
    if action == "delete" then
        withKb(function()
            local id = qparam(path, "id")
            local list = loadJsonKey(KBDEV_KEY, {})
            for i, e in ipairs(list) do
                if e.id == id then table.remove(list, i) SetResourceKvp(KBDEV_KEY, json.encode(list)) send(res, 200, { ok = true }) return end
            end
            send(res, 404, { error = "not_found" })
        end)
        return
    end
    send(res, 400, { error = "bad_action" })
end

-- ============================================================
-- Joueurs en ligne avec pseudo Discord (route publique « online »)
-- ============================================================
local discordNameCache = {}  -- discordId -> { name, expires }
local function discordIdOf(src)
    for _, ident in ipairs(GetPlayerIdentifiers(src)) do
        local d = ident:match("^discord:(%d+)$")
        if d then return d end
    end
    return nil
end
local function resolveDiscordName(botToken, did, cb)
    local c = discordNameCache[did]
    if c and c.expires > os.time() then cb(c.name) return end
    PerformHttpRequest("https://discord.com/api/v10/users/" .. did, function(st, body)
        local name
        if st == 200 and body then
            local ok, u = pcall(json.decode, body)
            if ok and type(u) == "table" then name = u.global_name or u.username end
        end
        discordNameCache[did] = { name = name, expires = os.time() + (name and 600 or 60) }
        cb(name)
    end, "GET", "", { ["Authorization"] = "Bot " .. botToken })
end
local function buildOnline(cb)
    local botToken = GetConvar("anomia_discord_bot_token", "")
    local list, pending = {}, 0
    local ids = GetPlayers()
    for _, id in ipairs(ids) do list[#list + 1] = { name = GetPlayerName(id) or "?", ping = GetPlayerPing(id) or 0, _did = discordIdOf(id) } end
    for _, e in ipairs(list) do if e._did and botToken ~= "" then pending = pending + 1 end end
    local function finish() for _, e in ipairs(list) do e._did = nil end cb(list) end
    if pending == 0 then finish() return end
    for _, e in ipairs(list) do
        if e._did and botToken ~= "" then
            resolveDiscordName(botToken, e._did, function(n)
                e.discordName = n
                pending = pending - 1
                if pending == 0 then finish() end
            end)
        end
    end
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
    if ppath:find("/online", 1, true) and not ppath:find("kb", 1, true) then
        buildOnline(function(list) send(res, 200, { players = list }) end)
        return
    end
    if ppath:find("kbstatus", 1, true) then
        local maint = GetResourceKvpString(KB_MAINT_KEY) == "true"
        refreshKb(function(kb) send(res, 200, { kbMaintenance = maint, kb = kb }) end)
        return
    end
    if ppath:find("kbpush", 1, true) then
        local secret = GetConvar("anomia_kb_push_secret", "")
        if secret == "" or headers["x-push-secret"] ~= secret then send(res, 403, { error = "forbidden" }) return end
        req.setDataHandler(function(body)
            local ok, j = pcall(json.decode, body or "")
            if not ok or type(j) ~= "table" or type(j.players) ~= "table" then send(res, 400, { error = "bad_body" }) return end
            local players = {}
            for uuid, p in pairs(j.players) do
                if type(p) == "table" then
                    players[(tostring(uuid):lower():gsub("-", ""))] = { name = tostring(p.name or ""), adv = type(p.adv) == "table" and p.adv or {}, playTicks = tonumber(p.playTicks) or 0 }
                end
            end
            kbStats = { players = players, at = os.time() }
            SetResourceKvp(KB_STATS_KEY, json.encode(kbStats))
            send(res, 200, { ok = true, count = j.count })
        end)
        return
    end
    if ppath:find("kbach", 1, true) then
        local q = ppath:match("%?(.*)") or ""
        local uuid = q:match("uuid=([%w%-]+)")
        local name = q:match("name=([^&]+)")
        local decoded = name and (name:gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end)) or nil
        local p = kbFind(uuid, decoded)
        if not p then send(res, 200, { found = false }) return end
        local v = kbPlayerView(p) v.found = true
        send(res, 200, v)
        return
    end
    if ppath:find("polls", 1, true) then handlePolls(req, res, headers) return end
    if ppath:find("events", 1, true) then handleEvents(req, res, headers) return end
    if ppath:find("friends/", 1, true) then handleFriends(req, res, headers) return end
    if ppath:find("announce/", 1, true) then handleAnnounce(req, res, headers) return end
    if ppath:find("kbdevlog/", 1, true) then handleKbDevlog(req, res, headers) return end
    if ppath:find("rolecheck", 1, true) then
        local srv = tostring(req.path or ""):find("kannibaventure", 1, true) and "kannibaventure" or "anomia"
        checkCitizen(headers["x-discord-token"], srv, function(v) send(res, 200, { citizen = v }) end)
        return
    end
    if ppath:find("subcheck", 1, true) then
        checkSub(headers["x-discord-token"], function(has) send(res, 200, { sub = has }) end)
        return
    end
    resolveRole(headers, function(role, reason, scopes)
        scopes = scopes or { anomia = false, kb = false }
        if not role then
            noteFailure(addr)
            send(res, 403, { error = "invalid_code", reason = reason or "invalid_code" })
            return
        end

        local path = tostring(req.path or "")
        if path:find("kbmaintenance", 1, true) then
            if role ~= "admin" or not scopes.kb then send(res, 403, { error = "admin_only" }) return end
            local state = path:find("/on", 1, true) and "on" or (path:find("/off", 1, true) and "off" or nil)
            if not state then send(res, 400, { error = "bad_state" }) return end
            SetResourceKvp(KB_MAINT_KEY, state == "on" and "true" or "false")
            print(("[b2_staffpanel] Maintenance KannibAventure %s (role Discord admin)."):format(state:upper()))
            send(res, 200, { ok = true, kbMaintenance = state == "on" })
            return
        end
        if path:find("maintenance", 1, true) then
            if role ~= "admin" or not scopes.anomia then send(res, 403, { error = "admin_only" }) return end
            local state = path:find("/on", 1, true) and "on" or (path:find("/off", 1, true) and "off" or nil)
            if not state then send(res, 400, { error = "bad_state" }) return end
            ExecuteCommand("maintenance " .. state)
            print(("[b2_staffpanel] Maintenance %s demandee depuis le launcher (role Discord admin)."):format(state:upper()))
            send(res, 200, { ok = true, maintenance = state == "on" })
            return
        end
        if path:find("health", 1, true) then
            if role ~= "mod" and not scopes.anomia then
                send(res, 403, { error = "admin_only" })
                return
            end
            send(res, 200, { role = role, health = buildHealth() })
            return
        end
        if path:find("players", 1, true) then
            send(res, 200, { role = role, scopes = scopes, players = buildPlayers(), maxClients = GetConvarInt("sv_maxclients", 0) })
        else
            send(res, 200, { role = role, scopes = scopes })
        end
    end)
end)

print("[b2_staffpanel] Pret. Admin = role Discord (anomia_discord_bot_token requis), modo = anomia_mod_passphrase.")
