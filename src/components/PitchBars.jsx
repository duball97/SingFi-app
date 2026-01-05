import { useMemo, useRef, useCallback } from 'react';

export default function PitchBars({ segments, currentTime, userPitch, notes }) {
  const WINDOW_DURATION = 5; // Show 5 seconds of notes at a time
  
  // Track fill progress for each bar
  const barFillsRef = useRef({});
  
  // Use real notes if available
  const pitchBars = useMemo(() => {
    if (notes && Array.isArray(notes) && notes.length > 0) {
      return notes.map((note, index) => ({
        id: `note-${index}`,
        start: note.start,
        end: note.end,
        duration: note.duration || (note.end - note.start),
        targetPitch: note.targetPitch,
      }));
    }
    return [];
  }, [notes]);

  // Calculate the current window start time
  const windowStart = useMemo(() => {
    if (!currentTime || pitchBars.length === 0) return 0;
    const windowIndex = Math.floor(currentTime / WINDOW_DURATION);
    return windowIndex * WINDOW_DURATION;
  }, [currentTime, pitchBars]);

  // Find bars visible in the current window
  const visibleBars = useMemo(() => {
    if (pitchBars.length === 0) return [];
    const windowEnd = windowStart + WINDOW_DURATION;
    return pitchBars.filter(bar => 
      bar.start < windowEnd && bar.end > windowStart
    );
  }, [pitchBars, windowStart]);

  // Calculate pitch to vertical position (inverted - higher pitch = higher on screen)
  const pitchToPosition = useCallback((pitch) => {
    const minPitch = 80;
    const maxPitch = 800;
    const trackHeight = 200;
    const margin = 20;
    const usableHeight = trackHeight - margin * 2;
    
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    const pitchPercent = (clampedPitch - minPitch) / (maxPitch - minPitch);
    // Higher pitch = lower Y value (higher on screen)
    return trackHeight - margin - (pitchPercent * usableHeight);
  }, []);

  // Get user pitch position
  const userPitchY = useMemo(() => {
    if (!userPitch) return null;
    return pitchToPosition(userPitch);
  }, [userPitch, pitchToPosition]);

  // Update bar fills when user is singing
  const updateBarFills = useCallback(() => {
    if (!userPitch || !currentTime) return;
    
    pitchBars.forEach(bar => {
      if (currentTime >= bar.start && currentTime <= bar.end) {
        const progress = ((currentTime - bar.start) / bar.duration) * 100;
        
        if (!barFillsRef.current[bar.id]) {
          barFillsRef.current[bar.id] = { maxProgress: 0 };
        }
        
        // Only update if we've progressed further
        if (progress > barFillsRef.current[bar.id].maxProgress) {
          barFillsRef.current[bar.id].maxProgress = progress;
        }
      }
    });
  }, [currentTime, userPitch, pitchBars]);

  // Call update on each render when singing
  if (userPitch && currentTime) {
    updateBarFills();
  }

  return (
    <div className="pitch-bars-container">
      <div className="pitch-bars-track">
        {/* Progress line showing current time within window */}
        {currentTime >= windowStart && currentTime < windowStart + WINDOW_DURATION && (
          <div 
            className="pitch-time-cursor"
            style={{
              left: `${((currentTime - windowStart) / WINDOW_DURATION) * 100}%`,
            }}
          />
        )}
        
        {/* User's voice indicator - always shows where they're singing */}
        {userPitch && userPitchY !== null && (
          <div 
            className="user-voice-indicator"
            style={{
              top: `${userPitchY}px`,
              left: `${((currentTime - windowStart) / WINDOW_DURATION) * 100}%`,
            }}
          />
        )}
        
        {/* Render the note bars */}
        {visibleBars.map((bar) => {
          const barHeight = 30;
          
          // Position based on time within the window
          const barStartPercent = Math.max(0, ((bar.start - windowStart) / WINDOW_DURATION) * 100);
          const barEndPercent = Math.min(100, ((bar.end - windowStart) / WINDOW_DURATION) * 100);
          const barWidth = barEndPercent - barStartPercent;
          
          // Vertical position based on pitch
          const barY = pitchToPosition(bar.targetPitch);
          const topPosition = barY - barHeight / 2;
          
          // Check if currently active
          const isActive = currentTime >= bar.start && currentTime < bar.end;
          
          // Get fill progress
          const storedFill = barFillsRef.current[bar.id]?.maxProgress || 0;
          
          // Calculate current fill if active
          let fillPercent = storedFill;
          let showFill = storedFill > 0;
          let fillOffsetY = 0;
          let isOnTarget = false;
          
          if (isActive && userPitch) {
            // Calculate progress through the bar
            const progress = ((currentTime - bar.start) / bar.duration) * 100;
            fillPercent = Math.max(fillPercent, progress);
            showFill = true;
            
            // Calculate offset based on pitch difference
            const pitchDiff = userPitch - bar.targetPitch;
            const tolerance = 80; // Hz tolerance for "on target"
            
            isOnTarget = Math.abs(pitchDiff) <= tolerance;
            
            if (!isOnTarget) {
              // Show fill at user's pitch position relative to bar
              fillOffsetY = barY - userPitchY; // Positive if singing higher
            }
          }

          return (
            <div
              key={bar.id}
              className={`pitch-bar-empty ${isActive ? 'active' : ''}`}
              style={{
                left: `${barStartPercent}%`,
                width: `${barWidth}%`,
                top: `${topPosition}px`,
                height: `${barHeight}px`,
              }}
            >
              {/* Fill that shows user's singing */}
              {showFill && fillPercent > 0 && (
                <div 
                  className={`pitch-bar-fill ${isOnTarget ? 'on-target' : ''}`}
                  style={{
                    width: `${fillPercent}%`,
                    height: `${barHeight}px`,
                    top: isActive && userPitch ? `${-fillOffsetY}px` : '0px',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
