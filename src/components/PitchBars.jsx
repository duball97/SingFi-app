import { useMemo } from 'react';

export default function PitchBars({ segments, currentTime, userPitch, notes }) {
  // Use real notes if available, otherwise generate synthetic bars from segments
  const pitchBars = useMemo(() => {
    // If we have real notes from pitch extraction, use those!
    if (notes && Array.isArray(notes) && notes.length > 0) {
      console.log('🎵 Using REAL pitch notes:', notes.length);
      return notes.map((note, index) => ({
        id: `note-${index}`,
        start: note.start,
        end: note.end,
        duration: note.duration || (note.end - note.start),
        targetPitch: note.targetPitch,
        segmentIndex: -1, // Notes don't map to segments
      }));
    }

    // Fallback: Generate synthetic bars from segments (old method)
    if (!segments || segments.length === 0) return [];
    console.log('⚠️ No real notes available, generating synthetic bars from segments');

    const bars = [];
    let firstSingingStart = null;
    
    // First pass: find when actual singing starts (skip intro/silence)
    segments.forEach((segment) => {
      const start = typeof segment.start === 'number' ? segment.start : parseFloat(segment.start || 0);
      const text = segment.text || '';
      // If segment has meaningful text (not just silence/pauses), mark as singing start
      if (text.trim().length > 3 && firstSingingStart === null) {
        firstSingingStart = start;
      }
    });

    // If no singing found, use first segment
    if (firstSingingStart === null && segments.length > 0) {
      firstSingingStart = typeof segments[0].start === 'number' 
        ? segments[0].start 
        : parseFloat(segments[0].start || 0);
    }

    segments.forEach((segment, index) => {
      const start = typeof segment.start === 'number' ? segment.start : parseFloat(segment.start || 0);
      const end = typeof segment.end === 'number' ? segment.end : parseFloat(segment.end || 0);
      const text = segment.text || '';
      const duration = end - start;

      // Skip segments before singing starts or with no text
      if (start < firstSingingStart || text.trim().length < 2) {
        return;
      }

      // Generate bars with varied lengths like SingStar
      // Strategy: Create a mix of short, medium, and long notes
      // Short notes: 0.2-0.5s (quick syllables)
      // Medium notes: 0.6-1.2s (normal words)
      // Long notes: 1.5-3.0s (held notes, vowels)
      
      let currentPos = start;
      let barIndex = 0;
      
      while (currentPos < end) {
        // Determine note length based on position in segment - DETERMINISTIC (no Math.random)
        // Use a pattern: some short, some medium, some long
        const noteType = (index + barIndex) % 5;
        let barDuration;
        
        // Use deterministic pseudo-random based on index and barIndex
        const seed = (index * 1000 + barIndex * 100) % 1000;
        const pseudoRandom = seed / 1000; // 0 to 1
        
        if (noteType === 0 || noteType === 1) {
          // Short notes (40% of bars) - 0.2 to 0.5s
          barDuration = 0.2 + (pseudoRandom * 0.3);
        } else if (noteType === 2 || noteType === 3) {
          // Medium notes (40% of bars) - 0.6 to 1.2s
          barDuration = 0.6 + (pseudoRandom * 0.6);
        } else {
          // Long notes (20% of bars) - 1.5 to 2.5s
          barDuration = 1.5 + (pseudoRandom * 1.0);
        }
        
        // Don't exceed segment end
        const barStart = currentPos;
        const barEnd = Math.min(currentPos + barDuration, end);
        const actualDuration = barEnd - barStart;
        
        // Skip if bar is too short (less than 0.15s)
        if (actualDuration < 0.15) {
          currentPos = end;
          continue;
        }
        
        // Generate varied target pitch (Hz) - typical singing range is 100-600 Hz
        // Create more variation using multiple sine waves
        const basePitch = 250 + (index % 7) * 40; // Base varies 250-490 Hz
        const wave1 = Math.sin((index * 0.7 + barIndex * 0.3)) * 80;
        const wave2 = Math.cos((index * 0.5 + barIndex * 0.2)) * 50;
        const variation = wave1 + wave2;
        const targetPitch = basePitch + variation;

        bars.push({
          id: `${index}-${barIndex}`,
          start: barStart,
          end: barEnd,
          duration: actualDuration,
          targetPitch: Math.max(100, Math.min(600, targetPitch)),
          segmentIndex: index,
        });
        
        currentPos = barEnd;
        barIndex++;
      }
    });

    return bars;
  }, [segments]);

  // Find bars that should be visible (current time + 4 seconds ahead, 2 seconds behind)
  const visibleBars = useMemo(() => {
    if (!currentTime || currentTime === 0) {
      // If no currentTime, show first 20 bars
      return pitchBars.slice(0, 20);
    }
    
    const windowStart = currentTime - 2; // Show bars 2s past center
    const windowEnd = currentTime + 4; // Show bars 4s ahead
    
    return pitchBars.filter(bar => bar.start <= windowEnd && bar.end >= windowStart);
  }, [pitchBars, currentTime]);

  // Find the active bar (the one the user should be matching)
  const activeBar = useMemo(() => {
    if (!currentTime) return null;
    
    return visibleBars.find(bar => 
      currentTime >= bar.start && currentTime <= bar.end
    ) || visibleBars.find(bar => 
      currentTime >= bar.start && currentTime < bar.start + 0.3
    ) || null;
  }, [visibleBars, currentTime]);

  // Calculate accuracy for active bar
  const accuracy = useMemo(() => {
    if (!activeBar || !userPitch) return 0;
    
    const diff = Math.abs(userPitch - activeBar.targetPitch);
    const maxDiff = 100; // Maximum acceptable difference
    const accuracy = Math.max(0, 100 - (diff / maxDiff) * 100);
    
    return accuracy;
  }, [activeBar, userPitch]);

  // Calculate position of bar (0-100% from right to left)
  // Bars start at 100% (right) and move to left, passing center at 50%, continuing to ~20%
  // Center line is at 50% - this is where user should match
  const getBarPosition = (bar) => {
    if (!currentTime || currentTime === 0) {
      // If no currentTime, position bars based on their start time relative to visible bars
      if (visibleBars.length === 0) {
        // Fallback: use all pitchBars if visibleBars is empty
        if (pitchBars.length === 0) return 100;
        const firstBarStart = pitchBars[0]?.start || bar.start;
        const lastBarStart = pitchBars[pitchBars.length - 1]?.start || bar.start;
        const timeRange = Math.max(6, lastBarStart - firstBarStart);
        const timeDiff = bar.start - firstBarStart;
        const normalized = Math.min(1, Math.max(0, timeDiff / timeRange));
        return 100 - (normalized * 80);
      }
      const firstBarStart = visibleBars[0]?.start || bar.start;
      const lastBarStart = visibleBars[visibleBars.length - 1]?.start || bar.start;
      const timeRange = Math.max(6, lastBarStart - firstBarStart); // At least 6 second window
      const timeDiff = bar.start - firstBarStart;
      // Position bars from right (100%) to left (20%) based on their relative start times
      // Bars that start later appear more to the right
      const normalized = Math.min(1, Math.max(0, timeDiff / timeRange));
      return 100 - (normalized * 80); // 100% (right) to 20% (left)
    }
    
    const timeDiff = bar.start - currentTime;
    // Bars appear 4 seconds ahead and disappear 2 seconds after passing center
    const lookAhead = 4; // How far ahead bars appear (right side)
    const lookBehind = 2; // How far past center bars continue (left side)
    const totalWindow = lookAhead + lookBehind;
    
    // Position calculation:
    // When bar.start is 4s ahead of currentTime → position = 100% (right edge)
    // When bar.start equals currentTime → position = 50% (center line)
    // When bar.start is 2s past currentTime → position = 20% (left, past center)
    // Position: 100% when 4s ahead, 50% when at current time, 20% when 2s past
    const normalizedTime = (timeDiff + lookAhead) / totalWindow;
    const position = 20 + (normalizedTime * 80); // Maps to 20% (left) to 100% (right)
    
    return Math.max(-5, Math.min(105, position)); // Allow slight overflow for smooth entry/exit
  };

  return (
    <div className="pitch-bars-container">
      <div className="pitch-bars-track">
        {/* Center line indicator */}
        <div className="pitch-bars-center-line"></div>
        
        {/* Render visible bars */}
        {visibleBars.map((bar) => {
          const position = getBarPosition(bar);
          const isActive = activeBar?.id === bar.id;
          const isHit = isActive && userPitch && accuracy > 70;
          
          // Calculate bar height (fixed size, doesn't change with pitch)
          const barHeight = 40; // Fixed height in pixels
          
          // Calculate bar width based on duration (longer = wider)
          // Short notes (0.2-0.5s): 50-70px
          // Medium notes (0.6-1.2s): 80-120px
          // Long notes (1.5-2.5s): 130-180px
          let barWidth;
          if (bar.duration < 0.5) {
            // Short note
            barWidth = 50 + (bar.duration / 0.5) * 20; // 50-70px
          } else if (bar.duration < 1.2) {
            // Medium note
            barWidth = 80 + ((bar.duration - 0.5) / 0.7) * 40; // 80-120px
          } else {
            // Long note
            barWidth = 130 + ((bar.duration - 1.2) / 1.3) * 50; // 130-180px
          }
          barWidth = Math.max(50, Math.min(180, barWidth));
          
          // Position bar vertically based on pitch
          // Higher pitch = higher position (lower top value), lower pitch = lower position (higher top value)
          // Pitch range: 100-600 Hz
          // Track height: 300px
          // Position range: 30px (top/high pitch) to 260px (bottom/low pitch)
          // Center line at 150px represents ~350 Hz (middle of range)
          const minPitch = 100;
          const maxPitch = 600;
          const pitchRange = maxPitch - minPitch;
          const trackHeight = 300;
          const topMargin = 30; // Space from top
          const bottomMargin = 30; // Space from bottom
          const usableHeight = trackHeight - topMargin - bottomMargin;
          
          // Ensure targetPitch is within valid range
          const clampedPitch = Math.max(minPitch, Math.min(maxPitch, bar.targetPitch || 350));
          
          // Higher pitch = lower top value (higher on screen)
          // 600 Hz (high) = 30px (top), 100 Hz (low) = 270px (bottom)
          const pitchPercent = (clampedPitch - minPitch) / pitchRange;
          const topPosition = trackHeight - bottomMargin - (pitchPercent * usableHeight) - (barHeight / 2);
          
          // Debug log for first few bars (only once per render)
          if (visibleBars.indexOf(bar) < 3 && Math.random() < 0.01) {
            console.log(`Bar ${bar.id}: start=${bar.start.toFixed(2)}s, currentTime=${currentTime?.toFixed(2) || '0'}s, pitch=${clampedPitch.toFixed(0)}Hz, left=${position.toFixed(1)}%, top=${topPosition.toFixed(1)}px`);
          }

          return (
            <div
              key={bar.id}
              className={`pitch-bar ${isActive ? 'active' : ''} ${isHit ? 'hit' : ''}`}
              style={{
                left: `${position}%`,
                top: `${topPosition}px`,
                height: `${barHeight}px`,
                width: `${barWidth}px`,
              }}
            >
              {isActive && userPitch && (
                <div className="pitch-bar-accuracy" style={{ opacity: accuracy / 100 }}>
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

