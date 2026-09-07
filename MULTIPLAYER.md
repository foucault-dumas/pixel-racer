# Installer le cahier partagé

Le code est prêt à être configuré, mais la partie en ligne ne fonctionne dans le cloud qu’après ces étapes. Le mode local fonctionne même si Supabase est indisponible. Aucun secret ne doit être envoyé dans une conversation ou enregistré dans GitHub.

## 1. Supabase — une seule exécution SQL

Dans le projet **pixel-racer** (`bgkhaaniuaqrdnkrygoz`), ouvrir **SQL Editor**, créer une requête, coller tout le contenu de [la migration](supabase/migrations/202609070001_private_racing.sql), puis cliquer **Run**.

Résultat attendu : succès, sans résultat à afficher. Le script crée deux tables préfixées `pixel_racer_` et une fonction de limitation des requêtes. Il est transactionnel : si une instruction échoue, l’installation n’est pas partiellement appliquée. Ne pas le relancer après un succès ; une erreur « already exists » indique généralement qu’il est déjà installé.

Garder **Data API activée**, l’exposition automatique des nouvelles tables **désactivée**, et RLS **activée**. La migration donne uniquement au serveur les droits nécessaires. Il n’y a pas de politique autorisant les navigateurs à lire directement les tables, et c’est volontaire. Aucune configuration Supabase Auth ou Realtime n’est nécessaire.

## 2. Vercel — trois variables

Dans le projet Vercel **pixel-racer**, ouvrir **Settings → Environment Variables**. Ajouter ces valeurs pour **Production** :

| Nom exact | Valeur |
| --- | --- |
| `SUPABASE_URL` | `https://bgkhaaniuaqrdnkrygoz.supabase.co` |
| `SUPABASE_SECRET_KEY` | La clé **secret** du projet Supabase, commençant par `sb_secret_` |
| `MULTIPLAYER_ENABLED` | `true` |

La clé se trouve dans Supabase, **Settings → API Keys → Secret keys**. La copier directement de Supabase vers Vercel. Marquer cette variable comme sensible si Vercel propose cette option. Ne pas utiliser une clé publishable/anon et ne pas ajouter de préfixe `VITE_`. Le serveur prend aussi en charge l’ancienne clé `service_role`, mais la clé secret actuelle est préférable.

Pour tester d’abord sur un aperçu, ajouter les mêmes variables à **Preview**, limitées à la branche `codex/private-multiplayer`, puis redéployer cet aperçu. Utiliser uniquement des parties de test sur cet aperçu : elles utilisent la même base. Retirer les variables Preview après intégration si elles ne servent plus.

## 3. GitHub puis Vercel

Quand les vérifications de la pull request sont vertes, la fusionner dans **main**. Vercel construira le site avec les variables Production. Si le code était déjà déployé avant l’ajout des variables, ouvrir **Deployments → dernier déploiement → Redeploy**.

L’URL publique reste **https://pixel-racer-six.vercel.app**. Envoyer les invitations depuis cette adresse stable, car le navigateur mémorise les Bics par domaine. Un aperçu Vercel protégé peut demander une connexion Vercel : les amis doivent utiliser le site de production.

## Vérification finale à deux appareils

1. Créer un cahier pour deux, copier l’invitation et l’ouvrir sur un autre appareil ou dans une fenêtre privée.
2. Rejoindre avec un autre prénom. Le premier navigateur doit afficher deux Bics au plus tard au prochain rafraîchissement (dix secondes).
3. Lancer la course. Vérifier que seul le joueur actif peut poser son point ou jouer.
4. Jouer un coup, actualiser les deux pages : le trait, le tour et l’identité de chacun doivent être conservés.
5. Sauvegarder un lien personnel et le rouvrir dans une autre session : il doit retrouver le même Bic, sans créer une place.
6. Couper temporairement Internet : le jeu doit indiquer la perte de connexion et refuser de confirmer un coup tant que le cahier n’a pas été relu.

