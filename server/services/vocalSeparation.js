import { replicate } from './replicate.js';
import { vocalLocks } from './globalLocks.js';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Vocals directory for provisional storage
const vocalsDir = join(__dirname, '../../vocals');
if (!fs.existsSync(vocalsDir)) {
  fs.mkdirSync(vocalsDir, { recursive: true });
  console.log('📁 Created vocals directory:', vocalsDir);
}

/**
 * Separates vocals from audio using Replicate Demucs API
 * @param {Buffer} audioBuffer - WAV audio buffer
 * @param {string} youtubeId - YouTube video ID for locking (prevents duplicate calls)
 * @returns {Promise<{vocals: Buffer, accompaniment: Buffer}>}
 */
export async function separateVocals(audioBuffer, youtubeId) {
  console.log(`\n🔵 [VOCAL SEPARATION START] YouTube ID: ${youtubeId}`);
  console.log(`   → Input audio size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)}MB`);
  
  // If another request is already processing this song, WAIT
  if (vocalLocks.has(youtubeId)) {
    console.log(`⏳ [VOCAL SEPARATION] Waiting for existing vocal separation for: ${youtubeId}`);
    return await vocalLocks.get(youtubeId);
  }

  const promise = (async () => {
    try {
      console.log(`🎤 [DEMUCS] Running Demucs ONCE for: ${youtubeId}`);
      console.log(`   → [DEMUCS] Uploading audio to Replicate...`);
      const uploadStart = Date.now();
      
      // Replicate SDK automatically handles Buffer uploads - no manual upload needed!
      const output = await replicate.run(
        "ryan5453/demucs:5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77",
        {
          input: {
            audio: audioBuffer, // Pass Buffer directly - SDK handles upload
            model: "htdemucs_ft",
            stem: "vocals", // Only get vocals
            output_format: "wav",
            split: true,
            shifts: 1,
            overlap: 0.25,
            clip_mode: "rescale",
          }
        }
      );

      const uploadTime = ((Date.now() - uploadStart) / 1000).toFixed(1);
      console.log(`   → [DEMUCS] Upload complete in ${uploadTime}s`);
      console.log(`   → [DEMUCS] Processing on Replicate...`);

      if (!output || !output.vocals) {
        throw new Error('Invalid response from Replicate - no vocals found');
      }

      console.log(`   → [DEMUCS] Got output from Replicate`);
      console.log(`   → [DEMUCS] Vocals URL: ${output.vocals}`);

      // Download vocals from Replicate's URL
      console.log(`   → [GETTING VOCALS] Downloading isolated vocals from Replicate...`);
      const downloadStart = Date.now();
      const vocalsResponse = await fetch(output.vocals);
      if (!vocalsResponse.ok) {
        throw new Error(`Failed to download vocals: ${vocalsResponse.statusText}`);
      }
      
      const vocalsBuffer = Buffer.from(await vocalsResponse.arrayBuffer());
      const downloadTime = ((Date.now() - downloadStart) / 1000).toFixed(1);
      console.log(`   → [GETTING VOCALS] Download complete in ${downloadTime}s`);
      console.log(`   → [GETTING VOCALS] Vocals size: ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      // Validate vocals buffer - check if it's too small or likely empty
      const minVocalsSize = 10000; // ~10KB minimum for a valid WAV file
      if (vocalsBuffer.length < minVocalsSize) {
        throw new Error(`Vocals file too small (${vocalsBuffer.length} bytes) - likely empty or corrupted`);
      }
      
      // Check if vocals buffer appears to be silent/empty by sampling audio data
      // WAV files have a header (typically 44 bytes), then audio data
      // Sample some audio data to see if it's all zeros (silent)
      if (vocalsBuffer.length > 100) {
        const sampleStart = 100; // Skip WAV header
        const sampleEnd = Math.min(sampleStart + 1000, vocalsBuffer.length);
        const sample = vocalsBuffer.slice(sampleStart, sampleEnd);
        const hasAudio = sample.some(byte => byte !== 0 && byte !== 128); // Check for non-zero/non-midpoint values
        
        if (!hasAudio) {
          console.warn(`   ⚠️ [VALIDATION] Vocals buffer appears to be silent/empty`);
          throw new Error('Vocals appear to be silent or empty after separation');
        }
      }
      
      console.log(`   ✅ [VALIDATION] Vocals buffer validated - contains audio data`);
      
      // Save vocals provisionally to vocals folder
      const vocalsFilePath = join(vocalsDir, `${youtubeId}.wav`);
      try {
        console.log(`   → [SAVING VOCALS] Saving to: ${vocalsFilePath}`);
        fs.writeFileSync(vocalsFilePath, vocalsBuffer);
        console.log(`   ✅ [SAVING VOCALS] Saved provisionally: ${vocalsFilePath} (${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB)`);
      } catch (saveError) {
        console.warn(`   ⚠️ [SAVING VOCALS] Failed to save: ${saveError.message}`);
      }
      
      // Also get accompaniment if needed (for future use)
      let accompanimentBuffer = null;
      if (output.other) {
        console.log(`   → [GETTING ACCOMPANIMENT] Downloading accompaniment...`);
        const accompResponse = await fetch(output.other);
        if (accompResponse.ok) {
          accompanimentBuffer = Buffer.from(await accompResponse.arrayBuffer());
          console.log(`   → [GETTING ACCOMPANIMENT] Accompaniment size: ${(accompanimentBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        }
      }

      console.log(`✅ [VOCAL SEPARATION COMPLETE] ${youtubeId} - ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB vocals\n`);

      return {
        vocals: vocalsBuffer,
        accompaniment: accompanimentBuffer
      };
    } catch (error) {
      console.error(`❌ [VOCAL SEPARATION ERROR] ${youtubeId}:`, error);
      console.error(`   → Error details:`, error.message);
      throw new Error(`Vocal separation failed: ${error.message}`);
    } finally {
      // Always remove lock when done (success or failure)
      vocalLocks.delete(youtubeId);
      console.log(`🔵 [VOCAL SEPARATION END] ${youtubeId}\n`);
    }
  })();

  // Store promise so all other concurrent calls wait for it
  vocalLocks.set(youtubeId, promise);
  return promise;
}

