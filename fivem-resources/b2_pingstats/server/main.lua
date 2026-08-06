-- ============================================================
-- b2_pingstats
--
-- Expose UNIQUEMENT des statistiques agregees (ping moyen, nombre
-- de joueurs) via un endpoint HTTP custom, pense pour le launcher
-- Anomia. Ne renvoie JAMAIS de pseudo, d'identifiant, ni aucune
-- donnee individuelle de joueur - seulement des nombres agreges.
--
-- URL exposee (meme port que le jeu) :
--   http://IP:PORT/b2_pingstats/
--
-- Reponse JSON :
--   { "avgPing": 42, "players": 12 }
-- ============================================================

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
        players = #players
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

print('[b2_pingstats] Endpoint pret sur /b2_pingstats/ (ping moyen, sans donnees joueur individuelles)')
