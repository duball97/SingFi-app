import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

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

    try {
      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Server returned non-JSON response:', text.substring(0, 200));
        throw new Error(`Server error: Received ${response.status} ${response.statusText}. Make sure the backend server is running on ${API_BASE_URL}`);
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setSearchResults(data.videos || []);
    } catch (err) {
      console.error('Search error:', err);
      alert(err.message || 'Failed to search. Please make sure the backend server is running.');
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

