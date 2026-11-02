-- ============================================================
-- b2_twitchstatus
--
-- Interroge l'API Twitch pour savoir quels streamers de la liste sont
-- actuellement en live, avec leur avatar et le nombre de viewers.
-- Les clés API Twitch restent 100% côté serveur (dans server.cfg),
-- jamais exposées au launcher ni aux joueurs.
--
-- URL exposée (même port que le jeu) :
--   http://IP:PORT/b2_twitchstatus/
--
-- Réponse JSON :
--   [
--     { "channel": "b2obi64", "displayName": "B2OBI64", "avatarUrl": "...", "live": true, "viewers": 42 },
--     { "channel": "toto_le_byr", "displayName": "toto_le_byr", "avatarUrl": "...", "live": false, "viewers": 0 }
--   ]
-- ============================================================

-- Configure ces convars dans ton server.cfg :
--   setr anomia_twitch_client_id "TON_CLIENT_ID"
--   setr anomia_twitch_client_secret "TON_CLIENT_SECRET"
--   setr anomia_twitch_channels "b2obi64,toto_le_byr,romaintititox17"
-- (Récupère client_id/secret sur dev.twitch.tv/console/apps -> Register Your Application)

local function getConfig()
    local channelsRaw = GetConvar("anomia_twitch_channels", "")
    local channels = {}
    for channel in channelsRaw:gmatch("[^,]+") do
        table.insert(channels, channel:match("^%s*(.-)%s*$")) -- trim
    end
    return {
        clientId = GetConvar("anomia_twitch_client_id", ""),
        clientSecret = GetConvar("anomia_twitch_client_secret", ""),
        channels = channels
    }
end

-- Cache le résultat 60s pour ne pas spammer l'API Twitch à chaque requête du launcher
local cache = { data = nil, expiresAt = 0 }
local CACHE_DURATION_MS = 60000

-- Cache le token d'app (valable plusieurs semaines côté Twitch)
local tokenCache = { token = nil, expiresAt = 0 }

local function getAppAccessToken(cfg, cb)
    if tokenCache.token and GetGameTimer() < tokenCache.expiresAt then
        cb(tokenCache.token)
        return
    end

    local url = ("https://id.twitch.tv/oauth2/token?client_id=%s&client_secret=%s&grant_type=client_credentials")
        :format(cfg.clientId, cfg.clientSecret)

    PerformHttpRequest(url, function(statusCode, responseText)
        if statusCode ~= 200 then
            cb(nil)
            return
        end
        local ok, data = pcall(json.decode, responseText)
        if not ok or not data or not data.access_token then
            cb(nil)
            return
        end
        tokenCache.token = data.access_token
        -- expires_in est en secondes, on garde une marge de sécurité de 5 minutes
        tokenCache.expiresAt = GetGameTimer() + ((data.expires_in - 300) * 1000)
        cb(tokenCache.token)
    end, "POST", "", {})
end

local function buildQuery(paramName, values)
    local parts = {}
    for _, v in ipairs(values) do
        table.insert(parts, paramName .. "=" .. v)
    end
    return table.concat(parts, "&")
end

