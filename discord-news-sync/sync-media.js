// ============================================================
// ANOMIA — Synchronisation salon média Discord -> media.json
//
// Lit les derniers messages d'un salon Discord (celui où les joueurs
// partagent leurs screenshots) et génère un fichier media.json avec
// les images trouvées, pour la galerie du launcher.
//
// Aucune convention d'écriture requise : n'importe quel message avec
// une image en pièce jointe est repris automatiquement.
//
// Variables d'environnement requises :
//   DISCORD_BOT_TOKEN         token du bot Discord (même bot que pour les patch-notes)
//   DISCORD_MEDIA_CHANNEL_ID  ID du salon média/screenshots
// ============================================================

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_MEDIA_CHANNEL_ID;
// Nombre d'images conservées au final (les plus récentes)
const MAX_ITEMS = parseInt(process.env.DISCORD_MEDIA_LIMIT || "60", 10);
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, "..", "media.json");

if (!TOKEN || !CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN et DISCORD_MEDIA_CHANNEL_ID sont requis.");
  process.exit(1);
}

// Même pagination que sync.js : jusqu'à 1000 messages d'historique
async function fetchAllMessages() {
  const perPage = 100;
  const maxPages = 10;
  let messages = [];
  let before = null;

  for (let page = 0; page < maxPages; page++) {
    const url =
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=${perPage}` +
      (before ? `&before=${before}` : "");

    const res = await fetch(url, { headers: { Authorization: `Bot ${TOKEN}` } });

    if (!res.ok) {
      console.error(`Erreur API Discord: HTTP ${res.status} - ${await res.text()}`);
      process.exit(1);
    }

    const batch = await res.json();
    if (batch.length === 0) break;

    messages = messages.concat(batch);
    before = batch[batch.length - 1].id;

    if (batch.length < perPage) break;

    await new Promise((r) => setTimeout(r, 300));
  }

  return messages;
}

function extractImages(msg) {
  const items = [];
  for (const att of msg.attachments || []) {
    if (att.content_type && att.content_type.startsWith("image/")) {
      items.push({
        url: att.url,
        author: msg.author?.username || "Anonyme",
        date: msg.timestamp.slice(0, 10)
      });
    }
  }
  return items;
}

async function main() {
  const messages = await fetchAllMessages();

  const media = messages
    .flatMap(extractImages)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // plus récent en premier
    .slice(0, MAX_ITEMS);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(media, null, 2), "utf-8");
  console.log(`${media.length} image(s) écrite(s) dans ${OUTPUT_PATH} (${messages.length} messages parcourus)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
