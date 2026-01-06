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
import { extractPitch, generateNotesFromPitch } from "../services/pitchExtraction.js";
import { fileURLToPath } from "url";
import { getToolPaths, setupTools } from "../utils/downloadTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create vocals directory if it doesn't exist
// Note: vocals are saved in root/vocals (not server/vocals) to match vocalSeparation.js
const vocalsDir = join(__dirname, '../../vocals');
if (!fs.existsSync(vocalsDir)) {
  fs.mkdirSync(vocalsDir, { recursive: true });
  console.log('📁 Created vocals directory:', vocalsDir);
}

const execAsync = promisify(exec);
const router = express.Router();

// Cache the tool paths
let toolPaths = null;

// Initialize tools on first use
async function initializeTools() {
  if (toolPaths) return toolPaths;
  
  // Try to get existing tools
  toolPaths = getToolPaths();
  
  // If tools don't exist, try to download them (Windows only for now)
  if (!toolPaths.ytDlp || (process.platform === 'win32' && !toolPaths.ffmpeg)) {
    console.log('🔧 Setting up tools automatically...');
    try {
      const downloaded = await setupTools();
      toolPaths = downloaded;
    } catch (err) {
      console.warn('⚠️ Auto-setup failed, trying system PATH...');
      // Fall back to PATH
      toolPaths = {
        ytDlp: null, // Will try PATH
        ffmpeg: process.platform === 'win32' ? null : 'ffmpeg',
      };
    }
  }
  
  return toolPaths;
}

// Helper to find yt-dlp command
async function findYtDlpCommand() {
  await initializeTools();
  
  // First try local tools
  if (toolPaths.ytDlp && fs.existsSync(toolPaths.ytDlp)) {
    return toolPaths.ytDlp;
  }
  
  // Fall back to PATH
  const commands = process.platform === 'win32' 
    ? ['yt-dlp.exe', 'yt-dlp', 'python -m yt_dlp']
    : ['yt-dlp', 'python3 -m yt_dlp', 'python -m yt_dlp'];
  
  for (const cmd of commands) {
    try {
      await execAsync(`${cmd} --version`);
      return cmd;
    } catch (err) {
      continue;
    }
  }
  
  throw new Error(
    'yt-dlp not found! Run the server once to auto-download, or install manually:\n' +
    'Windows: Download from https://github.com/yt-dlp/yt-dlp/releases\n' +
    'macOS: brew install yt-dlp\n' +
    'Linux: sudo pip install yt-dlp'
  );
}

// Helper to find ffmpeg command
async function findFfmpegCommand() {
  await initializeTools();
  
  // First try local tools (Windows)
  if (toolPaths.ffmpeg && fs.existsSync(toolPaths.ffmpeg)) {
    return toolPaths.ffmpeg;
  }
  
  // Fall back to PATH
  const cmd = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  try {
    await execAsync(`${cmd} -version`);
    return cmd;
  } catch (err) {
    throw new Error(
      'ffmpeg not found! Run the server once to auto-download (Windows), or install manually:\n' +
      'Windows: https://www.gyan.dev/ffmpeg/builds/\n' +
      'macOS: brew install ffmpeg\n' +
      'Linux: sudo apt install ffmpeg'
    );
  }
}

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

// Check if transcription is mostly instrumental symbols (indicates vocals separation failed)
function isMostlyInstrumental(segments) {
  if (!segments || segments.length === 0) return false;
  
  const instrumentalSymbols = ['♪', '♫', '♬', '♩', '♭', '♮', '♯'];
  let instrumentalCount = 0;
  let totalSegments = 0;
  
  segments.forEach(seg => {
    const text = (seg.text || '').trim();
    if (text.length > 0) {
      totalSegments++;
      // Check if segment is mostly instrumental symbols
      const isInstrumental = instrumentalSymbols.some(symbol => 
        text.includes(symbol) || text === symbol || text === symbol + symbol
      );
      if (isInstrumental) {
        instrumentalCount++;
      }
    }
  });
  
  // If more than 70% of segments are instrumental symbols, consider it failed
  const instrumentalRatio = totalSegments > 0 ? instrumentalCount / totalSegments : 0;
  return instrumentalRatio > 0.7;
}

