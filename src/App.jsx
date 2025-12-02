import { useState, useEffect } from 'react';
import Player from './components/Player';
import Lyrics from './components/Lyrics';
import PitchDetector from './components/PitchDetector';
import Score from './components/Score';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [selectedSongInfo, setSelectedSongInfo] = useState(null);
  const [segments, setSegments] = useState([]);
  const [lyrics, setLyrics] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [userPitch, setUserPitch] = useState(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setSearchResults(data.videos || []);
    } catch (err) {
      setError(err.message);
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSong = (video) => {
    setSelectedSong(video.id);
    setSelectedSongInfo(video);
    setSearchResults([]);
    setSearchQuery('');
    handleSongSelect(video.id);
  };

  const handleSongSelect = async (youtubeId) => {
    setLoading(true);
    setError(null);
    setSegments([]);
    setLyrics('');
    setCurrentTime(0);
    setScore(0);

    try {
      // Call Whisper API
      const response = await fetch(`${API_BASE_URL}/whisper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to process song');
      }

      const data = await response.json();
      setSegments(data.segments || []);
      setLyrics(data.lyrics || '');
    } catch (err) {
      setError(err.message);
      console.error('Error processing song:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeUpdate = (time) => {
    setCurrentTime(time);
  };

  const handlePitchDetected = (pitch) => {
    setUserPitch(pitch);
    
    // Simple scoring: for MVP, just increment score based on pitch detection
    // In a real implementation, compare with target pitch from song
    if (pitch > 0) {
      setScore((prev) => prev + 0.1);
    }
  };

  // Auto-select first result when search completes
  useEffect(() => {
    if (searchResults.length > 0 && !selectedSong) {
      // Don't auto-select, let user choose
    }
  }, [searchResults, selectedSong]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎤 SingFi</h1>
      </header>

      <main className="app-main">
        <div className="song-selector">
          <h2>Search for a Song</h2>
          <div className="search-container">
            <input
              type="text"
              placeholder="Search by song name, artist, or both..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(searchQuery);
                }
              }}
              className="search-input"
            />
            <button
              onClick={() => handleSearch(searchQuery)}
              disabled={searching || !searchQuery.trim()}
              className="search-button"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              <h3>Search Results:</h3>
              <div className="results-list">
                {searchResults.map((video) => (
                  <div
                    key={video.id}
                    className="result-item"
                    onClick={() => handleSelectSong(video)}
                  >
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="result-thumbnail"
                      />
                    )}
                    <div className="result-info">
                      <div className="result-title">{video.title}</div>
                      {video.channel && (
                        <div className="result-channel">{video.channel}</div>
                      )}
                      {video.duration && (
                        <div className="result-duration">{video.duration}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedSongInfo && (
            <div className="selected-song">
              <h3>Selected: {selectedSongInfo.title}</h3>
              {selectedSongInfo.channel && (
                <p>Channel: {selectedSongInfo.channel}</p>
              )}
            </div>
          )}
        </div>

        {loading && <div className="loading">Processing song with Whisper...</div>}
        {error && <div className="error">Error: {error}</div>}

        {selectedSong && segments.length > 0 && (
          <>
            <div className="player-section">
              <Player
                videoId={selectedSong}
                onTimeUpdate={handleTimeUpdate}
              />
            </div>

            <div className="game-section">
              <div className="lyrics-section">
                <Lyrics segments={segments} currentTime={currentTime} />
              </div>

              <div className="controls-section">
                <PitchDetector onPitchDetected={handlePitchDetected} />
                <Score
                  score={score}
                  targetPitch={null}
                  userPitch={userPitch}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
