import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Game from '../components/Game';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoId = searchParams.get('video');
  const title = searchParams.get('title');
  const artist = searchParams.get('artist');
  const { user } = useAuth(); // MUST be called before any conditional returns

  const [segments, setSegments] = useState([]);
  const [lyrics, setLyrics] = useState('');
  const [notes, setNotes] = useState(null);
  const [firstVerseStartTime, setFirstVerseStartTime] = useState(null);
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
      console.log('Request already in progress, skipping duplicate...');
      return;
    }

    const loadGame = async () => {
      try {
        window[lockKey] = true;

        // Use title and artist from searchParams (already defined at top)
        const displayTitle = decodeURIComponent(title || 'Unknown');
        const displayArtist = decodeURIComponent(artist || 'Unknown');

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

        // Validate segments - check if transcription is mostly instrumental symbols
        const segments = data.segments || [];
        const hasValidSegments = segments.length > 0 && segments.some(seg => {
          const text = (seg.text || '').trim();
          const instrumentalSymbols = ['♪', '♫', '♬', '♩', '♭', '♮', '♯'];
          // Check if segment has actual text (not just instrumental symbols)
          return text.length > 0 && !instrumentalSymbols.some(symbol =>
            text === symbol || text === symbol + symbol || text.includes(symbol) && text.replace(new RegExp(symbol, 'g'), '').trim().length === 0
          );
        });

        if (!hasValidSegments && segments.length > 0) {
          // Segments are mostly instrumental - redirect to error page
          navigate('/song-error', {
            state: {
              title: data.title || displayTitle,
              artist: data.artist || displayArtist,
            }
          });
          return;
        }

        setSegments(segments);
        setLyrics(data.lyrics || '');
        setNotes(data.notes || null);
        setFirstVerseStartTime(data.firstVerseStartTime || null);

        if (data.cached) {
          console.log('Loaded from cache - instant!');
        }
        if (data.notes) {
          console.log('Real pitch notes loaded:', data.notes.length);
        }
        if (data.firstVerseStartTime) {
          console.log('First verse starts at:', data.firstVerseStartTime, 'seconds');
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
  }, [videoId, navigate, title, artist]);

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
            <h2>Processing Song...</h2>
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
          <div className="error-content" style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="error-icon" style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ color: '#ff6b35', marginBottom: '0.5rem' }}>There was a small issue</h2>
            <p style={{ color: '#999', marginBottom: '1.5rem' }}>Please try again</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                className="retry-button"
                style={{
                  background: 'linear-gradient(135deg, #ff6b35, #ff8c42)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Try Again
              </button>
              <button onClick={handleBack} className="back-button">
                ← Back to Home
              </button>
            </div>
          </div>
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
      firstVerseStartTime={firstVerseStartTime}
      user={user}
      onBack={handleBack}
    />
  );
}

