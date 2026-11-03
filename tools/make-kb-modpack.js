// Génère kb-modpack.json à partir d'un dossier de mods.
// Usage (Windows) :  node tools\make-kb-modpack.js "C:\chemin\vers\mods"
// Puis envoie kb-modpack.json ET tous les .jar dans la release « mods » du dépôt GitHub kannibaventure-mods.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('Usage : node tools\\make-kb-modpack.js "<dossier des mods>"'); process.exit(1); }
const mods = [];
for (const f of fs.readdirSync(dir).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))) {
  if (!/\.jar$/i.test(f) || / \(\d+\)\.jar$/i.test(f)) continue; // ignore les doublons « (1) »
  const buf = fs.readFileSync(path.join(dir, f));
  mods.push({ file: f, size: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") });
}
const out = path.join(process.cwd(), "kb-modpack.json");
fs.writeFileSync(out, JSON.stringify({ minecraft: "26.1.2", neoforge: "26.1.2.122", mods }, null, 2));
console.log(`${mods.length} mods -> ${out}`);
