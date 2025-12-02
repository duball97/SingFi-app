import express from 'express';
import { Innertube } from 'youtubei.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Extract video ID from URL
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (!videoIdMatch) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    const videoId = videoIdMatch[1];

    // Create Innertube instance and get video info
    const yt = await Innertube.create();
    const info = await yt.getInfo(url);

    // Get highest quality audio stream
    const audioFormat = info.streaming_data?.adaptive_formats
      ?.filter((x) => x.mime_type?.includes('audio'))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

    if (!audioFormat || !audioFormat.url) {
      return res.status(500).json({ error: 'No audio format found' });
    }

    // Redirect to the audio URL
    res.redirect(audioFormat.url);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
