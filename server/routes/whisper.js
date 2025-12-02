import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import fs from "fs";
import { supabase } from "../services/supabase.js";
import OpenAI from "openai";

const execAsync = promisify(exec);
const router = express.Router();

// Lazy-load OpenAI client
let openaiClient = null;
const getOpenAI = () => {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    openaiClient = new OpenAI({
      apiKey: apiKey,
    });
  }
  return openaiClient;
};

// STEP 1 — Download + Convert into perfect Whisper WAV file
async function youtubeToWavBuffer(youtubeUrl) {
  const ts = Date.now();
  const tempInput = join(tmpdir(), `audio-${ts}.m4a`);
  const tempOutput = join(tmpdir(), `audio-${ts}.wav`);

  try {
    // Download best audio using yt-dlp
    await execAsync(`yt-dlp -f bestaudio -o "${tempInput}" "${youtubeUrl}"`);

    // Convert to WAV 16kHz mono
    await execAsync(
      `ffmpeg -y -i "${tempInput}" -ac 1 -ar 16000 -f wav "${tempOutput}"`
    );

    const buffer = fs.readFileSync(tempOutput);

    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);

    return buffer;
  } catch (err) {
    console.error("FFMPEG/YTDLP ERROR:", err);
    throw new Error(`Audio processing failed: ${err.message}`);
  }
}

router.post("/", async (req, res) => {
  try {
    const { youtubeId } = req.body;

    if (!youtubeId)
      return res.status(400).json({ error: "youtubeId required" });

    // Check cache
    const { data: cached } = await supabase
      .from("songs")
      .select("*")
      .eq("youtube_id", youtubeId)
      .single();

    if (cached && cached.segments) {
      return res.json({
        cached: true,
        segments: cached.segments,
        lyrics: cached.lyrics,
      });
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    console.log("Processing:", youtubeUrl);

    // Download + convert
    const wavBuffer = await youtubeToWavBuffer(youtubeUrl);
    console.log(
      "WAV size:",
      (wavBuffer.length / 1024 / 1024).toFixed(2),
      "MB"
    );

    // STEP 2 — Send WAV buffer to OpenAI Whisper
    console.log("Sending to OpenAI Whisper...");

    const openai = getOpenAI();
    const transcription = await openai.audio.transcriptions.create({
      file: new File([wavBuffer], "audio.wav", { type: "audio/wav" }),
      model: "whisper-1",
      response_format: "verbose_json", // gives segments + text
    });

    const segments = transcription.segments || [];
    const fullText = transcription.text || "";

    // Save in Supabase
    await supabase
      .from("songs")
      .upsert(
        {
          youtube_id: youtubeId,
          lyrics: fullText,
          segments: segments,
        },
        { onConflict: "youtube_id" }
      );

    console.log('✅ Game ready! Segments:', segments.length, 'Lyrics length:', fullText.length);

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
