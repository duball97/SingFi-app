import { useMemo, useRef, useEffect, useState } from 'react';

// Pitch tolerance for "on target" - higher value = easier to hit notes
const PITCH_TOLERANCE = 150; // Hz tolerance (increased from 80 for easier gameplay)

export default function PitchBars({ segments, currentTime, userPitch, notes }) {
  const WINDOW_DURATION = 5; // Show 5 seconds of notes at a time
  
  // Track fill progress for each bar
  const barFillsRef = useRef({});
  const animationFrameRef = useRef(null);
  const [, forceUpdate] = useState(0);
  
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

  // Find the current lyrics segment being displayed
  const currentSegment = useMemo(() => {
    if (!segments || segments.length === 0 || !currentTime) return null;
    
    // Find the segment that contains currentTime
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      
      if (currentTime >= start && currentTime <= end) {
        return { start, end, index: i };
      }
    }
    
    // If no exact match, find the last segment that has started
    for (let i = segments.length - 1; i >= 0; i--) {
      const start = Number(segments[i].start) || 0;
      if (currentTime >= start) {
        const end = Number(segments[i].end) || 0;
        return { start, end, index: i };
      }
    }
    
    return null;
  }, [segments, currentTime]);

  // Calculate window duration - use segment duration if available
  const windowDuration = useMemo(() => {
    if (currentSegment) {
      return currentSegment.end - currentSegment.start;
    }
    return WINDOW_DURATION;
  }, [currentSegment]);

  // Calculate the current window start time - based on current segment if available
  const windowStart = useMemo(() => {
    if (!currentTime || pitchBars.length === 0) return 0;
    
    // If we have a current segment, use its start time as window start
    if (currentSegment) {
      return currentSegment.start;
    }
    
    // Fallback to 5-second windows
    const windowIndex = Math.floor(currentTime / WINDOW_DURATION);
    return windowIndex * WINDOW_DURATION;
  }, [currentTime, pitchBars, currentSegment]);

  // Find bars visible - only show bars for the current lyrics segment
  const visibleBars = useMemo(() => {
    if (pitchBars.length === 0) return [];
    
    if (currentSegment) {
      // Only show bars that overlap with the current segment
      return pitchBars.filter(bar => 
        bar.start < currentSegment.end && bar.end > currentSegment.start
      );
    }
    
    // Fallback: show bars in the current window if no segment
    const windowEnd = windowStart + WINDOW_DURATION;
    return pitchBars.filter(bar => 
      bar.start < windowEnd && bar.end > windowStart
    );
  }, [pitchBars, currentSegment, windowStart]);

  // Calculate pitch to vertical position - memoized constants
  const PITCH_MIN = 80;
  const PITCH_MAX = 800;
  const TRACK_HEIGHT = 200;
  const MARGIN = 20;
  const USABLE_HEIGHT = TRACK_HEIGHT - MARGIN * 2;
  
  const pitchToPosition = (pitch) => {
    const clampedPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
    const pitchPercent = (clampedPitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN);
    return TRACK_HEIGHT - MARGIN - (pitchPercent * USABLE_HEIGHT);
  };

  // Get user pitch position
  const userPitchY = useMemo(() => {
    if (!userPitch) return null;
    return pitchToPosition(userPitch);
  }, [userPitch]);

  // Reset fill state when notes change
  useEffect(() => {
    barFillsRef.current = {};
    forceUpdate(prev => prev + 1);
  }, [notes]);

  // Smooth animation loop using requestAnimationFrame - tracks partial fills
  useEffect(() => {
    if (!userPitch || !currentTime) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 16; // ~60fps
    const FILL_CHECK_INTERVAL = 0.016; // Check every ~16ms (60fps) for fast-paced songs
    
    const animate = (timestamp) => {
      // Throttle updates to ~60fps
      if (timestamp - lastUpdateTime < UPDATE_INTERVAL) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastUpdateTime = timestamp;
      
      // Update fills only for active bars - only fill when on target
      let needsUpdate = false;
      
      pitchBars.forEach(bar => {
        if (currentTime >= bar.start && currentTime <= bar.end) {
          // Check if user is on target
          const pitchDiff = Math.abs(userPitch - bar.targetPitch);
          const isOnTarget = pitchDiff <= PITCH_TOLERANCE;
          
          if (!barFillsRef.current[bar.id]) {
            barFillsRef.current[bar.id] = { 
              filledSegments: [],
              lastCheckedTime: bar.start,
              wasOnTarget: false
            };
          }
          
          const fillState = barFillsRef.current[bar.id];
          const timeSinceLastCheck = currentTime - fillState.lastCheckedTime;
          
          // For fast-paced songs, always update fills when on target
          // Only use interval for reducing computation when not on target
          if (isOnTarget) {
            // Always update fill when on target for smooth, responsive fills
            const lastSegment = fillState.filledSegments[fillState.filledSegments.length - 1];
            const gapTolerance = 0.05; // 50ms gap tolerance
            
            if (lastSegment && lastSegment.end >= fillState.lastCheckedTime - gapTolerance) {
              // Extend existing segment to current time
              lastSegment.end = currentTime;
            } else {
              // Start new segment - use lastCheckedTime as start to avoid gaps
              const segmentStart = fillState.wasOnTarget 
                ? fillState.lastCheckedTime 
                : Math.max(bar.start, fillState.lastCheckedTime);
              fillState.filledSegments.push({
                start: segmentStart,
                end: currentTime
              });
            }
            needsUpdate = true;
            fillState.wasOnTarget = true;
            fillState.lastCheckedTime = currentTime;
          } else {
            // Not on target - only update lastCheckedTime at intervals to reduce computation
            if (timeSinceLastCheck >= FILL_CHECK_INTERVAL) {
              fillState.wasOnTarget = false;
              fillState.lastCheckedTime = currentTime;
            }
          }
        }
      });
      
      // Force update more frequently to show fills in real-time
      if (needsUpdate) {
        forceUpdate(prev => prev + 1);
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [currentTime, userPitch, pitchBars]);

  return (
    <div className="pitch-bars-container">
      <div className="pitch-bars-track">
        {/* Progress line showing current time within window */}
        {currentTime >= windowStart && currentTime < windowStart + windowDuration && (
          <div 
            className="pitch-time-cursor"
            style={{
              left: `${((currentTime - windowStart) / windowDuration) * 100}%`,
            }}
          />
        )}
        
        {/* User's voice indicator - always shows where they're singing */}
        {userPitch && userPitchY !== null && (
          <div 
            className="user-voice-indicator"
            style={{
              top: `${userPitchY}px`,
              left: `${((currentTime - windowStart) / windowDuration) * 100}%`,
            }}
          />
        )}
        
        {/* Render the note bars */}
        {visibleBars.map((bar) => {
          const barHeight = 30;
          
          // Position based on time within the window
          const barStartPercent = Math.max(0, ((bar.start - windowStart) / windowDuration) * 100);
          const barEndPercent = Math.min(100, ((bar.end - windowStart) / windowDuration) * 100);
          const barWidth = barEndPercent - barStartPercent;
          
          // Vertical position based on pitch
          const barY = pitchToPosition(bar.targetPitch);
          const topPosition = barY - barHeight / 2;
          
          // Check if currently active
          const isActive = currentTime >= bar.start && currentTime < bar.end;
          
          // Get filled segments for this bar
          const fillState = barFillsRef.current[bar.id];
          const filledSegments = fillState?.filledSegments || [];
          
          // Check if currently on target (for real-time indicator)
          let isCurrentlyOnTarget = false;
          if (isActive && userPitch) {
            const pitchDiff = Math.abs(userPitch - bar.targetPitch);
            isCurrentlyOnTarget = pitchDiff <= PITCH_TOLERANCE;
          }

          return (
            <div
              key={bar.id}
              className={`pitch-bar-empty ${isActive ? 'active' : ''}`}
              style={{
                left: `${barStartPercent}%`,
                top: `${topPosition}px`,
                width: `${barWidth}%`,
                height: `${barHeight}px`,
              }}
            >
              {/* Render filled segments - only parts where user was on target */}
              {filledSegments.map((segment, segIdx) => {
                // Calculate segment position and width within the bar
                const segmentStartPercent = ((segment.start - bar.start) / bar.duration) * 100;
                const segmentEndPercent = ((segment.end - bar.start) / bar.duration) * 100;
                const segmentWidth = segmentEndPercent - segmentStartPercent;
                
                // Clamp to bar bounds
                const clampedStart = Math.max(0, Math.min(100, segmentStartPercent));
                const clampedEnd = Math.max(0, Math.min(100, segmentEndPercent));
                const clampedWidth = clampedEnd - clampedStart;
                
                if (clampedWidth <= 0) return null;
                
                return (
                  <div
                    key={segIdx}
                    className="pitch-bar-fill on-target"
                    style={{
                      left: `${clampedStart}%`,
                      width: `${clampedWidth}%`,
                      height: `${barHeight}px`,
                      top: '0px',
                    }}
                  />
                );
              })}
              
              {/* Real-time fill indicator if currently on target */}
              {isActive && isCurrentlyOnTarget && userPitch && (
                <div 
                  className="pitch-bar-fill on-target realtime"
                  style={{
                    left: `${((currentTime - bar.start) / bar.duration) * 100}%`,
                    width: '2px',
                    height: `${barHeight}px`,
                    top: '0px',
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
