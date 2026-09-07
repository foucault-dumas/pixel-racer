# Pixel Racer — Règles du jeu

## Présentation

Pixel Racer est une adaptation numérique d'un jeu de course automobile classique sur papier quadrillé. Le principe repose sur la **physique de l'inertie** : chaque déplacement découle du précédent, ce qui oblige les joueurs à anticiper leur trajectoire, à freiner avant les virages et à gérer leur vitesse. C'est aussi un excellent outil pédagogique pour apprendre la notion de **symétrie centrale**.

- **Joueurs :** 2 à 6
- **Support :** grille numérique (cases carrées)
- **Objectif :** être le premier à franchir la ligne d'arrivée

---

## Le circuit

### Construction

Le circuit est composé de **deux tracés fermés** :
- un **bord extérieur**
- un **bord intérieur**

La **largeur minimale de la piste** est de **3 cases** en tout point du circuit. Cette contrainte est indispensable pour que les voitures puissent se croiser sans ambiguïté.

### La ligne de départ / arrivée

- Elle est **perpendiculaire** aux bords du circuit au point choisi.
- Elle traverse la piste de bord à bord (du tracé extérieur au tracé intérieur).
- C'est la même ligne qui sert au départ et à l'arrivée.

### Placement initial des joueurs

- Tous les joueurs se placent **sur** la ligne de départ, chacun sur un nœud de la grille distinct.
- Les positions de départ sont espacées d'au moins **une case**.
- Si le nombre de joueurs excède les nœuds disponibles sur la ligne, les joueurs supplémentaires se placent sur une **rangée parallèle** en arrière (côté départ, pas côté arrivée).
- L'ordre de jeu est déterminé avant le début de la partie (par exemple par tirage au sort).
- Chaque joueur choisit sa place puis joue immédiatement son premier coup, avant que le suivant se place. Le placement ne consomme pas un tour. Une fois tous les premiers coups joués, le premier joueur reprend la main.

---

## Mécanique de déplacement

### Le principe de l'inertie (symétrie centrale)

À chaque tour, un joueur calcule son déplacement en deux étapes :

1. **Trouver le point symétrique** : c'est le symétrique de l'avant-dernier point (position du tour précédent) par rapport au dernier point (position actuelle). Ce point représente la continuation naturelle de la trajectoire à vitesse constante — c'est le point "zéro freinage, zéro accélération".

2. **Choisir sa destination** : le joueur peut atterrir sur :
   - ce point symétrique exactement, **ou**
   - l'un des **8 points adjacents** (les 8 cases immédiatement autour du point symétrique)

Les 8 points adjacents permettent de freiner, d'accélérer légèrement ou d'ajuster la trajectoire latéralement.

### Premier déplacement

Au tout premier coup, le joueur n'a pas encore de "mouvement précédent". Il peut donc se déplacer d'**au maximum 1 case** dans n'importe quelle direction (y compris en diagonale). Ce premier coup définit le vecteur initial.

### Illustration

```
Avant-dernier point (A) → Dernier point (B) → Point symétrique (C)

C = B + (B - A)  →  C est le "miroir" de A par rapport à B
```

Le joueur peut choisir C ou n'importe lequel des 8 points autour de C.

---

## Contraintes de déplacement

- Un déplacement doit rester **à l'intérieur de la piste** (entre les deux bords).
- Deux voitures **ne peuvent pas occuper le même point** au même moment.
- Les trajectoires (lignes reliant deux positions successives) de différents joueurs **peuvent se croiser**.

---

## Sorties de piste

### Définition

Un joueur est en sortie de piste si son point d'atterrissage se trouve **en dehors des limites du circuit** (sur ou au-delà d'un bord).

### Pénalité : retour en "première vitesse"

Quand un joueur sort de la piste :

1. Il doit **se replacer sur la piste** au niveau de son point de sortie ou légèrement en arrière (il ne peut pas prendre d'avantage en sautant une portion du circuit).
2. Son vecteur de déplacement est **réinitialisé** : il repart comme s'il était à l'arrêt.
3. Il doit effectuer **4 tours consécutifs en "première vitesse"** avant de pouvoir rejouer normalement. En première vitesse, chaque déplacement est limité à **1 case maximum** dans n'importe quelle direction (y compris diagonale). Cela simule le temps nécessaire pour récupérer son allure après un accident.

> **Pourquoi cette règle ?** Sans pénalité, un joueur aurait intérêt à sortir volontairement de piste pour couper des virages ou "téléporter" sa voiture. Les 4 tours en première vitesse représentent un coût réel qui dissuade la sortie intentionnelle.

---

## Fin de partie

- La partie se termine dès qu'un joueur **franchit la ligne d'arrivée** (même ligne que le départ).
- Le franchissement doit se faire dans le **sens de la course** : le joueur doit venir du bon côté de la ligne.
- Le gagnant est le **premier joueur à franchir complètement la ligne** d'arrivée.

---

## Aide visuelle et mode pédagogique

Le jeu propose une option **"aide visuelle"** qui peut être activée ou désactivée :

- **Avec l'aide** : les points accessibles sont affichés (le point symétrique et les 8 cases adjacentes). Idéal pour débuter.
- **Sans l'aide** : les joueurs doivent calculer eux-mêmes le point symétrique. Mode recommandé pour apprendre la notion de symétrie et rendre le jeu plus stimulant intellectuellement.

Dans les deux modes, la **position précédente du joueur** est toujours visible (marquée différemment de la position actuelle) pour que le calcul de symétrie reste possible.

---

## Conseils stratégiques

- **Anticipez plusieurs coups à l'avance** : la physique de l'inertie rend les changements brutaux de direction impossibles à grande vitesse.
- **Freinez avant les virages** : choisir des points adjacents "en retrait" du point symétrique permet de réduire la vitesse avant une courbe.
- **Observez les adversaires** : un joueur rapide devant vous peut bloquer vos points d'atterrissage.
- **Ne prenez pas de risques inutiles** : une sortie de piste coûte 4 tours en première vitesse — une pénalité lourde qui peut faire perdre une course.
- **Utilisez les 8 points** pour vous repositionner idéalement en vue du prochain virage, même si ce n'est pas le chemin le plus rapide à court terme.

---

## Résumé des règles en un coup d'œil

| Situation | Règle |
|---|---|
| Déplacement normal | Point symétrique ± 1 case (9 options) |
| Premier déplacement | 1 case max dans n'importe quelle direction |
| Sortie de piste | 4 tours en première vitesse (1 case max par tour) |
| Même point que l'adversaire | Interdit |
| Traversée de trajectoire adverse | Autorisée |
| Franchissement de la ligne d'arrivée | Dans le sens de la course uniquement |

## Précisions de la version numérique

- Un trait qui touche ou traverse un bord est une sortie, même si son extrémité revient dans la piste. Le retour se fait sur une intersection libre avant le premier bord rencontré, sans raccourci.
- Les quatre coups au ralenti sont les quatre prochains coups du joueur concerné, pas ceux de ses adversaires.
- Un déplacement nul est autorisé (si le point appartient aux neuf destinations possibles).
- La victoire exige un tour complet dans le sens choisi et un dépassement de la ligne. S’arrêter exactement sur celle-ci ne suffit pas.
- L’éditeur propose un tracé par sommets ou à main levée, puis une fermeture explicite. La ligne de départ est une coupe horizontale ou verticale qui relie les deux bords.
