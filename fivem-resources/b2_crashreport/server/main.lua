-- ============================================================
-- b2_crashreport
--
-- Reçoit le texte d'un rapport de crash FiveM envoyé par le launcher
-- (uniquement avec l'accord du joueur) et le relaie vers un salon Discord
-- via un webhook. Le webhook reste 100% côté serveur (server.cfg), jamais
-- exposé au launcher ni aux joueurs.
--
-- URL exposée (même port que le jeu) :
--   POST http://IP:PORT/b2_crashreport/   body JSON: { "player": "...", "log": "..." }
-- ============================================================

-- Configure dans ton server.cfg :
--   setr anomia_crash_webhook_url "https://discord.com/api/webhooks/..."
-- (Discord -> Réglages du salon -> Intégrations -> Webhooks -> Nouveau webhook -> Copier l'URL)

local WEBHOOK_URL_CONVAR = "anomia_crash_webhook_url"

SetHttpHandler(function(req, res)
    if req.method ~= "POST" then
        res.writeHead(405, { ['Content-Type'] = 'application/json' })
        res.send(json.encode({ error = "method_not_allowed" }))
        return
    end

    req.setDataHandler(function(body)
        local ok, data = pcall(json.decode, body)
        if not ok or not data then
            res.writeHead(400, { ['Content-Type'] = 'application/json' })
            res.send(json.encode({ error = "invalid_json" }))
            return
        end

        local webhookUrl = GetConvar(WEBHOOK_URL_CONVAR, "")
        if webhookUrl == "" then
            res.writeHead(500, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
            res.send(json.encode({ error = "webhook_not_configured" }))
            return
        end

        local player = data.player or "Joueur inconnu"
        local logText = data.log or "(vide)"
        if #logText > 3800 then
            logText = logText:sub(-3800) -- garde la fin, c'est là qu'est la vraie erreur
        end

        local payload = json.encode({
            embeds = {
                {
                    title = "🛑 Rapport de crash FiveM",
                    description = ("```\n%s\n```"):format(logText),
                    color = 15548997,
                    fields = {
                        { name = "Nom de session Windows", value = player, inline = true }
                    },
                    timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
                }
            }
        })

        PerformHttpRequest(webhookUrl, function(statusCode)
            res.writeHead(200, { ['Content-Type'] = 'application/json', ['Access-Control-Allow-Origin'] = '*' })
            res.send(json.encode({ ok = statusCode < 300 }))
        end, "POST", payload, { ['Content-Type'] = 'application/json' })
    end)
end)

print("[b2_crashreport] Pret. Verifie que anomia_crash_webhook_url est configure dans server.cfg.")
