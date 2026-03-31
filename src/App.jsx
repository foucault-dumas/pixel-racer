// Import du composant GameGrid depuis le dossier components
import GameGrid from './components/GameGrid'

// Le composant App simplifié qui utilise GameGrid comme composant principal
function App() {
  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      <header className="shrink-0 px-4 py-2 border-b border-gray-800">
        <h1 className="text-xl font-bold">Pixel Racer</h1>
      </header>
      <main className="flex-1 min-h-0">
        <GameGrid />
      </main>
    </div>
  )
}

export default App