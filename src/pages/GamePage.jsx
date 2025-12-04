import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import Game from '../components/Game';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function GamePage() {
  const { channel, title: urlTitle } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoId = searchParams.get('id');
  
  const [segments, setSegments] = useState([]);
  const [lyrics, setLyrics] = useState('');
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('Downloading audio...');

  // Animated loading messages that cycle
  useEffect(() => {
    if (!loading) return;
    
    const messages = [
      'Downloading audio...',
      'Separating vocals...',
      'Transcribing lyrics...',
      'Extracting pitch...',
      'Almost ready...'
    ];
    
    let messageIndex = 0;
    const interval = setInterval(() => {
      messageIndex = (messageIndex + 1) % messages.length;
      setLoadingMessage(messages[messageIndex]);
    }, 2000);
    
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!videoId) {
      navigate('/');
      return;
    }

    // Prevent double requests (React Strict Mode, double-click, etc.)
    const lockKey = `__songLoading_${videoId}`;
    if (window[lockKey]) {
      console.log('⏳ Request already in progress, skipping duplicate...');
      return;
    }

    const loadGame = async () => {
      try {
        window[lockKey] = true;
        
        // Decode title and channel from URL
        const title = decodeURIComponent(urlTitle || 'Unknown');
        const artist = decodeURIComponent(channel || 'Unknown');
        
        const response = await fetch(`${API_BASE_URL}/whisper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            youtubeId: videoId,
            title: title !== 'Unknown' ? title : null,
            artist: artist !== 'Unknown' ? artist : null,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to load game');
        }

        const data = await response.json();
        setSegments(data.segments || []);
        setLyrics(data.lyrics || '');
        setNotes(data.notes || null);
        
        if (data.cached) {
          console.log('✅ Loaded from cache - instant!');
        }
        if (data.notes) {
          console.log('🎵 Real pitch notes loaded:', data.notes.length);
        }
      } catch (err) {
        setError(err.message);
        console.error('Error loading game:', err);
      } finally {
        setLoading(false);
        delete window[lockKey];
      }
    };

    loadGame();
  }, [videoId, navigate, urlTitle, channel]);

  const handleBack = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="game-page">
        <div className="loading-screen">
          {/* YouTube video background */}
          {videoId && (
            <iframe
              className="loading-video-bg"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Loading background"
            />
          )}
          
          {/* Overlay gradient */}
          <div className="loading-overlay"></div>
          
          {/* Content */}
          <div className="loading-content">
            <h2>🎤 Processing Song...</h2>
            <div className="loading-message">
              <span className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
              {loadingMessage}
            </div>
          </div>
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
      notes={notes}
      onBack={handleBack}
    />
  );
}

