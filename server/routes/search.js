import express from 'express';
import { Innertube } from 'youtubei.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    // Create Innertube instance
    const yt = await Innertube.create();

    // Search YouTube
    const search = await yt.search(q, {
      type: 'video',
    });

    // Helper function to parse duration string (e.g., "3:45" or "1:23:45") to seconds
    const parseDuration = (durationStr) => {
      if (!durationStr) return null;
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 2) {
        // MM:SS format
        return parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      return null;
    };

    // Format results and filter by duration (max 20 minutes = 1200 seconds)
    const maxDurationSeconds = 20 * 60; // 20 minutes
    
    const videos = search.videos
      .map((video) => {
        const durationStr = video.duration?.text || null;
        const durationSeconds = parseDuration(durationStr);
        
        return {
          id: video.id,
          title: video.title?.text || 'Unknown',
          url: `https://www.youtube.com/watch?v=${video.id}`,
          thumbnail: video.thumbnails?.[0]?.url || null,
          duration: durationStr,
          durationSeconds: durationSeconds,
          channel: video.author?.name || null,
        };
      })
      .filter((video) => {
        // Only include videos with duration <= 20 minutes
        // If duration is unknown, exclude it to be safe
        return video.durationSeconds !== null && video.durationSeconds <= maxDurationSeconds;
      })
      .slice(0, 1); // Limit to 1 result

    res.json({ videos });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
