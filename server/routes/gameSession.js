import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

// Save game session
router.post('/', async (req, res) => {
  try {
    const { userId, youtubeId, score, accuracy, notesHit, notesTotal, durationSeconds } = req.body;

    if (!userId || !youtubeId) {
      return res.status(400).json({ error: 'userId and youtubeId are required' });
    }

    // Get song ID from youtube_id
    const { data: song, error: songError } = await supabase
      .from('singfi_songs')
      .select('id')
      .eq('youtube_id', youtubeId)
      .single();

    const songId = song?.id || null;

    // Insert game session
    const { data, error } = await supabase
      .from('singfi_game_sessions')
      .insert({
        user_id: userId,
        song_id: songId,
        youtube_id: youtubeId,
        score: score || 0,
        accuracy: accuracy || null,
        notes_hit: notesHit || 0,
        notes_total: notesTotal || 0,
        duration_seconds: durationSeconds || null,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving game session:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, session: data });
  } catch (error) {
    console.error('Game session error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