// Detect first verse start time using GPT-4.1-nano
async function detectFirstVerse(segments, title, artist) {
  try {
    if (!segments || segments.length === 0) {
      return null;
    }

    // Build context from first 20 segments (to avoid too much context)
    const previewSegments = segments.slice(0, 20).map((seg, idx) => ({
      index: idx,
      start: seg.start || 0,
      end: seg.end || 0,
      text: seg.text || ''
    }));

    const openai = getOpenAI();
    
    const messages = [
      {
        role: "system",
        content: "You are a music analysis expert. Your task is to identify when the actual song starts (first verse) versus introductions, talking, or other non-song content. Return ONLY the start time in seconds as a number, nothing else."
      },
      {
        role: "user",
        content: `Analyze these transcription segments from "${title || 'a song'}" by "${artist || 'an artist'}". 

Find when the first verse of the actual song begins (not introductions, talking, or announcements). 

Segments:
${previewSegments.map(s => `[${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] "${s.text}"`).join('\n')}

Return ONLY the start time in seconds (e.g., 56.0) when the first verse begins. If you can't determine, return the first segment's start time.`
      }
    ];

    console.log('🤖 [GPT] Detecting first verse start time...');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini (gpt-4.1-nano doesn't exist, this is the smallest available)
      messages,
      max_completion_tokens: 80, // As requested
      top_p: 1.0, // As requested
      frequency_penalty: 0, // As requested
      presence_penalty: 0, // As requested
    });

    const result = response.choices[0]?.message?.content?.trim();
    const firstVerseTime = parseFloat(result);

    if (isNaN(firstVerseTime) || firstVerseTime < 0) {
      console.warn('⚠️ [GPT] Invalid first verse time returned, using first segment start');
      return segments[0]?.start || 0;
    }

    console.log(`✅ [GPT] First verse detected at ${firstVerseTime.toFixed(2)}s`);
    return firstVerseTime;
  } catch (error) {
    console.error('❌ [GPT] Error detecting first verse:', error.message);
    // Fallback: return first segment start time
    return segments[0]?.start || 0;
  }
}

