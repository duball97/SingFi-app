import { useMemo, useState, useEffect } from "react";

export default function Lyrics({ segments, currentTime }) {
  const [displayedIdx, setDisplayedIdx] = useState(-1);
  
  const { currentIdx, current, next } = useMemo(() => {
    if (!segments?.length || currentTime === undefined || currentTime === null) {
      return { currentIdx: -1, current: null, next: null };
    }

    // Find the segment where currentTime is between start and end
    let idx = -1;
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      
      if (currentTime >= start && currentTime <= end) {
        idx = i;
        break;
      }
    }

    // If no exact match, find the last segment that has started
    if (idx === -1) {
      for (let i = segments.length - 1; i >= 0; i--) {
        const start = Number(segments[i].start) || 0;
        if (currentTime >= start) {
          idx = i;
          break;
        }
      }
    }

    // Default to first segment if nothing found
    if (idx === -1) {
      idx = 0;
    }

    return {
      currentIdx: idx,
      current: segments[idx] || null,
      next: segments[idx + 1] || null,
    };
  }, [segments, currentTime]);

  // Only update displayed content when segment index changes
  useEffect(() => {
    if (currentIdx !== displayedIdx && currentIdx !== -1) {
      setDisplayedIdx(currentIdx);
    }
  }, [currentIdx, displayedIdx]);

  // Use displayed segment for rendering to prevent flicker
  const displayCurrent = displayedIdx >= 0 ? segments[displayedIdx] : current;
  const displayNext = displayedIdx >= 0 ? segments[displayedIdx + 1] : next;

  if (!displayCurrent) {
    return null;
  }

  return (
    <div className="lyrics-container">
      <div 
        key={`line-${displayedIdx}`}
        className="lyric-line current"
      >
        {displayCurrent.text || ''}
      </div>
      {displayNext && (
        <div 
          key={`line-${displayedIdx + 1}`}
          className="lyric-line next"
        >
          {displayNext.text || ''}
        </div>
      )}
    </div>
  );
}

