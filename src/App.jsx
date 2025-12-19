import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import GamePage from './pages/GamePage';
import './App.css';

function App() {
  return (
    <div className="app-layout">
      <Header />
      <main className="app-main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:channel/:title" element={<GamePage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
