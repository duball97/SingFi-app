import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import GamePage from './pages/GamePage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game/:channel/:title" element={<GamePage />} />
    </Routes>
  );
}

export default App;
