// ============================================================
// ANOMIA — Synchronisation patch-notes Discord -> news.json
//
// Lit les derniers messages d'un salon Discord et génère un
// fichier news.json dans le format attendu par le launcher.
//
// Convention d'écriture dans Discord (1er message = 1 note) :
//
//   [NOUVEAU] Titre de la note
//   Le contenu de la note, sur une ou plusieurs lignes.
//
// Tags reconnus : [NOUVEAU] [MAJ] [FIX]  (optionnel, "MAJ" par défaut)
//
// Variables d'environnement requises :
//   DISCORD_BOT_TOKEN   token du bot Discord (permissions: View Channel + Read Message History, sur CE salon uniquement)
//   DISCORD_CHANNEL_ID  ID du salon #patch-notes
// ============================================================

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const LIMIT = parseInt(process.env.DISCORD_FETCH_LIMIT || "30", 10);
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, "..", "news.json");

if (!TOKEN || !CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN et DISCORD_CHANNEL_ID sont requis.");
  process.exit(1);
}

function parseTag(firstLine) {
  const match = firstLine.match(/^\s*\[(\w+)\]\s*(.*)$/);
  if (match) {
    return { tag: match[1].toUpperCase(), title: match[2].trim() };
  }
  return { tag: "MAJ", title: firstLine.trim() };
}

function messageToNewsItem(msg) {
  const rawLines = msg.content.split("\n").filter((l) => l.trim() !== "");
  if (rawLines.length === 0) return null;

  const { tag, title } = parseTag(rawLines[0]);
  const content = rawLines.slice(1).join("\n").trim();

  return {
    date: msg.timestamp.slice(0, 10), // YYYY-MM-DD
    tag,
    title: title || "(sans titre)",
    content: content || ""
  };
}

async function main() {
  const url = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${TOKEN}` }
  });

  if (!res.ok) {
    console.error(`Erreur API Discord: HTTP ${res.status} - ${await res.text()}`);
    process.exit(1);
  }

  const messages = await res.json();

  const news = messages
    .filter((m) => m.content && m.content.trim() !== "")
    .map(messageToNewsItem)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // plus récent en premier

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(news, null, 2), "utf-8");
  console.log(`${news.length} note(s) écrite(s) dans ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
