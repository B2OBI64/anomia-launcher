// Génère src/kb-modsinfo.json (catégorie « Mods » de KannibAventure) depuis ton dossier de mods.
// Usage :   node tools/make-kb-modsinfo.js "C:\chemin\vers\mods"
// - cherche chaque .jar sur Modrinth (par empreinte sha1) : nom, description, icône, lien
// - les mods introuvables (CurseForge uniquement…) sont listés : complète-les à la main dans tools/kb-modsinfo-overrides.json
// - tools/kb-modsinfo-overrides.json permet de remplacer la description (en français) ou le lien d'un mod :
//     { "sodium": { "description": "Rend Minecraft beaucoup plus fluide.", "url": "https://modrinth.com/mod/sodium" } }
//   (la clé = slug Modrinth, ou nom du fichier .jar pour un mod hors Modrinth)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('Donne le dossier des mods :  node tools/make-kb-modsinfo.js "C:\\...\\mods"'); process.exit(1); }
const overridesPath = path.join(__dirname, "kb-modsinfo-overrides.json");
const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, "utf-8")) : {};
const out = path.join(__dirname, "..", "src", "kb-modsinfo.json");

const jars = fs.readdirSync(dir).filter((f) => /\.jar$/i.test(f)).sort();
const sha1 = (f) => crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex");
const UA = { "User-Agent": "B2OBI64/kannibal-launcher (tools/make-kb-modsinfo)", "Content-Type": "application/json" };

(async () => {
  const hashes = Object.fromEntries(jars.map((f) => [sha1(f), f]));
  const vr = await fetch("https://api.modrinth.com/v2/version_files", { method: "POST", headers: UA, body: JSON.stringify({ hashes: Object.keys(hashes), algorithm: "sha1" }) });
  if (!vr.ok) throw new Error("Modrinth : HTTP " + vr.status);
  const versions = await vr.json(); // { sha1: { project_id, ... } }
  const ids = [...new Set(Object.values(versions).map((v) => v.project_id))];
  const projects = {};
  for (let i = 0; i < ids.length; i += 50) {
    const pr = await fetch("https://api.modrinth.com/v2/projects?ids=" + encodeURIComponent(JSON.stringify(ids.slice(i, i + 50))), { headers: UA });
    if (!pr.ok) throw new Error("Modrinth projets : HTTP " + pr.status);
    for (const p of await pr.json()) projects[p.id] = p;
  }
  const mods = [], missing = [], seen = new Set();
  for (const f of jars) {
    const v = versions[sha1(f)], p = v && projects[v.project_id];
    if (p) {
      if (seen.has(p.id)) continue; seen.add(p.id);
      const o = overrides[p.slug] || {};
      mods.push({ name: p.title, description: o.description || p.description || "", url: o.url || `https://modrinth.com/mod/${p.slug}`, icon: p.icon_url || "" });
    } else {
      const o = overrides[f] || {};
      const name = o.name || f.replace(/\.jar$/i, "").replace(/[-_ ]+\d.*$/, "");
      mods.push({ name, description: o.description || "", url: o.url || "", icon: "" });
      missing.push(f);
    }
  }
  mods.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  fs.writeFileSync(out, JSON.stringify({ notes: "Ce que fait chaque mod du serveur, avec le lien vers sa page.", mods }, null, 2) + "\n");
  console.log(`OK : ${mods.length} mods écrits dans src/kb-modsinfo.json`);
  if (missing.length) { console.log(`\n${missing.length} mod(s) introuvable(s) sur Modrinth (description/lien à compléter dans tools/kb-modsinfo-overrides.json) :`); missing.forEach((m) => console.log("  - " + m)); }
  const noDesc = mods.filter((m) => !m.description).length; if (noDesc) console.log(`\n${noDesc} mod(s) sans description.`);
})().catch((e) => { console.error("Erreur :", e.message); process.exit(1); });
