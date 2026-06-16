// Import du composant GameGrid depuis le dossier components
import GameGrid from './components/GameGrid'

// Le composant App simplifié qui utilise GameGrid comme composant principal
function App() {
  return (
    <div className="h-screen bg-[#0a0a12] text-white flex flex-col overflow-hidden">
      <header className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <span className="text-lg" aria-hidden="true">🏁</span>
        <h1 className="font-pixel title-neon text-sm sm:text-base">PIXEL RACER</h1>
      </header>
      <main className="flex-1 min-h-0">
        <GameGrid />
      </main>
    </div>
  )
}

export default App