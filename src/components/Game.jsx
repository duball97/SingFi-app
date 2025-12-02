import { useState, useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import Lyrics from './Lyrics';
import PitchDetector from './PitchDetector';
import Score from './Score';

export default function Game({ videoId, segments, lyrics, onBack }) {
  const [player, setPlayer] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [userPitch, setUserPitch] = useState(null);
  const [score, setScore] = useState(0);
  const intervalRef = useRef(null);

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      showinfo: 0,
      iv_load_policy: 3,
    },
  };

  const handleReady = (event) => {
    const playerInstance = event.target;
    setPlayer(playerInstance);
    
    // Poll for current time every 100ms
    const interval = setInterval(() => {
      try {
        if (playerInstance && typeof playerInstance.getCurrentTime === 'function') {
          const time = playerInstance.getCurrentTime();
          if (typeof time === 'number' && !isNaN(time)) {
            setCurrentTime(time);
          }
        }
      } catch (error) {
        console.error('Error getting current time:', error);
      }
    }, 100);
    
    intervalRef.current = interval;
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handlePitchDetected = (pitch) => {
    setUserPitch(pitch);
    if (pitch > 0) {
      setScore((prev) => prev + 0.1);
    }
  };

  return (
    <div className="game-page">
      {/* Video Background */}
      <div className="game-video-background">
        <div className="video-overlay"></div>
        <YouTube
          videoId={videoId}
          opts={opts}
          onReady={handleReady}
          className="game-youtube-player"
        />
      </div>

      {/* Game Content Overlay */}
      <div className="game-content">
        {/* Top Controls */}
        <div className="game-top-controls">
          <button onClick={onBack} className="back-button">
            ← Back
          </button>
          <Score
            score={score}
            targetPitch={null}
            userPitch={userPitch}
          />
        </div>

        {/* Lyrics at Bottom */}
        <div className="game-lyrics-container">
          <Lyrics segments={segments} currentTime={currentTime} />
          {/* Debug: Remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <div style={{ position: 'absolute', bottom: '10px', right: '10px', color: 'white', fontSize: '12px', opacity: 0.5 }}>
              Time: {currentTime.toFixed(2)}s
            </div>
          )}
        </div>

        {/* Pitch Detector */}
        <div className="game-pitch-detector">
          <PitchDetector onPitchDetected={handlePitchDetected} />
        </div>
      </div>
    </div>
  );
}

