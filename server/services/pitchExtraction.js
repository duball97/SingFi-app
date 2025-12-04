import * as PitchFinder from 'pitchfinder';
import WaveFileModule from 'wavefile';

const WaveFile = WaveFileModule.WaveFile;

/**
 * Extract pitch from isolated vocals audio using pitchfinder (Node.js)
 * Returns array of {time, pitch} objects
 */
export async function extractPitch(vocalsBuffer) {
  try {
    console.log('🎵 Extracting pitch from isolated vocals using pitchfinder...');
    
    // Parse WAV file
    const wav = new WaveFile(vocalsBuffer);
    
    // Convert to mono if stereo
    if (wav.fmt.numChannels > 1) {
      wav.toMono();
    }
    
    // Convert to 32-bit float and resample to 22050 Hz (good for pitch detection)
    wav.toBitDepth('32f');
    wav.toSampleRate(22050);
    
    // Get audio samples as Float32Array (mono)
    const samples = wav.getSamples(false, Float32Array);
    const sampleRate = wav.fmt.sampleRate;
    
    console.log(`   → Audio: ${samples.length} samples at ${sampleRate}Hz`);
    
    // Create pitch detector (YIN algorithm is good for vocals)
    const detectPitch = PitchFinder.YIN({ sampleRate });
    
    // Extract pitch at regular intervals (every 0.1 seconds = 100ms)
    const interval = Math.floor(sampleRate * 0.1); // 0.1 second chunks
    const pitchData = [];
    
    for (let i = 0; i < samples.length - interval; i += interval) {
      const chunk = samples.slice(i, i + interval);
      const pitch = detectPitch(chunk);
      
      if (pitch && pitch > 80 && pitch < 2000) { // Valid pitch range
        const time = i / sampleRate;
        pitchData.push({
          time: parseFloat(time.toFixed(3)),
          pitch: parseFloat(pitch.toFixed(2))
        });
      }
    }
    
    console.log(`✅ Extracted ${pitchData.length} pitch points`);
    
    if (pitchData.length > 0) {
      console.log(`   → Pitch range: ${Math.min(...pitchData.map(p => p.pitch)).toFixed(1)}Hz - ${Math.max(...pitchData.map(p => p.pitch)).toFixed(1)}Hz`);
    }
    
    return pitchData;
    
  } catch (error) {
    console.error('❌ Pitch extraction error:', error);
    throw new Error(`Pitch extraction failed: ${error.message}`);
  }
}

/**
 * Cluster pitch data into SingStar-style notes
 * Groups consecutive similar pitches into note bars
 */
export function generateNotesFromPitch(pitchData, segments) {
  if (!pitchData || pitchData.length === 0) {
    return [];
  }

  const notes = [];
  const minNoteDuration = 0.2; // Minimum note length in seconds
  const maxNoteDuration = 3.0; // Maximum note length in seconds
  const pitchTolerance = 20; // Hz tolerance for grouping similar pitches

  let currentNote = null;

  for (const point of pitchData) {
    const { time, pitch } = point;

    if (!currentNote) {
      // Start new note
      currentNote = {
        start: time,
        end: time,
        targetPitch: pitch,
        duration: 0,
      };
    } else {
      const pitchDiff = Math.abs(pitch - currentNote.targetPitch);
      
      if (pitchDiff <= pitchTolerance && (time - currentNote.end) < 0.3) {
        // Continue current note (similar pitch, close in time)
        currentNote.end = time;
        currentNote.duration = currentNote.end - currentNote.start;
        // Update target pitch to average
        currentNote.targetPitch = (currentNote.targetPitch + pitch) / 2;
      } else {
        // Finish current note and start new one
        if (currentNote.duration >= minNoteDuration) {
          notes.push({
            start: currentNote.start,
            end: currentNote.end,
            targetPitch: Math.round(currentNote.targetPitch),
            duration: currentNote.duration,
          });
        }
        
        currentNote = {
          start: time,
          end: time,
          targetPitch: pitch,
          duration: 0,
        };
      }
    }
  }

  // Add final note
  if (currentNote && currentNote.duration >= minNoteDuration) {
    notes.push({
      start: currentNote.start,
      end: currentNote.end,
      targetPitch: Math.round(currentNote.targetPitch),
      duration: currentNote.duration,
    });
  }

  console.log(`✅ Generated ${notes.length} notes from pitch data`);
  return notes;
}

