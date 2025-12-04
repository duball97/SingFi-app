import { replicate } from './replicate.js';
import { vocalLocks } from './globalLocks.js';

/**
 * Separates vocals from audio using Replicate Demucs API
 * @param {Buffer} audioBuffer - WAV audio buffer
 * @param {string} youtubeId - YouTube video ID for locking (prevents duplicate calls)
 * @returns {Promise<{vocals: Buffer, accompaniment: Buffer}>}
 */
export async function separateVocals(audioBuffer, youtubeId) {
  // If another request is already processing this song, WAIT
  if (vocalLocks.has(youtubeId)) {
    console.log(`⏳ Waiting for existing vocal separation for: ${youtubeId}`);
    return await vocalLocks.get(youtubeId);
  }

  const promise = (async () => {
    try {
      console.log(`🎤 Running Demucs ONCE for: ${youtubeId}`);
      
      // Replicate SDK automatically handles Buffer uploads - no manual upload needed!
      console.log('   → Running Demucs on Replicate (uploading file automatically)...');
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

      if (!output || !output.vocals) {
        throw new Error('Invalid response from Replicate - no vocals found');
      }

      // Download vocals from Replicate's URL
      console.log('   → Downloading isolated vocals...');
      const vocalsResponse = await fetch(output.vocals);
      if (!vocalsResponse.ok) {
        throw new Error(`Failed to download vocals: ${vocalsResponse.statusText}`);
      }
      
      const vocalsBuffer = Buffer.from(await vocalsResponse.arrayBuffer());
      
      // Also get accompaniment if needed (for future use)
      let accompanimentBuffer = null;
      if (output.other) {
        const accompResponse = await fetch(output.other);
        if (accompResponse.ok) {
          accompanimentBuffer = Buffer.from(await accompResponse.arrayBuffer());
        }
      }

      console.log(`✅ DONE 1x vocalsep: ${youtubeId} - ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB vocals`);

      return {
        vocals: vocalsBuffer,
        accompaniment: accompanimentBuffer
      };
    } catch (error) {
      console.error(`❌ Vocal separation error for ${youtubeId}:`, error);
      throw new Error(`Vocal separation failed: ${error.message}`);
    } finally {
      // Always remove lock when done (success or failure)
      vocalLocks.delete(youtubeId);
    }
  })();

  // Store promise so all other concurrent calls wait for it
  vocalLocks.set(youtubeId, promise);
  return promise;
}

