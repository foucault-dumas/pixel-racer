# CLAUDE.md

## Projet

Pixel Racer digitalise le jeu de course au Bic sur petits carreaux. Lire RULES.md. Préserver le jeu local à 2–6, les couleurs de Bic, les trajectoires et la possibilité de dessiner le circuit.

## Déploiement

Site existant : pixel-racer-six.vercel.app, Vercel connecté à GitHub. Un push sur main déclenche un déploiement. Préférer une branche de travail et vérifier avant intégration. Ne pas utiliser npm run dev ; compiler puis utiliser npm run preview.

## Vérification

npm test
npm run lint
npm run build

Les règles sont indépendantes de React dans src/lib/racing.js. Les tests Node incluent des courses complètes dans les deux sens. Le workflow .github/workflows/check.yml exécute les mêmes vérifications.

## Architecture

React 19 + Vite 6 + Tailwind 4. GameGrid.jsx gère l’état et les contrôles ; Notebook.jsx dessine en SVG ; Rules.jsx présente les règles. src/index.css porte le style cahier et Bic. Aucune dépendance supplémentaire pour le moteur.

Grille 64 × 40, coordonnées {x,y} entières aux intersections. Bords polygonaux simples, intérieur inclus dans extérieur, largeur >= 3. La ligne de départ relie les deux bords sur une coupe horizontale ou verticale. Les positions sur un bord sont exclues.

Phases : setup (race=null), placement, playing, finished. Joueur : position, previous, velocity, penalty, turns, progress (enroulement angulaire signé), path et crashes. Une sortie coupe au premier bord traversé et replace avant celui-ci, jamais après un raccourci. La pénalité concerne les quatre prochains coups du joueur. La victoire exige un tour complet puis un franchissement du segment de départ dans le sens choisi. Les trajectoires peuvent se croiser ; les positions finales occupées sont interdites.

Le mode local reste en mémoire. Le mode en ligne passe exclusivement par api/rooms.js (Vercel), qui valide les règles et les identités côté serveur puis sauvegarde dans Supabase par comparaison atomique de version. Ne jamais exposer SUPABASE_SECRET_KEY au navigateur ni accepter une race fournie par le client. Voir MULTIPLAYER.md. Les confirmations de coup évitent les clics accidentels. Au tactile, un défilement ne doit jamais placer une voiture.
