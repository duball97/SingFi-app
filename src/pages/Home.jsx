import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
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

  const startSession = async (videoId, title, artist, coverUrl) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
            genre: 'pop',
            language: 'english'
          })
          .select()
          .single();
        songId = newSong.id;
      }

      const { data: gameSession, error } = await supabase
        .from('game_sessions')
        .insert({
          user_id: session.user.id,
          song_id: songId,
          score: 0,
          status: 'started'
        })
        .select()
        .single();

      if (error) throw error;
      navigate(`/game/${gameSession.id}`);
    } catch (error) {
      console.error('Error starting session:', error);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-x-hidden">
      {/* Background Gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/20 via-black to-black -z-10" />

      {/* Main Container */}
      <main className="max-w-[1600px] mx-auto px-8 lg:px-16 py-12 lg:py-20 flex flex-col gap-24">

        {/* Top Grid Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left Column: Hero Text + Search Bar */}
          <div className="flex flex-col gap-8 text-center lg:text-left" style={{ paddingLeft: '120px' }}>
            <div className="space-y-6">
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight uppercase leading-[1.1] pb-2"
                style={{
                  background: 'linear-gradient(180deg, #FFD84A 15%, #FF9A1F 40%, #FF4A00 70%, #E60000 90%)',
                  backgroundSize: '100% 50%', // Repeats effectively for each line (assuming ~2 lines)
                  backgroundRepeat: 'repeat-y',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  color: 'transparent'
                }}
              >
                Sing Any Song.<br />Any Time.
              </h1>
              <p className="text-lg md:text-xl font-bold text-white/90 uppercase tracking-wide">
                Play solo, online or with friends
              </p>

            </div>

            {/* Search Box - Now in Left Column */}
            <div className="relative group max-w-lg mx-auto lg:mx-0 w-full z-20">
              {/* Subtle outer glow that isn't muddy */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full opacity-20 blur-md group-hover:opacity-40 transition duration-500" />

              <div className="relative flex items-center bg-black/40 backdrop-blur-xl border border-white/10 rounded-full p-1 transition-all duration-300 focus-within:border-orange-500/50 focus-within:bg-black/60 focus-within:shadow-[0_0_30px_-5px_rgba(249,115,22,0.3)]">
                <span className="pl-5 text-white/40">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </span>
                <input
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-white px-6 py-2 placeholder-white/40 text-base font-medium"
                  placeholder="Search artist or song..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="text-black rounded-full px-6 py-1.5 font-bold uppercase transition-all transform hover:scale-105 shadow-md shadow-orange-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm h-full"
                  style={{
                    background: 'linear-gradient(0deg, #FFD84A 0%, #FF9A1F 30%, #FF4A00 70%, #E60000 100%)'
                  }}
                >
                  {searching ? (
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    'Search'
                  )}
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
                <h3 className="font-bold text-xl text-orange-500 flex items-center gap-2">
                  <span>🎵</span> Search Results
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
              <div className="hidden lg:flex justify-center items-center h-full opacity-20">
                <div className="text-9xl filter blur-sm">🎤</div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Start Playing */}
        <div className="flex flex-col items-center text-center space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <h3 className="text-5xl md:text-6xl font-black uppercase tracking-tight">
            Start Playing
          </h3>

          {/* Cards Row - Centered Single Row */}
          <div className="flex flex-wrap gap-6 justify-center max-w-4xl mx-auto">
            {suggestedSongs.map(song => (
              <div
                key={song.id}
                onClick={() => startSession(song.youtube_id, song.title, song.artist, song.cover_url)}
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
