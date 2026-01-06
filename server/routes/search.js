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

    console.log(`[SEARCH] YouTube returned ${search.videos?.length || 0} videos for query: "${q}"`);

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
    
    const allVideos = search.videos
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
      });
    
    console.log(`[SEARCH] After filtering by duration: ${allVideos.length} videos`);
    
    // Detect if this is an artist-only search (no song title)
    // Strategy: Check if multiple results share the same channel name
    const queryLower = q.toLowerCase().trim();
    const hasSongIndicators = /\b(song|track|music|lyrics|official|video|audio|remix|cover|live|feat|ft\.|featuring)\b/.test(queryLower);
    const hasArtistIndicators = /\b(by|artist|band|singer)\b/.test(queryLower);
    const wordCount = queryLower.split(/\s+/).length;
    
    // Check if results share the same channel (indicates artist search)
    const channelCounts = {};
    allVideos.slice(0, 10).forEach(video => {
      if (video.channel) {
        channelCounts[video.channel] = (channelCounts[video.channel] || 0) + 1;
      }
    });
    const maxChannelCount = Math.max(...Object.values(channelCounts), 0);
    const sameChannelRatio = allVideos.length > 0 ? maxChannelCount / Math.min(allVideos.length, 10) : 0;
    
    // If most results share the same channel, or query looks like artist name, treat as artist search
    // For artist searches, be more lenient - if word count is <= 4 and no song indicators, treat as artist
    const isLikelyArtistOnly = (sameChannelRatio >= 0.5 && allVideos.length >= 2) || 
                               (!hasSongIndicators && !hasArtistIndicators && wordCount <= 4 && !q.includes('"') && !q.includes("'"));
    
    console.log(`[SEARCH] Query: "${q}"`);
    console.log(`[SEARCH] Word count: ${wordCount}, Has song indicators: ${hasSongIndicators}, Has artist indicators: ${hasArtistIndicators}`);
    console.log(`[SEARCH] Same channel ratio: ${sameChannelRatio.toFixed(2)}, Max channel count: ${maxChannelCount}, Total videos: ${allVideos.length}`);
    console.log(`[SEARCH] Is artist search: ${isLikelyArtistOnly}`);
    console.log(`[SEARCH] Will return ${isLikelyArtistOnly ? 8 : 1} videos`);
    
    const videos = allVideos.slice(0, isLikelyArtistOnly ? 8 : 1); // Return 8 for artist-only, 1 for specific song

    res.json({ 
      videos,
      isArtistSearch: isLikelyArtistOnly 
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
