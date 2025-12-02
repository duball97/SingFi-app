export default function Lyrics({ segments, currentTime }) {
  if (!segments || segments.length === 0) {
    return <div className="lyrics-container">No lyrics available</div>;
  }

  // Find the active segment based on current time
  const activeSegment = segments.find(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  // Get previous, current, and next segments for context
  const currentIndex = segments.findIndex(
    (seg) => seg === activeSegment
  );

  const displaySegments = [];
  if (currentIndex > 0) {
    displaySegments.push(segments[currentIndex - 1]);
  }
  if (activeSegment) {
    displaySegments.push(activeSegment);
  }
  if (currentIndex < segments.length - 1) {
    displaySegments.push(segments[currentIndex + 1]);
  }

  return (
    <div className="lyrics-container">
      {displaySegments.map((seg, idx) => {
        const isActive = seg === activeSegment;
        return (
          <div
            key={idx}
            className={`lyric-line ${isActive ? 'active' : ''}`}
          >
            {seg.text}
          </div>
        );
      })}
    </div>
  );
}

