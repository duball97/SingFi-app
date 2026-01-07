import { useState, useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';
import Lyrics from './Lyrics';
import PitchBars from './PitchBars';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Game({ videoId, segments, lyrics, notes, firstVerseStartTime, user, onBack }) {
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

      // Request microphone with echo cancellation and noise suppression
      // These constraints help filter out PC audio and background noise
      const audioConstraints = {
        echoCancellation: true,      // Cancel echo from speakers (most important!)
        noiseSuppression: true,      // Suppress background noise
        autoGainControl: true,       // Auto-adjust microphone gain
        // Chrome-specific constraints (will be ignored by other browsers)
        ...(navigator.userAgent.includes('Chrome') && {
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googAutoGainControl: true,
          googHighpassFilter: true,    // Filter out low frequencies
          googTypingNoiseDetection: true,
        })
      };
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
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

  // Store currentTime in ref for pitch detection
  const currentTimeRef = useRef(0);
  const scoreAccumulatorRef = useRef(0);
  const lastScoreUpdateRef = useRef(Date.now()); // Initialize to current time for immediate first update
  
  // Update ref when currentTime changes
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Track game session data
  const gameStartTimeRef = useRef(null);
  const notesHitRef = useRef(0);
  const notesTotalRef = useRef(0);
  const sessionSavedRef = useRef(false);

  // Initialize notes tracking when notes change
  useEffect(() => {
    if (notes && Array.isArray(notes)) {
      // Reset tracking flags for all notes
      notes.forEach(note => {
        note._tracked = false;
        note._hit = false;
      });
      notesTotalRef.current = 0;
      notesHitRef.current = 0;
      sessionSavedRef.current = false;
    }
  }, [notes]);

  // Flush score accumulator and save game session when game ends
  useEffect(() => {
    if (gameState === 'ended' && !sessionSavedRef.current) {
      sessionSavedRef.current = true;
      
      // Flush any remaining accumulated score
      const finalScore = Math.min(score + scoreAccumulatorRef.current, 100000); // Cap at 100k
      if (scoreAccumulatorRef.current > 0) {
        setScore(finalScore);
        scoreAccumulatorRef.current = 0;
      }

      // Save game session if user is logged in
      if (user && videoId) {
        const durationSeconds = gameStartTimeRef.current 
          ? (Date.now() - gameStartTimeRef.current) / 1000 
          : null;
        
        const accuracy = notesTotalRef.current > 0 
          ? (notesHitRef.current / notesTotalRef.current) * 100 
          : null;

        fetch(`${API_BASE_URL}/game-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            youtubeId: videoId,
            score: finalScore,
            accuracy: accuracy,
            notesHit: notesHitRef.current,
            notesTotal: notesTotalRef.current,
            durationSeconds: durationSeconds,
            gameMode: 'solo', // Default to solo, can be changed later for online/duet modes
          }),
        }).catch(err => {
          console.error('Error saving game session:', err);
        });
      }
    }
  }, [gameState, user, videoId, score]);

  // Periodic flush of score accumulator to ensure updates even during brief pauses
  useEffect(() => {
    if (gameState === 'playing' && isMicActive) {
      const flushInterval = setInterval(() => {
        if (scoreAccumulatorRef.current > 0) {
          setScore(prev => {
            const newScore = prev + scoreAccumulatorRef.current;
            // Cap score at 100k
            return Math.min(newScore, 100000);
          });
          scoreAccumulatorRef.current = 0;
          lastScoreUpdateRef.current = Date.now();
        }
      }, 200); // Flush every 200ms to ensure score updates

      return () => clearInterval(flushInterval);
    }
  }, [gameState, isMicActive]);

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

      // Calculate RMS (Root Mean Square) to detect volume/amplitude
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const volumeThreshold = 0.005; // Lowered threshold to be more forgiving (was 0.01)
      
      // Only process pitch if volume is above threshold (user is actually singing)
      if (rms < volumeThreshold) {
        setUserPitch(null);
        micAnimationRef.current = requestAnimationFrame(detectPitch);
        return;
      }

      // Improved autocorrelation with better pitch detection
      let maxCorrelation = 0;
      let maxPeriod = 0;
      
      // Calculate valid period range for human voice (80Hz to 2000Hz)
      const minPeriod = Math.max(20, Math.floor(sampleRate / 2000)); // Max 2000Hz
      const maxPeriodLimit = Math.min(Math.floor(bufferLength / 2), Math.floor(sampleRate / 80)); // Min 80Hz
      
      // Use step size for faster computation while maintaining accuracy
      const step = Math.max(1, Math.floor((maxPeriodLimit - minPeriod) / 200));
      
      for (let period = minPeriod; period < maxPeriodLimit; period += step) {
        let correlation = 0;
        const checkLength = Math.min(bufferLength - period, 4096); // Larger window for better accuracy
        
        for (let i = 0; i < checkLength; i++) {
          correlation += Math.abs(data[i] * data[i + period]);
        }
        
        // Normalize by length for fair comparison
        correlation /= checkLength;
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          maxPeriod = period;
        }
      }
      
      // Refine around the peak for better accuracy
      if (maxPeriod > 0) {
        const refineRange = 5;
        const startPeriod = Math.max(minPeriod, maxPeriod - refineRange);
        const endPeriod = Math.min(maxPeriodLimit, maxPeriod + refineRange);
        
        for (let period = startPeriod; period < endPeriod; period++) {
          let correlation = 0;
          const checkLength = Math.min(bufferLength - period, 4096);
          for (let i = 0; i < checkLength; i++) {
            correlation += Math.abs(data[i] * data[i + period]);
          }
          correlation /= checkLength;
          if (correlation > maxCorrelation) {
            maxCorrelation = correlation;
            maxPeriod = period;
          }
        }
      }

      if (maxPeriod > 0 && maxCorrelation > 0.1) { // Minimum correlation threshold
        const rawFrequency = sampleRate / maxPeriod;
        if (rawFrequency > 80 && rawFrequency < 2000) {
          // Smooth pitch detection with previous value to reduce jitter
          const previousPitch = userPitch;
          let frequency;
          if (previousPitch && Math.abs(rawFrequency - previousPitch) < 100) {
            // Smooth if change is reasonable (within 100Hz)
            frequency = previousPitch * 0.7 + rawFrequency * 0.3;
          } else {
            frequency = rawFrequency;
          }
          setUserPitch(frequency);
          
          // Only award score if user is on target for an active note
          const currentTimeValue = currentTimeRef.current;
          if (notes && Array.isArray(notes) && notes.length > 0 && currentTimeValue) {
            // Find active note (note that contains currentTime)
            const activeNote = notes.find(note => 
              currentTimeValue >= note.start && currentTimeValue <= note.end
            );
            
            if (activeNote) {
              // Calculate accuracy based on pitch difference with octave tolerance
              const tolerance = 300; // Hz tolerance (matches PITCH_TOLERANCE in PitchBars)
              
              // Check base pitch and octave variations
              let pitchDiff = Math.abs(frequency - activeNote.targetPitch);
              let isOnTarget = pitchDiff <= tolerance;
              
              // Also check octave variations (singing an octave higher/lower)
              if (!isOnTarget && activeNote.targetPitch > 0) {
                const octaveUp = activeNote.targetPitch * 2;
                const octaveDown = activeNote.targetPitch / 2;
                const diffUp = Math.abs(frequency - octaveUp);
                const diffDown = Math.abs(frequency - octaveDown);
                if (diffUp <= tolerance || diffDown <= tolerance) {
                  isOnTarget = true;
                  pitchDiff = Math.min(diffUp, diffDown, pitchDiff);
                }
              }
              
              // Award proportional points even when partially on target
              // Points scale from 0 (far off) to full (perfect match)
              // This ensures partial bar fills give proportional scores
              let accuracy = 0;
              if (isOnTarget) {
                // Within tolerance: 1.0 when perfect, decreasing to 0.0 at edge
                accuracy = 1 - (pitchDiff / tolerance);
              } else {
                // Outside tolerance but still award some points for being close
                // Gradually decrease points up to 2x tolerance
                const extendedTolerance = tolerance * 2;
                if (pitchDiff <= extendedTolerance) {
                  accuracy = 0.5 * (1 - (pitchDiff - tolerance) / tolerance); // 50% max when just outside tolerance (increased from 30%)
                }
              }
              
              if (accuracy > 0) {
                // Award points per second, scaled by accuracy
                // Max 100k total score, so calculate points based on song duration and note density
                // Using requestAnimationFrame timing (~16-17ms per frame at 60fps)
                const timeWeight = 0.016; // ~16ms per frame
                // Base rate: points per second when perfect
                // Adjusted to ensure max score of ~100k for a typical song
                const basePointsPerSecond = 100; // Increased for better visibility
                const points = basePointsPerSecond * accuracy * timeWeight;
                
                // Accumulate score to ensure partial fills are counted
                scoreAccumulatorRef.current += points;
                
                // Update score state every ~50ms for more responsive updates
                const now = Date.now();
                if (now - lastScoreUpdateRef.current >= 50) {
                  if (scoreAccumulatorRef.current > 0) {
                    setScore(prev => {
                      const newScore = prev + scoreAccumulatorRef.current;
                      // Cap score at 100k
                      return Math.min(newScore, 100000);
                    });
                    scoreAccumulatorRef.current = 0;
                  }
                  lastScoreUpdateRef.current = now;
                }
              }
            }
            // If no active note, no points awarded
          }
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
      // Track game start time
      if (!gameStartTimeRef.current) {
        gameStartTimeRef.current = Date.now();
      }
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
        // Track game start time
        if (!gameStartTimeRef.current) {
          gameStartTimeRef.current = Date.now();
        }
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

  const jumpToFirstVerse = () => {
    if (!player || firstVerseStartTime === null || firstVerseStartTime === undefined) return;
    
    try {
      // Seek to first verse start time
      player.seekTo(firstVerseStartTime, true);
      console.log(`⏩ Jumped to first verse at ${firstVerseStartTime.toFixed(2)}s`);
      
      // Update current time immediately
      setCurrentTime(firstVerseStartTime);
      currentTimeRef.current = firstVerseStartTime;
      
      // Reset playback tracking to sync with new position
      if (isPlaying) {
        playbackStartTimeRef.current = performance.now() - (firstVerseStartTime * 1000);
        pauseOffsetRef.current = firstVerseStartTime;
      } else {
        pauseOffsetRef.current = firstVerseStartTime;
      }
      
      // If not playing, start playing
      if (!isPlaying) {
        player.playVideo();
        startMicrophone();
      }
    } catch (error) {
      console.error('Error jumping to first verse:', error);
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
          <div className="countdown-text">Loading Song...</div>
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
        {/* Top Bar - Time only */}
        <div className="game-top-bar">
          <div className="game-time-display">
            <span className="time-current">{formatTime(currentTime)}</span>
            <span className="time-separator">/</span>
            <span className="time-total">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Score - Top Left with Back Button */}
        <div className="game-score-top-left">
          <button onClick={onBack} className="back-button" aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="game-score-content">
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
            firstVerseStartTime={firstVerseStartTime}
          />
        </div>

        {/* Lyrics at Bottom */}
        <div className="game-lyrics-container">
          <Lyrics 
            segments={segments} 
            currentTime={currentTime}
            firstVerseStartTime={firstVerseStartTime}
          />
        </div>

        {/* Top Controls - Top Right */}
        <div className="game-top-controls">
          {/* Jump to First Verse Button */}
          {firstVerseStartTime !== null && firstVerseStartTime !== undefined && (
            <button 
              onClick={jumpToFirstVerse}
              className="control-button jump-button"
              aria-label="Jump to beginning of song"
              title={`Jump to first verse (${firstVerseStartTime.toFixed(1)}s)`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 18l8.5-6-8.5-6v12zm-.5-6l-8.5-6v12l8.5-6z"/>
              </svg>
            </button>
          )}

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
