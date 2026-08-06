# Patch-notes Discord -> Launcher

Ce système lit un salon Discord et met à jour automatiquement les actus visibles
dans le launcher, sans jamais avoir à toucher au code ou à reconstruire l'appli.

## Comment écrire une note dans Discord

Dans ton salon dédié (ex: `#patch-notes`), un message = une note :

```
[NOUVEAU] Refonte du système de garde-robe
Les vêtements achetés sont désormais livrés en objet physique dans l'inventaire.
```

Tags reconnus : `[NOUVEAU]`, `[MAJ]`, `[FIX]` (couleur différente dans le launcher).
Pas de tag → classé "MAJ" par défaut. La première ligne devient le titre, le reste
devient le texte de la note.

## Mise en place (une seule fois)

### 1. Créer le bot Discord

1. Va sur https://discord.com/developers/applications → **New Application** → nomme-le (ex: "Anomia News Bot")
2. Onglet **Bot** → **Add Bot**
3. Copie le **Token** (bouton "Reset Token" si besoin) — garde-le secret, ne le mets JAMAIS dans le launcher ni sur GitHub en clair
4. Dans **Privileged Gateway Intents**, tu n'as besoin de rien cocher (le script utilise l'API REST, pas le websocket)

### 2. Inviter le bot avec des droits minimaux

1. Onglet **OAuth2 → URL Generator**
2. Scopes : `bot`
3. Permissions : **View Channels** + **Read Message History** uniquement (rien d'autre — surtout pas "Administrator")
4. Ouvre l'URL générée, invite le bot sur ton serveur Discord
5. Dans les paramètres du salon `#patch-notes` → Permissions → assure-toi que le bot n'a accès qu'à CE salon si tu veux limiter encore plus (clic droit sur le salon → Modifier le salon → Permissions)

### 3. Récupérer l'ID du salon

Discord → Paramètres utilisateur → Avancé → active **Mode développeur**.
Puis clic droit sur le salon `#patch-notes` → **Copier l'ID du salon**.

### 4. Créer le repo GitHub (public)

1. Crée un nouveau repo public, ex: `anomia-launcher-news`
2. Mets-y le contenu du dossier `discord-news-sync/` et le fichier `news.json` (racine) de ce projet
3. Mets aussi `.github/workflows/sync-news.yml`

### 5. Configurer les secrets GitHub

Dans le repo → **Settings → Secrets and variables → Actions** :

- Onglet **Secrets** → **New repository secret** :
  - Nom : `DISCORD_BOT_TOKEN`
  - Valeur : le token copié à l'étape 1
- Onglet **Variables** → **New repository variable** :
  - Nom : `DISCORD_CHANNEL_ID`
  - Valeur : l'ID copié à l'étape 3

### 6. Activer le workflow

Onglet **Actions** du repo → active les workflows si demandé. Le script tourne
automatiquement toutes les 10 minutes, et tu peux aussi le lancer manuellement
via **Actions → Sync patch-notes Discord → Run workflow**.

### 7. Brancher le launcher dessus

Une fois que `news.json` s'est mis à jour au moins une fois dans ton repo,
récupère son URL "raw" (bouton **Raw** sur GitHub), ça ressemble à :

```
https://raw.githubusercontent.com/TON_USER/anomia-launcher-news/main/news.json
```

Colle cette URL dans `config.js` du launcher (`news.remoteUrl`), reconstruis
l'exe (`npm run dist:win`), et redistribue-le une dernière fois. **Après ça, tu
n'as plus jamais besoin de reconstruire le launcher pour poster une actu** —
tu postes dans Discord, et ça apparaît tout seul chez tes joueurs (au pire avec
10 minutes de délai, et le cache CDN GitHub peut ajouter 1-2 minutes de plus).

## Tester en local

```bash
cd discord-news-sync
DISCORD_BOT_TOKEN=xxxx DISCORD_CHANNEL_ID=xxxx node sync.js
```

Ça génère `../news.json` que tu peux inspecter avant de pousser sur GitHub.
