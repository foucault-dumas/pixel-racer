# Pixel Racer — La course des petits carreaux

La digitalisation des courses dessinées au Bic sur les cahiers d’école : chaque joueur a sa couleur, les traits restent sur la page et l’inertie oblige à anticiper les virages.

## Jouer

Site : https://pixel-racer-six.vercel.app

1. Choisir 2 à 6 joueurs et leurs prénoms. Chaque Bic a sa couleur.
2. Garder le circuit de la récré ou dessiner le vôtre, puis choisir le sens de course.
3. Cliquer sur « On fait la course ». L’ordre est tiré au sort.
4. Placer chaque joueur sur un point libre du départ. Si nécessaire, une rangée arrière apparaît.
5. Cliquer une intersection puis « Tracer mon coup ». Avec l’aide activée, le pavé de neuf flèches permet aussi de choisir une destination.
6. Faire un tour complet et dépasser la ligne dans le bon sens pour gagner. La revanche conserve le circuit et les joueurs.

Au premier coup : un carreau maximum, diagonales comprises. Ensuite, reporter le dernier déplacement et choisir ce point ou un de ses huit voisins. Les trajectoires peuvent se croiser, mais deux voitures ne peuvent finir au même point. Toucher ou traverser un bord déclenche un retour avant la sortie et quatre prochains coups en première vitesse. Un déplacement nul est autorisé pour attendre ou freiner.

L’aide au calcul se masque pour retrouver le jeu de tête. Le petit cercle vide indique la position précédente. Les règles détaillées sont accessibles dans le jeu et dans [RULES.md](RULES.md).

## Dessiner son circuit

Cliquer les sommets d’une boucle ou tracer au doigt / à la souris, puis fermer le bord. Répéter pour le bord intérieur, avec au moins trois carreaux entre les deux. Les boucles qui se croisent sont refusées. Enfin, cliquer dans la piste pour placer une ligne de départ horizontale ou verticale reliant les deux bords. Le bouton « Reprendre le circuit de la récré » permet de revenir au modèle.

## Commandes et accessibilité

- Souris ou tactile : sélectionner une intersection, puis confirmer le coup.
- Clavier : focus sur le cahier, flèches pour déplacer le curseur, Entrée pour jouer, Échap pour annuler la sélection.
- Placement au clavier : flèches entre les places libres puis Entrée ; un bouton propose aussi une place libre.
- Zoom de 100 à 200 %, avec défilement du cahier sur petit écran.
- Règles dans une boîte de dialogue native ; messages de course annoncés aux lecteurs d’écran.
- Les numéros distinguent les joueurs en plus des couleurs.

La partie se joue sur le même appareil. Pas de compte, de serveur de jeu ou de données envoyées. La course est conservée en mémoire : actualiser la page la remet à zéro.

## Développement

React 19, Vite 6, Tailwind CSS 4. Pas de dépendance de jeu supplémentaire.

```sh
npm ci
npm test
npm run lint
npm run build
npm run preview
```

- `src/lib/racing.js` : géométrie, validation du circuit, inertie, collisions, pénalités et victoire.
- `src/lib/racing.test.js` : tests Node, dont deux courses complètes dans les deux sens.
- `src/components/GameGrid.jsx` : état et commandes de partie.
- `src/components/Notebook.jsx` : cahier SVG, pointage souris/tactile et trajectoires.
- `src/components/Rules.jsx` : règles affichées.
- `src/index.css` : papier, petits carreaux, spirale, typographie manuscrite et Bics.

GitHub Actions exécute tests, lint et compilation. Vercel reste connecté au dépôt ; un push sur `main` met à jour le site, les branches utilisent les aperçus Vercel lorsque configurés.
