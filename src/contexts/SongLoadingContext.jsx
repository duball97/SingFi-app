import { createContext, useContext, useState, useEffect, useRef } from 'react';

const SongLoadingContext = createContext();

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export function SongLoadingProvider({ children }) {
  const [loadingSongs, setLoadingSongs] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('singfi_loading_songs');
    return saved ? JSON.parse(saved) : {};
  });

  const pollingIntervalRef = useRef(null);

  // Save to localStorage whenever loadingSongs changes
  useEffect(() => {
    localStorage.setItem('singfi_loading_songs', JSON.stringify(loadingSongs));
  }, [loadingSongs]);

  // Poll for completed songs
  useEffect(() => {
    // Check if there are any songs with status 'loading'
    const hasLoadingSongs = Object.values(loadingSongs).some(
      song => song.status === 'loading'
    );

    if (!hasLoadingSongs) {
      // No loading songs, clear interval if it exists
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const checkCompletedSongs = async () => {
      setLoadingSongs(prev => {
        const loadingIds = Object.keys(prev).filter(
          id => prev[id].status === 'loading'
        );

        // Check each loading song
        loadingIds.forEach(async (youtubeId) => {
          try {
            const response = await fetch(`${API_BASE_URL}/getSong?youtubeId=${youtubeId}`);
            const data = await response.json();
            
            if (data.cached) {
              setLoadingSongs(prevState => {
                if (!prevState[youtubeId] || prevState[youtubeId].status === 'completed') {
                  return prevState;
                }
                return {
                  ...prevState,
                  [youtubeId]: {
                    ...prevState[youtubeId],
                    status: 'completed'
                  }
                };
              });
            }
          } catch (error) {
            console.error(`Error checking song ${youtubeId}:`, error);
          }
        });

        return prev;
      });
    };

    // Clear existing interval before starting a new one
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Start polling every 5 seconds
    pollingIntervalRef.current = setInterval(checkCompletedSongs, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [loadingSongs]); // Restart polling when loadingSongs changes

  const addLoadingSong = (youtubeId, title, artist) => {
    setLoadingSongs(prev => {
      // Don't add if already exists
      if (prev[youtubeId]) {
        return prev;
      }
      return {
        ...prev,
        [youtubeId]: {
          title,
          artist,
          status: 'loading', // 'loading' or 'completed'
          startTime: Date.now()
        }
      };
    });
  };

  const updateSongStatus = (youtubeId, status) => {
    setLoadingSongs(prev => {
      if (!prev[youtubeId]) return prev;
      return {
        ...prev,
        [youtubeId]: {
          ...prev[youtubeId],
          status
        }
      };
    });
  };

  const removeLoadingSong = (youtubeId) => {
    setLoadingSongs(prev => {
      const newState = { ...prev };
      delete newState[youtubeId];
      return newState;
    });
  };

  return (
    <SongLoadingContext.Provider value={{
      loadingSongs,
      addLoadingSong,
      updateSongStatus,
      removeLoadingSong
    }}>
      {children}
    </SongLoadingContext.Provider>
  );
}

export function useSongLoading() {
  const context = useContext(SongLoadingContext);
  if (!context) {
    throw new Error('useSongLoading must be used within SongLoadingProvider');
  }
  return context;
}

