-- ============================================================
-- b2_maintenance
--
-- Mode maintenance : quand activé, seuls les admins (permission ACE
-- "admin") peuvent se connecter au serveur. Tous les autres joueurs
-- sont refusés avec un message explicite, avant même de charger le jeu.
--
-- Le launcher Anomia lit ce même état via b2_pingstats (voir cette
-- ressource) pour l'afficher AVANT que le joueur clique "Se connecter".
--
-- ============================================================
-- COMMANDES (staff uniquement, ACE "admin")
-- ============================================================
--   /maintenance on    -> active le mode maintenance
--   /maintenance off   -> désactive le mode maintenance
--   /maintenance        -> affiche l'état actuel
-- ============================================================

local MAINTENANCE_CONVAR = "anomia_maintenance"

local function isMaintenanceOn()
    return GetConvar(MAINTENANCE_CONVAR, "false") == "true"
end

local function setMaintenance(enabled)
    SetConvar(MAINTENANCE_CONVAR, enabled and "true" or "false")
end

RegisterCommand("maintenance", function(source, args)
    -- Commande utilisable en console (source 0) ou par un admin en jeu
    if source ~= 0 and not IsPlayerAceAllowed(source, "admin") then
        TriggerClientEvent("chat:addMessage", source, { args = { "^1Système", "Tu n'as pas la permission." } })
        return
    end

    local action = args[1] and string.lower(args[1]) or nil

    if action == "on" then
        setMaintenance(true)
        print("[b2_maintenance] Mode maintenance ACTIVÉ")
    elseif action == "off" then
        setMaintenance(false)
        print("[b2_maintenance] Mode maintenance DÉSACTIVÉ")
    else
        print(("[b2_maintenance] État actuel : %s"):format(isMaintenanceOn() and "ACTIVÉ" or "désactivé"))
    end
end, false)

AddEventHandler("playerConnecting", function(name, setKickReason, deferrals)
    local src = source
    deferrals.defer()

    -- Laisse le temps aux systèmes d'identification (ACE, identifiants) de se poser
    Citizen.Wait(0)

    if isMaintenanceOn() and not IsPlayerAceAllowed(src, "admin") then
        deferrals.done("^1Le serveur est actuellement en maintenance.\n^7Seul le staff peut se connecter pour le moment. Réessaie plus tard, ou suis le Discord pour être prévenu de la réouverture.")
        return
    end

    deferrals.done()
end)

print("[b2_maintenance] Prêt. Commande : /maintenance on|off (staff uniquement)")
