import { useState, useEffect, useRef } from 'react';

export default function PitchDetector({ onPitchDetected, isPaused = false }) {
  const [isListening, setIsListening] = useState(false);
  const [currentPitch, setCurrentPitch] = useState(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    // Restart detection loop if pause state changes and we're listening
    if (isListeningRef.current && !isPaused && analyserRef.current && dataArrayRef.current) {
      // Cancel any existing loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Restart detection
      detectPitch();
    } else if (isPaused && animationFrameRef.current) {
      // Stop detection when paused
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      setCurrentPitch(null);
      if (onPitchDetected) {
        onPitchDetected(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      microphone.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;

      setIsListening(true);
      isListeningRef.current = true;
      detectPitch();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Microphone access denied. Please enable microphone permissions.');
    }
  };

  const stopListening = () => {
    isListeningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsListening(false);
    setCurrentPitch(null);
  };

  const detectPitch = () => {
    if (!isListeningRef.current || !analyserRef.current || !dataArrayRef.current || isPaused) {
      // If paused, stop detection loop
      if (isPaused && isListeningRef.current) {
        setCurrentPitch(null);
        if (onPitchDetected) {
          onPitchDetected(null);
        }
      }
      return;
    }

    analyserRef.current.getByteFrequencyData(dataArrayRef.current);

    // Find the dominant frequency using autocorrelation
    const sampleRate = audioContextRef.current.sampleRate;
    const bufferLength = analyserRef.current.fftSize;
    const data = new Float32Array(bufferLength);
    analyserRef.current.getFloatTimeDomainData(data);

    // Autocorrelation to find pitch
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
        setCurrentPitch(frequency);
        if (onPitchDetected) {
          onPitchDetected(frequency);
        }
      }
    }

    if (isListeningRef.current && !isPaused) {
      animationFrameRef.current = requestAnimationFrame(detectPitch);
    }
  };

  return (
    <div className="pitch-detector">
      <button
        onClick={isListening ? stopListening : startListening}
        className={isListening ? 'listening' : ''}
      >
        {isListening ? 'Stop Listening' : 'Start Microphone'}
      </button>
      {currentPitch && (
        <div className="pitch-display">
          Pitch: {currentPitch.toFixed(1)} Hz
        </div>
      )}
    </div>
  );
}

