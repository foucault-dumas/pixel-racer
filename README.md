# Pixel Racer — La course des petits carreaux

La digitalisation des courses dessinées au Bic sur les cahiers d’école : chaque joueur a sa couleur, les traits restent sur la page et l’inertie oblige à anticiper les virages.

## Jouer

Site : https://pixel-racer-six.vercel.app

1. Choisir 2 à 6 joueurs et leurs prénoms. Chaque Bic a sa couleur.
2. Garder le circuit de la récré ou dessiner le vôtre, puis choisir le sens de course.
3. Cliquer sur « On fait la course ». L’ordre est tiré au sort.
4. Le joueur actif se place sur un point libre du départ, puis joue immédiatement son premier coup. Le suivant fait de même. Si nécessaire, une rangée arrière apparaît.
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

Le mode local se joue sur le même appareil et reste en mémoire : actualiser la page le remet à zéro. Il fonctionne sans Supabase.

## Jouer à distance

Préparer le circuit et le nombre de joueurs, puis choisir « Jouer à distance avec les copains ». Le créateur saisit son prénom et partage le lien d’invitation. Les amis choisissent leur prénom et reçoivent chacun un Bic. Quand tous sont là, le créateur lance la course et les invitations se ferment.

Chaque coup est validé et enregistré côté serveur. Il peut se passer des heures ou des jours entre deux tours : aucun chronomètre. Le cahier se rafraîchit toutes les dix secondes quand il est visible et au retour sur la page. Chacun peut fermer son navigateur puis retrouver la partie dans « Mes cahiers en ligne ».

Le navigateur mémorise le Bic. Dès l’arrivée, le jeu propose de conserver un lien personnel dans ses notes ou favoris. Ce lien est privé : celui qui le possède peut jouer avec ce Bic. Il permet de retrouver sa place sur un autre appareil ou après une session privée qui a effacé le stockage. Les vingt cahiers les plus récents sont visibles au-dessus du circuit à l’accueil ; les anciens restent accessibles par leur lien. À l’ouverture d’une invitation, le jeu vérifie d’abord le Bic enregistré avant de proposer de rejoindre. La rubrique « Tu as déjà joué ? » permet de coller son lien personnel pour reprendre.

À l’accueil, les cartes affichent les autres participants (« Reprendre avec Julie » ou « Reprendre avec Julie, X et Y »). Les anciennes parties récupèrent ces noms automatiquement à la connexion. « Retirer de mes cahiers » masque une course sur ce navigateur ; « Annuler » la remet dans la liste. La course et le Bic sont conservés, et le lien personnel permet toujours de l’ouvrir. Ce retrait n’abandonne pas la course pour les autres joueurs.

Quand ton tour arrive, le titre de l’onglet change, une pastille apparaît sur son icône et un petit clic évoquant un Bic quatre couleurs se fait entendre. Le son est activé par défaut : le bouton « Son activé / Son coupé » mémorise ton choix sur ce navigateur. Les clics habituels pour créer, rejoindre ou reprendre préparent l’audio ; aucun bouton d’autorisation supplémentaire n’est imposé. Le placement et le premier mouvement déclenchent une seule alerte, sans répétition. Ouvrir une partie déjà à ton tour reste silencieux.

Le jeu vérifie les tours toutes les dix secondes au premier plan, toutes les trente secondes dans un onglet masqué, et dès le retour à la page. Les navigateurs peuvent ralentir ou suspendre ces vérifications et le son, notamment sur téléphone verrouillé. Une nouvelle interaction peut être nécessaire après réouverture. Ce sont des alertes dans un onglet ouvert, pas des notifications push quand le jeu est fermé.

Installation Supabase / Vercel et retour arrière : [MULTIPLAYER.md](MULTIPLAYER.md).

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
- `src/components/OnlineGame.jsx` : invitations, reprise et interface de jeu partagé.
- `api/rooms.js` : fonction Vercel ; `server/` : autorisations, transitions et accès à Supabase.
- `supabase/migrations/` : schéma SQL versionné, isolé des autres applications.
- `src/index.css` : papier, petits carreaux, spirale, typographie manuscrite et Bics.

GitHub Actions exécute tests, lint et compilation. Vercel reste connecté au dépôt ; un push sur `main` met à jour le site, les branches utilisent les aperçus Vercel lorsque configurés.

Pour vérifier le multijoueur sans accès au cloud : `npm run build`, puis `npm run test:online`. Ouvrir `http://127.0.0.1:4173`. Ce serveur de test stocke uniquement en mémoire et perd ses parties à l’arrêt. Ne jamais le déployer. Les tests utilisent aussi PostgreSQL embarqué (PGlite) pour exécuter la migration et vérifier réellement les droits SQL.
