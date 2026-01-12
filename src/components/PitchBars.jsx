import { useMemo, useRef, useEffect, useCallback } from 'react';

// SingStar-style pitch bars - simple, clean, aligned to lyrics
const PITCH_TOLERANCE = 250;

export default function PitchBars({ segments, currentTime, userPitch, notes, firstVerseStartTime }) {
  const canvasRef = useRef(null);
  const fillProgressRef = useRef({});

  const TRACK_HEIGHT = 180;
  const BAR_HEIGHT = 24;

  // Filter segments for first verse
  const filteredSegments = useMemo(() => {
    if (!segments?.length) return [];
    if (firstVerseStartTime !== null && firstVerseStartTime !== undefined) {
      return segments.filter(seg => (Number(seg.start) || 0) >= firstVerseStartTime);
    }
    return segments;
  }, [segments, firstVerseStartTime]);

  // Get current segment index
  const currentSegmentIndex = useMemo(() => {
    if (!filteredSegments.length) return -1;
    const time = currentTime || 0;
    
    for (let i = 0; i < filteredSegments.length; i++) {
      const seg = filteredSegments[i];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      if (time >= start && time <= end) return i;
    }
    
    // Find closest upcoming segment
    for (let i = 0; i < filteredSegments.length; i++) {
      const start = Number(filteredSegments[i].start) || 0;
      if (time < start) return i;
    }
    
    return filteredSegments.length - 1;
  }, [filteredSegments, currentTime]);

  const currentSegment = filteredSegments[currentSegmentIndex] || null;
  const segStart = currentSegment ? (Number(currentSegment.start) || 0) : 0;
  const segEnd = currentSegment ? (Number(currentSegment.end) || 0) : 5;
  const segDuration = segEnd - segStart;

  // Create simple bars from notes - ONE bar per distinct pitch group in segment
  const bars = useMemo(() => {
    if (!notes?.length || !currentSegment) return [];
    
    // Get notes that overlap with current segment
    const segmentNotes = notes.filter(n => 
      n.start < segEnd && n.end > segStart
    ).sort((a, b) => a.start - b.start);
    
    if (segmentNotes.length === 0) return [];
    
    // Group notes into 2-4 bars max per segment based on timing
    const numBars = Math.min(4, Math.max(1, Math.ceil(segDuration / 1.5)));
    const barDuration = segDuration / numBars;
    const result = [];
    
    for (let i = 0; i < numBars; i++) {
      const barStart = segStart + i * barDuration;
      const barEnd = segStart + (i + 1) * barDuration;
      
      // Find notes in this time range
      const notesInBar = segmentNotes.filter(n => 
        n.start < barEnd && n.end > barStart
      );
      
      if (notesInBar.length > 0) {
        // Average pitch of notes in this bar
        const avgPitch = notesInBar.reduce((sum, n) => sum + n.targetPitch, 0) / notesInBar.length;
        
        result.push({
          id: `bar-${i}`,
          start: barStart,
          end: barEnd,
          pitch: avgPitch,
        });
      }
    }
    
    return result;
  }, [notes, currentSegment, segStart, segEnd, segDuration]);

  // Calculate pitch range from bars
  const pitchRange = useMemo(() => {
    if (!bars.length) return { min: 150, max: 400 };
    const pitches = bars.map(b => b.pitch);
    const minP = Math.min(...pitches);
    const maxP = Math.max(...pitches);
    const padding = Math.max(80, (maxP - minP) * 0.5);
    return { min: minP - padding, max: maxP + padding };
  }, [bars]);

  const pitchToY = useCallback((pitch) => {
    const { min, max } = pitchRange;
    const percent = Math.max(0, Math.min(1, (pitch - min) / (max - min)));
    return TRACK_HEIGHT - 20 - (percent * (TRACK_HEIGHT - 40));
  }, [pitchRange]);

  // Check pitch match with octave tolerance
  const isOnTarget = useCallback((userP, targetP) => {
    if (!userP || !targetP) return false;
    if (Math.abs(userP - targetP) <= PITCH_TOLERANCE) return true;
    // Check octaves
    for (let oct = -2; oct <= 2; oct++) {
      if (oct === 0) continue;
      if (Math.abs(userP - targetP * Math.pow(2, oct)) <= PITCH_TOLERANCE) return true;
    }
    return false;
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = TRACK_HEIGHT * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, TRACK_HEIGHT);
    
    const time = currentTime || 0;
    const pitch = userPitch;

    // Draw each bar
    bars.forEach(bar => {
      const startPct = (bar.start - segStart) / segDuration;
      const endPct = (bar.end - segStart) / segDuration;
      const x = startPct * rect.width;
      const w = Math.max(60, (endPct - startPct) * rect.width); // Min 60px width
      const y = pitchToY(bar.pitch) - BAR_HEIGHT / 2;
      
      const isActive = time >= bar.start && time < bar.end;
      const isPast = time >= bar.end;
      
      // Bar background
      ctx.fillStyle = isPast ? 'rgba(255, 107, 53, 0.15)' : 'rgba(255, 107, 53, 0.25)';
      ctx.beginPath();
      ctx.roundRect(x, y, w, BAR_HEIGHT, 12);
      ctx.fill();
      
      // Bar border
      ctx.strokeStyle = isActive ? 'rgba(255, 107, 53, 1)' : 'rgba(255, 107, 53, 0.5)';
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, BAR_HEIGHT, 12);
      ctx.stroke();
      
      // Track fill progress
      if (isActive && pitch && isOnTarget(pitch, bar.pitch)) {
        const progress = (time - bar.start) / (bar.end - bar.start);
        fillProgressRef.current[bar.id] = Math.max(
          fillProgressRef.current[bar.id] || 0,
          progress
        );
      }
      
      // Draw fill
      const fillPct = fillProgressRef.current[bar.id] || 0;
      if (fillPct > 0) {
        ctx.fillStyle = 'rgba(255, 107, 53, 0.8)';
        ctx.beginPath();
        ctx.roundRect(x + 3, y + 3, (w - 6) * fillPct, BAR_HEIGHT - 6, 9);
        ctx.fill();
      }
    });

    // Draw playhead
    const playheadPct = (time - segStart) / segDuration;
    if (playheadPct >= 0 && playheadPct <= 1) {
      const px = playheadPct * rect.width;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, TRACK_HEIGHT);
      ctx.stroke();
    }

    // Draw user pitch dot
    if (pitch && pitch > 0 && playheadPct >= 0 && playheadPct <= 1) {
      const py = pitchToY(pitch);
      const px = playheadPct * rect.width;
      
      ctx.shadowColor = '#ff6b35';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

  }, [currentTime, userPitch, bars, segStart, segDuration, pitchToY, isOnTarget]);

  // Reset fills on segment change
  useEffect(() => {
    fillProgressRef.current = {};
  }, [currentSegmentIndex]);

  if (!currentSegment || bars.length === 0) {
    return <div className="pitch-bars-container" style={{ height: TRACK_HEIGHT }} />;
  }

  return (
    <div className="pitch-bars-container">
      <canvas
        ref={canvasRef}
        className="pitch-bars-canvas"
        style={{ width: '100%', height: TRACK_HEIGHT, display: 'block' }}
      />
    </div>
  );
}
