import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSongLoading } from '../contexts/SongLoadingContext';
import './LoadingSongPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function LoadingSongPage() {
  const { channel, title: urlTitle } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const videoId = searchParams.get('id');
  const { addLoadingSong, updateSongStatus } = useSongLoading();
  
  const [randomSongs, setRandomSongs] = useState([]);
  const [loadingRandom, setLoadingRandom] = useState(true);

  const title = decodeURIComponent(urlTitle || 'Unknown');
  const artist = decodeURIComponent(channel || 'Unknown');

  // Start background processing
  useEffect(() => {
    if (!videoId) {
      navigate('/');
      return;
    }

    const startProcessing = async () => {
      try {
        // Add to loading songs
        addLoadingSong(videoId, title, artist);

        // Start processing in the background (don't await, let it run)
        fetch(`${API_BASE_URL}/whisper`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            youtubeId: videoId,
            title: title !== 'Unknown' ? title : null,
            artist: artist !== 'Unknown' ? artist : null,
          }),
        })
          .then(response => {
            if (response.ok) {
              updateSongStatus(videoId, 'completed');
            } else {
              console.error('Error processing song:', response.statusText);
              // Keep as loading on error, user can retry
            }
          })
          .catch(error => {
            console.error('Error processing song:', error);
            // Keep as loading on error
          });
      } catch (error) {
        console.error('Error starting song processing:', error);
      }
    };

    startProcessing();
  }, [videoId, title, artist, addLoadingSong, updateSongStatus, navigate]);

  // Fetch random songs
  useEffect(() => {
    const fetchRandomSongs = async () => {
      try {
        setLoadingRandom(true);
        const response = await fetch(`${API_BASE_URL}/songs?limit=100`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch songs');
        }
        
        const data = await response.json();
        const songs = data.songs || [];
        
        // Shuffle and pick 3 random songs
        const shuffled = [...songs].sort(() => Math.random() - 0.5);
        setRandomSongs(shuffled.slice(0, 3));
      } catch (error) {
        console.error('Error fetching random songs:', error);
      } finally {
        setLoadingRandom(false);
      }
    };

    fetchRandomSongs();
  }, []);

  const handleSelectSong = (song) => {
    const titleEncoded = encodeURIComponent(song.title || 'Unknown');
    const channelEncoded = encodeURIComponent(song.channel || 'Unknown');
    navigate(`/game/${channelEncoded}/${titleEncoded}?id=${song.id}`);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="loading-song-page">
      <div className="loading-song-content">
        <h2>🎤 Loading your song</h2>
        <p className="loading-song-message">
          This will take a few minutes. Would you like to play another song instead while it loads?
        </p>
        
        <div className="loading-song-info">
          <div className="song-title">{title}</div>
          {artist !== 'Unknown' && (
            <div className="song-artist">by {artist}</div>
          )}
        </div>

        {loadingRandom ? (
          <div className="random-songs-loading">
            <div className="loading-spinner-small"></div>
            <p>Loading songs...</p>
          </div>
        ) : randomSongs.length > 0 ? (
          <div className="random-songs-section">
            <h3>Try these songs instead:</h3>
            <div className="random-songs-list">
              {randomSongs.map((song) => (
                <div
                  key={song.id}
                  className="random-song-item"
                  onClick={() => handleSelectSong(song)}
                >
                  {song.thumbnail && (
                    <div className="random-song-thumbnail-wrapper">
                      <img
                        src={song.thumbnail}
                        alt={song.title}
                        className="random-song-thumbnail"
                      />
                      <div className="play-overlay">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                  <div className="random-song-info">
                    <div className="random-song-title">{song.title}</div>
                    {song.channel && (
                      <div className="random-song-artist">{song.channel}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <button onClick={handleGoHome} className="go-home-button">
          ← Back to Home
        </button>
      </div>
    </div>
  );
}

