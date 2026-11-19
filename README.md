# NaqRun

Appli iPhone (page web installable) pour reprendre la course après une périostite tibiale, puis préparer le Raid de l'Archange (280 km, juin 2027).

- **Reprise (périostite)** : 17 paliers de 20 à 90 min, chaque marche ajoutant au plus 10 % (étude Garmin-RUNSAFE, BJSM 2025), une semaine de consolidation toutes les 4 semaines, dans une semaine type : footing palier (seule séance qui fait progresser), footing cadence, vélo ou elliptique, rando-course. Trois notes de douleur par course (pendant, après, lendemain matin) donnent un verdict vert, orange ou rouge. Trois signes d'arrêt bloquent la course. Relief : pentes douces courues, montées raides et descentes marchées.
- **Test de passage** : paliers terminés, 3 semaines au vert, 15 sauts sur une jambe et 25 montées sur pointe sans douleur, feu vert médical facultatif.
- **Programme ultra-trail (finisher)** : fiche course (distance, D+, étapes, temps limite, terrain, autonomie, nuit), km-effort, durée estimée et marge sur le temps limite, faisabilité selon les semaines disponibles, plan Base › Construction › Spécifique › Affûtage avec semaines allégées, week-ends chocs ou blocs de 3 jours, points de décision. Séances structurées en temps et zones de FC, pas d'objectif d'allure.
- **Projection** : les semaines et mois à venir, en supposant toutes les séances vertes.
- **Envoi sur la montre** : chaque séance part sur Intervals.icu, qui la transmet à Garmin Connect, puis à la Fenix.

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
