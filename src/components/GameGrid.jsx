import { useState } from 'react'
const GameGrid = () => {
  // État pour stocker la taille de la grille
  const gridSize = {
    rows: 20,
    cols: 30
  };

  // Création de la grille comme un tableau 2D
  const createGrid = () => {
    return Array(gridSize.rows).fill().map(() => 
      Array(gridSize.cols).fill(null)
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {/* En-tête du composant */}
      <h2 className="text-2xl font-bold mb-4">Pixel Racer</h2>
      
      {/* Container de la grille avec un rapport hauteur/largeur fixe */}
      <div className="w-full aspect-[3/2] bg-gray-100 border border-gray-300 rounded-lg overflow-hidden">
        {/* Grille de jeu */}
        <div className="grid h-full" 
             style={{
               gridTemplateRows: `repeat(${gridSize.rows}, 1fr)`,
               gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`
             }}>
          {createGrid().map((row, rowIndex) => 
            row.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className="border border-gray-200 hover:bg-gray-200 transition-colors"
                // Nous ajouterons ici les gestionnaires d'événements pour le tracé de la piste
              />
            ))
          )}
        </div>
      </div>
      
      {/* Contrôles de base */}
      <div className="mt-4 flex gap-4">
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          onClick={() => {/* Ajout futur : démarrer une nouvelle partie */}}
        >
          Nouvelle Partie
        </button>
      </div>
    </div>
  );
};

export default GameGrid;