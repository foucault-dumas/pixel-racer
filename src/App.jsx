// Import du composant GameGrid depuis le dossier components
import GameGrid from './components/GameGrid'

// Le composant App simplifié qui utilise GameGrid comme composant principal
function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="p-4">
        <h1 className="text-3xl font-bold text-center">Pixel Racer</h1>
      </header>
      <main className="container mx-auto">
        <GameGrid />
      </main>
    </div>
  )
}

export default App