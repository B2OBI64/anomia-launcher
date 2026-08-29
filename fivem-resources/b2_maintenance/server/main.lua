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
-- L'état est stocké de façon PERSISTANTE (survit à un redémarrage complet
-- du serveur, pas juste à un restart de cette ressource) via le stockage
-- Kvp de FiveM - contrairement à un simple SetConvar qui, lui, retombe à
-- "false" dès que le processus serveur redémarre.
-- ============================================================
-- COMMANDES (staff uniquement, ACE "admin")
-- ============================================================
--   /maintenance on    -> active le mode maintenance
--   /maintenance off   -> désactive le mode maintenance
--   /maintenance        -> affiche l'état actuel
-- ============================================================

local MAINTENANCE_CONVAR = "anomia_maintenance" -- cache mémoire rapide, lu par b2_pingstats
local MAINTENANCE_KVP_KEY = "maintenance" -- stockage réellement persistant (survit aux redémarrages serveur)

local function isMaintenanceOn()
    return GetConvar(MAINTENANCE_CONVAR, "false") == "true"
end

local function setMaintenance(enabled)
    local value = enabled and "true" or "false"
    SetConvar(MAINTENANCE_CONVAR, value)
    SetResourceKvp(MAINTENANCE_KVP_KEY, value)
end

-- Au démarrage de la ressource (y compris juste après un redémarrage complet
-- du serveur), on relit l'état persistant et on le remet en mémoire.
CreateThread(function()
    local persisted = GetResourceKvpString(MAINTENANCE_KVP_KEY)
    local isOn = persisted == "true"
    SetConvar(MAINTENANCE_CONVAR, isOn and "true" or "false")
    if isOn then
        print("[b2_maintenance] Mode maintenance restauré depuis la dernière session (ACTIVÉ)")
    end
end)

RegisterCommand("maintenance", function(source, args)
    -- Commande utilisable en console (source 0) ou par un admin en jeu
    if source ~= 0 and not IsPlayerAceAllowed(source, "admin") then
        TriggerClientEvent("chat:addMessage", source, { args = { "^1Système", "Tu n'as pas la permission." } })
        return
    end

    local action = args[1] and string.lower(args[1]) or nil

    if action == "on" then
        setMaintenance(true)
        print("[b2_maintenance] Mode maintenance ACTIVÉ (persiste même après un redémarrage serveur)")
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
