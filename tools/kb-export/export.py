#!/usr/bin/env python3
"""
KannibAventure : exporte les avancements Minecraft (natifs + mods) et le temps de jeu
de chaque joueur vers l'hôte Anomia (ressource b2_staffpanel, route /kbpush).

À lancer sur la MACHINE MINECRAFT, toutes les 2 à 5 minutes (tâche planifiée / cron).
Aucune dépendance : Python 3 seulement.

Variables d'environnement :
  KB_WORLD_DIR     dossier du monde (ex: /home/mc/server/world)
  KB_PUSH_URL      ex: http://185.44.80.32:30140/b2_staffpanel/kbpush
  KB_PUSH_SECRET   même valeur que  set anomia_kb_push_secret "..."  côté FiveM
"""
import json, os, sys, urllib.request

world = os.environ.get("KB_WORLD_DIR", "world")
url = os.environ.get("KB_PUSH_URL")
secret = os.environ.get("KB_PUSH_SECRET")
if not url or not secret:
    sys.exit("KB_PUSH_URL et KB_PUSH_SECRET sont requis.")

# noms des joueurs : usercache.json (dossier du serveur, à côté du monde)
names = {}
for cand in (os.path.join(world, "..", "usercache.json"), "usercache.json"):
    try:
        for e in json.load(open(cand, encoding="utf-8")):
            names[e["uuid"].lower()] = e["name"]
        break
    except Exception:
        pass

players = {}
adv_dir = os.path.join(world, "advancements")
for fn in os.listdir(adv_dir) if os.path.isdir(adv_dir) else []:
    if not fn.endswith(".json"):
        continue
    uuid = fn[:-5].lower()
    try:
        data = json.load(open(os.path.join(adv_dir, fn), encoding="utf-8"))
    except Exception:
        continue
    done = [k for k, v in data.items()
            if isinstance(v, dict) and v.get("done") and not k.startswith("minecraft:recipes/") and k != "DataVersion"]
    ticks = 0
    try:
        st = json.load(open(os.path.join(world, "stats", fn), encoding="utf-8"))
        c = st.get("stats", {}).get("minecraft:custom", {})
        ticks = c.get("minecraft:play_time", c.get("minecraft:play_one_minute", 0))
    except Exception:
        pass
    players[uuid] = {"name": names.get(uuid, ""), "adv": done, "playTicks": ticks}

body = json.dumps({"players": players, "count": len(players)}).encode()
req = urllib.request.Request(url, data=body, method="POST",
                             headers={"Content-Type": "application/json", "x-push-secret": secret})
with urllib.request.urlopen(req, timeout=15) as r:
    print(r.status, r.read().decode())
