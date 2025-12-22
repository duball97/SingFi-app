import { useMemo } from 'react';

export default function PitchBars({ segments, currentTime, userPitch, notes }) {
  // Use real notes if available, otherwise generate synthetic bars from segments
  const pitchBars = useMemo(() => {
    // ONLY use real notes from pitch extraction - no synthetic bars!
    if (notes && Array.isArray(notes) && notes.length > 0) {
      console.log('🎵 [PITCHBARS] Using REAL pitch notes:', notes.length);
      
      // Log first few notes for debugging
      if (notes.length > 0) {
        console.log('   → First 3 notes:', notes.slice(0, 3).map(n => ({
          start: n.start?.toFixed(2),
          end: n.end?.toFixed(2),
          pitch: n.targetPitch,
          duration: n.duration?.toFixed(2)
        })));
      }
      
      const mappedNotes = notes.map((note, index) => ({
        id: `note-${index}`,
        start: note.start,
        end: note.end,
        duration: note.duration || (note.end - note.start),
        targetPitch: note.targetPitch,
        segmentIndex: -1,
      }));
      
      // Check for timing issues
      const timeRange = mappedNotes.length > 0 
        ? `${mappedNotes[0].start.toFixed(2)}s - ${mappedNotes[mappedNotes.length - 1].end.toFixed(2)}s`
        : 'N/A';
      console.log(`   → Notes time range: ${timeRange}`);
      
      return mappedNotes;
    }

    // NO FALLBACK - Only show bars if we have real pitch data!
    console.log('⚠️ [PITCHBARS] No real pitch notes available - not showing any bars');
    console.log('   → Notes value:', notes);
    return [];
  }, [notes]);

  // Find bars that should be visible (current time + lookAhead, and keep visible while bar is active)
  // SingStar style: notes come from right, hit zone is on the left
  const visibleBars = useMemo(() => {
    if (!currentTime || currentTime === 0 || pitchBars.length === 0) {
      return [];
    }
    
    const lookAhead = 4; // Match the position calculation
    const lookBehind = 1; // Keep bars visible 1 second after they pass (for long bars)
    
    const windowStart = currentTime - lookBehind;
    const windowEnd = currentTime + lookAhead;
    
    // Show bar if:
    // 1. It's about to appear (start <= windowEnd)
    // 2. It hasn't fully passed yet (end >= windowStart)
    return pitchBars.filter(bar => bar.start <= windowEnd && bar.end >= windowStart);
  }, [pitchBars, currentTime]);

  // Find the active bar (the one the user should be matching)
  const activeBar = useMemo(() => {
    if (!currentTime || visibleBars.length === 0) return null;
    
    const active = visibleBars.find(bar => 
      currentTime >= bar.start && currentTime <= bar.end
    ) || visibleBars.find(bar => 
      currentTime >= bar.start && currentTime < bar.start + 0.2
    ) || null;
    
    // Debug logging for active bar
    if (active && currentTime % 1 < 0.1) { // Log roughly once per second
      console.log(`🎯 [PITCHBARS] Active bar at ${currentTime.toFixed(2)}s:`, {
        start: active.start.toFixed(2),
        end: active.end.toFixed(2),
        pitch: active.targetPitch,
        duration: active.duration.toFixed(2)
      });
    }
    
    return active;
  }, [visibleBars, currentTime]);

  // Calculate accuracy for active bar
  const accuracy = useMemo(() => {
    if (!activeBar || !userPitch) return 0;
    
    const diff = Math.abs(userPitch - activeBar.targetPitch);
    const maxDiff = 50; // Tighter tolerance for better accuracy
    const accuracy = Math.max(0, 100 - (diff / maxDiff) * 100);
    
    return accuracy;
  }, [activeBar, userPitch]);

  // Calculate position of bar (0-100% from right to left)
  // SingStar style: Hit line is on the LEFT (~15%), notes scroll from right to left
  // Simple linear formula: bar arrives at hit line when timeDiff = 0
  const getBarPosition = (bar) => {
    if (!currentTime || currentTime === 0) return 100;
    
    const timeDiff = bar.start - currentTime;
    const lookAhead = 4; // 4 seconds ahead (slower, more time to read)
    const hitLinePosition = 15; // Hit line is at 15% from left
    
    // Simple linear mapping:
    // timeDiff = 0 → position = hitLinePosition (15%)
    // timeDiff = lookAhead → position = 100%
    // timeDiff = negative → position < 15% (past hit line)
    const position = hitLinePosition + (timeDiff / lookAhead) * (100 - hitLinePosition);
    
    return Math.max(-10, Math.min(110, position));
  };

  // Calculate user pitch position on the track (SingStar style indicator)
  // Always show user pitch, not just when there's an active bar
  const getUserPitchPosition = useMemo(() => {
    if (!userPitch) return null;

    const minPitch = 100;
    const maxPitch = 600;
    const pitchRange = maxPitch - minPitch;
    const trackHeight = 300;
    const topMargin = 30;
    const bottomMargin = 30;
    const usableHeight = trackHeight - topMargin - bottomMargin;
    
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, userPitch));
    const pitchPercent = (clampedPitch - minPitch) / pitchRange;
    const topPosition = trackHeight - bottomMargin - (pitchPercent * usableHeight);
    
    return topPosition;
  }, [userPitch]);

  // Calculate target pitch position for active bar
  const getTargetPitchPosition = useMemo(() => {
    if (!activeBar) return null;

    const minPitch = 100;
    const maxPitch = 600;
    const pitchRange = maxPitch - minPitch;
    const trackHeight = 300;
    const topMargin = 30;
    const bottomMargin = 30;
    const usableHeight = trackHeight - topMargin - bottomMargin;
    
    const clampedPitch = Math.max(minPitch, Math.min(maxPitch, activeBar.targetPitch || 350));
    const pitchPercent = (clampedPitch - minPitch) / pitchRange;
    const topPosition = trackHeight - bottomMargin - (pitchPercent * usableHeight);
    
    return topPosition;
  }, [activeBar]);

  // Determine if user is above, below, or on target
  const pitchStatus = useMemo(() => {
    if (!userPitch || !activeBar) {
      return null;
    }

    const diff = userPitch - activeBar.targetPitch;
    const tolerance = 30; // Hz tolerance for "on target" (increased for better feedback)
    
    if (Math.abs(diff) <= tolerance) {
      return 'on-target';
    } else if (diff > 0) {
      return 'above';
    } else {
      return 'below';
    }
  }, [userPitch, activeBar]);
  
  // Calculate distance between user pitch and target (for visual feedback)
  const pitchDistance = useMemo(() => {
    if (!userPitch || !activeBar || !getUserPitchPosition || !getTargetPitchPosition) {
      return null;
    }
    return Math.abs(getUserPitchPosition - getTargetPitchPosition);
  }, [userPitch, activeBar, getUserPitchPosition, getTargetPitchPosition]);

  return (
    <div className="pitch-bars-container">
      <div className="pitch-bars-track">
        {/* Center line indicator (hit line) */}
        <div className="pitch-bars-center-line"></div>
        
        {/* Target pitch line (where the note should be) - Always visible when there's an active bar */}
        {activeBar && getTargetPitchPosition !== null && (
          <div 
            className="pitch-target-line"
            style={{
              top: `${getTargetPitchPosition}px`,
            }}
          >
            <div className="pitch-target-label">TARGET</div>
          </div>
        )}
        
        {/* Connecting line between user and target (when both exist) */}
        {activeBar && userPitch && getUserPitchPosition !== null && getTargetPitchPosition !== null && (
          <div 
            className={`pitch-connection-line ${pitchStatus || ''}`}
            style={{
              top: `${Math.min(getUserPitchPosition, getTargetPitchPosition)}px`,
              height: `${Math.abs(getUserPitchPosition - getTargetPitchPosition)}px`,
            }}
          />
        )}
        
        {/* User pitch indicator (SingStar style - shows where you're singing) - Always visible */}
        {userPitch && getUserPitchPosition !== null && (
          <div 
            className={`user-pitch-indicator ${pitchStatus || ''}`}
            style={{
              top: `${getUserPitchPosition}px`,
            }}
          >
            <div className="user-pitch-dot"></div>
            {pitchStatus && (
              <>
                <div className={`pitch-status-arrow ${pitchStatus}`}>
                  {pitchStatus === 'above' && '↑ TOO HIGH'}
                  {pitchStatus === 'below' && '↓ TOO LOW'}
                  {pitchStatus === 'on-target' && '✓ PERFECT'}
                </div>
                {pitchDistance !== null && pitchDistance > 5 && (
                  <div className="pitch-distance-indicator">
                    {Math.round(pitchDistance / 3)}Hz off
                  </div>
                )}
              </>
            )}
          </div>
        )}
        
        {/* Render visible bars */}
        {visibleBars.map((bar) => {
          const position = getBarPosition(bar);
          const isActive = activeBar?.id === bar.id;
          const isHit = isActive && userPitch && accuracy > 70;
          
          // Calculate bar height (fixed size)
          const barHeight = 40;
          
          // Calculate bar width as percentage based on duration
          // The bar should span (duration / lookAhead) * 85% of the visible width
          const lookAhead = 4; // Match position calculation
          const visiblePercent = 85; // 85% of screen (from 15% to 100%)
          const widthPercent = (bar.duration / lookAhead) * visiblePercent;
          // Clamp width to reasonable values (min 3%, max 50% of screen)
          const clampedWidthPercent = Math.max(3, Math.min(50, widthPercent));
          // Convert to vw units for responsive sizing
          const barWidth = `${clampedWidthPercent}vw`;
          
          // Position bar vertically based on pitch
          const minPitch = 100;
          const maxPitch = 600;
          const pitchRange = maxPitch - minPitch;
          const trackHeight = 300;
          const topMargin = 30;
          const bottomMargin = 30;
          const usableHeight = trackHeight - topMargin - bottomMargin;
          
          const clampedPitch = Math.max(minPitch, Math.min(maxPitch, bar.targetPitch || 350));
          const pitchPercent = (clampedPitch - minPitch) / pitchRange;
          const topPosition = trackHeight - bottomMargin - (pitchPercent * usableHeight) - (barHeight / 2);

          return (
            <div
              key={bar.id}
              className={`pitch-bar ${isActive ? 'active' : ''} ${isHit ? 'hit' : ''}`}
              style={{
                left: `${position}%`,
                top: `${topPosition}px`,
                height: `${barHeight}px`,
                width: barWidth, // Already includes 'vw' unit
              }}
            >
              {isActive && userPitch && (
                <div className="pitch-bar-accuracy" style={{ opacity: Math.max(0.3, accuracy / 100) }}>
                  {Math.round(accuracy)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
