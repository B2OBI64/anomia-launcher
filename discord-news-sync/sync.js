// ============================================================
// ANOMIA — Synchronisation patch-notes Discord -> news.json
//
// Lit les derniers messages d'un salon Discord et génère un
// fichier news.json dans le format attendu par le launcher.
//
// Aucune convention stricte requise : le premier message = une note.
// La première ligne devient le titre, le reste le contenu.
// Optionnel : commencer par [NOUVEAU], [MAJ] ou [FIX] pour forcer
// l'étiquette de couleur (sinon "MAJ" par défaut). Les lignes qui se
// terminent par ":" (ex: "Nouveautés :") deviennent des sous-titres,
// les lignes qui commencent par "*" deviennent des listes à puces,
// les lignes du type ".1 : Texte" deviennent des points numérotés —
// exactement le format que tu utilises déjà pour tes patch-notes.
//
// Variables d'environnement requises :
//   DISCORD_BOT_TOKEN   token du bot Discord (permissions: View Channel + Read Message History, sur CE salon uniquement)
//   DISCORD_CHANNEL_ID  ID du salon #patch-notes
// ============================================================

const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
// Nombre de notes conservées au final dans news.json (les plus récentes). L'historique
// parcouru côté Discord va bien plus loin que ça, voir fetchAllMessages() ci-dessous.
const MAX_ITEMS = parseInt(process.env.DISCORD_FETCH_LIMIT || "50", 10);
const OUTPUT_PATH = process.env.OUTPUT_PATH || path.join(__dirname, "..", "news.json");

if (!TOKEN || !CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN et DISCORD_CHANNEL_ID sont requis.");
  process.exit(1);
}

function stripMentions(text) {
  // @everyone / @here / mentions @utilisateur / <@&role> n'ont aucun sens hors Discord
  return text.replace(/@everyone|@here|<@[!&]?\d+>/g, "").trim();
}

function parseTag(firstLine) {
  const match = firstLine.match(/^\s*\[(\w+)\]\s*(.*)$/);
  if (match) {
    return { tag: match[1].toUpperCase(), title: match[2].trim() };
  }
  return { tag: "MAJ", title: firstLine.trim() };
}

function messageToNewsItem(msg) {
  const cleaned = stripMentions(msg.content);
  const rawLines = cleaned.split("\n").filter((l) => l.trim() !== "");
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

// Discord ne renvoie que 100 messages max par requête. On remonte donc l'historique
// page par page (avec "before") jusqu'à avoir tout parcouru, avec une sécurité à
// 1000 messages pour éviter une boucle infinie sur un très gros salon.
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

    if (batch.length < perPage) break; // fin de l'historique du salon

    await new Promise((r) => setTimeout(r, 300)); // ménage l'API Discord entre deux pages
  }

  return messages;
}

async function main() {
  const messages = await fetchAllMessages();

  const news = messages
    .filter((m) => m.content && m.content.trim() !== "")
    .map(messageToNewsItem)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1)) // plus récent en premier
    .slice(0, MAX_ITEMS);

  // Protection : on ne laisse JAMAIS un résultat vide écraser un fichier qui avait
  // déjà du contenu. Un raté ponctuel de l'API Discord (timing, permission qui
  // n'a pas eu le temps de se propager, etc.) ne doit jamais effacer les vraies
  // données déjà synchronisées.
  if (news.length === 0) {
    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
    } catch {
      // pas de fichier existant ou illisible, tant pis, on continue normalement
    }
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(
        `Résultat vide (0 note trouvée sur ${messages.length} messages parcourus) alors que le fichier existant en contient ${existing.length} -> on ne touche à rien, probable raté ponctuel de l'API Discord.`
      );
      return;
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(news, null, 2), "utf-8");
  console.log(`${news.length} note(s) écrite(s) dans ${OUTPUT_PATH} (${messages.length} messages parcourus dans l'historique)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
