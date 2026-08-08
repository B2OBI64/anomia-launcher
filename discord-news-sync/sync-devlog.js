// ============================================================
// ANOMIA — Synchronisation salon devlog Discord -> devlog.json
//
// Lit un salon Discord dédié au suivi de développement et génère un
// devlog.json avec, pour chaque message, une feature et sa checklist
// de tâches. Le pourcentage d'avancement est calculé automatiquement
// à partir du nombre de tâches cochées.
//
// Convention d'écriture dans Discord (1 message = 1 feature) :
//
//   Police 2.0
//   [x] Système de garde à vue
//   [x] Refonte MDT
//   [ ] Système de mandats
//   [ ] Interface radio améliorée
//
// Pour valider une tâche : édite le message Discord, change [ ] en [x].
// L'API Discord renvoie toujours le contenu ACTUEL d'un message (même
// édité après coup), donc la prochaine synchro récupère l'état à jour
// automatiquement - pas besoin de reposter.
//
// Variables d'environnement requises :
//   DISCORD_BOT_TOKEN          token du bot Discord (même bot que patch-notes/media)
//   DISCORD_DEVLOG_CHANNEL_ID  ID du salon devlog
// ============================================================

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_DEVLOG_CHANNEL_ID;
const MAX_ITEMS = parseInt(process.env.DISCORD_DEVLOG_LIMIT || "40", 10);
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, "..", "devlog.json");

if (!TOKEN || !CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN et DISCORD_DEVLOG_CHANNEL_ID sont requis.");
  process.exit(1);
}

function stripMentions(text) {
  return text.replace(/@everyone|@here|<@[!&]?\d+>/g, "").trim();
}

function parseDevlogMessage(msg) {
  const cleaned = stripMentions(msg.content);
  const lines = cleaned.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const title = lines[0];
  const tasks = [];
  const descriptionLines = [];

  for (const line of lines.slice(1)) {
    const match = line.match(/^\[([ xX])\]\s*(.*)$/);
    if (match) {
      tasks.push({ text: match[2].trim(), done: match[1].toLowerCase() === "x" });
    } else {
      descriptionLines.push(line);
    }
  }

  const percent = tasks.length > 0 ? Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100) : 0;

  return {
    date: msg.timestamp.slice(0, 10),
    title,
    description: descriptionLines.join(" "),
    tasks,
    percent
  };
}

// Même pagination que sync.js
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

async function main() {
  const messages = await fetchAllMessages();

  const devlog = messages
    .filter((m) => m.content && m.content.trim() !== "")
    .map(parseDevlogMessage)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, MAX_ITEMS);

  // Protection contre l'écrasement par un résultat vide (même principe que sync.js)
  if (devlog.length === 0) {
    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
    } catch {
      // pas grave
    }
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(
        `Résultat vide (0 feature trouvée sur ${messages.length} messages parcourus) alors que le fichier existant en contient ${existing.length} -> on ne touche à rien.`
      );
      return;
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(devlog, null, 2), "utf-8");
  console.log(`${devlog.length} feature(s) écrite(s) dans ${OUTPUT_PATH} (${messages.length} messages parcourus)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
