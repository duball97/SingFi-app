import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isArtistSearch, setIsArtistSearch] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [suggestedSongs, setSuggestedSongs] = useState([]);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const navigate = useNavigate();

  const handleSearch = async (query, page = 1) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsArtistSearch(false);
      setHasMore(false);
      setCurrentPage(1);
      return;
    }

    if (page === 1) {
      setSearching(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&page=${page}`);
      
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
      
      if (page === 1) {
        setSearchResults(data.videos || []);
      } else {
        // Append new results for pagination
        setSearchResults(prev => [...prev, ...(data.videos || [])]);
      }
      
      setIsArtistSearch(data.isArtistSearch || false);
      setHasMore(data.hasMore || false);
      setCurrentPage(page);
    } catch (err) {
      console.error('Search error:', err);
      alert(err.message || 'Failed to search. Please make sure the backend server is running.');
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && searchQuery.trim()) {
      handleSearch(searchQuery, currentPage + 1);
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
        <div className="home-layout">
          {/* Left Column - Hero and Suggested Songs */}
          <div className="home-left-column">
            <div className="song-selector">
              <h2>Master Your Voice</h2>
              <p className="hero-subtitle">Sing. Score. Dominate.</p>
              <p className="hero-description">
                Find any song, challenge yourself, and become a legend.
              </p>
            </div>
            
            <div className="search-container-wrapper">
              <div className="search-container">
              <input
              type="text"
              placeholder="Search by song name, artist, or both..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(searchQuery, 1);
                }
              }}
                className="search-input"
              />
              <button
                onClick={() => handleSearch(searchQuery, 1)}
                disabled={searching || !searchQuery.trim()}
                className="search-button"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
              </div>
            </div>



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
                <div className="jukebox-carousel">
                  <div className="jukebox-track">
                    {suggestedSongs.map((song, index) => (
                      <div
                        key={song.id}
                        className="jukebox-card"
                        onClick={() => handleSelectSong(song)}
                        style={{ '--index': index }}
                      >
                        <div className="jukebox-card-inner">
                          {song.thumbnail && (
                            <div className="jukebox-image-wrapper">
                              <img
                                src={song.thumbnail}
                                alt={song.title}
                                className="jukebox-image"
                              />
                              <div className="jukebox-play-overlay">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                          <div className="jukebox-card-info">
                            <div className="jukebox-title">{song.title}</div>
                            {song.channel && (
                              <div className="jukebox-artist">{song.channel}</div>
                            )}
                          </div>
                        </div>
                        <div className="jukebox-card-shadow"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="no-suggested-songs">
                  <p>No songs available yet. Search for a song to get started!</p>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Right Column - Search Results */}
          <div className="home-right-column">
            {searchResults.length > 0 ? (
              <div className="search-results">
                <h3>
                  {isArtistSearch ? `Songs by ${searchQuery}` : 'Search Results'}
                </h3>
                <div className="jukebox-carousel">
                  <div className="jukebox-track">
                    {searchResults.map((video, index) => (
                      <div
                        key={video.id}
                        className="jukebox-card"
                        onClick={() => handleSelectSong(video)}
                        style={{ '--index': index }}
                      >
                        <div className="jukebox-card-inner">
                          {video.thumbnail && (
                            <div className="jukebox-image-wrapper">
                              <img
                                src={video.thumbnail}
                                alt={video.title}
                                className="jukebox-image"
                              />
                              <div className="jukebox-play-overlay">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="white">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </div>
                            </div>
                          )}
                          <div className="jukebox-card-info">
                            <div className="jukebox-title">{video.title}</div>
                            {video.channel && (
                              <div className="jukebox-artist">{video.channel}</div>
                            )}
                            {video.duration && (
                              <div className="jukebox-duration">{video.duration}</div>
                            )}
                          </div>
                        </div>
                        <div className="jukebox-card-shadow"></div>
                      </div>
                    ))}
                  </div>
                </div>
                {isArtistSearch && hasMore && (
                  <div className="load-more-container">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="load-more-button"
                    >
                      {loadingMore ? 'Loading...' : 'Load More Songs'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="home-logo-container">
                <img
                  src="/iconlogo.png"
                  alt="SingFi Logo"
                  className="home-logo-image"
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

