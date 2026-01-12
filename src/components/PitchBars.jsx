import { useMemo, useRef, useEffect, useCallback } from 'react';

// Pitch tolerance for "on target" - higher value = easier to hit notes
const PITCH_TOLERANCE = 300;

// Merging settings - merge nearby notes with similar pitch into one bar
const MERGE_TIME_GAP = 0.15; // Max gap between notes to merge (seconds)
const MERGE_PITCH_TOLERANCE = 80; // Max pitch difference to merge (Hz)

export default function PitchBars({ segments, currentTime, userPitch, notes, firstVerseStartTime }) {
  const canvasRef = useRef(null);
  const barFillsRef = useRef({});
  const lastPitchRef = useRef(null);
  const animationFrameRef = useRef(null);

  const WINDOW_DURATION = 5;
  const MAX_WINDOW_DURATION = 8; // Cap window to prevent super thin bars
  const TRACK_HEIGHT = 200;
  const MARGIN = 20;
  const USABLE_HEIGHT = TRACK_HEIGHT - MARGIN * 2;
  const BAR_HEIGHT = 30;
  const FILL_HEIGHT = 20;
  const MIN_BAR_WIDTH = 40; // Minimum pixel width for bars to be visible

  // Filter and merge notes - combine nearby notes with similar pitch into longer bars
  const pitchBars = useMemo(() => {
    if (!notes || !Array.isArray(notes) || notes.length === 0) return [];
    
    // Filter by first verse
    let filteredNotes = notes;
    if (firstVerseStartTime !== null && firstVerseStartTime !== undefined) {
      filteredNotes = notes.filter(note => note.start >= firstVerseStartTime);
    }
    
    // Sort by start time
    const sortedNotes = [...filteredNotes].sort((a, b) => a.start - b.start);
    
    // Merge adjacent notes with similar pitch
    const mergedNotes = [];
    
    for (const note of sortedNotes) {
      const lastMerged = mergedNotes[mergedNotes.length - 1];
      
      if (lastMerged) {
        const timeGap = note.start - lastMerged.end;
        const pitchDiff = Math.abs(note.targetPitch - lastMerged.targetPitch);
        
        // Merge if notes are close in time AND similar in pitch
        if (timeGap <= MERGE_TIME_GAP && pitchDiff <= MERGE_PITCH_TOLERANCE) {
          // Extend the last bar to include this note
          lastMerged.end = note.end;
          lastMerged.duration = lastMerged.end - lastMerged.start;
          // Use weighted average for pitch (weighted by duration)
          const lastDur = lastMerged.end - lastMerged.start - (note.end - note.start);
          const noteDur = note.end - note.start;
          const totalDur = lastDur + noteDur;
          lastMerged.targetPitch = (lastMerged.targetPitch * lastDur + note.targetPitch * noteDur) / totalDur;
          continue;
        }
      }
      
      // Add as new bar
      mergedNotes.push({
        id: `note-${mergedNotes.length}`,
        start: note.start,
        end: note.end,
        duration: note.duration || (note.end - note.start),
        targetPitch: note.targetPitch,
      });
    }
    
    return mergedNotes;
  }, [notes, firstVerseStartTime]);

  // Calculate dynamic pitch range from actual notes for better visual spread
  const pitchRange = useMemo(() => {
    if (!pitchBars || pitchBars.length === 0) return { min: 100, max: 500 };
    const pitches = pitchBars.map(n => n.targetPitch);
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);
    // Add 30% padding for user pitch display
    const range = maxPitch - minPitch;
    const padding = Math.max(50, range * 0.3);
    return {
      min: Math.max(50, minPitch - padding),
      max: maxPitch + padding
    };
  }, [pitchBars]);

  // Pitch to Y position using dynamic range
  const pitchToY = useCallback((pitch) => {
    const { min, max } = pitchRange;
    let pitchPercent = (pitch - min) / (max - min);
    pitchPercent = Math.max(0, Math.min(1, pitchPercent));
    return TRACK_HEIGHT - MARGIN - (pitchPercent * USABLE_HEIGHT);
  }, [pitchRange]);

  // Filter segments for first verse
  const filteredSegments = useMemo(() => {
    if (!segments?.length) return [];
    if (firstVerseStartTime !== null && firstVerseStartTime !== undefined) {
      return segments.filter(seg => (Number(seg.start) || 0) >= firstVerseStartTime);
    }
    return segments;
  }, [segments, firstVerseStartTime]);

  // Get current segment
  const currentSegment = useMemo(() => {
    if (!filteredSegments || filteredSegments.length === 0 || !currentTime) return null;
    for (const seg of filteredSegments) {
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      if (currentTime >= start && currentTime <= end) {
        return { start, end };
      }
    }
    for (let i = filteredSegments.length - 1; i >= 0; i--) {
      const start = Number(filteredSegments[i].start) || 0;
      if (currentTime >= start) {
        return { start, end: Number(filteredSegments[i].end) || 0 };
      }
    }
    return null;
  }, [filteredSegments, currentTime]);

  // Cap window duration to prevent bars from becoming too thin
  const rawWindowDuration = currentSegment ? (currentSegment.end - currentSegment.start) : WINDOW_DURATION;
  const windowDuration = Math.min(rawWindowDuration, MAX_WINDOW_DURATION);
  const windowStart = currentSegment 
    ? Math.max(currentSegment.start, (currentTime || 0) - windowDuration / 2)
    : (currentTime ? Math.floor(currentTime / WINDOW_DURATION) * WINDOW_DURATION : 0);

  // Visible bars
  const visibleBars = useMemo(() => {
    if (!pitchBars.length) return [];
    if (currentSegment) {
      return pitchBars.filter(bar => bar.start < currentSegment.end && bar.end > currentSegment.start);
    }
    const windowEnd = windowStart + WINDOW_DURATION;
    return pitchBars.filter(bar => bar.start < windowEnd && bar.end > windowStart);
  }, [pitchBars, currentSegment, windowStart]);

  // Track last pitch
  useEffect(() => {
    if (userPitch && userPitch > 0) {
      lastPitchRef.current = userPitch;
    }
  }, [userPitch]);

  // Check if pitch is on target (with octave tolerance)
  const isOnTarget = useCallback((pitch, targetPitch) => {
    if (!pitch || !targetPitch) return false;
    let diff = Math.abs(pitch - targetPitch);
    if (diff <= PITCH_TOLERANCE) return true;
    for (let oct = -3; oct <= 3; oct++) {
      if (oct === 0) continue;
      const adjTarget = targetPitch * Math.pow(2, oct);
      if (Math.abs(pitch - adjTarget) <= PITCH_TOLERANCE) return true;
    }
    return false;
  }, []);

  // Canvas draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = TRACK_HEIGHT * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.height = `${TRACK_HEIGHT}px`;

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, TRACK_HEIGHT);

      const winDur = windowDuration || WINDOW_DURATION;
      const winStart = windowStart || 0;
      const time = currentTime || 0;
      const pitch = userPitch || lastPitchRef.current;

      // Draw note bars (empty)
      visibleBars.forEach(bar => {
        const barStartPercent = Math.max(0, ((bar.start - winStart) / winDur));
        const barEndPercent = Math.min(1, ((bar.end - winStart) / winDur));
        let barWidth = (barEndPercent - barStartPercent) * rect.width;
        let barX = barStartPercent * rect.width;
        
        // Enforce minimum bar width so bars are always visible
        if (barWidth < MIN_BAR_WIDTH) {
          const extraWidth = MIN_BAR_WIDTH - barWidth;
          barX = Math.max(0, barX - extraWidth / 2);
          barWidth = MIN_BAR_WIDTH;
        }
        
        const barY = pitchToY(bar.targetPitch) - BAR_HEIGHT / 2;

        const isActive = time >= bar.start && time < bar.end;

        // Empty bar (outline)
        ctx.strokeStyle = isActive ? 'rgba(255, 107, 53, 0.8)' : 'rgba(255, 107, 53, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, BAR_HEIGHT, 13);
        ctx.stroke();

        // Fill based on whether on target
        if (isActive && pitch && isOnTarget(pitch, bar.targetPitch)) {
          // Update fill tracking
          if (!barFillsRef.current[bar.id]) {
            barFillsRef.current[bar.id] = { filledSegments: [], lastEnd: bar.start };
          }
          const fillState = barFillsRef.current[bar.id];
          const lastSeg = fillState.filledSegments[fillState.filledSegments.length - 1];

          if (lastSeg && time - lastSeg.end < 0.05) {
            lastSeg.end = time;
          } else {
            fillState.filledSegments.push({ start: fillState.lastEnd, end: time });
          }
          fillState.lastEnd = time;
        }

        // Draw filled segments
        const fills = barFillsRef.current[bar.id]?.filledSegments || [];
        fills.forEach(seg => {
          const segStartPercent = ((seg.start - bar.start) / bar.duration);
          const segEndPercent = ((seg.end - bar.start) / bar.duration);
          const segX = barX + segStartPercent * barWidth;
          const segW = (segEndPercent - segStartPercent) * barWidth;

          if (segW > 0) {
            ctx.fillStyle = 'rgba(255, 107, 53, 0.9)';
            ctx.shadowColor = 'rgba(255, 107, 53, 0.6)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.roundRect(segX, barY + (BAR_HEIGHT - FILL_HEIGHT) / 2, segW, FILL_HEIGHT, 10);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      });

      // Draw time cursor
      if (time >= winStart && time < winStart + winDur) {
        const cursorX = ((time - winStart) / winDur) * rect.width;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, TRACK_HEIGHT);
        ctx.stroke();
      }

      // Draw user pitch line
      if (pitch && pitch > 0) {
        const pitchY = pitchToY(pitch);

        // Glow effect
        ctx.shadowColor = 'rgba(255, 107, 53, 0.8)';
        ctx.shadowBlur = 15;

        // Horizontal line
        ctx.strokeStyle = 'rgba(255, 107, 53, 1)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, pitchY);
        ctx.lineTo(rect.width, pitchY);
        ctx.stroke();

        // Dot at current time
        if (time >= winStart && time < winStart + winDur) {
          const dotX = ((time - winStart) / winDur) * rect.width;
          ctx.fillStyle = '#ff6b35';
          ctx.beginPath();
          ctx.arc(dotX, pitchY, 8, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.shadowBlur = 0;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentTime, userPitch, visibleBars, windowStart, windowDuration, pitchToY, isOnTarget]);

  // Reset fills when notes change
  useEffect(() => {
    barFillsRef.current = {};
  }, [notes]);

  return (
    <div className="pitch-bars-container">
      <canvas
        ref={canvasRef}
        className="pitch-bars-canvas"
        style={{ width: '100%', height: `${TRACK_HEIGHT}px`, display: 'block' }}
      />
    </div>
  );
}
