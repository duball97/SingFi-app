import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

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
    // Navigate immediately to show loading screen
    const title = encodeURIComponent(video.title || 'Unknown');
    const channel = encodeURIComponent(video.channel || 'Unknown');
    navigate(`/game/${channel}/${title}?id=${video.id}`);
  };

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
        </div>
      </main>
    </div>
  );
}

