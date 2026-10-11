-----------------------------------------------------------------
-- b2 — Anomia : pont vers b2_hud pour l'écran de coma + écran K.O.
-- Fichier volontairement AUTONOME (aucune dépendance à wsb/wasabi_bridge)
-- pour ne jamais rester bloqué si cl_customize.lua se coupe tôt (garde-fou
-- "if not wsb then return end" en tête de ce fichier) et pour ne plus
-- jamais toucher wasabi_bridge (source du crash précédent).
--
-- L'écran de coma et l'écran K.O. sont désormais entièrement rendus par
-- b2_hud (overlay NUI séparé, configurable par chaque joueur via /hud).
-- Ce fichier se contente de détecter l'état côté wasabi_ambulance et de
-- le transmettre à b2_hud via TriggerEvent (les events sont partagés
-- entre toutes les resources côté client, contrairement aux variables
-- globales Lua qui restent, elles, propres à chaque resource).
-----------------------------------------------------------------

local seconds = 1000

local function HudRunning()
	return GetResourceState('b2_hud') == 'started'
end

-- ═══════════════════════════════════════════════════════════════
-- Écran de coma — poll de `isDead` (global posé par wasabi_ambulance,
-- lisible ici car ce fichier fait partie de la même resource/VM Lua)
-- + minuteur calculé nous-mêmes à partir de Config.RespawnTimer /
-- Config.BleedoutTimer, pour ne pas dépendre des variables internes
-- (encrypted) de cl_customize.lua.
-- ═══════════════════════════════════════════════════════════════
CreateThread(function()
	local wasDown = false
	local downStartedAt = nil

	while true do
		Wait(300)
		if not HudRunning() then goto continue end

		local down = isDead and true or false

		if down and not wasDown then
			downStartedAt = GetGameTimer()
			TriggerEvent('b2_hud:client:openComa')
		elseif not down and wasDown then
			downStartedAt = nil
			TriggerEvent('b2_hud:client:closeComa')
		end

		if down then
			local elapsedSec = downStartedAt and ((GetGameTimer() - downStartedAt) / 1000) or 0
			local bleedoutSec = math.floor((Config.BleedoutTimer or (20 * 60 * seconds)) / seconds)
			local autoTpRemaining = math.max(0, bleedoutSec - elapsedSec)

			TriggerEvent('b2_hud:client:comaTimer', {
				elapsed = elapsedSec,
				autoTpRemaining = autoTpRemaining,
				emsCount = EMSAvailable or 0, -- global posé par wasabi_ambulance (client.lua/cl_customize.lua)
			})
		end

		wasDown = down
		::continue::
	end
end)

