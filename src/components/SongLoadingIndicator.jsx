import { useSongLoading } from '../contexts/SongLoadingContext';
import './SongLoadingIndicator.css';

export default function SongLoadingIndicator() {
  const { loadingSongs } = useSongLoading();

  const loadingSongsArray = Object.entries(loadingSongs).map(([youtubeId, data]) => ({
    youtubeId,
    ...data
  }));

  if (loadingSongsArray.length === 0) {
    return null;
  }

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
        </div>
      ))}
    </div>
  );
}

