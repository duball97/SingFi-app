import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join, dirname } from "path";
import fs from "fs";
import { supabase } from "../services/supabase.js";
import OpenAI from "openai";
import { Innertube } from "youtubei.js";
import { separateVocals } from "../services/vocalSeparation.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create vocals directory if it doesn't exist
const vocalsDir = join(__dirname, '../vocals');
if (!fs.existsSync(vocalsDir)) {
  fs.mkdirSync(vocalsDir, { recursive: true });
  console.log('📁 Created vocals directory:', vocalsDir);
}

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
router.post("/", async (req, res) => {
  try {
    const { youtubeId, title, artist, owner } = req.body;

    if (!youtubeId)
      return res.status(400).json({ error: "youtubeId required" });

    // Check cache first (RLS policies will filter based on owner)
    // Note: If using RLS, ensure policies allow public access OR use service role key
    const { data: cached, error: cacheError } = await supabase
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
        notes: cached.notes || null,
        title: cached.title,
        artist: cached.artist,
        thumbnail: cached.thumbnail || null,
      });
    }
    
    // If cache check failed due to RLS (not found), continue processing
    if (cacheError && cacheError.code !== 'PGRST116') {
      console.warn('⚠️ Cache check error (continuing anyway):', cacheError.message);
    }

    const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    console.log("Processing:", youtubeUrl);

    // Get YouTube thumbnail using standard URL pattern (no API needed)
    let thumbnailStoragePath = null;
    try {
      console.log("📸 Fetching YouTube thumbnail...");
      // Use standard YouTube thumbnail URL pattern (maxresdefault is highest quality)
      const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
      
      console.log("📸 Thumbnail URL:", thumbnailUrl);
      
      // Download thumbnail
      const thumbnailResponse = await fetch(thumbnailUrl);
      if (thumbnailResponse.ok) {
        const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
        thumbnailStoragePath = `thumbnails/${youtubeId}.jpg`;
        
        // Upload to Supabase Storage
        console.log(`💾 Uploading thumbnail to Supabase Storage: ${thumbnailStoragePath}`);
        const { error: thumbUploadError } = await supabase
          .storage
          .from('thumbnails')
          .upload(thumbnailStoragePath, thumbnailBuffer, {
            contentType: 'image/jpeg',
            upsert: true
          });
        
        if (thumbUploadError) {
          console.warn('⚠️ Failed to upload thumbnail to storage:', thumbUploadError.message);
          thumbnailStoragePath = thumbnailUrl; // Fallback to direct URL
        } else {
          console.log(`✅ Thumbnail saved to storage: ${(thumbnailBuffer.length / 1024).toFixed(2)}KB`);
        }
      } else {
        // Try hqdefault if maxresdefault fails (some videos don't have maxresdefault)
        console.log("📸 maxresdefault not available, trying hqdefault...");
        const hqThumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
        const hqResponse = await fetch(hqThumbnailUrl);
        if (hqResponse.ok) {
          const thumbnailBuffer = Buffer.from(await hqResponse.arrayBuffer());
          thumbnailStoragePath = `thumbnails/${youtubeId}.jpg`;
          
          const { error: thumbUploadError } = await supabase
            .storage
            .from('thumbnails')
            .upload(thumbnailStoragePath, thumbnailBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });
          
          if (thumbUploadError) {
            console.warn('⚠️ Failed to upload thumbnail to storage:', thumbUploadError.message);
            thumbnailStoragePath = hqThumbnailUrl;
          } else {
            console.log(`✅ Thumbnail saved to storage: ${(thumbnailBuffer.length / 1024).toFixed(2)}KB`);
          }
        } else {
          console.warn('⚠️ Failed to download thumbnail, using direct URL');
          thumbnailStoragePath = thumbnailUrl; // Fallback to direct URL
        }
      }
    } catch (error) {
      console.warn('⚠️ Error fetching thumbnail:', error.message);
      thumbnailStoragePath = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`; // Fallback
    }

    // Download + convert
    const wavBuffer = await youtubeToWavBuffer(youtubeUrl);
    console.log(
      "WAV size:",
      (wavBuffer.length / 1024 / 1024).toFixed(2),
      "MB"
    );

    const openai = getOpenAI();

    // STEP 2 — Run Whisper transcription (vocals are handled separately)
    console.log("🎤 Running Whisper transcription...");
    const transcription = await openai.audio.transcriptions.create({
      file: new File([wavBuffer], "audio.wav", { type: "audio/wav" }),
      model: "whisper-1",
      response_format: "verbose_json", // gives segments + text
    });
    console.log("✅ Whisper transcription complete");

    const segments = transcription.segments || [];
    const fullText = transcription.text || "";

    // Console log the raw whisper segments
    console.log('🎤 RAW WHISPER SEGMENTS:');
    console.log('Total segments:', segments.length);
    console.log('First 5 segments:', JSON.stringify(segments.slice(0, 5), null, 2));
    console.log('Full text:', fullText);

    // STEP 3 — Process vocals (in parallel with AI processing if possible, or after)
    console.log("🎤 Processing vocals...");
    const vocalsStoragePath = `${youtubeId}.wav`;
    let vocalsProcessed = false;
    
    try {
      // Check if vocals already exist in Supabase Storage
      console.log(`🔍 Checking for existing vocals in storage: ${vocalsStoragePath}`);
      const { data: existingFile, error: downloadError } = await supabase
        .storage
        .from('vocals')
        .download(vocalsStoragePath);
      
      if (existingFile && !downloadError) {
        console.log('✅ Found existing vocals in storage');
        vocalsProcessed = true;
      } else {
        throw new Error('Vocals not found in storage');
      }
    } catch (error) {
      console.log('📝 Vocals not in storage, processing with Replicate...');
      
      // Process vocals with Replicate Demucs
      const vocalsResult = await separateVocals(wavBuffer, youtubeId).catch((error) => {
        console.warn("⚠️ Vocal separation failed:", error.message);
        return null;
      });
      
      if (vocalsResult && vocalsResult.vocals) {
        const vocalsBuffer = vocalsResult.vocals;
        console.log("✅ Vocals isolated successfully");
        
        // Save vocals locally for testing
        const localFilePath = join(vocalsDir, `${youtubeId}.wav`);
        try {
          fs.writeFileSync(localFilePath, vocalsBuffer);
          console.log(`💾 Saved vocals locally: ${localFilePath} (${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
        } catch (localError) {
          console.warn('⚠️ Failed to save vocals locally:', localError.message);
        }
        
        // Upload vocals to Supabase Storage
        console.log(`💾 Uploading vocals to Supabase Storage: ${vocalsStoragePath}`);
        try {
          const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('vocals')
            .upload(vocalsStoragePath, vocalsBuffer, {
              contentType: 'audio/wav',
              upsert: true
            });
          
          if (uploadError) {
            console.error('❌ Supabase Storage upload error:', uploadError);
            console.warn('⚠️ Vocals saved locally but NOT to Supabase Storage');
          } else {
            console.log(`✅ Vocals saved to Supabase Storage: ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB`);
            vocalsProcessed = true;
          }
        } catch (storageError) {
          console.error('❌ Supabase Storage exception:', storageError);
          console.warn('⚠️ Vocals saved locally but NOT to Supabase Storage');
        }
      }
    }

    // STEP 4 — Use raw Whisper segments directly (no AI processing)
    const rawSegments = segments.map(seg => ({
      text: seg.text || "",
      start: seg.start || 0,
      end: seg.end || 0,
    }));
    
    console.log('📝 RAW WHISPER SEGMENTS:');
    console.log('Total segments:', rawSegments.length);
    console.log('First 5 segments:', JSON.stringify(rawSegments.slice(0, 5), null, 2));

    // Save in Supabase with lyrics and segments (vocals and notes handled separately)
    await supabase
      .from("singfi_songs")
      .upsert(
        {
          youtube_id: youtubeId,
          title: title || null,
          artist: artist || null,
          lyrics: fullText,
          segments: rawSegments, // Use raw Whisper segments
          notes: null, // Notes extracted separately via vocals route
          vocals: vocalsProcessed ? vocalsStoragePath : null, // Vocals path in Storage
          thumbnail: thumbnailStoragePath, // Thumbnail path in Storage or YouTube URL
          owner: owner || null, // User UUID for RLS (optional for now)
        },
        { onConflict: "youtube_id" }
      );

    console.log(`💾 Saved lyrics and segments to database`);

    console.log('✅ Game ready! Segments:', rawSegments.length, 'Lyrics length:', fullText.length);

    res.json({
      cached: false,
      segments: rawSegments, // Return raw Whisper segments
      lyrics: fullText,
      notes: null, // Notes extracted separately via vocals route
      title: title || null,
      artist: artist || null,
      thumbnail: thumbnailStoragePath || null,
    });
  } catch (error) {
    console.error("Whisper error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
