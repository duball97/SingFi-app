import { useState, useEffect, useRef } from 'react';
import YouTube from 'react-youtube';
import Lyrics from './Lyrics';
import PitchDetector from './PitchDetector';
import Score from './Score';
import PitchBars from './PitchBars';

export default function Game({ videoId, segments, lyrics, notes, onBack }) {
  const [player, setPlayer] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [userPitch, setUserPitch] = useState(null);
  const [score, setScore] = useState(0);
  
  // Custom timer refs
  const playbackStartTimeRef = useRef(null);
  const pauseOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);
  const animationFrameRef = useRef(null);

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
    
    // Ensure video starts playing (autoplay might be blocked)
    try {
      playerInstance.playVideo();
      console.log('▶️ Video ready, attempting to play...');
    } catch (error) {
      console.error('Error starting video:', error);
    }
  };

  const handleStateChange = (event) => {
    const state = event.data;
    const playerInstance = event.target;

    console.log(`📺 YouTube state changed: ${state} (1=playing, 2=paused, 3=buffering, 0=ended, -1=unstarted)`);

    if (state === -1) { // UNSTARTED
      // Video hasn't started, try to play it
      try {
        playerInstance.playVideo();
        console.log('▶️ Attempting to start unstarted video...');
      } catch (error) {
        console.error('Error playing unstarted video:', error);
      }
    }

    if (state === 1) { // PLAYING
      isPlayingRef.current = true;
      
      try {
        // Sync timer with YouTube's actual time on play
        const ytTime = playerInstance.getCurrentTime();
        if (typeof ytTime === 'number' && !isNaN(ytTime) && ytTime >= 0) {
          // Reset timer based on YouTube's current position
          playbackStartTimeRef.current = performance.now() - (ytTime * 1000);
          pauseOffsetRef.current = 0;
          console.log(`▶️ PLAY: Synced timer to YouTube time ${ytTime.toFixed(2)}s`);
        } else {
          // If YouTube time is invalid, start from 0
          playbackStartTimeRef.current = performance.now();
          pauseOffsetRef.current = 0;
          console.log(`▶️ PLAY: Started timer from 0`);
        }
      } catch (error) {
        console.error('Error syncing timer:', error);
        // Fallback: start timer from now
        playbackStartTimeRef.current = performance.now();
        pauseOffsetRef.current = 0;
      }
    }

    if (state === 2) { // PAUSED
      isPlayingRef.current = false;
      if (playbackStartTimeRef.current !== null) {
        pauseOffsetRef.current = performance.now() - playbackStartTimeRef.current;
        console.log(`⏸️ PAUSE: Timer paused at ${(pauseOffsetRef.current / 1000).toFixed(2)}s`);
      }
    }

    if (state === 0) { // ENDED
      isPlayingRef.current = false;
      console.log(`⏹️ ENDED: Video finished`);
    }

    if (state === 3) { // BUFFERING
      // Don't update timer during buffering
      return;
    }
  };

  // Custom high-precision timer using requestAnimationFrame
  useEffect(() => {
    const tick = () => {
      if (isPlayingRef.current && playbackStartTimeRef.current !== null) {
        const now = performance.now();
        const elapsed = (now - playbackStartTimeRef.current) / 1000; // convert to seconds
        setCurrentTime(elapsed);
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
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
          onStateChange={handleStateChange}
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

        {/* Pitch Bars in Center */}
        <div className="game-pitch-bars-container">
          <PitchBars 
            segments={segments} 
            currentTime={currentTime} 
            userPitch={userPitch}
            notes={notes}
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

