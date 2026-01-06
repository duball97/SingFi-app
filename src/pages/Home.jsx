import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [isArtistSearch, setIsArtistSearch] = useState(false);
  const [suggestedSongs, setSuggestedSongs] = useState([]);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const navigate = useNavigate();

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsArtistSearch(false);
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
      setIsArtistSearch(data.isArtistSearch || false);
    } catch (err) {
      console.error('Search error:', err);
      alert(err.message || 'Failed to search. Please make sure the backend server is running.');
    } finally {
      setSearching(false);
    }
  };

  // Fetch suggested songs on mount
  useEffect(() => {
    const fetchSuggestedSongs = async () => {
      try {
        setLoadingSuggested(true);
        const response = await fetch(`${API_BASE_URL}/songs?limit=12`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch suggested songs');
        }
        
        const data = await response.json();
        setSuggestedSongs(data.songs || []);
      } catch (error) {
        console.error('Error fetching suggested songs:', error);
        // Don't show error to user, just leave empty
      } finally {
        setLoadingSuggested(false);
      }
    };

    fetchSuggestedSongs();
  }, []);

  const handleSelectSong = async (video) => {
    const title = encodeURIComponent(video.title || 'Unknown');
    const channel = encodeURIComponent(video.channel || 'Unknown');
    
    // Check if song exists in database
    try {
      const response = await fetch(`${API_BASE_URL}/getSong?youtubeId=${video.id}`);
      const data = await response.json();
      
      if (data.cached) {
        // Song exists, navigate directly to game
        navigate(`/game/${channel}/${title}?id=${video.id}`);
      } else {
        // Song doesn't exist, navigate to loading page
        navigate(`/loading-song/${channel}/${title}?id=${video.id}`);
      }
    } catch (error) {
      console.error('Error checking if song exists:', error);
      // On error, assume song doesn't exist and go to loading page
      navigate(`/loading-song/${channel}/${title}?id=${video.id}`);
    }
  };

  return (
    <div className="app">
      <main className="app-main">
        <div className="song-selector">
          <h2>Search for a Song</h2>
          <p className="hero-subtitle">Find your favorite songs and test your singing skills</p>
          <p className="hero-description">
            Search by artist name to discover their popular songs, or search for a specific song title to start singing right away!
          </p>
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
              <h3>
                {isArtistSearch ? `Songs by ${searchQuery}` : 'Search Results'}
              </h3>
              <div className={isArtistSearch ? 'results-list artist-results' : 'results-list'}>
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

          {/* Hint text in bottom right - only show for artist searches */}
          {isArtistSearch && searchResults.length > 0 && (
            <div className="search-hint">
              <p>You can also search for a specific song</p>
            </div>
          )}

          {/* Suggested Songs Section */}
          {!searching && searchResults.length === 0 && (
            <div className="suggested-songs">
              <h3 className="suggested-songs-title">
                <span className="title-icon">🎵</span>
                Suggested Songs
              </h3>
              {loadingSuggested ? (
                <div className="suggested-loading">
                  <div className="loading-spinner-small"></div>
                  <p>Loading songs...</p>
                </div>
              ) : suggestedSongs.length > 0 ? (
                <div className="suggested-list">
                  {suggestedSongs.map((song) => (
                    <div
                      key={song.id}
                      className="suggested-item"
                      onClick={() => handleSelectSong(song)}
                    >
                      {song.thumbnail && (
                        <div className="suggested-thumbnail-wrapper">
                          <img
                            src={song.thumbnail}
                            alt={song.title}
                            className="suggested-thumbnail"
                          />
                          <div className="play-overlay">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      )}
                      <div className="suggested-info">
                        <div className="suggested-title">{song.title}</div>
                        {song.channel && (
                          <div className="suggested-artist">{song.channel}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-suggested-songs">
                  <p>No songs available yet. Search for a song to get started!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

