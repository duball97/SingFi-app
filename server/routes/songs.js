import express from 'express';
import { supabase } from '../services/supabase.js';

const router = express.Router();

// Get all songs from Supabase (for suggested songs)
router.get('/', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('singfi_songs')
      .select('youtube_id, title, artist, thumbnail, created_at')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      console.error('Error fetching songs:', error);
      return res.status(500).json({ error: error.message });
    }

    // Format the response to match the search results format
    const formattedSongs = (data || []).map(song => {
      let thumbnailUrl = `https://img.youtube.com/vi/${song.youtube_id}/mqdefault.jpg`; // Default fallback
      
      if (song.thumbnail) {
        // Check if it's a storage path (starts with "thumbnails/") or already a URL
        if (song.thumbnail.startsWith('thumbnails/')) {
          // Convert storage path to public URL
          const { data: urlData } = supabase.storage
            .from('thumbnails')
            .getPublicUrl(song.thumbnail);
          thumbnailUrl = urlData.publicUrl;
        } else if (song.thumbnail.startsWith('http')) {
          // Already a full URL (e.g., YouTube URL fallback)
          thumbnailUrl = song.thumbnail;
        }
      }
      
      return {
        id: song.youtube_id,
        title: song.title || 'Unknown Title',
        channel: song.artist || 'Unknown Artist',
        thumbnail: thumbnailUrl,
      };
    });

    res.json({ songs: formattedSongs });
  } catch (error) {
    console.error('Error in /api/songs:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

