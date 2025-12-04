import { useMemo } from 'react';

export default function PitchBars({ segments, currentTime, userPitch }) {
  // Generate pitch bars from segments
  // For now, we'll create bars based on segment timing
  // Later this can be replaced with actual pitch data from audio analysis
  const pitchBars = useMemo(() => {
    if (!segments || segments.length === 0) return [];

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

      // Generate bars based on duration (one bar per 0.3-0.8 seconds, varying)
      const barInterval = 0.4 + (index % 3) * 0.15; // Varies between 0.4-0.7s
      const barCount = Math.max(1, Math.floor(duration / barInterval));
      
      for (let i = 0; i < barCount; i++) {
        const barStart = start + (i * barInterval);
        const barEnd = Math.min(barStart + barInterval, end);
        const barDuration = barEnd - barStart;
        
        // Generate varied target pitch (Hz) - typical singing range is 100-600 Hz
        // Create more variation using multiple sine waves
        const basePitch = 250 + (index % 7) * 40; // Base varies 250-490 Hz
        const wave1 = Math.sin((index * 0.7 + i * 0.3)) * 80;
        const wave2 = Math.cos((index * 0.5 + i * 0.2)) * 50;
        const variation = wave1 + wave2;
        const targetPitch = basePitch + variation;

        bars.push({
          id: `${index}-${i}`,
          start: barStart,
          end: barEnd,
          duration: barDuration,
          targetPitch: Math.max(100, Math.min(600, targetPitch)),
          segmentIndex: index,
        });
      }
    });

    return bars;
  }, [segments]);

  // Find bars that should be visible (current time ± 3 seconds ahead, 1 second behind)
  const visibleBars = useMemo(() => {
    if (!currentTime) return [];
    
    const windowStart = currentTime - 1;
    const windowEnd = currentTime + 3;
    
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
  // Bars start at 100% (right) and move to 0% (left)
  // Center line is at 50%
  const getBarPosition = (bar) => {
    if (!currentTime) return 100;
    
    const timeDiff = bar.start - currentTime;
    // Bars appear 3 seconds ahead and disappear 1 second after
    const lookAhead = 3;
    const lookBehind = 1;
    const totalWindow = lookAhead + lookBehind;
    
    // Position: 100% when 3s ahead, 0% when 1s past
    const position = ((timeDiff + lookAhead) / totalWindow) * 100;
    
    return Math.max(-10, Math.min(110, position)); // Allow slight overflow for smooth entry/exit
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
          
          // Calculate bar height based on target pitch (normalize to 0-100%)
          // Higher pitch = taller bar from center
          const pitchHeight = ((bar.targetPitch - 100) / (600 - 100)) * 100;
          const barHeight = Math.max(20, Math.min(70, pitchHeight));
          
          // Calculate bar width based on duration (longer = wider)
          // Base width 70px, scales with duration (0.3s = 70px, 0.8s = 140px)
          const baseWidth = 70;
          const widthMultiplier = 0.4 + (bar.duration || 0.4) * 0.6;
          const barWidth = Math.max(60, Math.min(140, baseWidth * widthMultiplier));
          
          // Position bar vertically (centered on center line, extending equally up and down)
          // Center line is at 50%, so bar should be centered there
          const barBottom = 50 - (barHeight / 2);

          return (
            <div
              key={bar.id}
              className={`pitch-bar ${isActive ? 'active' : ''} ${isHit ? 'hit' : ''}`}
              style={{
                left: `${position}%`,
                height: `${barHeight}%`,
                bottom: `${barBottom}%`,
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

