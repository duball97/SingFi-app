import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs';
import { supabase } from '../services/supabase.js';
import { replicate } from '../services/replicate.js';

const execAsync = promisify(exec);
const router = express.Router();

// STEP 1 — Download + Convert to Whisper-friendly WAV
async function youtubeToWavBuffer(youtubeUrl) {
  const ts = Date.now();
  const tempInput = join(tmpdir(), `audio-${ts}.m4a`);
  const tempOutput = join(tmpdir(), `audio-${ts}.wav`);

  try {
    // DOWNLOAD BEST AUDIO (usually .m4a or .webm)
    await execAsync(`yt-dlp -f bestaudio -o "${tempInput}" "${youtubeUrl}"`);

    // CONVERT TO WAV 16kHz MONO — Whisper LOVES THIS FORMAT
    await execAsync(
      `ffmpeg -y -i "${tempInput}" -ac 1 -ar 16000 -f wav "${tempOutput}"`
    );

    const buffer = fs.readFileSync(tempOutput);

    // CLEANUP
    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);

    return buffer;
  } catch (err) {
    console.error("FFMPEG/YTDLP ERROR:", err);
    throw new Error(`Failed audio processing: ${err.message}`);
  }
}

router.post('/', async (req, res) => {
  try {
    const { youtubeId } = req.body;
    if (!youtubeId) return res.status(400).json({ error: 'youtubeId required' });

    // CACHE CHECK
    const { data: cached } = await supabase
      .from('songs')
      .select('*')
      .eq('youtube_id', youtubeId)
      .single();

    if (cached && cached.segments) {
      return res.json({
        cached: true,
        segments: cached.segments,
        lyrics: cached.lyrics,
      });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    console.log("Downloading + converting:", youtubeUrl);

    // STEP 2 — Convert YT → WAV (clean audio)
    const wavBuffer = await youtubeToWavBuffer(youtubeUrl);
    console.log("WAV size:", (wavBuffer.length / 1024 / 1024).toFixed(2), "MB");

    // STEP 3 — Send WAV buffer to Whisper
    console.log("Sending to Whisper...");
    const output = await replicate.run(
      "openai/whisper:large-v3",
      {
        input: {
          audio: wavBuffer,   // EXACT format Whisper expects
          model: "large-v3",
        }
      }
    );

    const segments = output.segments ?? [];
    const fullText = output.text ?? "";

    // SAVE TO SUPABASE
    await supabase
      .from('songs')
      .upsert({
        youtube_id: youtubeId,
        lyrics: fullText,
        segments,
      }, { onConflict: 'youtube_id' });

    res.json({
      cached: false,
      segments,
      lyrics: fullText,
    });

  } catch (error) {
    console.error("Whisper error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
