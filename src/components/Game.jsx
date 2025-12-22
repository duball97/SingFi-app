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
  const [gameState, setGameState] = useState('loading'); // 'loading', 'countdown', 'playing', 'paused', 'ended'
  const [countdown, setCountdown] = useState(3);
  const [isMicActive, setIsMicActive] = useState(false);
  
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

      analyser.fftSize = 4096; // Larger FFT for better frequency resolution
      analyser.smoothingTimeConstant = 0.3; // Less smoothing for more responsive detection
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

  // VASTLY IMPROVED pitch detection - more sensitive and accurate
  const detectPitch = useCallback(() => {
    try {
      if (!analyserRef.current || !audioContextRef.current) {
        return;
      }

      if (audioContextRef.current.state === 'closed') {
        return;
      }

      const sampleRate = audioContextRef.current.sampleRate;
      const bufferLength = analyserRef.current.fftSize;
      const data = new Float32Array(bufferLength);
      analyserRef.current.getFloatTimeDomainData(data);

      // Calculate RMS (root mean square) for volume detection
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        sumSquares += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      
      // Much lower threshold - detect even quiet singing
      const volumeThreshold = 0.005; // Very sensitive
      
      if (rms < volumeThreshold) {
        // Too quiet - clear pitch but keep detecting
        setUserPitch(null);
        if (isPlayingRef.current && isMicActive) {
          micAnimationRef.current = requestAnimationFrame(detectPitch);
        }
        return;
      }

      // Normalize the signal for pitch detection
      let maxVal = 0;
      for (let i = 0; i < bufferLength; i++) {
        if (Math.abs(data[i]) > maxVal) maxVal = Math.abs(data[i]);
      }
      if (maxVal > 0) {
        for (let i = 0; i < bufferLength; i++) {
          data[i] = data[i] / maxVal;
        }
      }

      // YIN-inspired autocorrelation for better pitch detection
      // Human voice fundamental frequency range: 75Hz - 800Hz (most common singing range)
      const minPeriod = Math.floor(sampleRate / 800);  // Max 800Hz
      const maxPeriod = Math.floor(sampleRate / 75);   // Min 75Hz
      
      // Calculate difference function (similar to YIN algorithm)
      const windowSize = Math.min(bufferLength / 2, maxPeriod * 2);
      const diffFunction = new Float32Array(maxPeriod - minPeriod + 1);
      
      for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        let diff = 0;
        for (let i = 0; i < windowSize; i++) {
          const delta = data[i] - data[i + tau];
          diff += delta * delta;
        }
        diffFunction[tau - minPeriod] = diff;
      }
      
      // Cumulative mean normalized difference (CMND)
      const cmnd = new Float32Array(diffFunction.length);
      cmnd[0] = 1;
      let runningSum = diffFunction[0];
      
      for (let i = 1; i < diffFunction.length; i++) {
        runningSum += diffFunction[i];
        cmnd[i] = diffFunction[i] / (runningSum / (i + 1));
      }
      
      // Find the first dip below threshold (YIN-style)
      const yinThreshold = 0.15; // Slightly higher for noise tolerance
      let bestPeriod = -1;
      let bestValue = Infinity;
      
      for (let i = 1; i < cmnd.length - 1; i++) {
        // Look for local minimum that's below threshold
        if (cmnd[i] < yinThreshold && cmnd[i] < cmnd[i - 1] && cmnd[i] <= cmnd[i + 1]) {
          if (cmnd[i] < bestValue) {
            bestValue = cmnd[i];
            bestPeriod = i + minPeriod;
          }
          // Take first good match (fundamental, not harmonic)
          break;
        }
      }
      
      // Fallback: find global minimum if no threshold crossing
      if (bestPeriod < 0) {
        for (let i = 1; i < cmnd.length - 1; i++) {
          if (cmnd[i] < bestValue && cmnd[i] < cmnd[i - 1] && cmnd[i] <= cmnd[i + 1]) {
            bestValue = cmnd[i];
            bestPeriod = i + minPeriod;
          }
        }
      }
      
      // Only accept if we found a good period and CMND is reasonably low
      if (bestPeriod > 0 && bestValue < 0.5) {
        // Parabolic interpolation for sub-sample accuracy
        const idx = bestPeriod - minPeriod;
        if (idx > 0 && idx < cmnd.length - 1) {
          const alpha = cmnd[idx - 1];
          const beta = cmnd[idx];
          const gamma = cmnd[idx + 1];
          const peak = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
          bestPeriod = bestPeriod + peak;
        }
        
        const frequency = sampleRate / bestPeriod;
        
        // Validate frequency is in reasonable singing range
        if (frequency >= 75 && frequency <= 800) {
          setUserPitch(frequency);
          
          // Score based on volume (louder = more confident)
          const volumeScore = Math.min(1, rms * 10);
          setScore(prev => prev + (0.1 * volumeScore));
          
          // Occasional logging
          if (Math.random() < 0.02) {
            console.log(`🎤 Pitch: ${frequency.toFixed(1)}Hz (CMND: ${bestValue.toFixed(3)}, RMS: ${rms.toFixed(4)})`);
          }
        } else {
          setUserPitch(null);
        }
      } else {
        setUserPitch(null);
      }

      if (isPlayingRef.current && isMicActive && audioContextRef.current && audioContextRef.current.state !== 'closed') {
        micAnimationRef.current = requestAnimationFrame(detectPitch);
      }
    } catch (error) {
      console.error('Error in pitch detection:', error);
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
      if (gameState === 'playing' || gameState === 'paused') {
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
      setGameState('paused');
      if (playbackStartTimeRef.current !== null) {
        pauseOffsetRef.current = performance.now() - playbackStartTimeRef.current;
      }
    }

    if (state === 0) { // ENDED
      isPlayingRef.current = false;
      setIsPlaying(false);
      setGameState('ended');
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
        {/* Top Bar - Time (left), Back, Score (right) */}
        <div className="game-top-bar">
          <div className="game-time-display">
            <span className="time-current">{formatTime(currentTime)}</span>
            <span className="time-separator">/</span>
            <span className="time-total">{formatTime(duration)}</span>
          </div>
          
          <button onClick={onBack} className="back-button">
            ← Back
          </button>
          
          <div className="game-score-display">
            <span className="score-label">SCORE</span>
            <span className="score-value">{Math.floor(score)}</span>
          </div>
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
        
        {/* Pause/Resume Button - CENTERED, HUGE, IMPOSSIBLE TO MISS */}
        <button 
          onClick={handlePauseResume}
          className={`game-stop-button-center ${!isPlaying ? 'resume-state' : ''}`}
          aria-label={isPlaying ? 'Pause' : 'Resume'}
        >
          {isPlaying ? (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h12v12H6z"/>
              </svg>
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>RESUME</span>
            </>
          )}
        </button>

        {/* Bottom Controls - Centered */}
        <div className="game-bottom-controls">
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
