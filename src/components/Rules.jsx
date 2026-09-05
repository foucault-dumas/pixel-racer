/* eslint-disable react/prop-types -- Internal callback only. */
export default function Rules({close}) {
  return <>
    <button className="dialog-close" aria-label="Fermer les règles" onClick={close}>×</button><p className="eyebrow">À RECOPIER DANS LA MARGE</p><h2>La règle du dernier trait.</h2>
    <p>Chacun son Bic, chacun son tour. Le premier à faire un tour complet et franchir l’arrivée dans le sens de la flèche gagne.</p>
    <ol className="rules-list">
      <li><strong>Au départ, un petit carreau.</strong>Place ton point sur la ligne. Pour le premier coup, avance d’un carreau maximum, diagonales comprises.</li>
      <li><strong>Ensuite, reporte ton dernier trait.</strong>Prolonge ton déplacement à l’identique : c’est le point d’inertie. Choisis ce point ou l’un de ses huit voisins. Clique, puis confirme ton trait.</li>
      <li><strong>Les traits se croisent, les points non.</strong>Tu peux traverser une ancienne trajectoire, mais pas finir sur une voiture. Le petit cercle vide marque ta position précédente.</li>
      <li><strong>Le bord ? Quatre coups au ralenti.</strong>Toucher ou traverser un bord te replace juste avant la sortie. Tu repars à l’arrêt, puis avances d’un carreau maximum pendant tes quatre prochains coups.</li>
      <li><strong>Un vrai tour, dans le bon sens.</strong>Repasser le départ tout de suite ou couper par l’intérieur ne compte pas. Tu dois dépasser la ligne, pas simplement t’y arrêter.</li>
    </ol>
    <p className="small-note">Clavier : donne le focus au cahier, utilise les flèches pour choisir et Entrée pour jouer. Sur téléphone, zoome et fais défiler le cahier ; trace ton circuit au doigt.</p><button className="primary" onClick={close}>J’ai retrouvé le coup de main ↗</button>
  </>;
}
