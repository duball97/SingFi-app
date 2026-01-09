import { useSongLoading } from '../contexts/SongLoadingContext';
import { useNavigate } from 'react-router-dom';
import './SongLoadingIndicator.css';

export default function SongLoadingIndicator() {
  const { loadingSongs, removeLoadingSong } = useSongLoading();
  const navigate = useNavigate();

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

  const handleSongClick = (youtubeId, title, artist) => {
    if (!youtubeId) return;

    const titleEncoded = encodeURIComponent(title || 'Unknown');
    const artistEncoded = encodeURIComponent(artist || 'Unknown');
    navigate(`/game/${artistEncoded}/${titleEncoded}?id=${youtubeId}`);
  };

  return (
    <div className="song-loading-indicator">
      {loadingSongsArray.map(({ youtubeId, title, artist, status }) => (
        <div
          key={youtubeId}
          className={`loading-song-item ${status === 'completed' ? 'completed' : ''}`}
          title={status === 'completed' ? `Click to play: ${title}` : title}
          onClick={status === 'completed' ? () => handleSongClick(youtubeId, title, artist) : undefined}
        >
          <div className="loading-song-icon">
            {status === 'completed' ? 'Check' : '...'}
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

