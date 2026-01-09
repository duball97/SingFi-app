import { useMemo, useRef, useEffect, useState } from 'react';

// Pitch tolerance for "on target" - higher value = easier to hit notes
const PITCH_TOLERANCE = 300; // Hz tolerance (increased significantly for easier gameplay)

export default function PitchBars({ segments, currentTime, userPitch, notes, firstVerseStartTime }) {
  const WINDOW_DURATION = 5; // Show 5 seconds of notes at a time

  // Track fill progress for each bar
  const barFillsRef = useRef({});
  const animationFrameRef = useRef(null);
  const [, forceUpdate] = useState(0);

  // Use real notes if available, filtered by first verse start time
  const pitchBars = useMemo(() => {
    if (notes && Array.isArray(notes) && notes.length > 0) {
      let filteredNotes = notes;

      // Filter out notes before first verse starts
      if (firstVerseStartTime !== null && firstVerseStartTime !== undefined) {
        filteredNotes = notes.filter(note =>
          note.start >= firstVerseStartTime
        );
      }

      return filteredNotes.map((note, index) => ({
        id: `note-${index}`,
        start: note.start,
        end: note.end,
        duration: note.duration || (note.end - note.start),
        targetPitch: note.targetPitch,
      }));
    }
    return [];
  }, [notes, firstVerseStartTime]);

  // Filter segments to only include those after first verse starts
  const filteredSegments = useMemo(() => {
    if (!segments?.length) return [];

    if (firstVerseStartTime !== null && firstVerseStartTime !== undefined) {
      return segments.filter(seg => {
        const start = Number(seg.start) || 0;
        return start >= firstVerseStartTime;
      });
    }

    return segments;
  }, [segments, firstVerseStartTime]);

  // Find the current lyrics segment being displayed
  const currentSegment = useMemo(() => {
    if (!filteredSegments || filteredSegments.length === 0 || !currentTime) return null;

    // Find the segment that contains currentTime
    for (let i = 0; i < filteredSegments.length; i++) {
      const seg = filteredSegments[i];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;

      if (currentTime >= start && currentTime <= end) {
        return { start, end, index: i };
      }
    }

    // If no exact match, find the last segment that has started
    for (let i = filteredSegments.length - 1; i >= 0; i--) {
      const start = Number(filteredSegments[i].start) || 0;
      if (currentTime >= start) {
        const end = Number(filteredSegments[i].end) || 0;
        return { start, end, index: i };
      }
    }

    return null;
  }, [filteredSegments, currentTime]);

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
  // Extended range to show wider pitch ranges
  const PITCH_MIN = 40;
  const PITCH_MAX = 1600;
  const TRACK_HEIGHT = 200;
  const MARGIN = 20;
  const USABLE_HEIGHT = TRACK_HEIGHT - MARGIN * 2;

  const pitchToPosition = (pitch) => {
    // Don't clamp - show the actual pitch position even if outside range
    // Clamp to visible area only for display purposes
    let pitchPercent;
    if (pitch <= PITCH_MIN) {
      pitchPercent = 0;
    } else if (pitch >= PITCH_MAX) {
      pitchPercent = 1;
    } else {
      pitchPercent = (pitch - PITCH_MIN) / (PITCH_MAX - PITCH_MIN);
    }
    const yPos = TRACK_HEIGHT - MARGIN - (pitchPercent * USABLE_HEIGHT);
    // Clamp to visible track area
    return Math.max(MARGIN, Math.min(TRACK_HEIGHT - MARGIN, yPos));
  };

  // Track last known pitch to keep line visible during detection lag
  const lastPitchRef = useRef(null);

  useEffect(() => {
    if (userPitch && userPitch > 0) {
      lastPitchRef.current = userPitch;
    }
  }, [userPitch]);

  // Get user pitch position - use last known pitch if current is null (for smoother rendering)
  const userPitchY = useMemo(() => {
    const pitchToUse = userPitch || lastPitchRef.current;
    if (!pitchToUse || pitchToUse <= 0) {
      console.log('No pitch detected. userPitch:', userPitch, 'lastPitch:', lastPitchRef.current);
      return null;
    }
    const yPos = pitchToPosition(pitchToUse);
    console.log('Pitch:', pitchToUse.toFixed(1), 'Hz -> Y:', yPos.toFixed(1), 'px');
    return yPos;
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
          // Check if user is on target (with octave tolerance)
          // Allow matching within tolerance or in any octave (2x, 0.5x, etc.)
          let pitchDiff = Math.abs(userPitch - bar.targetPitch);
          let isOnTarget = pitchDiff <= PITCH_TOLERANCE;

          // Also check octave variations (singing an octave higher/lower)
          if (!isOnTarget && bar.targetPitch > 0) {
            const octaveUp = bar.targetPitch * 2;
            const octaveDown = bar.targetPitch / 2;
            const diffUp = Math.abs(userPitch - octaveUp);
            const diffDown = Math.abs(userPitch - octaveDown);
            isOnTarget = diffUp <= PITCH_TOLERANCE || diffDown <= PITCH_TOLERANCE;
            if (isOnTarget) {
              pitchDiff = Math.min(diffUp, diffDown);
            }
          }

          if (!barFillsRef.current[bar.id]) {
            barFillsRef.current[bar.id] = {
              filledSegments: [],
              lastCheckedTime: bar.start,
              wasOnTarget: false,
              wasClose: false
            };
          }

          const fillState = barFillsRef.current[bar.id];
          const timeSinceLastCheck = currentTime - fillState.lastCheckedTime;

          // Always update fills when on target for real-time smooth fills
          // Also allow partial fills when close (within 1.5x tolerance)
          const extendedTolerance = PITCH_TOLERANCE * 1.5;
          const isCloseEnough = pitchDiff <= extendedTolerance;

          if (isOnTarget || isCloseEnough) {
            // Calculate fill amount based on how close we are
            const fillAmount = isOnTarget ? 1.0 : Math.max(0.3, 1 - (pitchDiff - PITCH_TOLERANCE) / (extendedTolerance - PITCH_TOLERANCE));

            // Always update fill when on target or close for smooth, responsive fills
            const lastSegment = fillState.filledSegments[fillState.filledSegments.length - 1];
            const gapTolerance = 0.1; // Increased gap tolerance to 100ms for smoother fills

            if (lastSegment && lastSegment.end >= fillState.lastCheckedTime - gapTolerance) {
              // Extend existing segment to current time - this creates smooth continuous fills
              lastSegment.end = currentTime;
            } else {
              // Start new segment - use lastCheckedTime as start to avoid gaps
              const segmentStart = fillState.wasOnTarget || fillState.wasClose
                ? fillState.lastCheckedTime
                : Math.max(bar.start, fillState.lastCheckedTime);
              fillState.filledSegments.push({
                start: segmentStart,
                end: currentTime
              });
            }
            needsUpdate = true;
            fillState.wasOnTarget = isOnTarget;
            fillState.wasClose = isCloseEnough;
            fillState.lastCheckedTime = currentTime;
          } else {
            // Not on target or close - update lastCheckedTime to track progress
            fillState.wasOnTarget = false;
            fillState.wasClose = false;
            fillState.lastCheckedTime = currentTime;
          }
        }
      });

      // Update every frame for smooth, real-time fills
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



        {/* User's voice indicator - HORIZONTAL LINE ALWAYS VISIBLE across entire track */}
        {/* Show line if we have ANY pitch data (current or last known) */}
        {userPitchY !== null && (
          <>
            {/* Horizontal line showing user's pitch - spans entire width */}
            <div
              className="user-voice-line"
              style={{
                top: `${userPitchY}px`,
                width: '100%',
                opacity: userPitch ? 1 : 0.6, // Fade slightly if using last known pitch
              }}
            />
            {/* Dot at current time position for precise tracking */}
            {currentTime >= windowStart && currentTime < windowStart + windowDuration && (
              <div
                className="user-voice-dot"
                style={{
                  top: `${userPitchY}px`,
                  left: `${((currentTime - windowStart) / windowDuration) * 100}%`,
                  opacity: userPitch ? 1 : 0.6, // Fade slightly if using last known pitch
                }}
              />
            )}
          </>
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

          // Check if currently on target (for real-time indicator) with octave tolerance
          let isCurrentlyOnTarget = false;
          if (isActive && userPitch) {
            let pitchDiff = Math.abs(userPitch - bar.targetPitch);
            isCurrentlyOnTarget = pitchDiff <= PITCH_TOLERANCE;

            // Also check octave variations
            if (!isCurrentlyOnTarget && bar.targetPitch > 0) {
              const octaveUp = bar.targetPitch * 2;
              const octaveDown = bar.targetPitch / 2;
              isCurrentlyOnTarget =
                Math.abs(userPitch - octaveUp) <= PITCH_TOLERANCE ||
                Math.abs(userPitch - octaveDown) <= PITCH_TOLERANCE;
            }
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
              {/* NO FILLS HERE - fills appear at user's actual pitch position below */}
            </div>
          );
        })}

        {/* Render fills at USER'S ACTUAL PITCH POSITION - appears where they sing! */}
        {userPitchY !== null && pitchBars.map((bar) => {
          const barStartPercent = Math.max(0, ((bar.start - windowStart) / windowDuration) * 100);
          const barEndPercent = Math.min(100, ((bar.end - windowStart) / windowDuration) * 100);
          const barWidth = barEndPercent - barStartPercent;

          // Check if currently active
          const isActive = currentTime >= bar.start && currentTime < bar.end;
          if (!isActive) return null;

          // Get filled segments for this bar
          const fillState = barFillsRef.current[bar.id];
          const filledSegments = fillState?.filledSegments || [];

          // Check if currently on target (with octave tolerance)
          let isCurrentlyOnTarget = false;
          if (userPitch) {
            let pitchDiff = Math.abs(userPitch - bar.targetPitch);
            isCurrentlyOnTarget = pitchDiff <= PITCH_TOLERANCE;

            // Also check octave variations
            if (!isCurrentlyOnTarget && bar.targetPitch > 0) {
              const octaveUp = bar.targetPitch * 2;
              const octaveDown = bar.targetPitch / 2;
              isCurrentlyOnTarget =
                Math.abs(userPitch - octaveUp) <= PITCH_TOLERANCE ||
                Math.abs(userPitch - octaveDown) <= PITCH_TOLERANCE;
            }
          }

          // Only render fills if on target or have filled segments
          if (!isCurrentlyOnTarget && filledSegments.length === 0) return null;

          const fillHeight = 20; // Height of fill bars
          const fillTop = userPitchY - fillHeight / 2; // Position at user's actual pitch

          return (
            <div key={`fill-${bar.id}`} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 15 }}>
              {/* Render filled segments at user's pitch position */}
              {filledSegments.map((segment, segIdx) => {
                const segmentStartPercent = ((segment.start - bar.start) / bar.duration) * 100;
                const segmentEndPercent = ((segment.end - bar.start) / bar.duration) * 100;

                // Calculate absolute position within track
                const clampedStart = Math.max(0, Math.min(100, segmentStartPercent));
                const clampedEnd = Math.max(0, Math.min(100, segmentEndPercent));
                const clampedWidth = clampedEnd - clampedStart;
                const clampedLeft = barStartPercent + (clampedStart / 100) * barWidth;
                const clampedWidthPx = (clampedWidth / 100) * barWidth;

                if (clampedWidthPx <= 0) return null;

                return (
                  <div
                    key={segIdx}
                    className="pitch-bar-fill user-pitch-fill"
                    style={{
                      left: `${clampedLeft}%`,
                      width: `${clampedWidthPx}%`,
                      height: `${fillHeight}px`,
                      top: `${fillTop}px`,
                    }}
                  />
                );
              })}

              {/* Real-time fill extension at user's actual pitch position */}
              {isCurrentlyOnTarget && userPitch && (() => {
                const lastSegment = filledSegments[filledSegments.length - 1];
                const fillStartPercent = lastSegment
                  ? ((lastSegment.end - bar.start) / bar.duration) * 100
                  : 0;
                const fillEndPercent = ((currentTime - bar.start) / bar.duration) * 100;
                const fillWidthPercent = Math.max(0, fillEndPercent - fillStartPercent);

                if (fillWidthPercent <= 0) return null;

                const fillLeft = barStartPercent + (fillStartPercent / 100) * barWidth;
                const fillWidthPx = (fillWidthPercent / 100) * barWidth;

                return (
                  <div
                    className="pitch-bar-fill user-pitch-fill realtime"
                    style={{
                      left: `${fillLeft}%`,
                      width: `${fillWidthPx}%`,
                      height: `${fillHeight}px`,
                      top: `${fillTop}px`,
                    }}
                  />
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
