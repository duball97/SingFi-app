import express from "express";
import { supabase } from "../services/supabase.js";
import { separateVocals } from "../services/vocalSeparation.js";
import fs from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Create vocals directory if it doesn't exist
const vocalsDir = join(__dirname, '../../vocals');
if (!fs.existsSync(vocalsDir)) {
  fs.mkdirSync(vocalsDir, { recursive: true });
  console.log('📁 Created vocals directory:', vocalsDir);
}

/**
 * Get or process vocals for a YouTube video
 * Checks Supabase Storage first, processes with Replicate if needed
 */
router.post("/", async (req, res) => {
  try {
    const { youtubeId, audioBuffer } = req.body;

    if (!youtubeId) {
      return res.status(400).json({ error: "youtubeId required" });
    }

    if (!audioBuffer) {
      return res.status(400).json({ error: "audioBuffer required (base64 encoded WAV)" });
    }

    // Convert base64 back to buffer
    const wavBuffer = Buffer.from(audioBuffer, 'base64');

    // Check if vocals already exist in Supabase Storage
    const vocalsStoragePath = `${youtubeId}.wav`;
    let vocalsBuffer;

    try {
      console.log(`🔍 Checking for existing vocals in storage: ${vocalsStoragePath}`);
      const { data: existingFile, error: downloadError } = await supabase
        .storage
        .from('vocals')
        .download(vocalsStoragePath);

      if (existingFile && !downloadError) {
        console.log('✅ Found existing vocals in storage, downloading...');
        const arrayBuffer = await existingFile.arrayBuffer();
        vocalsBuffer = Buffer.from(arrayBuffer);
        console.log(`✅ Loaded vocals from storage: ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB`);
        
        return res.json({
          cached: true,
          vocals: vocalsBuffer.toString('base64'),
          storagePath: vocalsStoragePath,
        });
      } else {
        throw new Error('Vocals not found in storage');
      }
    } catch (error) {
      console.log('📝 Vocals not in storage, processing with Replicate...');

      // Process vocals with Replicate Demucs
      const vocalsResult = await separateVocals(wavBuffer, youtubeId).catch((error) => {
        console.warn("⚠️ Vocal separation failed, using full audio:", error.message);
        return { vocals: wavBuffer }; // Fallback to full audio
      });

      vocalsBuffer = vocalsResult.vocals;
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
            upsert: true // Overwrite if exists
          });

        if (uploadError) {
          console.error('❌ Supabase Storage upload error:', uploadError);
          console.error('   Error details:', JSON.stringify(uploadError, null, 2));
          console.warn('⚠️ Vocals saved locally but NOT to Supabase Storage');
        } else {
          console.log(`✅ Vocals saved to Supabase Storage: ${(vocalsBuffer.length / 1024 / 1024).toFixed(2)}MB`);
          if (uploadData) {
            console.log('   Upload data:', uploadData);
          }
        }
      } catch (storageError) {
        console.error('❌ Supabase Storage exception:', storageError);
        console.warn('⚠️ Vocals saved locally but NOT to Supabase Storage');
      }

      return res.json({
        cached: false,
        vocals: vocalsBuffer.toString('base64'),
        storagePath: vocalsStoragePath,
      });
    }
  } catch (error) {
    console.error("Vocals error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

