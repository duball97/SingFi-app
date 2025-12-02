import { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';

export default function Player({ videoId, onTimeUpdate, onReady }) {
  const [player, setPlayer] = useState(null);
  const intervalRef = useRef(null);

  const opts = {
    height: '390',
    width: '100%',
    playerVars: {
      autoplay: 0,
      controls: 1,
    },
  };

  const handleReady = (event) => {
    setPlayer(event.target);
    if (onReady) onReady(event.target);
    
    // Poll for current time every 100ms
    intervalRef.current = setInterval(() => {
      if (event.target && event.target.getCurrentTime) {
        const currentTime = event.target.getCurrentTime();
        if (onTimeUpdate) onTimeUpdate(currentTime);
      }
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (!videoId) {
    return <div>Select a song to play</div>;
  }

  return (
    <div className="player-container">
      <YouTube
        videoId={videoId}
        opts={opts}
        onReady={handleReady}
      />
    </div>
  );
}

