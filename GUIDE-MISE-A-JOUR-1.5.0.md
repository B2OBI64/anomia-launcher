# Mettre à jour le launcher : B2 Launcher v1.5.0 (grosse refonte)

## 0. Avant de commencer
- Le dossier du projet : `C:\Users\Boobi\Desktop\launcher anomia\anomia-launcher-clean`
- Il faut avoir : Node.js, Git, et ton jeton GitHub (GH_TOKEN) à portée de main.

## 1. Remplacer les fichiers
1. Décompresse `anomia-launcher.zip` dans un dossier temporaire.
2. Copie TOUT son contenu dans `anomia-launcher-clean` et accepte de remplacer les fichiers.
3. Ne supprime jamais le dossier caché `.git` : il doit rester en place.

## 2. Vérifier avant de publier
```
cd "C:\Users\Boobi\Desktop\launcher anomia\anomia-launcher-clean"
verify-before-publish.bat
```
Il doit afficher OK partout (pas de conflit Git, pas d'erreur de syntaxe).

## 3. Tester en local (recommandé)
```
npm start
```
Vérifie : barre des serveurs en haut, accueil avec slider, onglets Anomia (bouton grisé 2027), page KannibAventure (Fichiers, Carte avec molette/glisser), connexion Discord. Ferme ensuite la fenêtre.

## 4. Enregistrer sur GitHub
```
git add .
git commit -m "v1.5.0 : B2 Launcher"
git push origin HEAD:main --force
git checkout -B main
```
(Le `git checkout -B main` évite de rester en "detached HEAD".)

## 5. Publier la version
```
set GH_TOKEN=ton_token_ici
npm run dist:win:publish
```
- `ton_token_ici` = uniquement le jeton, sans texte autour.
- Erreur "already exists" (422) : la version existe déjà, augmente `version` dans package.json.
- Erreur 401 : jeton incorrect ou expiré.

## 6. Contrôler la release sur GitHub
Sur github.com/B2OBI64/anomia-launcher > Releases, la version 1.5.0 doit contenir :
- `B2 Launcher Setup 1.5.0.exe`
- le fichier `.blockmap`
- `latest.yml`
Le patch note du "Quoi de neuf" vient de `release-notes.md`. S'il n'apparaît pas dans le launcher, colle le même texte dans la description de la release GitHub.

## 7. Tester la mise à jour sur TON PC
1. Ouvre l'ancien launcher (Anomia Launcher, version avant 1.5.0).
2. Il doit proposer la mise à jour, avec le patch note.
3. Télécharge et laisse installer : il se relance en "B2 Launcher".
4. Contrôle : tu es toujours connecté à Discord, un seul raccourci "B2 Launcher" (pas de doublon avec l'ancien), la nouvelle icône.

## 8. Si quelque chose ne va pas
Supprime la release 1.5.0 sur GitHub (et son tag) : les joueurs ne la verront plus, ceux qui n'ont pas encore mis à jour ne sont pas touchés. Corrige, passe en 1.5.1 et republie.

## 9. Côté serveur Anomia (optionnel tant qu'il est arrêté)
À la prochaine remise en ligne : copier `fivem-resources/b2_playerlink`, `b2_achievements` et `patch_wasabi_ambulance/b2_customize.lua`, puis redémarrer ces ressources.

## 10. Ce qui se modifie sans republier
Sur GitHub (branche main) : `src/kb-devlog.json`, `src/kb-faq.json`, `src/kb-rules.json`, `src/kb-mods.json`, `news.json`... Les joueurs voient les changements au prochain affichage, sans nouvelle version.
