import { Routes, Route } from 'react-router-dom';
import { SongLoadingProvider } from './contexts/SongLoadingContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import GamePage from './pages/GamePage';
import LoadingSongPage from './pages/LoadingSongPage';
import SongLoadingIndicator from './components/SongLoadingIndicator';
import './App.css';

function App() {
  return (
    <SongLoadingProvider>
      <div className="app-layout">
        <Header />
        <main className="app-main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/game/:channel/:title" element={<GamePage />} />
            <Route path="/loading-song/:channel/:title" element={<LoadingSongPage />} />
          </Routes>
        </main>
        <Footer />
        <SongLoadingIndicator />
      </div>
    </SongLoadingProvider>
  );
}

export default App;
