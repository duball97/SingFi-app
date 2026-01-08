import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    fetchSuggestedSongs();
  }, []);

  const fetchSuggestedSongs = async () => {
    try {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .order('views', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSuggestedSongs(data || []);
    } catch (error) {
      console.error('Error fetching suggested songs:', error);
    } finally {
      setLoadingSuggested(false);
    }
  };

  const performSearch = async (query, page = 1) => {
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
        setSearchResults(data);
      } else {
        setSearchResults(prev => [...prev, ...data]);
      }

      // Update pagination state if API returns it, otherwise guess
      setHasMore(data.length > 0);
      setCurrentPage(page);

    } catch (error) {
      console.error('Search error:', error);
      // Optional: show error to user
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  };

  const handleSearchSubmit = () => {
    performSearch(searchQuery, 1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const startSession = async (videoId, title, artist, coverUrl) => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (!session) {
        navigate('/login');
        return;
      }

      // Check if song exists in DB, if not add it
      const { data: songData } = await supabase
        .from('songs')
        .select('id')
        .eq('youtube_id', videoId)
        .single();

      let songId = songData?.id;

      if (!songId) {
        const { data: newSong } = await supabase
          .from('songs')
          .insert({
            title: title,
            artist: artist,
            youtube_id: videoId,
            cover_url: coverUrl,
            genre: 'pop', // Default
            language: 'english' // Default
          })
          .select()
          .single();
        songId = newSong.id;
      }

      // Create game session
      const { data: gameSession, error: sessionError } = await supabase
        .from('game_sessions')
        .insert({
          user_id: session.user.id,
          song_id: songId,
          score: 0,
          status: 'started'
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      navigate(`/game/${gameSession.id}`);
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-brand-orange selection:text-white overflow-x-hidden">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-orange/20 via-black to-black -z-10 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-brand-gray/40 via-black to-black -z-10 pointer-events-none" />



      <main className="max-w-[1600px] mx-auto px-12 py-12 lg:py-20 flex flex-col gap-24">
        {/* Top Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">

          {/* Left Column: Hero Content */}
          <div className="flex flex-col justify-center space-y-8 text-center lg:text-left">
            <div className="space-y-4">
              <h2 className="text-6xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] text-transparent bg-clip-text bg-gradient-to-br from-brand-orange via-orange-400 to-yellow-400 uppercase drop-shadow-sm">
                SING ANY SONG.<br />ANY TIME.
              </h2>
              <p className="text-xl md:text-2xl font-bold tracking-tight text-white/90 uppercase">
                Play Locally. Play Online. Play Solo.
              </p>
              <p className="text-lg text-white/60 font-medium max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                SingFi is an online singing game. Challenge your friends for a singing battle and master your vocals.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full max-w-xl mx-auto lg:mx-0 group">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-orange to-yellow-400 rounded-full opacity-30 group-hover:opacity-70 blur transition duration-500" />
              <div className="relative flex items-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-full p-2">
                <input
                  type="text"
                  placeholder="Search for a song or artist..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-transparent border-none text-lg text-white placeholder-white/40 px-6 py-3 focus:outline-none focus:ring-0"
                />
                <button
                  onClick={handleSearchSubmit}
                  disabled={searching}
                  className="bg-brand-orange hover:bg-orange-600 text-white px-8 py-3 rounded-full font-bold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {searching ? (
                    <span className="animate-pulse">Searching...</span>
                  ) : (
                    'Search'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Search Results */}
          <div className="relative w-full lg:sticky lg:top-24">
            {searching && (
              <div className="flex justify-center items-center py-20">
                <div className="w-12 h-12 border-4 border-brand-orange border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="animate-fade-in space-y-6">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <span className="text-brand-orange">🎵</span>
                  Search Results
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {searchResults.map((video) => (
                    <div
                      key={video.id}
                      onClick={() => startSession(video.id, video.title, video.channel, video.thumbnail)}
                      className="group relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-brand-orange/30 rounded-2xl p-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 block"
                    >
                      <div className="aspect-video rounded-xl overflow-hidden mb-4 relative shadow-lg group-hover:shadow-brand-orange/20">
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover transform group-hover:scale-110 transition duration-500" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="w-12 h-12 bg-brand-orange rounded-full flex items-center justify-center text-white text-xl shadow-xl transform scale-75 group-hover:scale-100 transition duration-300">▶</span>
                        </div>
                      </div>
                      <h4 className="font-bold text-lg line-clamp-1 group-hover:text-brand-orange transition-colors">{video.title}</h4>
                      <p className="text-white/50 text-sm font-medium">{video.channel}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logo / Decoration when not searching */}
            {!searching && searchResults.length === 0 && (
              <div className="hidden lg:flex justify-center items-center p-12">
                <div className="relative w-full max-w-md aspect-square rounded-full bg-gradient-to-tr from-brand-orange/10 to-transparent flex items-center justify-center animate-pulse-slow">
                  <div className="absolute inset-0 border border-white/5 rounded-full" />
                  <div className="absolute inset-12 border border-white/5 rounded-full" />
                  <div className="text-9xl opacity-20 filter blur-sm">🎤</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Suggested Songs */}
        {!searching && searchResults.length === 0 && (
          <div className="w-full space-y-8 animate-fade-in-up">
            <h3 className="text-3xl font-black uppercase tracking-tight flex items-center gap-3">
              <span className="text-brand-orange animate-bounce">🔥</span>
              Trending to Sing
            </h3>

            {loadingSuggested ? (
              <div className="flex justify-center py-20">
                <div className="w-10 h-10 border-4 border-white/20 border-t-brand-orange rounded-full animate-spin" />
              </div>
            ) : suggestedSongs.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-12 text-center">
                <p className="text-white/50 text-xl font-medium">No trending songs found. Be the first to sing!</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto pb-8 -mx-6 px-6 scrollbar-hide">
                <div className="flex gap-6 min-w-max">
                  {suggestedSongs.map((song) => (
                    <div
                      key={song.id}
                      onClick={() => startSession(song.youtube_id, song.title, song.artist, song.cover_url)}
                      className="group w-[280px] h-[380px] relative bg-white/5 hover:bg-white/10 border border-white/5 rounded-3xl p-5 cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-brand-orange/10 flex flex-col"
                    >
                      <div className="w-full aspect-square rounded-2xl overflow-hidden mb-5 relative shadow-lg">
                        <img
                          src={song.cover_url || `https://img.youtube.com/vi/${song.youtube_id}/maxresdefault.jpg`}
                          alt={song.title}
                          className="w-full h-full object-cover transform group-hover:scale-110 transition duration-700"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                          <span className="bg-white/20 backdrop-blur-md text-white px-6 py-2 rounded-full font-bold border border-white/20">Sing Now</span>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col justify-end">
                        <h4 className="text-xl font-bold leading-tight mb-1 line-clamp-2 group-hover:text-brand-orange transition-colors">{song.title}</h4>
                        <p className="text-white/60 font-medium text-sm">{song.artist}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center pt-8">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white/40 text-sm font-medium">
                💡 Tip: Connect a microphone for accurate pitch detection
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