local function fetchTwitchData(cfg, token, cb)
    local headers = {
        ["Client-Id"] = cfg.clientId,
        ["Authorization"] = "Bearer " .. token
    }

    -- 1) Streams actuellement en live parmi la liste
    PerformHttpRequest(
        "https://api.twitch.tv/helix/streams?" .. buildQuery("user_login", cfg.channels),
        function(streamsStatus, streamsBody)
            local liveByChannel = {}
            if streamsStatus == 200 then
                local ok, data = pcall(json.decode, streamsBody)
                if ok and data and data.data then
                    for _, stream in ipairs(data.data) do
                        liveByChannel[stream.user_login:lower()] = {
                            viewers = stream.viewer_count or 0,
                            title = stream.title or "",
                            game = stream.game_name or "",
                            -- Twitch fournit un gabarit avec {width}x{height} à remplacer
                            thumbnailUrl = stream.thumbnail_url
                                and stream.thumbnail_url:gsub("{width}", "440"):gsub("{height}", "248")
                                or nil
                        }
                    end
                end
            end

            -- 2) Infos de profil (avatar, bio, nom affiché) pour tous les channels de la liste
            PerformHttpRequest(
                "https://api.twitch.tv/helix/users?" .. buildQuery("login", cfg.channels),
                function(usersStatus, usersBody)
                    local result = {}
                    local usersByLogin = {}

                    if usersStatus == 200 then
                        local ok, data = pcall(json.decode, usersBody)
                        if ok and data and data.data then
                            for _, user in ipairs(data.data) do
                                usersByLogin[user.login:lower()] = user
                            end
                        end
                    end

                    for _, channel in ipairs(cfg.channels) do
                        local key = channel:lower()
                        local user = usersByLogin[key]
                        local liveInfo = liveByChannel[key]
                        table.insert(result, {
                            channel = channel,
                            displayName = user and user.display_name or channel,
                            avatarUrl = user and user.profile_image_url or nil,
                            bio = user and user.description or "",
                            live = liveInfo ~= nil,
                            viewers = liveInfo and liveInfo.viewers or 0,
                            title = liveInfo and liveInfo.title or "",
                            game = liveInfo and liveInfo.game or "",
                            thumbnailUrl = liveInfo and liveInfo.thumbnailUrl or nil
                        })
                    end

                    cb(result)
                end,
                "GET", "", headers
            )
        end,
        "GET", "", headers
    )
end

local function getTwitchStatus(cb)
    if cache.data and GetGameTimer() < cache.expiresAt then
        cb(cache.data)
        return
    end

    local cfg = getConfig()
    if cfg.clientId == "" or cfg.clientSecret == "" or #cfg.channels == 0 then
        cb(nil, "config_missing")
        return
    end

    getAppAccessToken(cfg, function(token)
        if not token then
            cb(nil, "twitch_auth_failed")
            return
        end
        fetchTwitchData(cfg, token, function(result)
            cache.data = result
            cache.expiresAt = GetGameTimer() + CACHE_DURATION_MS
            cb(result)
        end)
    end)
end

-- ============================================================
-- Clips de la communaute  ->  http://IP:PORT/b2_twitchstatus/clips
-- Clips recents (90 jours, sinon les plus vus) de la chaine principale.
-- Chaine par defaut : la 1ere de anomia_twitch_channels, ou la convar
--   setr anomia_twitch_clips_channel "b2obi64"
-- ============================================================
local clipsCache = { data = nil, expiresAt = 0 }
local CLIPS_CACHE_MS = 5 * 60 * 1000
local broadcasterIdCache = {}

local function fetchClips(cfg, token, broadcasterId, withDate, cb)
    local headers = { ["Client-Id"] = cfg.clientId, ["Authorization"] = "Bearer " .. token }
    local url = "https://api.twitch.tv/helix/clips?first=24&broadcaster_id=" .. broadcasterId
    if withDate then
        url = url .. "&started_at=" .. os.date("!%Y-%m-%dT%H:%M:%SZ", os.time() - 90 * 86400)
    end
    PerformHttpRequest(url, function(status, body)
        local list = {}
        if status == 200 then
            local ok, data = pcall(json.decode, body)
            if ok and data and data.data then
                for _, c in ipairs(data.data) do
                    table.insert(list, {
                        id = c.id,
                        url = c.url,
                        title = c.title or "",
                        creator = c.creator_name or "",
                        views = c.view_count or 0,
                        duration = c.duration or 0,
                        createdAt = c.created_at,
                        thumbnailUrl = c.thumbnail_url
                    })
                end
            end
        end
        cb(list, status)
    end, "GET", "", headers)
end

