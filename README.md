# NaqRun

Appli iPhone (page web installable) pour reprendre la course après une périostite tibiale, puis préparer le Raid de l'Archange (280 km, juin 2027).

- **Mode reprise** : 15 paliers, du course/marche au trail de 90 min. Après chaque séance, trois notes de douleur (pendant, après, lendemain matin) donnent un verdict vert, orange ou rouge qui fait monter, rester ou reculer d'un palier. Trois signes d'arrêt (douleur précise sur l'os, douleur au repos, boiterie) bloquent la course.
- **Test de passage** : paliers terminés, 3 semaines au vert, test de sauts, feu vert médical facultatif.
- **Plan Raid** : semaines Base, Construction, Pic, Affûtage calculées à rebours depuis la date du Raid, avec semaines allégées et points de décision (mi-février, fin mars, fin avril, fin mai).
- **Envoi sur la montre** : chaque séance est envoyée à Intervals.icu, qui la transmet à Garmin Connect, puis à la Fenix.

## Installer sur l'iPhone

1. Ouvrir https://naqnum.github.io/Naqrun/ dans Safari.
2. Partager › « Sur l'écran d'accueil ».

## Relier la Fenix (gratuit)

1. Créer un compte sur https://intervals.icu.
2. Settings › Connections › Garmin Connect : autoriser, cocher « Upload planned workouts ».
3. Settings › Developer Settings : copier l'identifiant d'athlète (`i…`) et générer une clé API.
4. Dans NaqRun : Réglages › Intervals.icu, coller les deux, puis « Tester la connexion ».

Les données (journal, clé API) restent dans le stockage du téléphone, jamais dans ce dépôt.

## Fichiers

| Fichier | Rôle |
|---|---|
| `engine.js` | Logique pure : paliers, verdicts, plan Raid, texte Intervals, estimations |
| `index.html` | Interface (vues Aujourd'hui, Journal, Plan, Renfo, Réglages) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installation sur l'écran d'accueil, hors ligne |
| `tests/engine.test.js` | Tests du moteur : `node tests/engine.test.js` |

NaqRun ne remplace pas un avis médical.
