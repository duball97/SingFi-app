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

    // Format results
    const videos = search.videos.slice(0, 10).map((video) => ({
      id: video.id,
      title: video.title?.text || 'Unknown',
      url: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnail: video.thumbnails?.[0]?.url || null,
      duration: video.duration?.text || null,
      channel: video.author?.name || null,
    }));

    res.json({ videos });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
