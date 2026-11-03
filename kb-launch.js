// Construit la ligne de commande Java d'une version Minecraft (vanilla ou NeoForge/Forge/Fabric)
// à partir des fichiers de version du dossier .minecraft, comme le fait le launcher officiel.
// Nécessite que la version, ses bibliothèques et ses assets soient déjà installés (par le launcher officiel).
const fs = require("fs");
const path = require("path");

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function loadVersion(root, id, depth = 0) {
  const file = path.join(root, "versions", id, id + ".json");
  if (!fs.existsSync(file)) throw new Error(`version « ${id} » introuvable (${file})`);
  const v = readJson(file);
  if (v.inheritsFrom && depth < 5) {
    const p = loadVersion(root, v.inheritsFrom, depth + 1);
    return {
      ...p, ...v,
      libraries: [...(v.libraries || []), ...(p.libraries || [])],
      arguments: {
        jvm: [...(p.arguments?.jvm || []), ...(v.arguments?.jvm || [])],
        game: [...(p.arguments?.game || []), ...(v.arguments?.game || [])]
      },
      assetIndex: v.assetIndex || p.assetIndex,
      assets: v.assets || p.assets,
      downloads: v.downloads || p.downloads,
      _parentId: v.inheritsFrom
    };
  }
  return v;
}

function ruleOk(rules, features, osName = "windows", arch = "x64") {
  if (!rules || !rules.length) return true;
  let allowed = false;
  for (const r of rules) {
    let match = true;
    if (r.os) {
      if (r.os.name && r.os.name !== osName) match = false;
      if (r.os.arch && r.os.arch !== arch && !(r.os.arch === "x86" && arch === "ia32")) match = false;
    }
    if (r.features) for (const [k, val] of Object.entries(r.features)) if (Boolean(features[k]) !== Boolean(val)) match = false;
    if (match) allowed = r.action === "allow";
  }
  return allowed;
}

function mavenPath(name) {
  const [g, a, v, c] = name.split(":");
  const [ver, ext] = String(v).split("@");
  return `${g.replace(/\./g, "/")}/${a}/${ver}/${a}-${ver}${c ? "-" + c : ""}.${ext || "jar"}`;
}

/**
 * @param {{root:string, versionId:string, auth:{access_token:string,uuid:string,name:string,meta?:object}, quickPlay?:string,
 *          nativesDir:string, memory?:{max:string,min:string}, osName?:string, arch?:string}} o
 */
function buildLaunch(o) {
  const root = o.root, sep = o.osName === "linux" ? ":" : ";";
  const osName = o.osName || "windows", arch = o.arch || "x64";
  const v = loadVersion(root, o.versionId);
  const features = { has_quick_plays_support: true, is_quick_play_multiplayer: Boolean(o.quickPlay), has_custom_resolution: false, is_demo_user: false };
  const libDir = path.join(root, "libraries");

  // Bibliothèques (classpath)
  const cp = [], seen = new Set();
  for (const lib of v.libraries || []) {
    if (!ruleOk(lib.rules, features, osName, arch)) continue;
    const rel = (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) || (lib.name ? mavenPath(lib.name) : null);
    if (!rel) continue;
    const full = path.join(libDir, rel);
    if (seen.has(full)) continue; seen.add(full);
    if (!fs.existsSync(full)) throw new Error(`bibliothèque manquante : ${rel} (lance une fois la version depuis le Minecraft Launcher officiel)`);
    cp.push(full);
  }
  // Jar du jeu : celui de la version lancée sinon celui de la version parente
  const ids = [o.versionId, v._parentId].filter(Boolean);
  const jar = ids.map((id) => path.join(root, "versions", id, id + ".jar")).find((p) => fs.existsSync(p));
  if (!jar) throw new Error("jar du jeu introuvable");
  cp.push(jar);

  const assetsRoot = path.join(root, "assets");
  const assetId = v.assetIndex && v.assetIndex.id ? v.assetIndex.id : v.assets;
  if (!fs.existsSync(path.join(assetsRoot, "indexes", assetId + ".json"))) throw new Error(`assets « ${assetId} » introuvables (lance une fois la version depuis le Minecraft Launcher officiel)`);

  const a = o.auth;
  const vars = {
    auth_player_name: a.name, auth_uuid: a.uuid, auth_access_token: a.access_token, auth_session: a.access_token,
    auth_xuid: (a.meta && a.meta.xuid) || "", clientid: (a.meta && a.meta.clientId) || a.client_token || "",
    user_type: (a.meta && a.meta.type) || "msa", user_properties: a.user_properties || "{}",
    version_name: o.versionId, version_type: (v.type === "release" ? "release" : v.type) || "release",
    game_directory: o.gameDir || root, assets_root: assetsRoot, game_assets: assetsRoot, assets_index_name: assetId,
    natives_directory: o.nativesDir, library_directory: libDir, classpath_separator: sep, classpath: cp.join(sep),
    launcher_name: "B2Launcher", launcher_version: "1", quickPlayMultiplayer: o.quickPlay || "",
    quickPlayPath: "", quickPlaySingleplayer: "", quickPlayRealms: "", resolution_width: "854", resolution_height: "480"
  };
  const sub = (s) => String(s).replace(/\$\{([^}]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const flat = (list) => {
    const out = [];
    for (const e of list || []) {
      if (typeof e === "string") { out.push(sub(e)); continue; }
      if (!ruleOk(e.rules, features, osName, arch)) continue;
      for (const val of [].concat(e.value)) out.push(sub(val));
    }
    return out;
  };
  let jvm = flat(v.arguments && v.arguments.jvm);
  const game = flat(v.arguments && v.arguments.game);
  if (!jvm.length) jvm = [`-Djava.library.path=${o.nativesDir}`, "-cp", cp.join(sep)]; // anciennes versions sans bloc jvm
  if (!jvm.some((x) => x.startsWith("-Xmx"))) jvm.unshift(`-Xmx${(o.memory && o.memory.max) || "4G"}`, `-Xms${(o.memory && o.memory.min) || "2G"}`);
  return { args: [...jvm, v.mainClass, ...game], mainClass: v.mainClass, classpathCount: cp.length };
}

module.exports = { buildLaunch, loadVersion, ruleOk };