La migration et les autorisations ont été testées dans PostgreSQL embarqué, et le parcours dans deux sessions locales distinctes. La connexion réelle à Supabase et le déploiement Vercel nécessitent encore cette vérification après configuration.

## Revenir en arrière

**Arrêter seulement le mode en ligne :** mettre `MULTIPLAYER_ENABLED=false` dans Vercel puis redéployer. Le mode local continue de fonctionner et les parties enregistrées restent dans la base.

**Revenir au jeu d’avant :** restaurer le déploiement Vercel précédent, puis annuler la pull request avec **Revert** sur GitHub si l’on veut aussi remettre le dépôt dans cet état. Référence du code précédent : `923b0bc`. Les nouvelles tables peuvent rester en place sans gêner l’ancien jeu.

**GitHub ne restaure pas la base de données.** Pour une restauration des parties elles-mêmes, il faut une sauvegarde Supabase. Ne supprimer les tables que si l’on veut réellement effacer toutes les parties en ligne, après export/sauvegarde :

```sql
-- Destructif : toutes les parties en ligne seront effacées.
begin;
drop function if exists public.pixel_racer_rate_limit(text, integer, integer);
drop table if exists public.pixel_racer_limits;
drop table if exists public.pixel_racer_rooms;
commit;
```

## Sécurité et limites de cette version

- Identités sans compte : secrets aléatoires de 256 bits, propres à chaque joueur et chaque partie ; seuls leurs condensats SHA-256 sont enregistrés dans la base. Les liens d’invitation utilisent un secret séparé et ne permettent plus d’obtenir un Bic après le départ.
- Les secrets de joueur sont dans le stockage du navigateur, et peuvent être exportés via un lien personnel. Une personne ayant ce lien ou accès à ce navigateur peut jouer avec ce Bic. Si le stockage et le lien sont perdus, il n’y a pas de récupération par email.
- La clé d’administration Supabase reste dans la fonction Vercel. Les tables ont RLS activée et aucun droit pour `anon` ou `authenticated`. Les réponses de l’API excluent secrets, condensats et reçus internes.
- Le serveur vérifie le circuit, le nombre de joueurs, les prénoms, le rôle de créateur, le tour courant et les règles du mouvement. Un changement de version concurrent bloque une seconde écriture ; les derniers identifiants de requête rendent les répétitions sans effet.
- Requêtes limitées par adresse IP condensée avec HMAC : 180/minute au total, 60 écritures/minute, 10 créations/heure et 30 tentatives de rejoindre/heure. Les compteurs sont partagés dans PostgreSQL et expirent. Cela limite les abus ordinaires, sans constituer une protection complète contre un déni de service distribué.
- Les invitations et liens personnels sont dans le fragment de l’URL, retiré après mémorisation. Pas d’analytics ni de script tiers. CSP, refus d’intégration dans une iframe, absence de referrer, réponses privées non mises en cache.
- Pas de notifications push/email, d’expulsion, de changement de joueur en cours de course ou de revanche qui efface l’ancienne partie. Une nouvelle course crée un nouveau cahier. Le créateur choisit le nombre exact de participants avant d’inviter ; tous doivent rejoindre pour commencer.
- Pas d’expiration automatique des parties. Une limite de taille protège chaque cahier (environ 1,5 million de caractères). Surveiller l’usage Supabase/Vercel et conserver les sauvegardes ; les contrôles applicatifs ne garantissent pas un plafond de facturation.

Vérifications automatisées : moteur de course, parties à deux et six identités, accès interdit aux non-membres, invitations invalides, capacité, privilèges du créateur, coups hors tour, versions périmées, doubles envois, reprise, formats invalides, origine, limitation et autorisations SQL réelles. Les corrections compatibles des dépendances ont été appliquées ; `npm audit` ne signalait aucune vulnérabilité connue lors de cette livraison. Il s’agit de vérifications ciblées, pas d’une certification de sécurité ni d’un audit externe.
