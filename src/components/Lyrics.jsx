import { useMemo, useRef, useState, useEffect } from "react";

export default function Lyrics({ segments, currentTime }) {
  const lastIdxRef = useRef(-1);
  const [displayedIdx, setDisplayedIdx] = useState(-1);
  const segmentsLoggedRef = useRef(false);
  
  // Log all segments once when they're loaded
  useEffect(() => {
    if (segments?.length && !segmentsLoggedRef.current) {
      console.log('🎵 ALL SEGMENTS WITH TIMES:');
      segments.forEach((seg, idx) => {
        const start = Number(seg.start) || 0;
        const end = Number(seg.end) || 0;
        console.log(`  [${idx}] ${start.toFixed(2)}s - ${end.toFixed(2)}s (${(end - start).toFixed(2)}s): "${seg.text}"`);
      });
      segmentsLoggedRef.current = true;
    }
  }, [segments]);
  
  // Only calculate the INDEX, not the full objects
  const currentIdx = useMemo(() => {
    if (!segments?.length || currentTime === undefined || currentTime === null) {
      return -1;
    }

    // Find the segment where currentTime is between start and end
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      
      if (currentTime >= start && currentTime <= end) {
        return i;
      }
    }

    // If no exact match, find the last segment that has started
    for (let i = segments.length - 1; i >= 0; i--) {
      const start = Number(segments[i].start) || 0;
      if (currentTime >= start) {
        return i;
      }
    }

    return 0;
  }, [segments, currentTime]);

  // Only update state when index actually changes, and log here
  useEffect(() => {
    if (currentIdx !== lastIdxRef.current && currentIdx !== -1) {
      const seg = segments[currentIdx];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      console.log(`✅ SEGMENT CHANGE: Time ${currentTime.toFixed(2)}s → Segment [${currentIdx}] (${start.toFixed(2)}s - ${end.toFixed(2)}s): "${seg.text}"`);
      
      lastIdxRef.current = currentIdx;
      setDisplayedIdx(currentIdx);
    }
  }, [currentIdx, currentTime, segments]);

  // Get segments directly from array using displayedIdx
  const current = displayedIdx >= 0 && segments[displayedIdx] ? segments[displayedIdx] : null;
  const next = displayedIdx >= 0 && segments[displayedIdx + 1] ? segments[displayedIdx + 1] : null;

  if (!current) {
    return null;
  }

  return (
    <div className="lyrics-container">
      <div 
        key={`current-${displayedIdx}`}
        className="lyric-line current"
      >
        {current.text || ''}
      </div>
      {next && (
        <div 
          key={`next-${displayedIdx + 1}`}
          className="lyric-line next"
        >
          {next.text || ''}
        </div>
      )}
    </div>
  );
}

