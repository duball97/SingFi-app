import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { youtubeId } = req.query;

    if (!youtubeId) {
      return res.status(400).json({ error: 'youtubeId parameter is required' });
    }

    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .eq('youtube_id', youtubeId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      return res.json({ cached: false });
    }

    res.json({
      cached: true,
      ...data,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

