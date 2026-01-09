import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './SongErrorPage.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function SongErrorPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get song info from location state or URL params
  const songTitle = location.state?.title || new URLSearchParams(location.search).get('title') || 'this song';
  const artist = location.state?.artist || new URLSearchParams(location.search).get('artist') || '';

  const handleSearch = async (query, page = 1) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    try {
      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&page=${page}`);

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

  const handleSelectSong = async (video) => {
    const title = encodeURIComponent(video.title || 'Unknown');
    const channel = encodeURIComponent(video.channel || 'Unknown');

    // Check if song exists in database
    try {
      const response = await fetch(`${API_BASE_URL}/getSong?youtubeId=${video.id}`);
      const data = await response.json();

      if (data.cached) {
        navigate(`/game/${channel}/${title}?id=${video.id}`);
      } else {
        navigate(`/loading-song/${channel}/${title}?id=${video.id}`);
      }
    } catch (error) {
      console.error('Error checking if song exists:', error);
      navigate(`/loading-song/${channel}/${title}?id=${video.id}`);
    }
  };

  return (
    <div className="song-error-container">
      <div className="song-error-card">
        <div className="error-icon"></div>
        <h1 className="error-title">Unable to Process This Song</h1>
        <p className="error-message">
          We couldn't extract the lyrics from <strong>{songTitle}</strong>
          {artist && ` by ${artist}`}. Please try with another song.
        </p>
        <p className="error-suggestion">
          Search for a different song below:
        </p>

        <div className="error-search-container">
          <input
            type="text"
            placeholder="Search for a different song..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSearch(searchQuery, 1);
              }
            }}
            className="error-search-input"
          />
          <button
            onClick={() => handleSearch(searchQuery, 1)}
            disabled={searching || !searchQuery.trim()}
            className="error-search-button"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="error-search-results">
            <h3>Search Results:</h3>
            <div className="error-results-list">
              {searchResults.map((video) => (
                <div
                  key={video.id}
                  className="error-result-item"
                  onClick={() => handleSelectSong(video)}
                >
                  {video.thumbnail && (
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="error-result-thumbnail"
                    />
                  )}
                  <div className="error-result-info">
                    <div className="error-result-title">{video.title}</div>
                    {video.channel && (
                      <div className="error-result-channel">{video.channel}</div>
                    )}
                    {video.duration && (
                      <div className="error-result-duration">{video.duration}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="error-actions">
          <button
            onClick={() => navigate('/')}
            className="error-button secondary"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

