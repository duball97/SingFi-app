import { useEffect, useRef, memo } from 'react';

// Memoized ScoreDisplay to prevent parent re-renders from affecting it
// and to allow direct DOM updates for high performance
const ScoreDisplay = memo(({ scoreRef }) => {
    const displayRef = useRef(null);
    const currentDisplayScore = useRef(0);
    const animationFrameRef = useRef(null);

    useEffect(() => {
        const animate = () => {
            if (displayRef.current && scoreRef.current !== undefined) {
                // Smoothly interpolate score
                const target = scoreRef.current;
                const diff = target - currentDisplayScore.current;

                if (Math.abs(diff) > 0.5) {
                    // Lerp for smooth counting effect
                    currentDisplayScore.current += diff * 0.1;
                    // Snap to target if very close
                    if (Math.abs(target - currentDisplayScore.current) < 1) {
                        currentDisplayScore.current = target;
                    }
                } else {
                    currentDisplayScore.current = target;
                }

                displayRef.current.textContent = Math.round(currentDisplayScore.current).toLocaleString();
            }
            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [scoreRef]);

    return (
        <div className="score-container">
            <div className="score-label">SCORE</div>
            <div className="score-value" ref={displayRef}>0</div>
        </div>
    );
});

export default ScoreDisplay;
