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

// STEP 3 — Group segments into proper verse lines using AI
async function groupSegmentsIntoVerses(rawSegments, fullText, openai) {
  if (!rawSegments || rawSegments.length === 0) {
    return [];
  }

  try {
    // Create a prompt that asks AI to group segments into verse lines
    // Each line should contain about 2 sentences, similar to how lyrics are displayed
    const prompt = `You are a lyrics formatting assistant. I have a song transcription with timestamped segments. 

Raw transcription text:
"${fullText}"

Segment data (first 10 segments as example):
${JSON.stringify(rawSegments.slice(0, 10), null, 2)}

Please analyze ALL segments and group them into verse lines. Each verse line should:
1. Contain approximately 2 sentences or phrases (like typical song lyrics)
2. Preserve the timing information (use the start time of the first segment and end time of the last segment in each group)
3. Combine the text from grouped segments into a single line
4. Maintain natural lyric flow and phrasing

Return a JSON array where each object has:
- "text": the combined text for this verse line
- "start": the start timestamp (number)
- "end": the end timestamp (number)

Example format:
[
  {"text": "When you were here before Couldn't look you in the eye", "start": 0.0, "end": 5.2},
  {"text": "You're just like an angel Your skin makes me cry", "start": 5.2, "end": 10.5}
]

Return ONLY the JSON array, no other text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a lyrics formatting assistant. Always return valid JSON arrays only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
    });

    const responseText = completion.choices[0].message.content.trim();
    
    // Try to extract JSON from the response (in case there's extra text)
    let jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const verseLines = JSON.parse(jsonMatch[0]);
      console.log(`✅ AI grouped ${rawSegments.length} segments into ${verseLines.length} verse lines`);
      return verseLines;
    } else {
      // Fallback: try parsing the whole response
      const verseLines = JSON.parse(responseText);
      return verseLines;
    }
  } catch (error) {
    console.error("Error processing segments with AI:", error);
    console.log("Falling back to original segments");
    // Fallback: return original segments if AI processing fails
    return rawSegments.map(seg => ({
      text: seg.text || "",
      start: seg.start || 0,
      end: seg.end || 0,
    }));
  }
}

router.post("/", async (req, res) => {
  try {
    const { youtubeId, title, artist } = req.body;

    if (!youtubeId)
      return res.status(400).json({ error: "youtubeId required" });

    // Check cache first
    const { data: cached } = await supabase
      .from("singfi_songs")
      .select("*")
      .eq("youtube_id", youtubeId)
      .single();

    if (cached && cached.segments) {
      console.log('✅ Loaded from cache:', youtubeId);
      console.log('📝 Cached segments:', cached.segments.length, 'verse lines');
      return res.json({
        cached: true,
        segments: cached.segments,
        lyrics: cached.lyrics,
        title: cached.title,
        artist: cached.artist,
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

    // Console log the raw whisper segments
    console.log('🎤 RAW WHISPER SEGMENTS:');
    console.log('Total segments:', segments.length);
    console.log('First 5 segments:', JSON.stringify(segments.slice(0, 5), null, 2));
    console.log('Full text:', fullText);

    // STEP 3 — Use AI to group segments into proper verse lines
    console.log("Processing segments into verse lines with AI...");
    const processedSegments = await groupSegmentsIntoVerses(segments, fullText, openai);
    
    console.log('📝 PROCESSED VERSE SEGMENTS:');
    console.log('Total verse lines:', processedSegments.length);
    console.log('First 5 verse lines:', JSON.stringify(processedSegments.slice(0, 5), null, 2));

    // Save in Supabase with all fields
    await supabase
      .from("singfi_songs")
      .upsert(
        {
          youtube_id: youtubeId,
          title: title || null,
          artist: artist || null,
          lyrics: fullText,
          segments: processedSegments, // Use processed verse lines instead of raw segments
          notes: null, // Will be populated later for pitch bars
        },
        { onConflict: "youtube_id" }
      );

    console.log('✅ Game ready! Verse lines:', processedSegments.length, 'Lyrics length:', fullText.length);

    res.json({
      cached: false,
      segments: processedSegments, // Return processed verse lines
      lyrics: fullText,
      title: title || null,
      artist: artist || null,
    });
  } catch (error) {
    console.error("Whisper error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
