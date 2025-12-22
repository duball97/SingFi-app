import { useMemo, useState, useEffect, useRef } from 'react';

export default function PitchBars({ segments, currentTime, userPitch, notes }) {
  // Smooth user pitch for display
  const [smoothedPitch, setSmoothedPitch] = useState(null);
  const pitchHistoryRef = useRef([]);
  
  // Smooth pitch changes for better visualization
  useEffect(() => {
    if (userPitch && userPitch > 50 && userPitch < 2000) {
      pitchHistoryRef.current.push(userPitch);
      // Keep last 5 readings for smoothing
      if (pitchHistoryRef.current.length > 5) {
        pitchHistoryRef.current.shift();
      }
      // Calculate median for noise reduction
      const sorted = [...pitchHistoryRef.current].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      setSmoothedPitch(median);
    } else if (!userPitch) {
      // Clear history when no pitch detected
      pitchHistoryRef.current = [];
      setSmoothedPitch(null);
    }
  }, [userPitch]);
  
  // Calculate the pitch range from the actual notes in the song
  const pitchRange = useMemo(() => {
    if (!notes || notes.length === 0) {
      return { min: 150, max: 500, center: 325 }; // Default range
    }
    
    const pitches = notes.map(n => n.targetPitch).filter(p => p > 50 && p < 2000);
    if (pitches.length === 0) {
      return { min: 150, max: 500, center: 325 };
    }
    
    const minPitch = Math.min(...pitches);
    const maxPitch = Math.max(...pitches);
    
    // Add 30% padding above and below for user pitch display
    const range = maxPitch - minPitch;
    const padding = Math.max(50, range * 0.3);
    
    return {
      min: Math.max(50, minPitch - padding),
      max: Math.min(2000, maxPitch + padding),
      center: (minPitch + maxPitch) / 2,
      songMin: minPitch,
      songMax: maxPitch
    };
  }, [notes]);

  // Use real notes only
  const pitchBars = useMemo(() => {
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return [];
    }
    
    return notes.map((note, index) => ({
      id: `note-${index}`,
      start: note.start,
      end: note.end,
      duration: note.duration || (note.end - note.start),
      targetPitch: note.targetPitch,
    }));
  }, [notes]);

  // Find current segment
  const currentSegment = useMemo(() => {
    if (!segments || segments.length === 0 || !currentTime) return null;
    
    for (const seg of segments) {
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      if (currentTime >= start && currentTime <= end) {
        return seg;
      }
    }
    
    // Find last segment that started
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= Number(segments[i].start)) {
        return segments[i];
      }
    }
    
    return segments[0] || null;
  }, [segments, currentTime]);

  // Get visible bars for current verse - show ALL notes in the current segment
  const visibleBars = useMemo(() => {
    if (!currentTime || pitchBars.length === 0 || !currentSegment) {
      return [];
    }
    
    const segmentStart = Number(currentSegment.start) || 0;
    const segmentEnd = Number(currentSegment.end) || 0;
    
    // Get ALL notes that overlap with this segment
    const segmentNotes = pitchBars.filter(bar => 
      bar.start < segmentEnd && bar.end > segmentStart
    );
    
    segmentNotes.sort((a, b) => a.start - b.start);
    
    // Return up to 6 notes per verse
    return segmentNotes.slice(0, 6);
  }, [pitchBars, currentTime, currentSegment]);

  // Find the currently active note
  const activeBar = useMemo(() => {
    if (!currentTime || visibleBars.length === 0) return null;
    
    // Find the note we're currently in
    return visibleBars.find(bar => 
      currentTime >= bar.start && currentTime <= bar.end
    ) || null;
  }, [visibleBars, currentTime]);

  // Calculate accuracy percentage
  const accuracy = useMemo(() => {
    if (!activeBar || !smoothedPitch) return 0;
    
    const diff = Math.abs(smoothedPitch - activeBar.targetPitch);
    // Use dynamic tolerance based on pitch (higher pitches have more variance)
    const tolerance = Math.max(30, activeBar.targetPitch * 0.1);
    const acc = Math.max(0, 100 - (diff / tolerance) * 50);
    
    return Math.min(100, acc);
  }, [activeBar, smoothedPitch]);

  // Pitch status (above/below/on-target)
  const pitchStatus = useMemo(() => {
    if (!smoothedPitch || !activeBar) return null;
    
    const diff = smoothedPitch - activeBar.targetPitch;
    // Dynamic tolerance
    const tolerance = Math.max(25, activeBar.targetPitch * 0.08);
    
    if (Math.abs(diff) <= tolerance) return 'on-target';
    return diff > 0 ? 'above' : 'below';
  }, [smoothedPitch, activeBar]);

  // Convert pitch to Y position on screen
  const pitchToY = (pitch) => {
    const trackHeight = 300;
    const topMargin = 20;
    const bottomMargin = 20;
    const usableHeight = trackHeight - topMargin - bottomMargin;
    
    // Normalize pitch to 0-1 range based on song's pitch range
    const normalizedPitch = (pitch - pitchRange.min) / (pitchRange.max - pitchRange.min);
    // Clamp to 0-1
    const clamped = Math.max(0, Math.min(1, normalizedPitch));
    // Invert (higher pitch = higher on screen = lower Y)
    const y = trackHeight - bottomMargin - (clamped * usableHeight);
    
    return y;
  };

  // User's current pitch position
  const userPitchY = smoothedPitch ? pitchToY(smoothedPitch) : null;
  
  // Target pitch position (when there's an active bar)
  const targetPitchY = activeBar ? pitchToY(activeBar.targetPitch) : null;

  // Calculate bar position (horizontal) based on time within segment
  const getBarPositionInSegment = (bar, index, total) => {
    if (!currentSegment) return 50;
    
    const segStart = Number(currentSegment.start);
    const segEnd = Number(currentSegment.end);
    const segDuration = segEnd - segStart;
    
    if (segDuration <= 0) return 20 + (index * 60 / Math.max(1, total - 1));
    
    // Position bar based on its time within the segment
    const barCenter = (bar.start + bar.end) / 2;
    const relativeTime = (barCenter - segStart) / segDuration;
    
    // Map to 10% - 90% of screen width
    return 10 + (relativeTime * 80);
  };

  // Get width of bar based on duration
  const getBarWidth = (bar) => {
    if (!currentSegment) return 8;
    
    const segStart = Number(currentSegment.start);
    const segEnd = Number(currentSegment.end);
    const segDuration = segEnd - segStart;
    
    if (segDuration <= 0) return 8;
    
    // Width proportional to duration (as percentage of segment)
    const durationPercent = (bar.duration / segDuration) * 80;
    return Math.max(4, Math.min(25, durationPercent));
  };

  return (
    <div className="pitch-bars-container">
      <div className="pitch-bars-track">
        {/* Horizontal pitch guide lines */}
        <div className="pitch-guide-lines">
          <div className="pitch-guide-line high" style={{ top: '15%' }}>
            <span className="pitch-guide-label">HIGH</span>
          </div>
          <div className="pitch-guide-line mid" style={{ top: '50%' }}>
            <span className="pitch-guide-label">MID</span>
          </div>
          <div className="pitch-guide-line low" style={{ top: '85%' }}>
            <span className="pitch-guide-label">LOW</span>
          </div>
        </div>
        
        {/* Target pitch indicator (golden bar where you should sing) */}
        {activeBar && targetPitchY !== null && (
          <div 
            className="target-pitch-bar"
            style={{ top: `${targetPitchY}px` }}
          >
            <div className="target-pitch-marker">
              <span className="target-label">♪ TARGET</span>
            </div>
          </div>
        )}
        
        {/* Render note bars */}
        {visibleBars.map((bar, index) => {
          const position = getBarPositionInSegment(bar, index, visibleBars.length);
          const barWidth = getBarWidth(bar);
          const barY = pitchToY(bar.targetPitch);
          const isActive = activeBar?.id === bar.id;
          const isHit = isActive && smoothedPitch && accuracy >= 70;
          const isPast = currentTime > bar.end;
          const isFuture = currentTime < bar.start;
          
          // Calculate where user pitch intersects this bar (for per-bar feedback)
          let userHitY = null;
          let barHitStatus = null;
          if (isActive && smoothedPitch) {
            userHitY = pitchToY(smoothedPitch);
            const diff = smoothedPitch - bar.targetPitch;
            const tolerance = Math.max(25, bar.targetPitch * 0.08);
            if (Math.abs(diff) <= tolerance) barHitStatus = 'on-target';
            else barHitStatus = diff > 0 ? 'above' : 'below';
          }

          return (
            <div
              key={bar.id}
              className={`pitch-bar-note ${isActive ? 'active' : ''} ${isHit ? 'hit' : ''} ${isPast ? 'past' : ''} ${isFuture ? 'future' : ''}`}
              style={{
                left: `${position}%`,
                top: `${barY - 25}px`, // Center bar vertically on pitch
                width: `${barWidth}%`,
                height: '50px',
              }}
            >
              <div className="note-glow"></div>
              <div className="note-inner">
                {/* Pitch value label */}
                <span className="note-pitch-label">{bar.targetPitch}Hz</span>
              </div>
              
              {/* Per-bar user hit indicator */}
              {isActive && userHitY !== null && (
                <div 
                  className={`bar-hit-indicator ${barHitStatus || ''}`}
                  style={{ 
                    top: `${userHitY - barY + 25}px`, // Relative to bar
                  }}
                >
                  <div className="hit-marker"></div>
                </div>
              )}
              
              {/* Accuracy display */}
              {isActive && smoothedPitch && (
                <div className={`bar-accuracy ${barHitStatus || ''}`}>
                  {accuracy >= 70 ? '✓' : Math.round(accuracy) + '%'}
                </div>
              )}
            </div>
          );
        })}
        
        {/* User pitch indicator - horizontal line across screen */}
        {userPitchY !== null && (
          <div 
            className={`user-pitch-beam ${pitchStatus || 'no-target'}`}
            style={{ top: `${userPitchY}px` }}
          >
            {/* Glowing orb at the left side */}
            <div className="pitch-orb">
              <div className="orb-core"></div>
              <div className="orb-glow"></div>
            </div>
            
            {/* Status text */}
            <div className="pitch-status-display">
              {activeBar ? (
                <>
                  <span className={`status-text ${pitchStatus}`}>
                    {pitchStatus === 'on-target' && '🎯 PERFECT!'}
                    {pitchStatus === 'above' && '⬆️ Too High'}
                    {pitchStatus === 'below' && '⬇️ Too Low'}
                  </span>
                  <span className="pitch-value">{Math.round(smoothedPitch)}Hz</span>
                </>
              ) : (
                <>
                  <span className="status-text neutral">🎤 Singing...</span>
                  <span className="pitch-value">{Math.round(smoothedPitch)}Hz</span>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* No pitch detected indicator */}
        {!smoothedPitch && !userPitch && (
          <div className="no-pitch-indicator">
            <span>🎤 Sing into the mic!</span>
          </div>
        )}
        
        {/* Distance indicator connecting user to target */}
        {activeBar && userPitchY !== null && targetPitchY !== null && Math.abs(userPitchY - targetPitchY) > 10 && (
          <div 
            className={`pitch-distance-line ${pitchStatus || ''}`}
            style={{
              top: `${Math.min(userPitchY, targetPitchY)}px`,
              height: `${Math.abs(userPitchY - targetPitchY)}px`,
              left: '8%',
            }}
          >
            <span className="distance-label">
              {Math.abs(Math.round(smoothedPitch - activeBar.targetPitch))}Hz
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
