import { useState, useEffect, useRef, useCallback } from 'react';
import YouTube from 'react-youtube';
import Lyrics from './Lyrics';
import PitchBars from './PitchBars';
import ScoreDisplay from './ScoreDisplay'; // Import new optimizations

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Game({ videoId, segments, lyrics, notes, firstVerseStartTime, user, onBack }) {
  const [player, setPlayer] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [userPitch, setUserPitch] = useState(null);
  const [volumeLevel, setVolumeLevel] = useState(0); // For debug display
  // Score is now managed via ref for high-perf updates, but we keep state for final submission
  const [score, setScore] = useState(0);
  const displayScoreRef = useRef(0); // Ref for the visual counter
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
  const tryPlayTimeoutRef = useRef(null);

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
        await audioContextRef.current.close().catch(() => { });
      }

      // Request microphone - DISABLED filters that might suppress voice
      // autoGainControl can suppress voice if it thinks it's noise
      const audioConstraints = {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: false },
        autoGainControl: { ideal: true }, // Re-enabled for better sensitivity on some mics
        // Chrome-specific constraints
        ...(navigator.userAgent.includes('Chrome') && {
          googEchoCancellation: { ideal: true },
          googNoiseSuppression: { ideal: false },
          googAutoGainControl: { ideal: true },
          googHighpassFilter: { ideal: false },
          googTypingNoiseDetection: { ideal: false },
        })
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
      streamRef.current = stream;
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      // Use larger FFT size for better frequency resolution
      analyser.fftSize = 4096; // Increased from 2048 for better pitch detection
      analyser.smoothingTimeConstant = 0.3; // Lowered from 0.8 for more responsive detection
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      setIsMicActive(true);
      // Diagnostics
      console.log('Microphone connected', {
        sampleRate: audioContext.sampleRate,
        state: audioContext.state,
        fftSize: analyser.fftSize
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setIsMicActive(false);
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
      console.log('Microphone disconnected');
    } catch (error) {
      console.error('Error stopping microphone:', error);
      setIsMicActive(false);
      setUserPitch(null);
    }
  }, []);

  // Store currentTime in ref for pitch detection
  const currentTimeRef = useRef(0);
  const userPitchRef = useRef(null);
  const notesRef = useRef([]);
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
      notesRef.current = notes;
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

  // Update userPitchRef when userPitch changes
  useEffect(() => {
    userPitchRef.current = userPitch;
  }, [userPitch]);

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
      if (!analyserRef.current || !dataArrayRef.current || !audioContextRef.current) {
        return;
      }

      // Check if audio context is suspended (Chrome/Safary policy) and resume
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
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
      const volumeThreshold = 0.001; // LOWERED SIGNIFICANTLY - detect even very quiet sounds

      // Update volume level for debug display (0-100%) - use better scaling
      // RMS typically ranges from 0 to ~0.1 for normal speech, so scale accordingly
      const volumePercent = Math.min(100, Math.max(0, (rms / 0.05) * 100)); // Scale based on typical RMS range
      setVolumeLevel(volumePercent);

      // ALWAYS process pitch detection - don't stop on low volume!
      // Volume threshold is just for display, not for blocking detection
      // Only skip if there's literally no signal (RMS extremely low)
      if (rms < 0.0001) {
        // Only skip if there's literally no audio signal at all
        micAnimationRef.current = requestAnimationFrame(detectPitch);
        return;
      }

      // Improved autocorrelation with better pitch detection
      let maxCorrelation = 0;
      let maxPeriod = 0;

      // Calculate valid period range for human voice - EXTENDED range (50Hz to 3000Hz)
      const minPeriod = Math.max(20, Math.floor(sampleRate / 3000)); // Max 3000Hz (extended from 2000Hz)
      const maxPeriodLimit = Math.min(Math.floor(bufferLength / 2), Math.floor(sampleRate / 50)); // Min 50Hz (extended from 80Hz)

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

      // LOWERED threshold and EXTENDED range to ALWAYS show user's voice
      let detectedFrequency = null;

      // LOWERED correlation threshold even more to detect quiet singing
      if (maxPeriod > 0 && maxCorrelation > 0.02) { // Lowered from 0.05 to 0.02 to detect even quieter sounds
        const rawFrequency = sampleRate / maxPeriod;
        // EXTENDED range: 50Hz to 3000Hz to show wider pitch ranges
        if (rawFrequency > 50 && rawFrequency < 3000) {
          // Smooth pitch detection with previous value to reduce jitter
          const previousPitch = userPitch;
          let frequency;
          if (previousPitch && Math.abs(rawFrequency - previousPitch) < 200) {
            // Smooth if change is reasonable (increased tolerance to 200Hz for smoother tracking)
            frequency = previousPitch * 0.7 + rawFrequency * 0.3;
          } else {
            frequency = rawFrequency;
          }
          setUserPitch(frequency);
          detectedFrequency = frequency;
          // Log only once per second to avoid flooding
          if (Math.random() < 0.05) {
            console.log('PITCH DETECTED:', frequency.toFixed(1), 'Hz, Volume:', volumePercent.toFixed(1), '%');
          }
        } else {
          // Frequency outside extended range - still show it but clamp to display range
          if (rawFrequency > 0) {
            const clampedFreq = Math.max(50, Math.min(3000, rawFrequency));
            setUserPitch(clampedFreq);
            detectedFrequency = clampedFreq;
            console.log('PITCH DETECTED (clamped):', clampedFreq.toFixed(1), 'Hz, Volume:', volumePercent.toFixed(1), '%');
          }
        }
      } else {
        // Very low correlation - log for debugging
        if (volumePercent > 1 || rms > 0.001) {
          // If there's volume but no pitch, log it
          console.log('Volume detected (', volumePercent.toFixed(1), '%, RMS:', rms.toFixed(5), ') but no pitch (correlation:', maxCorrelation.toFixed(4), ')');
        }
        // Keep showing last pitch for smoother experience - don't clear it
      }

      // ONLY award points if volume is sufficient (lowered threshold to 0.5% for sensitivity)
      if (detectedFrequency && detectedFrequency > 0 && volumePercent > 0.5) {
        const currentTimeValue = currentTimeRef.current;
        const currentNotes = notesRef.current;

        if (currentNotes && currentNotes.length > 0 && currentTimeValue) {
          // Find active note (note that contains currentTime)
          const activeNote = currentNotes.find(note =>
            currentTimeValue >= note.start && currentTimeValue <= note.end
          );

          if (activeNote) {
            // Multi-octave matching logic
            const tolerance = 300; // Match PITCH_TOLERANCE in PitchBars
            let bestDiff = Math.abs(detectedFrequency - activeNote.targetPitch);
            let isOnTarget = bestDiff <= tolerance;

            // Check octaves (-3 to +3)
            for (let oct = -3; oct <= 3; oct++) {
              if (oct === 0) continue;
              const adjTarget = activeNote.targetPitch * Math.pow(2, oct);
              const diff = Math.abs(detectedFrequency - adjTarget);
              if (diff <= tolerance) {
                isOnTarget = true;
                if (diff < bestDiff) bestDiff = diff;
              }
            }

            let accuracy = 0;
            if (isOnTarget) {
              accuracy = 1 - (bestDiff / tolerance);
            } else {
              const extendedTolerance = tolerance * 2;
              if (bestDiff <= extendedTolerance) {
                accuracy = 0.5 * (1 - (bestDiff - tolerance) / tolerance);
              }
            }



            if (accuracy > 0) {
              const basePointsPerSecond = 15000;
              scoreAccumulatorRef.current += basePointsPerSecond * accuracy * 0.016;
              const now = Date.now();
              if (now - lastScoreUpdateRef.current >= 16) {
                const toAdd = scoreAccumulatorRef.current;
                if (toAdd > 0) {
                  // DIRECTLY update the ref for instant visual feedback
                  displayScoreRef.current = Math.min((displayScoreRef.current || 0) + toAdd, 100000);
                  // Sync to React state less frequently (every 1s or on event) if needed, 
                  // but for now we trust the ref for display and flush to state on end
                  setScore(prev => Math.min(prev + toAdd, 100000));
                  scoreAccumulatorRef.current = 0;
                }
                lastScoreUpdateRef.current = now;
              }
            }
          }
        }
      }

      // ALWAYS continue the loop if mic is active - don't stop even on low volume
      // Use refs instead of state to avoid dependency issues
      if (isMicActive && audioContextRef.current && audioContextRef.current.state !== 'closed') {
        micAnimationRef.current = requestAnimationFrame(detectPitch);
      }
    } catch (error) {
      console.error('Error in pitch detection:', error);
      // Continue loop even on error - don't stop detection
      if (isMicActive && audioContextRef.current && audioContextRef.current.state !== 'closed') {
        micAnimationRef.current = requestAnimationFrame(detectPitch);
      }
    }
  }, [isMicActive]);

  // Start pitch detection when mic is active - KEEP LOOP RUNNING CONTINUOUSLY
  // Don't cancel/restart on every state change - this causes lag!
  useEffect(() => {
    if (isMicActive && analyserRef.current && audioContextRef.current && audioContextRef.current.state !== 'closed') {
      // Only start if not already running - don't cancel existing loop!
      if (!micAnimationRef.current) {
        detectPitch();
      }
    } else {
      // Only stop if mic is completely disabled
      if (micAnimationRef.current && !isMicActive) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
    }
    return () => {
      // Cleanup on unmount only
      if (micAnimationRef.current) {
        cancelAnimationFrame(micAnimationRef.current);
        micAnimationRef.current = null;
      }
    };
  }, [isMicActive, detectPitch]); // Removed isPlaying - don't restart on play/pause

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
      console.log('Video ready, duration:', videoDuration);

      // Start countdown
      setGameState('countdown');
    } catch (error) {
      console.error('Error getting video duration:', error);
      setGameState('countdown');
    }
  };

  // Countdown logic - only runs when countdown finishes
  useEffect(() => {
    if (gameState !== 'countdown') return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    // Countdown finished - start the game!
    setGameState('playing');
    // Track game start time
    if (!gameStartTimeRef.current) {
      gameStartTimeRef.current = Date.now();
    }
    startMicrophone();

    // Wait for player to be fully ready, then play
    // Track retry attempts to prevent infinite loops
    let retryCount = 0;
    const maxRetries = 30; // Max 30 retries (3 seconds total)
    let isCancelled = false;

    const tryPlay = () => {
      // Check if cancelled (e.g., user paused)
      if (isCancelled) return;

      retryCount++;

      // Check if player exists and is ready
      if (!player || !playerReadyRef.current) {
        if (retryCount < maxRetries && !isCancelled) {
          tryPlayTimeoutRef.current = setTimeout(tryPlay, 100);
        } else if (retryCount >= maxRetries) {
          console.error('Max retries reached: Player not ready');
        }
        return;
      }

      // Check if player has the necessary methods
      if (typeof player.playVideo !== 'function') {
        if (retryCount < maxRetries && !isCancelled) {
          tryPlayTimeoutRef.current = setTimeout(tryPlay, 100);
        }
        return;
      }

      // Check if player has internal iframe (YouTube API requirement)
      // The error "Cannot read properties of null (reading 'src')" happens
      // when the iframe doesn't exist yet
      try {
        // Try to get iframe - this is what YouTube API needs
        let iframe = null;
        try {
          iframe = player.getIframe ? player.getIframe() : null;
        } catch (e) {
          // getIframe might not exist or might throw
        }

        // If we can't get iframe, try to find it in the DOM
        if (!iframe) {
          const playerContainer = document.querySelector('.game-youtube-player');
          if (playerContainer) {
            iframe = playerContainer.querySelector('iframe');
          }
        }

        // If still no iframe, wait a bit longer
        if (!iframe || !iframe.src) {
          if (retryCount < maxRetries && !isCancelled) {
            tryPlayTimeoutRef.current = setTimeout(tryPlay, 200);
          } else if (retryCount >= maxRetries) {
            console.error('Max retries reached: Iframe not ready');
          }
          return;
        }

        // Try to get player state - if it throws, player isn't ready
        let playerState = -1;
        try {
          playerState = player.getPlayerState ? player.getPlayerState() : -1;
        } catch (e) {
          // Player state method failed, retry
          if (retryCount < maxRetries && !isCancelled) {
            tryPlayTimeoutRef.current = setTimeout(tryPlay, 200);
          }
          return;
        }

        // Add a small delay to ensure iframe is fully initialized
        // YouTube API sometimes needs a moment after iframe appears
        if (retryCount < 5 && !isCancelled) {
          tryPlayTimeoutRef.current = setTimeout(tryPlay, 100);
          return;
        }

        // Check again if cancelled before attempting to play
        if (isCancelled) return;

        // Player is ready, attempt to play
        player.playVideo();
        console.log('Playing video, player state:', playerState);
      } catch (error) {
        // Only log error if we've tried a few times
        if (retryCount > 3) {
          console.error('Error playing video:', error);
        }

        // Only retry if we haven't exceeded max retries and not cancelled
        if (retryCount < maxRetries && !isCancelled) {
          tryPlayTimeoutRef.current = setTimeout(tryPlay, 300);
        } else if (retryCount >= maxRetries) {
          console.error('Max retries reached for video playback after', retryCount, 'attempts');
        }
      }
    };

    // Wait a bit before first attempt to let iframe initialize
    tryPlayTimeoutRef.current = setTimeout(tryPlay, 300);

    // Cleanup: cancel tryPlay if component unmounts or effect re-runs
    return () => {
      isCancelled = true;
      if (tryPlayTimeoutRef.current) {
        clearTimeout(tryPlayTimeoutRef.current);
        tryPlayTimeoutRef.current = null;
      }
    };
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
        console.log('Video buffering...');
      }
    }

    if (state === 0) { // ENDED
      isPlayingRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      setGameState('ended');
    }

    if (state === -1) { // UNSTARTED
      console.log('Video unstarted');
    }

    if (state === 5) { // CUED
      console.log('Video cued and ready');
    }
  };

  const handleError = (event) => {
    const errorCode = event.data;
    console.error('YouTube player error:', errorCode);

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
                console.log(`[SYNC] Drift detected: ${drift.toFixed(2)}s. Re-syncing to YouTube time.`);
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
    if (!player || !playerReadyRef.current) return;

    // Cancel any pending tryPlay timeouts
    if (tryPlayTimeoutRef.current) {
      clearTimeout(tryPlayTimeoutRef.current);
      tryPlayTimeoutRef.current = null;
    }

    try {
      if (isPlaying) {
        player.pauseVideo();
      } else {
        // Only play if player is ready and has iframe
        const iframe = player.getIframe ? player.getIframe() : null;
        if (iframe && iframe.src) {
          player.playVideo();
        } else {
          console.warn('Player not ready for playback');
        }
      }
    } catch (error) {
      console.error('Error in handlePlayPause:', error);
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
            <div className="game-over-title">Great Performance!</div>
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
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="game-score-content">
            <ScoreDisplay scoreRef={displayScoreRef} />
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
                <path d="M13 18l8.5-6-8.5-6v12zm-.5-6l-8.5-6v12l8.5-6z" />
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
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
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

        {/* Debug Voice Frequency Indicator - Bottom Left */}
        <div className="voice-frequency-debug">
          <div className="voice-debug-header">
            <span className="voice-debug-icon"></span>
            <span className="voice-debug-title">Voice Detection</span>
          </div>
          <div className="voice-debug-content">
            <div className="voice-debug-status">
              <span className={`voice-debug-indicator ${isMicActive ? 'active' : 'inactive'}`}>
                {isMicActive ? '●' : '○'}
              </span>
              <span className="voice-debug-text">
                {isMicActive ? 'Mic Active' : 'Mic Inactive'}
              </span>
            </div>
            {isMicActive ? (
              <>
                <div className="voice-debug-frequency">
                  <span className="voice-debug-label">Frequency:</span>
                  <span className="voice-debug-value" style={{ color: userPitch ? '#ff6b35' : '#666' }}>
                    {userPitch ? `${Math.round(userPitch)} Hz` : 'No signal'}
                  </span>
                </div>
                {notes && notes.length > 0 && currentTime && (() => {
                  const activeNote = notes.find(n => currentTime >= n.start && currentTime <= n.end);
                  if (activeNote) {
                    // Quick accuracy check for UI display
                    let bestDiff = userPitch ? Math.abs(userPitch - activeNote.targetPitch) : 999;
                    for (let oct = -3; oct <= 3; oct++) {
                      if (oct === 0) continue;
                      const diff = Math.abs(userPitch - (activeNote.targetPitch * Math.pow(2, oct)));
                      if (diff < bestDiff) bestDiff = diff;
                    }
                    const isHitting = bestDiff <= 300;
                    const accuracy = isHitting ? Math.round((1 - (bestDiff / 300)) * 100) : 0;

                    return (
                      <>
                        <div className="voice-debug-frequency" style={{ marginTop: '0.25rem' }}>
                          <span className="voice-debug-label">Target:</span>
                          <span className="voice-debug-value" style={{ color: '#22c55e' }}>
                            {Math.round(activeNote.targetPitch)} Hz
                          </span>
                        </div>
                        <div className="voice-debug-frequency" style={{ marginTop: '0.1rem' }}>
                          <span className="voice-debug-label">Status:</span>
                          <span className="voice-debug-value" style={{ color: isHitting ? '#22c55e' : '#ff6b35' }}>
                            {isHitting ? `HIT! (${accuracy}%)` : 'MISS'}
                          </span>
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}
                <div className="voice-debug-volume">
                  <span className="voice-debug-label">Volume:</span>
                  <span className="voice-debug-value" style={{ color: volumeLevel > 2 ? '#22c55e' : '#ff6b35' }}>
                    {Math.round(volumeLevel)}%
                  </span>
                </div>
                <div className="voice-debug-visual">
                  <div
                    className="voice-debug-bar voice-debug-volume-bar"
                    style={{
                      width: `${volumeLevel}%`,
                      backgroundColor: volumeLevel > 2 ? '#22c55e' : '#ff6b35'
                    }}
                  />
                </div>
                {userPitch && (
                  <div className="voice-debug-visual">
                    <div className="voice-debug-label" style={{ fontSize: '0.7rem', marginBottom: '0.25rem' }}>Visual Range:</div>
                    <div
                      className="voice-debug-bar voice-debug-pitch-bar"
                      style={{
                        width: `${Math.min(100, (userPitch / 1600) * 100)}%`,
                        backgroundColor: '#ff6b35'
                      }}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="voice-debug-note">Enable microphone to see detection</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
