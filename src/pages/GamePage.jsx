import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Game from '../components/Game';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function GamePage() {
  const { channel, title } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoId = searchParams.get('id');
  
  const [segments, setSegments] = useState([]);
  const [lyrics, setLyrics] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!videoId) {
      navigate('/');
      return;
    }

    const loadGame = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/whisper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youtubeId: videoId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to load game');
        }

        const data = await response.json();
        setSegments(data.segments || []);
        setLyrics(data.lyrics || '');
      } catch (err) {
        setError(err.message);
        console.error('Error loading game:', err);
      } finally {
        setLoading(false);
      }
    };

    loadGame();
  }, [videoId, navigate]);

  const handleBack = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="game-page">
        <div className="loading-screen">
          <h2>🎤 Processing Song...</h2>
          <div className="loading">Running Whisper transcription...</div>
          <div className="loading-subtitle">This may take a moment</div>
        </div>
      </div>
    );
  }

  if (error || !videoId || segments.length === 0) {
    return (
      <div className="game-page">
        <div className="error-screen">
          <div className="error">Error: {error || 'Game not found'}</div>
          <button onClick={handleBack} className="back-button">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <Game
      videoId={videoId}
      segments={segments}
      lyrics={lyrics}
      onBack={handleBack}
    />
  );
}

