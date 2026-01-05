import { useMemo } from 'react';

export default function PitchBars({ segments, currentTime, userPitch, notes }) {
  const WINDOW_DURATION = 5; // Show 5 seconds of notes at a time
  
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

  // Calculate the current window start time (snaps to 5-second intervals based on content)
  const windowStart = useMemo(() => {
    if (!currentTime || pitchBars.length === 0) return 0;
    
    // Find the first bar that contains or is after current time
    const currentOrNextBar = pitchBars.find(bar => bar.end >= currentTime);
    if (!currentOrNextBar) return currentTime;
    
    // Window starts at the beginning of the current bar's phrase
    // Or snap to 5-second windows
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

  // Calculate pitch to vertical position
  const pitchToPosition = (pitch) => {
    const minPitch = 100;
    const maxPitch = 600;
    const trackHeight = 200;
    const margin = 20;
    const usableHeight = trackHeight - margin * 2;
    
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    const pitchPercent = (clampedPitch - minPitch) / (maxPitch - minPitch);
    return trackHeight - margin - (pitchPercent * usableHeight);
  };

  // Get user pitch position
  const userPitchPosition = useMemo(() => {
    if (!userPitch) return null;
    return pitchToPosition(userPitch);
  }, [userPitch]);

  // Find active bar (for highlighting user pitch indicator)
  const activeBar = useMemo(() => {
    if (!currentTime || visibleBars.length === 0) return null;
    return visibleBars.find(bar => 
      currentTime >= bar.start && currentTime < bar.end
    ) || null;
  }, [visibleBars, currentTime]);

  // Check if user is on target
  const isOnTarget = useMemo(() => {
    if (!userPitch || !activeBar) return false;
    return Math.abs(userPitch - activeBar.targetPitch) <= 50;
  }, [userPitch, activeBar]);

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
        
        {/* User's voice indicator - ALWAYS shows where they're singing in real-time */}
        {userPitch && userPitchPosition !== null && (
          <div 
            className={`user-voice-indicator ${isOnTarget ? 'on-target' : ''}`}
            style={{
              top: `${userPitchPosition}px`,
              left: `${((currentTime - windowStart) / WINDOW_DURATION) * 100}%`,
            }}
          />
        )}
        
        {/* Render the note bars - STATIC positions within the 5-second window */}
        {visibleBars.map((bar) => {
          const barHeight = 30;
          
          // Position based on time within the window (0% to 100%)
          const barStartPercent = Math.max(0, ((bar.start - windowStart) / WINDOW_DURATION) * 100);
          const barEndPercent = Math.min(100, ((bar.end - windowStart) / WINDOW_DURATION) * 100);
          const barWidth = barEndPercent - barStartPercent;
          
          // Vertical position based on pitch
          const barCenterY = pitchToPosition(bar.targetPitch);
          const topPosition = barCenterY - barHeight / 2;
          
          const isActive = activeBar?.id === bar.id;
          
          // Calculate fill - shows user's pitch position relative to the bar
          let fillPercent = 0;
          let fillTop = 0;
          let fillHeight = 0;
          let fillClass = '';
          
          if (isActive && userPitch && currentTime >= bar.start && currentTime <= bar.end) {
            // User is singing during this bar - fill progresses with time
            const progress = (currentTime - bar.start) / bar.duration;
            fillPercent = Math.min(100, progress * 100);
            
            // Calculate where user's pitch is relative to the bar center
            const userPitchY = userPitchPosition;
            const barTop = barCenterY - barHeight / 2;
            const barBottom = barCenterY + barHeight / 2;
            const pitchDiff = userPitch - bar.targetPitch;
            const tolerance = 50; // Hz tolerance for "on target"
            
            if (Math.abs(pitchDiff) <= tolerance) {
              // On target - fill the bar itself
              fillTop = 0;
              fillHeight = barHeight;
              fillClass = 'on-target';
            } else if (pitchDiff > 0) {
              // Too high - fill extends from bar top upward to user's pitch
              const distanceAbove = userPitchY - barTop;
              fillTop = -distanceAbove;
              fillHeight = distanceAbove + barHeight;
              fillClass = 'above';
            } else {
              // Too low - fill extends from bar bottom downward to user's pitch
              const distanceBelow = barBottom - userPitchY;
              fillTop = 0;
              fillHeight = barHeight + distanceBelow;
              fillClass = 'below';
            }
          } else if (isActive && userPitch && currentTime > bar.end) {
            // Bar finished - show final state
            const pitchDiff = userPitch - bar.targetPitch;
            fillPercent = 100;
            if (Math.abs(pitchDiff) <= 50) {
              fillTop = 0;
              fillHeight = barHeight;
              fillClass = 'on-target';
            } else if (pitchDiff > 0) {
              const userPitchY = userPitchPosition;
              const barTop = barCenterY - barHeight / 2;
              const distanceAbove = userPitchY - barTop;
              fillTop = -distanceAbove;
              fillHeight = distanceAbove + barHeight;
              fillClass = 'above';
            } else {
              const userPitchY = userPitchPosition;
              const barBottom = barCenterY + barHeight / 2;
              const distanceBelow = barBottom - userPitchY;
              fillTop = 0;
              fillHeight = barHeight + distanceBelow;
              fillClass = 'below';
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
              {/* Orange fill - shows where user's pitch is (in bar, above, or below) */}
              {fillPercent > 0 && userPitch && (
                <div 
                  className={`pitch-bar-fill ${fillClass}`}
                  style={{
                    width: `${fillPercent}%`,
                    top: `${fillTop}px`,
                    height: `${fillHeight}px`,
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
