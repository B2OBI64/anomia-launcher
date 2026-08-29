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

SetHttpHandler(function(req, res)
    getTwitchStatus(function(result, err)
        res.writeHead(200, {
            ['Content-Type'] = 'application/json',
            ['Access-Control-Allow-Origin'] = '*'
        })
        if result then
            res.send(json.encode(result))
        else
            res.send(json.encode({ error = err or "unknown_error" }))
        end
    end)
end)

print("[b2_twitchstatus] Pret. Verifie que anomia_twitch_client_id / anomia_twitch_client_secret / anomia_twitch_channels sont bien configures dans server.cfg.")
