import { useMemo } from 'react';

export default function Lyrics({ segments, currentTime }) {
  if (!segments || segments.length === 0) {
    return <div className="lyrics-container">No lyrics available</div>;
  }

  // Find the active segment based on current time
  const { currentPhrase, nextPhrase } = useMemo(() => {
    if (!segments || segments.length === 0) {
      return { currentPhrase: null, nextPhrase: null };
    }

    if (currentTime === 0 || !currentTime) {
      return { currentPhrase: segments[0] || null, nextPhrase: segments[1] || null };
    }

    // Find segment where currentTime is within start and end
    let activeSegment = null;
    let activeIndex = -1;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = typeof seg.start === 'number' ? seg.start : parseFloat(seg.start || 0);
      const end = typeof seg.end === 'number' ? seg.end : parseFloat(seg.end || 0);
      
      if (currentTime >= start && currentTime <= end) {
        activeSegment = seg;
        activeIndex = i;
        break;
      }
    }

    // If no active segment, find the one that should be playing (last segment that started)
    if (!activeSegment) {
      for (let i = segments.length - 1; i >= 0; i--) {
        const start = typeof segments[i].start === 'number' ? segments[i].start : parseFloat(segments[i].start || 0);
        if (currentTime >= start) {
          activeSegment = segments[i];
          activeIndex = i;
          break;
        }
      }
    }

    // Fallback to first segment if still nothing
    if (!activeSegment && segments.length > 0) {
      activeSegment = segments[0];
      activeIndex = 0;
    }

    const nextIndex = activeIndex + 1;
    const next = nextIndex < segments.length ? segments[nextIndex] : null;

    return { currentPhrase: activeSegment, nextPhrase: next };
  }, [segments, currentTime]);

  return (
    <div className="lyrics-container">
      <div className="lyrics-wrapper">
        {currentPhrase && (
          <div key={`current-${currentPhrase.id || currentPhrase.start}`} className="lyric-line current">
            {currentPhrase.text}
          </div>
        )}
        {nextPhrase && (
          <div key={`next-${nextPhrase.id || nextPhrase.start}`} className="lyric-line next">
            {nextPhrase.text}
          </div>
        )}
      </div>
    </div>
  );
}

