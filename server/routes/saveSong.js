import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { youtubeId, title, artist, lyrics, segments } = req.body;

    if (!youtubeId || !segments) {
      return res.status(400).json({ error: 'youtubeId and segments are required' });
    }

    const { data, error } = await supabase
      .from('songs')
      .upsert({
        youtube_id: youtubeId,
        title: title || null,
        artist: artist || null,
        lyrics: lyrics || null,
        segments: segments,
      }, {
        onConflict: 'youtube_id',
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

