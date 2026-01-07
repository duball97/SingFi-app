import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

// Save game session
router.post('/', async (req, res) => {
  try {
    const { userId, youtubeId, score, accuracy, notesHit, notesTotal, durationSeconds, gameMode } = req.body;

    if (!userId || !youtubeId) {
      return res.status(400).json({ error: 'userId and youtubeId are required' });
    }

    // Get song info from youtube_id
    const { data: song, error: songError } = await supabase
      .from('singfi_songs')
      .select('id, title, artist')
      .eq('youtube_id', youtubeId)
      .single();

    const songId = song?.id || null;
    const songTitle = song?.title || null;
    const songArtist = song?.artist || null;

    // Cap score at 100k
    const finalScore = Math.min(score || 0, 100000);

    // Insert into singfi_games table (new table)
    const { data: gameData, error: gameError } = await supabase
      .from('singfi_games')
      .insert({
        user_id: userId,
        song_id: songId,
        youtube_id: youtubeId,
        title: songTitle,
        artist: songArtist,
        score: finalScore,
        game_mode: gameMode || 'solo',
      })
      .select()
      .single();

    if (gameError) {
      console.error('Error saving game:', gameError);
      return res.status(500).json({ error: gameError.message });
    }

    // Increment play_count on singfi_songs if song exists
    if (songId) {
      const { error: updateError } = await supabase.rpc('increment_song_play_count', {
        song_id_param: songId
      });

      // If RPC doesn't exist, use update instead
      if (updateError && updateError.message.includes('function') || updateError.message.includes('does not exist')) {
        // Fallback: Get current count and increment
        const { data: currentSong } = await supabase
          .from('singfi_songs')
          .select('play_count')
          .eq('id', songId)
          .single();

        const newCount = (currentSong?.play_count || 0) + 1;
        await supabase
          .from('singfi_songs')
          .update({ play_count: newCount })
          .eq('id', songId);
      }
    }

    // Also save to singfi_game_sessions for backward compatibility
    const { data: sessionData, error: sessionError } = await supabase
      .from('singfi_game_sessions')
      .insert({
        user_id: userId,
        song_id: songId,
        youtube_id: youtubeId,
        score: finalScore,
        accuracy: accuracy || null,
        notes_hit: notesHit || 0,
        notes_total: notesTotal || 0,
        duration_seconds: durationSeconds || null,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error saving game session (backward compatibility):', sessionError);
      // Don't fail the request if this fails, just log it
    }

    res.json({ 
      success: true, 
      game: gameData,
      session: sessionData 
    });
  } catch (error) {
    console.error('Game session error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
