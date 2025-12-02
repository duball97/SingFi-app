export default function Score({ score, targetPitch, userPitch }) {
  const calculateAccuracy = () => {
    if (!targetPitch || !userPitch) return 0;
    const diff = Math.abs(userPitch - targetPitch);
    return Math.max(0, 100 - diff);
  };

  const accuracy = calculateAccuracy();

  return (
    <div className="score-container">
      <div className="score-display">
        <h2>Score: {score.toFixed(0)}</h2>
        {userPitch && (
          <div className="pitch-info">
            <div>Your Pitch: {userPitch.toFixed(1)} Hz</div>
            {targetPitch && (
              <>
                <div>Target: {targetPitch.toFixed(1)} Hz</div>
                <div>Accuracy: {accuracy.toFixed(1)}%</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

