# b2_crashreport

Relaie automatiquement les rapports de crash FiveM des joueurs vers un salon
Discord — plus besoin qu'ils t'envoient le zip manuellement. Le launcher ne
transmet que le **texte** du log (la partie utile pour diagnostiquer), pas le
fichier `.dmp` binaire. Le joueur voit toujours une demande de confirmation
avant l'envoi — rien ne part sans son accord.

## Installation

1. Sur Discord : salon dédié (ex `#crash-reports`) → Réglages du salon →
   Intégrations → Webhooks → **Nouveau webhook** → copie l'URL
2. Copie le dossier `b2_crashreport` dans tes `resources/`
3. Dans `server.cfg` :
   ```
   setr anomia_crash_webhook_url "https://discord.com/api/webhooks/TON_WEBHOOK"
   ensure b2_crashreport
   ```
4. `refresh` + `start b2_crashreport`

## Comment ça marche côté joueur

Le launcher surveille le Bureau et le dossier Téléchargements du joueur. Dès
qu'un fichier `CfxCrashDump_*.zip` apparaît (généré par FiveM lors d'un
crash), une popup propose d'envoyer le rapport. Si le joueur accepte, seul le
texte du log (dernier ~2500 caractères, là où se trouve l'erreur) part vers
ce salon — jamais le fichier `.dmp` complet, jamais sans clic explicite.

## Sécurité

Le webhook ne quitte jamais `server.cfg` — le launcher ne connaît que
l'adresse de ta ressource (`b2_crashreport`), jamais l'URL du webhook
lui-même.
