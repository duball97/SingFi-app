import { useSongLoading } from '../contexts/SongLoadingContext';
import './SongLoadingIndicator.css';

export default function SongLoadingIndicator() {
  const { loadingSongs, removeLoadingSong } = useSongLoading();

  const loadingSongsArray = Object.entries(loadingSongs).map(([youtubeId, data]) => ({
    youtubeId,
    ...data
  }));

  if (loadingSongsArray.length === 0) {
    return null;
  }

  const handleRemove = (e, youtubeId) => {
    e.stopPropagation();
    removeLoadingSong(youtubeId);
  };

  return (
    <div className="song-loading-indicator">
      {loadingSongsArray.map(({ youtubeId, title, status }) => (
        <div
          key={youtubeId}
          className={`loading-song-item ${status === 'completed' ? 'completed' : ''}`}
          title={title}
        >
          <div className="loading-song-icon">
            {status === 'completed' ? '✓' : '⏳'}
          </div>
          <div className="loading-song-text">
            {title || 'Loading song...'}
          </div>
          <button
            className="loading-song-close"
            onClick={(e) => handleRemove(e, youtubeId)}
            aria-label="Close"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

