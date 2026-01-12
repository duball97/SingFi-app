import { useMemo, useRef, useState, useEffect } from "react";

export default function Lyrics({ segments, currentTime, firstVerseStartTime }) {
  const lastIdxRef = useRef(-1);
  const [displayedIdx, setDisplayedIdx] = useState(-1);
  const segmentsLoggedRef = useRef(false);

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

  // Log all segments once when they're loaded
  useEffect(() => {
    if (filteredSegments?.length && !segmentsLoggedRef.current) {
      console.log('FILTERED SEGMENTS WITH TIMES (after first verse):');
      filteredSegments.forEach((seg, idx) => {
        const start = Number(seg.start) || 0;
        const end = Number(seg.end) || 0;
        console.log(`  [${idx}] ${start.toFixed(2)}s - ${end.toFixed(2)}s (${(end - start).toFixed(2)}s): "${seg.text}"`);
      });
      segmentsLoggedRef.current = true;
    }
  }, [filteredSegments]);

  // Only calculate the INDEX, not the full objects
  const currentIdx = useMemo(() => {
    if (!filteredSegments?.length || currentTime === undefined || currentTime === null) {
      return -1;
    }

    // Find the segment where currentTime is between start and end
    for (let i = 0; i < filteredSegments.length; i++) {
      const seg = filteredSegments[i];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;

      if (currentTime >= start && currentTime <= end) {
        return i;
      }
    }

    // If no exact match, find the last segment that has started
    for (let i = filteredSegments.length - 1; i >= 0; i--) {
      const start = Number(filteredSegments[i].start) || 0;
      if (currentTime >= start) {
        return i;
      }
    }

    return 0;
  }, [filteredSegments, currentTime]);

  // Only update state when index actually changes, and log here
  useEffect(() => {
    if (currentIdx !== lastIdxRef.current && currentIdx !== -1 && filteredSegments[currentIdx]) {
      const seg = filteredSegments[currentIdx];
      const start = Number(seg.start) || 0;
      const end = Number(seg.end) || 0;
      console.log(`SEGMENT CHANGE: Time ${currentTime.toFixed(2)}s → Segment [${currentIdx}] (${start.toFixed(2)}s - ${end.toFixed(2)}s): "${seg.text}"`);

      lastIdxRef.current = currentIdx;
      setDisplayedIdx(currentIdx);
    }
  }, [currentIdx, currentTime, filteredSegments]);

  // Get previous, current, and next segments for better context
  const previous = displayedIdx > 0 && filteredSegments[displayedIdx - 1] ? filteredSegments[displayedIdx - 1] : null;
  const current = displayedIdx >= 0 && filteredSegments[displayedIdx] ? filteredSegments[displayedIdx] : null;
  const next = displayedIdx >= 0 && filteredSegments[displayedIdx + 1] ? filteredSegments[displayedIdx + 1] : null;

  if (!current) {
    return null;
  }

  return (
    <div className="lyrics-container">
      {previous && (
        <div
          key={`previous-${displayedIdx - 1}`}
          className="lyric-line previous"
        >
          {previous.text || ''}
        </div>
      )}
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