-- ═══════════════════════════════════════════════════════════════
-- Alerte EMS (demande utilisateur 20260906, "les ems ne receptionnent
-- pas les alertes coma d'un joueur sur le terminal et sur le telephone
-- ems") : le bloc au-dessus ne fait que transmettre l'etat de coma a
-- b2_hud - c'est l'ecran affiche AU JOUEUR A TERRE lui-meme, rien ne
-- prevenait jamais les secouristes. Reutilise TEL QUEL le flux emsCall
-- deja existant (b2_dispatch/server/ems.lua : verifie le cooldown,
-- construit un payload avec les coordonnees, appelle
-- NotifyService('ambulance', ...) qui alerte les EMS en service ET
-- alimente en plus Urgence_Signalement_VC -> EMS_Dossiers_VC (onglet
-- "Alertes urgence" du terminal) -> Chop_Telephone_VC (app pro), voir
-- leurs commentaires respectifs) - exactement comme si le joueur avait
-- appuye lui-meme sur la touche d'appel. Thread separe et INDEPENDANT
-- du bloc au-dessus (pas de garde HudRunning) : l'alerte doit partir
-- meme si b2_hud est arrete/desactive pour ce joueur.
CreateThread(function()
	local alerteDejaEnvoyee = false
	while true do
		Wait(300)
		local down = isDead and true or false
		if down and not alerteDejaEnvoyee then
			alerteDejaEnvoyee = true
			TriggerServerEvent('b2_dispatch:server:emsCall')
			TriggerServerEvent('b2_achievements:server:event', 'coma') -- succès "premier coma"
			-- Demande utilisateur (20260906) : "que quand le proprietaire
			-- du ped ems tombe en coma qu'il puisse le reanimer
			-- automatiquement si il est a proximite" - simple relais
			-- CLIENT vers CLIENT (les events sont partages entre toutes
			-- les resources cote client, voir le commentaire en tete de
			-- ce fichier) : Admin_PedMenu_VC ecoute cet event et gere
			-- lui-meme la recherche du secouriste + la reanimation (voir
			-- son client/main.lua). Rien ici ne connait ce systeme,
			-- cout nul si cette resource est arretee/absente.
			TriggerEvent('adminpedmenu:client:proprietaireEnComa')
		elseif not down then
			alerteDejaEnvoyee = false
		end
	end
end)

-- ═══════════════════════════════════════════════════════════════
-- Écran "K.O." (façon b2_soin), autonome
-- Détecte un coup nu sous le seuil configuré, gère le ragdoll et
-- notifie b2_hud pour l'overlay. N'utilise QUE des natives GTA côté
-- détection, aucun export/bridge.
-- ═══════════════════════════════════════════════════════════════
B2KnockedOut = false -- global (pas de "local") : dispo pour d'autres resources si besoin

local function B2KnockOutBypass()
	local enviZombies = GetResourceState('envi-zombies')
	if Config.EnviZombies and Config.EnviZombies.autoDetect and (enviZombies == 'started' or enviZombies == 'starting') then
		local ok, result = pcall(function() return exports['envi-zombies']:IsInZombieGame() end)
		return ok and result or false
	end
	return false
end

CreateThread(function()
	if not Config.B2Knockout or not Config.B2Knockout.enabled then return end

	AddEventHandler('gameEventTriggered', function(name, args)
		if name ~= 'CEventNetworkEntityDamage' then return end
		if not Config.B2Knockout.enabled then return end
		if B2KnockedOut then return end
		if isDead then return end -- le vrai "death screen" prime toujours sur le K.O.
		if B2KnockOutBypass() then return end

		local victim = args[1]
		if victim ~= PlayerPedId() then return end
		if not IsEntityAPed(victim) then return end

		local victimDied = args[6] == 1
		if victimDied then return end

		local weaponHash = args[7]
		local health = GetEntityHealth(victim)

		if weaponHash == GetHashKey('WEAPON_UNARMED')
			and health <= Config.B2Knockout.healthForKnockout
			and health > 0 then
			B2KnockedOut = true
			TriggerServerEvent('b2_achievements:server:event', 'ko') -- succès "premier K.O."
			local ped = victim
			local duration = Config.B2Knockout.duration or (7 * seconds)

			SetPedToRagdoll(ped, duration, duration, 0, false, false, false)
			if HudRunning() then TriggerEvent('b2_hud:client:openKO') end

			CreateThread(function()
				local heldFor = 0
				while heldFor < duration do
					Wait(0)
					if isDead then break end -- filet de sécurité : coup fatal entre-temps
					DisableControlAction(0, 21, true)
					DisableControlAction(0, 22, true)
					DisableControlAction(0, 24, true)
					DisableControlAction(0, 25, true)
					DisableControlAction(0, 30, true)
					DisableControlAction(0, 31, true)
					DisableControlAction(0, 47, true)
					DisableControlAction(0, 58, true)
					DisableControlAction(0, 140, true)
					DisableControlAction(0, 141, true)
					DisableControlAction(0, 142, true)
					DisableControlAction(0, 263, true)
					DisableControlAction(0, 264, true)
					heldFor = heldFor + (GetFrameTime() * 1000)
				end

				B2KnockedOut = false
				if HudRunning() then TriggerEvent('b2_hud:client:closeKO') end

				if Config.B2Knockout.regainHealth then
					local hp = GetEntityHealth(PlayerPedId())
					if hp <= Config.B2Knockout.regainHealth then
						SetEntityHealth(PlayerPedId(), math.min(200, hp + (Config.B2Knockout.regainAmount or 20)))
					end
				end
			end)
		end
	end)
end)