local function getClips(cb)
    if clipsCache.data and GetGameTimer() < clipsCache.expiresAt then
        cb(clipsCache.data)
        return
    end
    local cfg = getConfig()
    local channel = GetConvar("anomia_twitch_clips_channel", "")
    if channel == "" then channel = cfg.channels[1] or "" end
    if cfg.clientId == "" or cfg.clientSecret == "" or channel == "" then
        cb(nil, "config_missing")
        return
    end
    getAppAccessToken(cfg, function(token)
        if not token then cb(nil, "twitch_auth_failed") return end
        local headers = { ["Client-Id"] = cfg.clientId, ["Authorization"] = "Bearer " .. token }

        local function withBroadcaster(id)
            fetchClips(cfg, token, id, true, function(list, status)
                if status ~= 200 then cb(nil, "twitch_clips_failed") return end
                if #list > 0 then
                    clipsCache.data = list
                    clipsCache.expiresAt = GetGameTimer() + CLIPS_CACHE_MS
                    cb(list)
                    return
                end
                -- Rien dans les 90 derniers jours : on prend les plus vus de tous les temps
                fetchClips(cfg, token, id, false, function(list2)
                    clipsCache.data = list2
                    clipsCache.expiresAt = GetGameTimer() + CLIPS_CACHE_MS
                    cb(list2)
                end)
            end)
        end

        local key = channel:lower()
        if broadcasterIdCache[key] then
            withBroadcaster(broadcasterIdCache[key])
            return
        end
        PerformHttpRequest("https://api.twitch.tv/helix/users?login=" .. key, function(status, body)
            local ok, data = pcall(json.decode, body or "")
            if status ~= 200 or not ok or not data or not data.data or not data.data[1] then
                cb(nil, "twitch_user_not_found")
                return
            end
            broadcasterIdCache[key] = data.data[1].id
            withBroadcaster(data.data[1].id)
        end, "GET", "", headers)
    end)
end

-- ============================================================
-- Dernier stream (VOD) -> http://IP:PORT/b2_twitchstatus/videos
-- ============================================================
local videoCache = { data = nil, expiresAt = 0 }

local function getLastVideo(cb)
    if videoCache.data and GetGameTimer() < videoCache.expiresAt then
        cb(videoCache.data)
        return
    end
    local cfg = getConfig()
    local channel = GetConvar("anomia_twitch_clips_channel", "")
    if channel == "" then channel = cfg.channels[1] or "" end
    if cfg.clientId == "" or cfg.clientSecret == "" or channel == "" then
        cb(nil, "config_missing")
        return
    end
    getAppAccessToken(cfg, function(token)
        if not token then cb(nil, "twitch_auth_failed") return end
        local headers = { ["Client-Id"] = cfg.clientId, ["Authorization"] = "Bearer " .. token }

        local function withId(id)
            PerformHttpRequest("https://api.twitch.tv/helix/videos?first=1&type=archive&user_id=" .. id, function(status, body)
                local ok, data = pcall(json.decode, body or "")
                if status ~= 200 or not ok or not data or not data.data then cb(nil, "twitch_videos_failed") return end
                local v = data.data[1]
                if not v then cb(nil, "no_video") return end
                local result = {
                    title = v.title or "",
                    url = v.url,
                    thumbnailUrl = v.thumbnail_url and v.thumbnail_url:gsub("%%{width}", "480"):gsub("%%{height}", "270") or nil,
                    duration = v.duration or "",
                    createdAt = v.created_at,
                    views = v.view_count or 0
                }
                videoCache.data = result
                videoCache.expiresAt = GetGameTimer() + 5 * 60 * 1000
                cb(result)
            end, "GET", "", headers)
        end

        local key = channel:lower()
        if broadcasterIdCache[key] then withId(broadcasterIdCache[key]) return end
        PerformHttpRequest("https://api.twitch.tv/helix/users?login=" .. key, function(status, body)
            local ok, data = pcall(json.decode, body or "")
            if status ~= 200 or not ok or not data or not data.data or not data.data[1] then cb(nil, "twitch_user_not_found") return end
            broadcasterIdCache[key] = data.data[1].id
            withId(data.data[1].id)
        end, "GET", "", headers)
    end)
end

local function sendJson(res, result, err)
    res.writeHead(200, {
        ['Content-Type'] = 'application/json',
        ['Access-Control-Allow-Origin'] = '*'
    })
    if result then
        res.send(json.encode(result))
    else
        res.send(json.encode({ error = err or "unknown_error" }))
    end
end

SetHttpHandler(function(req, res)
    local path = tostring(req.path or "")
    if path:find("videos", 1, true) then
        getLastVideo(function(result, err) sendJson(res, result, err) end)
        return
    end
    if path:find("clips", 1, true) then
        getClips(function(result, err) sendJson(res, result, err) end)
        return
    end
    getTwitchStatus(function(result, err) sendJson(res, result, err) end)
end)

print("[b2_twitchstatus] Pret. Verifie que anomia_twitch_client_id / anomia_twitch_client_secret / anomia_twitch_channels sont bien configures dans server.cfg.")
