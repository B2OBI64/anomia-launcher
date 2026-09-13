-- ============================================================
-- b2_gpswaypoint (client)
--
-- Reçoit l'ordre du serveur et pose le point GPS in-game, avec un petit
-- message pour prévenir le joueur d'où ça vient.
-- ============================================================

RegisterNetEvent("b2_gpswaypoint:set")
AddEventHandler("b2_gpswaypoint:set", function(x, y)
    SetNewWaypoint(x + 0.0, y + 0.0)

    if GetResourceState("qb-core") == "started" then
        TriggerEvent("QBCore:Notify", "Point GPS posé depuis le launcher.", "success")
    else
        -- Repli minimal si QBCore:Notify n'est pas dispo pour une raison ou une autre
        print("[b2_gpswaypoint] Point GPS posé depuis le launcher.")
    end
end)
