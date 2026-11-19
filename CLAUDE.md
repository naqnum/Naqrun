# NaqRun — notes pour Claude

- Utilisateur : francophone, non développeur. Répondre en français, expliquer simplement.
- Site statique servi par GitHub Pages depuis `main` (racine). Pas de build, pas de dépendances.
- `engine.js` est pur et testable : toute règle d'entraînement va là, avec un test dans `tests/engine.test.js` (`node tests/engine.test.js` doit afficher `OK`).
- `index.html` contient l'interface et le CSS (design « Nuit de raid » : fond #0E0F11, accent #FF7A1A, Space Grotesk + Inter). Mobile d'abord (iPhone), cibles tactiles ≥ 44 px.
- Données dans `localStorage` (`naqrun.v1`) ; ne jamais committer de clé API ni de données personnelles.
- Envoi montre : API Intervals.icu (`POST /api/v1/athlete/{id}/events`, auth Basic `API_KEY:<clé>`), description au format texte Intervals (`- 40m Z2 HR`). Pas de chiffres dans les libellés d'étapes (ils perturbent l'analyse d'Intervals).
- Après un changement de fichier mis en cache, incrémenter `CACHE` dans `sw.js`.
- Séances toujours structurées en temps et zones de FC (jamais en distance ni en allure). Objectif unique : être finisher.
- Pas de séances de renfo dans le programme (demande de l'utilisateur).
- Paliers : chaque marche ≤ 10 % de la précédente (risque de blessure accru au-delà de 10 % de la plus longue sortie des 30 derniers jours). Une semaine de consolidation toutes les 4 semaines (remodelage osseux).
- « Orange pendant » (jaune) : 4–5/10 pendant la course seulement, ≤ 3 après, 0–1 au réveil → pas de montée, série conservée, pas d'allègement ; deux de suite = orange.
- Algorithme adaptatif (engine.js) : douleur d'abord ; plafond dur = 110 % de la plus longue course réelle des 30 derniers jours ; séance facile trop intense (effort ressenti ≥ 6, > 20 % du temps au-dessus de Z2) ou trop longue (> 110 % du prévu) = pas de montée ; forme du matin basse (VFC 7 j < moyenne 60 j − 0,5 ET, ou pouls repos > moyenne + 5) = séance allégée. Rythmes : prudent (palier, 2 vertes), dynamique (palier + cadence, 2 vertes), limite (palier + cadence, 1 verte).
- Ne pas affaiblir les règles de sécurité douleur (signes d'arrêt, recul sur rouge) sans demande explicite.
