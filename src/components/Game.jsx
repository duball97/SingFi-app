import { useState, useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';
import Lyrics from './Lyrics';
import PitchBars from './PitchBars';

export default function Game({ videoId, segments, lyrics, notes, onBack }) {
  const [player, setPlayer] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [userPitch, setUserPitch] = useState(null);
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameState, setGameState] = useState('loading'); // 'loading', 'countdown', 'playing', 'paused', 'ended', 'buffering'
  const [countdown, setCountdown] = useState(3);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferRetryCount, setBufferRetryCount] = useState(0);
  
  // Custom timer refs
  const playbackStartTimeRef = useRef(null);
  const pauseOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);
  const animationFrameRef = useRef(null);
  const playerReadyRef = useRef(false);
  
  // Audio refs for pitch detection
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const micAnimationRef = useRef(null);
  const streamRef = useRef(null);

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 0, // Don't autoplay - we'll control this
      controls: 0,
      modestbranding: 1,
      rel: 0,
      showinfo: 0,
      iv_load_policy: 3,
      // Improve buffering for slow connections
      enablejsapi: 1,
      playsinline: 1,
      // Use lower quality for better buffering (YouTube will auto-select best available)
      // Note: YouTube doesn't allow forcing quality via API, but we can optimize settings
    },
  };

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start microphone
  const startMicrophone = useCallback(async () => {
    try {
      // Clean up any existing microphone connection first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close().catch(() => {});
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      setIsMicActive(true);
      console.log('🎤 Microphone connected');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setIsMicActive(false);
      // Don't throw - just log the error
    }
  }, []);

  // Stop microphone
  const stopMicrophone = useCallback(() => {
    try {
      if (micAnimationRef.current) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(err => {
          console.warn('Error closing audio context:', err);
        });
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      dataArrayRef.current = null;
      setIsMicActive(false);
      setUserPitch(null);
      console.log('🎤 Microphone disconnected');
    } catch (error) {
      console.error('Error stopping microphone:', error);
      setIsMicActive(false);
      setUserPitch(null);
    }
  }, []);

  // Pitch detection loop
  const detectPitch = useCallback(() => {
    try {
      if (!analyserRef.current || !dataArrayRef.current || !isPlayingRef.current || !audioContextRef.current) {
        return;
      }

      // Check if audio context is still active
      if (audioContextRef.current.state === 'closed') {
        return;
      }

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);

      const sampleRate = audioContextRef.current.sampleRate;
      const bufferLength = analyserRef.current.fftSize;
      const data = new Float32Array(bufferLength);
      analyserRef.current.getFloatTimeDomainData(data);

      let maxCorrelation = 0;
      let maxPeriod = 0;

      for (let period = 20; period < bufferLength / 2; period++) {
        let correlation = 0;
        for (let i = 0; i < bufferLength - period; i++) {
          correlation += Math.abs(data[i] * data[i + period]);
        }
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          maxPeriod = period;
        }
      }

      if (maxPeriod > 0) {
        const frequency = sampleRate / maxPeriod;
        if (frequency > 80 && frequency < 2000) {
          setUserPitch(frequency);
          setScore(prev => prev + 0.1);
        }
      }

      if (isPlayingRef.current && isMicActive && audioContextRef.current && audioContextRef.current.state !== 'closed') {
        micAnimationRef.current = requestAnimationFrame(detectPitch);
      }
    } catch (error) {
      console.error('Error in pitch detection:', error);
      // Stop detection on error
      if (micAnimationRef.current) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
    }
  }, [isMicActive]);

  // Start pitch detection when playing
  useEffect(() => {
    if (isPlaying && isMicActive && analyserRef.current && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      // Cancel any existing animation frame
      if (micAnimationRef.current) {
        cancelAnimationFrame(micAnimationRef.current);
      }
      detectPitch();
    } else {
      // Stop detection if conditions aren't met
      if (micAnimationRef.current) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
    }
    return () => {
      if (micAnimationRef.current) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
    };
  }, [isPlaying, isMicActive, detectPitch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [stopMicrophone]);

  const handleReady = (event) => {
    const playerInstance = event.target;
    setPlayer(playerInstance);
    playerReadyRef.current = true;
    
    try {
      const videoDuration = playerInstance.getDuration();
      if (videoDuration) {
        setDuration(videoDuration);
      }
      console.log('▶️ Video ready, duration:', videoDuration);
      
      // Start countdown
      setGameState('countdown');
    } catch (error) {
      console.error('Error getting video duration:', error);
      setGameState('countdown');
    }
  };

  // Countdown logic
  useEffect(() => {
    if (gameState !== 'countdown') return;
    
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown finished - start the game!
      setGameState('playing');
      startMicrophone();
      
      // Wait for player to be fully ready, then play
      const tryPlay = () => {
        if (playerReadyRef.current && player && typeof player.playVideo === 'function') {
          try {
            // Check if player is actually ready by checking internal state
            const playerState = player.getPlayerState ? player.getPlayerState() : null;
            player.playVideo();
            console.log('▶️ Playing video, player state:', playerState);
          } catch (error) {
            console.error('Error playing video:', error);
            // Retry after a short delay
            setTimeout(tryPlay, 500);
          }
        } else {
          // Player not ready yet, retry
          setTimeout(tryPlay, 100);
        }
      };
      
      tryPlay();
    }
  }, [gameState, countdown, player, startMicrophone]);

  const handleStateChange = (event) => {
    const state = event.data;
    const playerInstance = event.target;

    if (state === 1) { // PLAYING
      isPlayingRef.current = true;
      setIsPlaying(true);
      setIsBuffering(false);
      setBufferRetryCount(0);
      if (gameState === 'playing' || gameState === 'paused' || gameState === 'buffering') {
        setGameState('playing');
      }
      
      try {
        const ytTime = playerInstance.getCurrentTime();
        const videoDuration = playerInstance.getDuration();
        if (videoDuration) setDuration(videoDuration);
        
        if (typeof ytTime === 'number' && !isNaN(ytTime) && ytTime >= 0) {
          playbackStartTimeRef.current = performance.now() - (ytTime * 1000);
          pauseOffsetRef.current = 0;
        } else {
          playbackStartTimeRef.current = performance.now();
          pauseOffsetRef.current = 0;
        }
      } catch (error) {
        playbackStartTimeRef.current = performance.now();
        pauseOffsetRef.current = 0;
      }
    }

    if (state === 2) { // PAUSED
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      setGameState('paused');
      if (playbackStartTimeRef.current !== null) {
        pauseOffsetRef.current = performance.now() - playbackStartTimeRef.current;
      }
    }

    if (state === 3) { // BUFFERING
      if (gameState === 'playing') {
        setIsBuffering(true);
        setGameState('buffering');
        console.log('⏳ Video buffering...');
      }
    }

    if (state === 0) { // ENDED
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      setGameState('ended');
    }

    if (state === -1) { // UNSTARTED
      console.log('⏸️ Video unstarted');
    }

    if (state === 5) { // CUED
      console.log('✅ Video cued and ready');
    }
  };

  const handleError = (event) => {
    const errorCode = event.data;
    console.error('❌ YouTube player error:', errorCode);
    
    // Error codes: https://developers.google.com/youtube/iframe_api_reference#Events
    // 2 = Invalid parameter value
    // 5 = HTML5 player error
    // 100 = Video not found
    // 101/150 = Video not allowed to be played in embedded players
    
    if (errorCode === 5 || errorCode === 100 || errorCode === 101 || errorCode === 150) {
      // Network or playback errors - try to recover
      console.log('🔄 Attempting to recover from error...');
      setGameState('loading');
      
      // Reload the video after a delay
      setTimeout(() => {
        if (player && player.loadVideoById) {
          try {
            player.loadVideoById(videoId);
          } catch (err) {
            console.error('Failed to reload video:', err);
          }
        }
      }, 2000);
    }
  };

  // Custom high-precision timer with periodic re-sync to YouTube player
  useEffect(() => {
    let lastSyncTime = 0;
    const syncInterval = 2000; // Re-sync with YouTube every 2 seconds
    
    const tick = () => {
      if (isPlayingRef.current && playbackStartTimeRef.current !== null) {
        const now = performance.now();
        
        // Periodically re-sync with YouTube player to prevent drift
        if (player && now - lastSyncTime > syncInterval) {
          try {
            const ytTime = player.getCurrentTime();
            if (typeof ytTime === 'number' && !isNaN(ytTime) && ytTime >= 0) {
              // Calculate expected time from our timer
              const expectedTime = (now - playbackStartTimeRef.current) / 1000;
              const drift = Math.abs(expectedTime - ytTime);
              
              // If drift is more than 0.3 seconds, re-sync
              if (drift > 0.3) {
                console.log(`⏱️ [SYNC] Drift detected: ${drift.toFixed(2)}s. Re-syncing to YouTube time.`);
                playbackStartTimeRef.current = now - (ytTime * 1000);
              }
            }
          } catch (e) {
            // Ignore errors during sync
          }
          lastSyncTime = now;
        }
        
        const elapsed = (now - playbackStartTimeRef.current) / 1000;
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
  }, [player]);

  const handlePlayPause = () => {
    if (!player) return;
    
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const toggleMicrophone = () => {
    if (isMicActive) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  };

  const handlePauseResume = () => {
    if (!player) return;
    
    if (isPlaying) {
      // Pause video and microphone
      player.pauseVideo();
      stopMicrophone();
    } else {
      // Resume video and microphone
      player.playVideo();
      startMicrophone();
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
          onError={handleError}
          className="game-youtube-player"
        />
      </div>

      {/* Countdown Overlay */}
      {gameState === 'countdown' && (
        <div className="countdown-overlay">
          <div className="countdown-number">
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <div className="countdown-text">Get Ready!</div>
        </div>
      )}

      {/* Loading Overlay */}
      {gameState === 'loading' && (
        <div className="countdown-overlay">
          <div className="loading-spinner"></div>
          <div className="countdown-text">Loading video...</div>
        </div>
      )}

      {/* Game Over Overlay */}
      {gameState === 'ended' && (
        <div className="countdown-overlay game-over">
          <div className="game-over-content">
            <div className="game-over-title">🎤 Great Performance!</div>
            <div className="final-score">
              <span className="final-score-label">Final Score</span>
              <span className="final-score-value">{Math.floor(score)}</span>
            </div>
            <button onClick={onBack} className="play-again-button">
              ← Back to Songs
            </button>
          </div>
        </div>
      )}

      {/* Game Content Overlay */}
      <div className="game-content">
        {/* Top Bar - Time (left), Back (center) */}
        <div className="game-top-bar">
          <div className="game-time-display">
            <span className="time-current">{formatTime(currentTime)}</span>
            <span className="time-separator">/</span>
            <span className="time-total">{formatTime(duration)}</span>
          </div>
          
          <button onClick={onBack} className="back-button">
            ← Back
          </button>
        </div>

        {/* Score - Top Left */}
        <div className="game-score-top-left">
          <span className="score-label">SCORE</span>
          <span className="score-value">{Math.floor(score)}</span>
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
        </div>

        {/* Top Controls - Top Right */}
        <div className="game-top-controls">
          {/* Play/Pause Button */}
          <button 
            onClick={handlePlayPause}
            className={`control-button ${isPlaying ? 'playing' : 'paused'}`}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Microphone Button */}
          <button 
            onClick={toggleMicrophone}
            className={`control-button mic-button ${isMicActive ? 'active' : ''}`}
            aria-label={isMicActive ? 'Mute Microphone' : 'Enable Microphone'}
          >
            {isMicActive ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            )}
          </button>

          {/* Pitch Display */}
          {isMicActive && userPitch && (
            <div className="pitch-indicator">
              {Math.round(userPitch)} Hz
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
