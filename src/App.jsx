import { Routes, Route } from 'react-router-dom';
import { SongLoadingProvider } from './contexts/SongLoadingContext';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import GamePage from './pages/GamePage';
import LoadingSongPage from './pages/LoadingSongPage';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AuthCallback from './pages/AuthCallback';
import SongErrorPage from './pages/SongErrorPage';
import Profile from './pages/Profile';
import SongLoadingIndicator from './components/SongLoadingIndicator';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <SongLoadingProvider>
        <div className="app-layout">
          <Header />
          <main className="app-main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/game/:channel/:title" element={<GamePage />} />
              <Route path="/loading-song/:channel/:title" element={<LoadingSongPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/song-error" element={<SongErrorPage />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </main>
          <Footer />
          <SongLoadingIndicator />
        </div>
      </SongLoadingProvider>
    </AuthProvider>
  );
}

export default App;