// Helper function to retry file operations on Windows
async function retryFileOperation(operation, maxRetries = 5, delay = 200) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err) {
      const isFileLocked = err.message.includes('being used by another process') ||
                          err.message.includes('EACCES') ||
                          err.message.includes('EBUSY');
      
      if (isFileLocked && i < maxRetries - 1) {
        console.log(`⚠️ File locked, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
        continue;
      }
      throw err;
    }
  }
}

// STEP 1 — Download + Convert into perfect Whisper WAV file
async function youtubeToWavBuffer(youtubeUrl) {
  const ts = Date.now();
  const randomId = Math.random().toString(36).substring(2, 9);
  const tempInput = join(tmpdir(), `audio-${ts}-${randomId}.m4a`);
  const tempOutput = join(tmpdir(), `audio-${ts}-${randomId}.wav`);

  try {
    // Find yt-dlp command (auto-downloads if needed)
    const ytDlpCmd = await findYtDlpCommand();
    console.log(`✅ Using yt-dlp: ${ytDlpCmd}`);

    // Download best audio using yt-dlp
    await execAsync(`${ytDlpCmd} -f bestaudio -o "${tempInput}" "${youtubeUrl}"`);
    
    // Wait a bit to ensure file is fully closed on Windows
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify file exists and is readable
    await retryFileOperation(async () => {
      if (!fs.existsSync(tempInput)) {
        throw new Error('Downloaded file does not exist');
      }
      // Try to open file to ensure it's not locked
      const fd = fs.openSync(tempInput, 'r');
      fs.closeSync(fd);
    });

    // Find ffmpeg command (auto-downloads on Windows if needed)
    const ffmpegCmd = await findFfmpegCommand();
    console.log(`✅ Using ffmpeg: ${ffmpegCmd}`);
    
    // Convert to WAV 16kHz mono
    await execAsync(
      `"${ffmpegCmd}" -y -i "${tempInput}" -ac 1 -ar 16000 -f wav "${tempOutput}"`
    );
    
    // Wait a bit to ensure output file is fully written
    await new Promise(resolve => setTimeout(resolve, 100));

    // Read the output file with retry
    const buffer = await retryFileOperation(async () => {
      return fs.readFileSync(tempOutput);
    });

    // Clean up temp files with retry
    const cleanup = async (filePath) => {
      try {
        await retryFileOperation(async () => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }, 3, 100);
      } catch (cleanupErr) {
        console.warn(`⚠️ Failed to cleanup ${filePath}:`, cleanupErr.message);
      }
    };

    // Clean up asynchronously (don't block)
    cleanup(tempInput).catch(() => {});
    cleanup(tempOutput).catch(() => {});

    return buffer;
  } catch (err) {
    console.error("FFMPEG/YTDLP ERROR:", err);
    
    // Clean up on error
    try {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    
    // Provide helpful error message
    if (err.message.includes('not recognized') || err.message.includes('not found')) {
      throw new Error(
        `yt-dlp or ffmpeg not found in PATH. Please install:\n` +
        `- yt-dlp: https://github.com/yt-dlp/yt-dlp/releases\n` +
        `- ffmpeg: https://ffmpeg.org/download.html\n` +
        `Make sure they are in your system PATH.`
      );
    }
    
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
      // Check if cached transcription is mostly instrumental symbols (indicates vocals separation failed)
      const cachedIsInstrumental = isMostlyInstrumental(cached.segments);
      
      if (cachedIsInstrumental) {
        console.warn('⚠️ Cached transcription is mostly instrumental symbols (♪♪)');
        console.warn('   → This indicates vocals separation failed - re-transcribing with original audio...');
        console.log('   → Re-processing and will update database with new transcription...');
        
        // Continue with full processing to get better transcription
        // The upsert at the end will update the existing record with new lyrics and segments
      } else if (cached.first_verse_start_time !== null && cached.first_verse_start_time !== undefined) {
        // Cache is good - return it
        console.log('✅ Loaded from cache:', youtubeId);
        console.log('📝 Cached segments:', cached.segments.length, 'verse lines');
        console.log('🎵 First verse start time:', cached.first_verse_start_time);
        
        // Return cached data including firstVerseStartTime
        return res.json({
          cached: true,
          segments: cached.segments,
          lyrics: cached.lyrics || '',
          notes: cached.notes || null,
          title: cached.title || null,
          artist: cached.artist || null,
          thumbnail: cached.thumbnail || null,
          firstVerseStartTime: cached.first_verse_start_time,
        });
      } else {
        console.log('⚠️ Cache exists but missing first_verse_start_time, detecting first verse from cached segments...');
        
        // Reuse cached segments and only detect first verse
        try {
          const firstVerseStartTime = await detectFirstVerse(cached.segments, cached.title || title, cached.artist || artist);
          
          // Update database with first verse start time
          const { error: updateError } = await supabase
            .from("singfi_songs")
            .update({ first_verse_start_time: firstVerseStartTime })
            .eq("youtube_id", youtubeId);
          
          if (updateError) {
            console.error('❌ [UPDATE] Error updating first_verse_start_time:', updateError.message);
          } else {
            console.log(`✅ [UPDATE] Updated first_verse_start_time to ${firstVerseStartTime.toFixed(2)}s`);
          }
          
          // Return cached data with newly detected first verse
          return res.json({
            cached: true,
            segments: cached.segments,
            lyrics: cached.lyrics || '',
            notes: cached.notes || null,
            title: cached.title || null,
            artist: cached.artist || null,
            thumbnail: cached.thumbnail || null,
            firstVerseStartTime: firstVerseStartTime,
          });
        } catch (error) {
          console.error('❌ [FIRST VERSE] Error detecting first verse from cache:', error.message);
          // Fallback: continue with full processing
          console.log('⚠️ Falling back to full processing...');
        }
      }
      
      // Check if notes are missing - if so, retry pitch extraction only
      if (!cached.notes || (Array.isArray(cached.notes) && cached.notes.length === 0)) {
        console.log('⚠️ [CACHE] Cached song has no notes, retrying pitch extraction...');
        
        // Try to load vocals from file
        const vocalsFilePath = join(vocalsDir, `${youtubeId}.wav`);
        if (fs.existsSync(vocalsFilePath)) {
          console.log(`   → [RETRY PITCH] Found vocals file: ${vocalsFilePath}`);
          try {
            const vocalsBuffer = fs.readFileSync(vocalsFilePath);
            console.log(`   → [RETRY PITCH] Loaded vocals: ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB`);
            
            // Extract pitch from vocals
            const pitchStart = Date.now();
            const pitchExtractionPromise = extractPitch(vocalsBuffer);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Pitch extraction timeout (60s)')), 60000)
            );
            
            const pitchData = await Promise.race([pitchExtractionPromise, timeoutPromise]);
            const pitchTime = ((Date.now() - pitchStart) / 1000).toFixed(1);
            
            if (pitchData && pitchData.length > 0) {
              console.log(`   ✅ [RETRY PITCH] Extracted ${pitchData.length} pitch points in ${pitchTime}s`);
              const notes = generateNotesFromPitch(pitchData, cached.segments);
              console.log(`   ✅ [RETRY PITCH] Generated ${notes.length} notes`);
              
              // Update cache with notes
              await supabase
                .from("singfi_songs")
                .update({ notes: notes })
                .eq("youtube_id", youtubeId);
              
              console.log('   ✅ [RETRY PITCH] Updated cache with notes');
              
              return res.json({
                cached: true,
                segments: cached.segments,
                lyrics: cached.lyrics,
                notes: notes,
                title: cached.title,
                artist: cached.artist,
                thumbnail: cached.thumbnail || null,
              });
            } else {
              console.warn('   ⚠️ [RETRY PITCH] No pitch data extracted, returning cached without notes');
            }
          } catch (retryError) {
            console.error('   ❌ [RETRY PITCH] Pitch extraction retry failed:', retryError.message);
            console.warn('   ⚠️ [RETRY PITCH] Returning cached without notes');
          }
        } else {
          console.warn(`   ⚠️ [RETRY PITCH] Vocals file not found: ${vocalsFilePath}`);
          console.warn('   ⚠️ [RETRY PITCH] Cannot retry pitch extraction, returning cached without notes');
        }
      }
      
      // Return cached data (with or without notes)
      return res.json({
        cached: true,
        segments: cached.segments,
        lyrics: cached.lyrics,
        notes: cached.notes || null, // Notes from vocals pitch extraction
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
    console.log("⚡ Using parallel processing for speed...");

    // Helper function to fetch and upload thumbnail
    const fetchThumbnail = async () => {
      try {
        console.log("📸 Fetching YouTube thumbnail...");
        const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
        
        const thumbnailResponse = await fetch(thumbnailUrl);
        if (thumbnailResponse.ok) {
          const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
          const storagePath = `thumbnails/${youtubeId}.jpg`;
          
          const { error: thumbUploadError } = await supabase
            .storage
            .from('thumbnails')
            .upload(storagePath, thumbnailBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            });
          
          if (thumbUploadError) {
            console.warn('⚠️ Failed to upload thumbnail:', thumbUploadError.message);
            return thumbnailUrl;
          }
          console.log(`✅ Thumbnail saved: ${(thumbnailBuffer.length / 1024).toFixed(2)}KB`);
          return storagePath;
        } else {
          // Try hqdefault fallback
          const hqUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
          const hqResponse = await fetch(hqUrl);
          if (hqResponse.ok) {
            const thumbnailBuffer = Buffer.from(await hqResponse.arrayBuffer());
            const storagePath = `thumbnails/${youtubeId}.jpg`;
            
            const { error } = await supabase.storage
              .from('thumbnails')
              .upload(storagePath, thumbnailBuffer, { contentType: 'image/jpeg', upsert: true });
            
            if (!error) {
              console.log(`✅ Thumbnail saved (hq): ${(thumbnailBuffer.length / 1024).toFixed(2)}KB`);
              return storagePath;
            }
            return hqUrl;
          }
          return thumbnailUrl;
        }
      } catch (error) {
        console.warn('⚠️ Error fetching thumbnail:', error.message);
        return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
      }
    };

    // STEP 1: Download audio + fetch thumbnail IN PARALLEL
    const [wavBuffer, thumbnailStoragePath] = await Promise.all([
      youtubeToWavBuffer(youtubeUrl),
      fetchThumbnail()
    ]);
    
    console.log("WAV size:", (wavBuffer.length / 1024 / 1024).toFixed(2), "MB");

    const openai = getOpenAI();

    // STEP 2: Run Whisper + Demucs IN PARALLEL (biggest time saver!)
    console.log("\n⚡ [PARALLEL PROCESSING] Running Whisper + Demucs in parallel...");
    const parallelStart = Date.now();
    
    const [transcription, vocalsResult] = await Promise.all([
      // Whisper transcription
      (async () => {
        console.log("🎤 [WHISPER] Starting Whisper transcription...");
        const whisperStart = Date.now();
        const result = await openai.audio.transcriptions.create({
          file: new File([wavBuffer], "audio.wav", { type: "audio/wav" }),
          model: "whisper-1",
          response_format: "verbose_json",
        });
        const whisperTime = ((Date.now() - whisperStart) / 1000).toFixed(1);
        console.log(`✅ [WHISPER] Transcription complete in ${whisperTime}s`);
        return result;
      })(),
      
      // Vocal separation with Demucs
      (async () => {
        console.log("🎤 [DEMUCS] Starting vocal separation (Demucs)...");
        const demucsStart = Date.now();
        const result = await separateVocals(wavBuffer, youtubeId).catch((error) => {
          console.warn("⚠️ [DEMUCS] Vocal separation failed:", error.message);
          console.warn("   → This might happen with heavily processed/autotuned vocals or certain music styles");
          return null;
        });
        if (result?.vocals) {
          const demucsTime = ((Date.now() - demucsStart) / 1000).toFixed(1);
          console.log(`✅ [DEMUCS] Vocals isolated successfully in ${demucsTime}s`);
          
          // Additional validation: check if vocals are actually usable
          if (result.vocals.length < 10000) {
            console.warn("   ⚠️ [DEMUCS] Vocals file is suspiciously small - may be empty");
            return null; // Treat as failed
          }
        } else {
          console.warn("   ⚠️ [DEMUCS] No vocals returned from separation");
        }
        return result;
      })()
    ]);
    
    const parallelTime = ((Date.now() - parallelStart) / 1000).toFixed(1);
    console.log(`⚡ [PARALLEL PROCESSING] Both completed in ${parallelTime}s\n`);

    const segments = transcription.segments || [];
    const fullText = transcription.text || "";

    console.log('🎤 Whisper: Total segments:', segments.length);
    
    // Check if transcription is mostly instrumental symbols (♪♪) - indicates vocals separation failed
    const transcriptionIsInstrumental = isMostlyInstrumental(segments);
    
    if (transcriptionIsInstrumental) {
      console.warn('⚠️ [TRANSCRIPTION] Transcription appears to be mostly instrumental symbols (♪♪)');
      console.warn('   → This indicates vocal separation likely failed - will use original audio for pitch extraction');
    }
    
    // Check if segments have word-level data
    const hasWords = segments.length > 0 && segments[0].words && Array.isArray(segments[0].words);
    console.log(`🎤 Whisper: Word-level timestamps available: ${hasWords ? 'YES' : 'NO'}`);
    
    if (segments.length > 0) {
      console.log(`🎤 Whisper: First segment structure:`, {
        hasText: !!segments[0].text,
        hasWords: !!segments[0].words,
        wordsCount: segments[0].words?.length || 0,
        sampleWord: segments[0].words?.[0] || null
      });
    }
    
    let rawSegments;
    
    if (hasWords) {
      // Extract word-by-word from segments
      console.log('🎤 Building word-by-word lyrics from Whisper words...');
      const words = [];
      
      for (const seg of segments) {
        if (seg.words && Array.isArray(seg.words)) {
          for (const word of seg.words) {
            words.push({
              text: word.word || word.text || "",
              start: word.start || seg.start || 0,
              end: word.end || word.start || seg.end || 0,
            });
          }
        } else {
          // Fallback: split segment text by spaces if no word data
          const wordTexts = seg.text.split(/\s+/).filter(w => w.length > 0);
          const segmentDuration = (seg.end || 0) - (seg.start || 0);
          const wordDuration = segmentDuration / wordTexts.length;
          
          wordTexts.forEach((wordText, idx) => {
            words.push({
              text: wordText,
              start: (seg.start || 0) + (idx * wordDuration),
              end: (seg.start || 0) + ((idx + 1) * wordDuration),
            });
          });
        }
      }
      
      // Group words into phrases (3-5 words per phrase for better display)
      rawSegments = [];
      const wordsPerPhrase = 4; // Show 4 words at a time
      
      for (let i = 0; i < words.length; i += wordsPerPhrase) {
        const phraseWords = words.slice(i, i + wordsPerPhrase);
        const phraseText = phraseWords.map(w => w.text).join(' ');
        const phraseStart = phraseWords[0].start;
        const phraseEnd = phraseWords[phraseWords.length - 1].end;
        
        rawSegments.push({
          text: phraseText,
          start: phraseStart,
          end: phraseEnd,
        });
      }
      
      console.log(`🎤 Built ${rawSegments.length} word-based phrases from ${words.length} words`);
    } else {
      // Fallback: use segment-level data (original behavior)
      console.log('🎤 Using segment-level data (no word timestamps available)');
      rawSegments = segments.map(seg => ({
        text: seg.text || "",
        start: seg.start || 0,
        end: seg.end || 0,
      }));
    }

    // STEP 2.5 — Split segments into individual verses (one verse per line)
    // Whisper often groups multiple verses into one segment, so we need to split them
    console.log('🎤 Splitting segments into individual verses...');
    const verseSegments = [];
    
    for (const seg of rawSegments) {
      const text = seg.text || "";
      const start = seg.start || 0;
      const end = seg.end || 0;
      const duration = end - start;
      
      // Split by line breaks first (most common)
      let lines = text.split(/\n+/).filter(line => line.trim().length > 0);
      
      // If no line breaks, try splitting by sentence endings (., !, ?) followed by space
      if (lines.length === 1) {
        lines = text.split(/([.!?]\s+)/).filter(line => line.trim().length > 0);
        // Rejoin punctuation with previous line
        const rejoined = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].match(/^[.!?]\s+$/)) {
            if (rejoined.length > 0) {
              rejoined[rejoined.length - 1] += lines[i];
            }
          } else {
            rejoined.push(lines[i]);
          }
        }
        lines = rejoined.filter(line => line.trim().length > 0);
      }
      
      // If still only one line, try splitting by commas (for very long segments)
      if (lines.length === 1 && text.length > 50) {
        const commaSplit = text.split(/,\s+/);
        if (commaSplit.length > 1) {
          lines = commaSplit.map((line, idx) => 
            idx < commaSplit.length - 1 ? line + ',' : line
          );
        }
      }
      
      // Distribute timing proportionally across verses
      if (lines.length > 1) {
        const lineDuration = duration / lines.length;
        lines.forEach((line, idx) => {
          verseSegments.push({
            text: line.trim(),
            start: start + (idx * lineDuration),
            end: start + ((idx + 1) * lineDuration),
          });
        });
      } else {
        // Single verse, keep as is
        verseSegments.push({
          text: text.trim(),
          start: start,
          end: end,
        });
      }
    }
    
    console.log(`🎤 Split ${rawSegments.length} segments into ${verseSegments.length} individual verses`);
    rawSegments = verseSegments; // Use the split verses

    // STEP 3 — Extract pitch from vocals (fast, ~2-5s)
    // Use original audio as fallback if vocals separation failed or transcription is mostly instrumental
    let notes = null;
    let vocalsBuffer = vocalsResult?.vocals || null;
    let pitchExtractionSucceeded = false;
    let usingOriginalAudio = false;
    
    console.log(`\n🎵 [PITCH EXTRACTION] Starting pitch extraction...`);
    
    // Check if we should use original audio instead of vocals
    if (transcriptionIsInstrumental || !vocalsBuffer || vocalsBuffer.length < 10000) {
      if (transcriptionIsInstrumental) {
        console.warn('   ⚠️ [PITCH] Transcription is mostly instrumental symbols - vocals separation likely failed');
      } else if (!vocalsBuffer) {
        console.warn('   ⚠️ [PITCH] No vocals buffer available');
      } else {
        console.warn('   ⚠️ [PITCH] Vocals buffer too small - likely empty or corrupted');
      }
      console.log('   → [PITCH] Falling back to original audio for pitch extraction');
      vocalsBuffer = wavBuffer; // Use original audio
      usingOriginalAudio = true;
    }
    
    console.log(`   → [PITCH] Audio buffer available: ${vocalsBuffer ? 'YES' : 'NO'}`);
    console.log(`   → [PITCH] Using: ${usingOriginalAudio ? 'ORIGINAL AUDIO (fallback)' : 'ISOLATED VOCALS'}`);
    
    if (vocalsBuffer) {
      console.log(`   → [PITCH] Audio buffer size: ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      try {
        const pitchStart = Date.now();
        // Add timeout to prevent hanging (60 seconds max)
        const pitchExtractionPromise = extractPitch(vocalsBuffer);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Pitch extraction timeout (60s)')), 60000)
        );
        
        console.log(`   → [PITCH] Running pitch detection algorithm...`);
        const pitchData = await Promise.race([pitchExtractionPromise, timeoutPromise]);
        const pitchTime = ((Date.now() - pitchStart) / 1000).toFixed(1);
        
        if (pitchData && pitchData.length > 0) {
          console.log(`   ✅ [PITCH] Extracted ${pitchData.length} pitch points in ${pitchTime}s`);
          console.log(`   → [PITCH] Generating notes from pitch data...`);
          notes = generateNotesFromPitch(pitchData, rawSegments);
          const source = usingOriginalAudio ? 'original audio (fallback)' : 'isolated vocals';
          console.log(`   ✅ [PITCH] Generated ${notes.length} notes from ${source}`);
          pitchExtractionSucceeded = true;
        } else {
          console.warn('   ⚠️ [PITCH] No pitch data extracted');
          console.error('   ❌ [PITCH] Pitch extraction failed - will NOT cache this song');
        }
      } catch (pitchError) {
        console.error('   ❌ [PITCH] Pitch extraction failed:', pitchError.message);
        console.error('   ❌ [PITCH] Will NOT cache this song - pitch extraction must succeed');
      }
    } else {
      console.warn('   ⚠️ [PITCH] No audio buffer available, skipping pitch extraction');
      console.error('   ❌ [PITCH] Cannot extract pitch - will NOT cache this song');
    }
    console.log(`🎵 [PITCH EXTRACTION] Complete\n`);

    // STEP 4.5 — Detect first verse start time using GPT
    console.log('🤖 [FIRST VERSE] Detecting first verse start time...');
    let firstVerseStartTime = null;
    try {
      firstVerseStartTime = await detectFirstVerse(rawSegments, title, artist);
      console.log(`✅ [FIRST VERSE] First verse starts at ${firstVerseStartTime?.toFixed(2)}s`);
    } catch (error) {
      console.error('❌ [FIRST VERSE] Error detecting first verse:', error.message);
      // Fallback to first segment start time
      firstVerseStartTime = rawSegments[0]?.start || 0;
    }

    // STEP 5 — Save segments and notes to database
    // Save even if pitch extraction failed - can retry pitch extraction later
    console.log('💾 [SAVE] Saving to database...');
    const { error: saveError } = await supabase
      .from("singfi_songs")
      .upsert(
        {
          youtube_id: youtubeId,
          title: title || null,
          artist: artist || null,
          lyrics: fullText,
          segments: rawSegments, // Use raw Whisper segments
          notes: notes || null, // Notes extracted from isolated vocals (null if pitch extraction failed)
          thumbnail: thumbnailStoragePath, // Thumbnail path in Storage or YouTube URL
          first_verse_start_time: firstVerseStartTime, // Start time of first verse
          owner: owner || null, // User UUID for RLS (optional for now)
        },
        { onConflict: "youtube_id" }
      );

    if (saveError) {
      console.error('❌ [SAVE] Error saving to database:', saveError.message);
    } else {
      if (pitchExtractionSucceeded && notes && notes.length > 0) {
        console.log(`✅ [SAVE] Saved lyrics, segments, and notes to database`);
      } else {
        console.log(`✅ [SAVE] Saved lyrics and segments to database (notes will be added later if pitch extraction retries)`);
      }
    }

    console.log('✅ Game ready! Segments:', rawSegments.length, 'Lyrics length:', fullText.length);

    res.json({
      cached: false,
      segments: rawSegments, // Return raw Whisper segments
      lyrics: fullText,
      notes: notes, // Notes extracted from isolated vocals
      title: title || null,
      artist: artist || null,
      thumbnail: thumbnailStoragePath || null,
      firstVerseStartTime: firstVerseStartTime, // First verse start time
    });
  } catch (error) {
    console.error("Whisper error:", error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
    console.error("Error details:", error);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
