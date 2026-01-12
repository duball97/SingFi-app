import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import './Home.css';
// import './Home.css'; // Intentionally commented out to avoid conflicts

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [suggestedSongs, setSuggestedSongs] = useState([]);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSuggestedSongs();
  }, []);

  const fetchSuggestedSongs = async () => {
    try {
      // Use the backend API route as requested
      const response = await fetch(`${API_BASE_URL}/songs`);
      if (!response.ok) throw new Error('Failed to fetch songs');

      const data = await response.json();

      // The API returns { songs: [...] } and maps fields differently
      if (data && data.songs && data.songs.length > 0) {
        const formattedSongs = data.songs.map(song => ({
          id: song.id, // unique id
          title: song.title,
          artist: song.channel, // API returns 'channel', we use 'artist'
          cover_url: song.thumbnail, // API returns 'thumbnail', we use 'cover_url'
          youtube_id: song.id // API 'id' is the youtube_id
        }));
        setSuggestedSongs(formattedSongs);
      } else {
        // Fallback data if API returns empty
        setSuggestedSongs([
          { id: 'fb1', title: 'Bohemian Rhapsody', artist: 'Queen', cover_url: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/maxresdefault.jpg', youtube_id: 'fJ9rUzIMcZQ' },
          { id: 'fb2', title: 'Shape of You', artist: 'Ed Sheeran', cover_url: 'https://i.ytimg.com/vi/JGwWNGJdvx8/maxresdefault.jpg', youtube_id: 'JGwWNGJdvx8' },
          { id: 'fb3', title: 'Rolling in the Deep', artist: 'Adele', cover_url: 'https://i.ytimg.com/vi/rYEDA3JcQqw/maxresdefault.jpg', youtube_id: 'rYEDA3JcQqw' },
          { id: 'fb4', title: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', cover_url: 'https://i.ytimg.com/vi/OPf0YbXqDm0/maxresdefault.jpg', youtube_id: 'OPf0YbXqDm0' },
          { id: 'fb5', title: 'Billie Jean', artist: 'Michael Jackson', cover_url: 'https://i.ytimg.com/vi/Zi_XLOBDo_Y/maxresdefault.jpg', youtube_id: 'Zi_XLOBDo_Y' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching suggested songs:', error);
    } finally {
      setLoadingSuggested(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      // Handle different API response structures
      let results = [];
      if (Array.isArray(data)) {
        results = data;
      } else if (data && Array.isArray(data.videos)) {
        results = data.videos;
      } else if (data && Array.isArray(data.results)) {
        results = data.results;
      }

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const startSession = async (videoId, title, artist, coverUrl, isFromDatabase = false) => {
    console.log('Starting session with:', { videoId, title, artist, coverUrl, isFromDatabase });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('No session, redirecting to login');
        navigate('/login');
        return;
      }

      // If song is from database (suggested songs), go directly to game
      if (isFromDatabase) {
        console.log('Song is from database, going directly to game');
        navigate(`/game?video=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}`);
        return;
      }

      // For search results, check if the song exists in the database
      const response = await fetch(`${API_BASE_URL}/getSong?youtubeId=${videoId}`);

      if (response.ok) {
        const songData = await response.json();
        // Song exists in database - go directly to game
        if (songData && songData.song) {
          console.log('Song found in database, going to game');
          navigate(`/game?video=${videoId}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || '')}`);
          return;
        }
      }

      // Song not in database - go to loading page to process it
      console.log('Song not in database, going to loading page');
      const titleEncoded = encodeURIComponent(title || 'Unknown');
      const artistEncoded = encodeURIComponent(artist || 'Unknown');
      navigate(`/loading-song/${artistEncoded}/${titleEncoded}?id=${videoId}`);

    } catch (error) {
      console.error('Error starting session:', error);
      // On error, try loading page anyway
      const titleEncoded = encodeURIComponent(title || 'Unknown');
      const artistEncoded = encodeURIComponent(artist || 'Unknown');
      navigate(`/loading-song/${artistEncoded}/${titleEncoded}?id=${videoId}`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/20 via-black to-black -z-10" />

      {/* Main Container */}
      <main className="max-w-[1600px] mx-auto px-8 lg:px-16 py-12 lg:py-20 flex flex-col gap-24">

        {/* Top Grid Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left Column: Hero Text + Search Bar */}
          <div className="flex flex-col gap-6 text-left lg:pl-12 lg:pt-10">
            <div className="space-y-2">
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1]"
              >
                <span className="block whitespace-nowrap hero-gradient-text">SING ANY SONG</span>
                <span className="block whitespace-nowrap hero-gradient-text">ANYTIME ANYWHERE</span>
              </h1>
              <p className="text-lg md:text-xl font-bold text-white/90 tracking-wide">
                Play solo, online & with friends
              </p>

            </div>

            {/* Search Box - Premium Ultra Design */}
            <div className="max-w-sm w-full group">
              <div className="flex items-center gap-3 bg-white/[0.07] backdrop-blur-3xl border border-white/10 rounded-full px-5 py-2 transition-all duration-500 group-focus-within:bg-white/[0.12] group-focus-within:border-orange-500/40 group-focus-within:ring-[8px] group-focus-within:ring-orange-500/[0.05] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] hover:border-white/25">
                <input
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder-white/20 text-sm font-semibold tracking-tight"
                  placeholder="Search artist or song..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  className="search-icon-button"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <defs>
                      <linearGradient id="searchGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="15%" stopColor="#FFD84A" />
                        <stop offset="40%" stopColor="#FF9A1F" />
                        <stop offset="70%" stopColor="#FF4A00" />
                        <stop offset="90%" stopColor="#E60000" />
                      </linearGradient>
                    </defs>
                    <circle cx="11" cy="11" r="8" stroke="url(#searchGradient)"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="url(#searchGradient)"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Search Results */}
          <div className="w-full max-w-xl mx-auto lg:mx-0 space-y-8 min-h-[400px]">
            {searching ? (
              <div className="flex justify-center p-12">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h3 className="font-bold text-xl text-orange-500">
                  Search Results
                </h3>
                <div className="grid gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {searchResults.map(video => (
                    <div key={video.id} onClick={() => startSession(video.id, video.title, video.channel, video.thumbnail)} className="group flex gap-4 p-4 bg-white/5 border border-white/5 hover:border-orange-500/50 rounded-xl cursor-pointer transition-all hover:translate-x-1 hover:bg-white/10">
                      <div className="w-32 aspect-video rounded-lg overflow-hidden relative shadow-lg">
                        <img src={video.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                          <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col justify-center">
                        <h4 className="font-bold text-lg line-clamp-1 group-hover:text-orange-500 transition">{video.title}</h4>
                        <p className="text-sm text-white/50">{video.channel}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Decorative placeholder when not searching */
              /* Decorative placeholder when not searching */
              <div className="hidden lg:flex justify-center items-center h-full opacity-0">
                {/* Removed mic emoji as requested */}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Start Playing */}
        <div className="flex flex-col space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <h3 className="text-5xl md:text-6xl font-black uppercase tracking-tight text-center">
            START PLAYING
          </h3>

          {/* Cards Row - Centered 4 Columns */}
          <div className="flex flex-wrap gap-10 justify-center">
            {suggestedSongs.slice(0, 4).map(song => (
              <div
                key={song.id}
                onClick={() => startSession(song.youtube_id, song.title, song.artist, song.cover_url, true)}
                className="group w-[160px] bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-orange-500/10"
              >
                <div className="w-full aspect-square rounded-lg overflow-hidden mb-5 relative shadow-md">
                  <img src={song.cover_url} className="w-full h-full object-cover transform group-hover:scale-110 transition duration-500" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-orange-500 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    </span>
                  </div>
                </div>
                <h4 className="text-sm font-bold leading-tight line-clamp-3 group-hover:text-orange-500 transition-colors text-left">{song.title}</h4>
              </div>
            ))}
            {suggestedSongs.length === 0 && !loadingSuggested && (
              <div className="text-white/50 w-full text-center py-8">No songs found.</div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
