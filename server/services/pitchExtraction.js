import WaveFileModule from 'wavefile';

const WaveFile = WaveFileModule.WaveFile;

/**
 * Fast autocorrelation-based pitch detection (much faster than YIN)
 * Returns pitch in Hz or null if no clear pitch found
 */
function detectPitchFast(samples, sampleRate) {
  const bufferLength = samples.length;
  if (bufferLength < 100) return null; // Need minimum samples
  
  // Calculate valid period range (80Hz to 2000Hz)
  const maxPeriod = Math.min(Math.floor(bufferLength / 2), Math.floor(sampleRate / 80)); // Min 80Hz
  const minPeriod = Math.max(2, Math.floor(sampleRate / 2000)); // Max 2000Hz
  
  if (minPeriod >= maxPeriod) return null;
  
  let maxCorrelation = 0;
  let bestPeriod = 0;
  
  // Optimized autocorrelation - use more samples for better accuracy
  // Increased to ~100 checks for better vocal pitch detection
  const step = Math.max(1, Math.floor((maxPeriod - minPeriod) / 100));
  
  for (let period = minPeriod; period < maxPeriod; period += step) {
    let correlation = 0;
    const checkLength = Math.min(bufferLength - period, 4096); // Increased window for better accuracy
    
    for (let i = 0; i < checkLength; i++) {
      correlation += Math.abs(samples[i] * samples[i + period]);
    }
    
    // Normalize by length
    correlation /= checkLength;
    
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestPeriod = period;
    }
  }
  
  // Refine around the peak for better accuracy
  // Lower threshold for vocals (they can be quieter)
  if (bestPeriod > 0 && maxCorrelation > 0.05) {
    // Check neighbors of the peak
    for (let offset = -2; offset <= 2; offset++) {
      const period = bestPeriod + offset;
      if (period >= minPeriod && period < maxPeriod) {
        let correlation = 0;
        const checkLength = Math.min(bufferLength - period, 2048);
        for (let i = 0; i < checkLength; i++) {
          correlation += Math.abs(samples[i] * samples[i + period]);
        }
        correlation /= checkLength;
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestPeriod = period;
        }
      }
    }
    
    const frequency = sampleRate / bestPeriod;
    if (frequency >= 80 && frequency <= 2000) {
      return frequency;
    }
  }
  
  return null;
}

/**
 * Extract pitch from isolated vocals audio using fast autocorrelation
 * Returns array of {time, pitch} objects
 */
export async function extractPitch(vocalsBuffer) {
  try {
    console.log('🎵 Extracting pitch from isolated vocals (fast autocorrelation)...');
    const startTime = Date.now();
    
    // Check buffer size - skip if too large (> 100MB)
    const bufferSizeMB = vocalsBuffer.length / (1024 * 1024);
    console.log(`   → [STEP 1] Buffer size: ${bufferSizeMB.toFixed(2)}MB`);
    
    if (bufferSizeMB > 100) {
      console.warn(`   ⚠️ [SKIP] Buffer too large (${bufferSizeMB.toFixed(0)}MB > 100MB limit), skipping pitch extraction`);
      return [];
    }
    
    // Parse WAV file
    console.log(`   → [STEP 2] Parsing WAV file...`);
    const parseStart = Date.now();
    const wav = new WaveFile(vocalsBuffer);
    console.log(`   → [STEP 2] WAV parsed in ${Date.now() - parseStart}ms`);
    
    // Get format info
    const sampleRate = wav.fmt.sampleRate;
    const numChannels = wav.fmt.numChannels;
    const bitDepth = wav.bitDepth;
    console.log(`   → [STEP 2] Format: ${sampleRate}Hz, ${numChannels}ch, ${bitDepth}bit`);
    
    // Get samples using wavefile's proper method
    console.log(`   → [STEP 3] Getting samples...`);
    const samplesStart = Date.now();
    
    // Use getSamples with Float32Array - this handles conversion properly
    let samples;
    try {
      // Get samples as Float32Array (non-interleaved, returns array of channel arrays)
      const channelSamples = wav.getSamples(false, Float32Array);
      console.log(`   → [STEP 3] Got channel samples: type=${typeof channelSamples}, isArray=${Array.isArray(channelSamples)}, constructor=${channelSamples?.constructor?.name}`);
      
      if (channelSamples instanceof Float32Array) {
        // Single channel or interleaved format
        console.log(`   → [STEP 3] Single channel/interleaved: ${channelSamples.length} samples`);
        samples = channelSamples;
      } else if (Array.isArray(channelSamples) && channelSamples.length > 0) {
        // Multi-channel: array of channel arrays (each element is a Float32Array)
        const firstElement = channelSamples[0];
        console.log(`   → [STEP 3] First element: type=${typeof firstElement}, isArray=${Array.isArray(firstElement)}, isFloat32Array=${firstElement instanceof Float32Array}, constructor=${firstElement?.constructor?.name}`);
        
        if (firstElement instanceof Float32Array) {
          // Multi-channel: array of Float32Arrays
          console.log(`   → [STEP 3] Multi-channel format: ${channelSamples.length} channels, first channel has ${firstElement.length} samples`);
          
          // Use first channel
          samples = firstElement;
        } else if (Array.isArray(firstElement)) {
          // Nested arrays (shouldn't happen with Float32Array type, but handle it)
          console.log(`   → [STEP 3] Nested array format: ${channelSamples.length} channels`);
          samples = Float32Array.from(firstElement);
        } else {
          // Try to convert first element to Float32Array
          console.log(`   → [STEP 3] Attempting to convert first element to Float32Array...`);
          samples = Float32Array.from(channelSamples[0]);
        }
      } else {
        throw new Error(`Unexpected sample format: ${typeof channelSamples}, isArray=${Array.isArray(channelSamples)}`);
      }
    } catch (e) {
      console.error(`   → [STEP 3] Error getting samples: ${e.message}`);
      console.error(`   → [STEP 3] Error stack: ${e.stack}`);
      throw new Error(`Failed to extract samples: ${e.message}`);
    }
    
    console.log(`   → [STEP 3] Extracted ${samples.length} samples in ${Date.now() - samplesStart}ms`);
    
    if (!samples || samples.length < 1000) {
      console.warn(`   ⚠️ [SKIP] Not enough samples (${samples?.length || 0}), skipping pitch extraction`);
      return [];
    }
    
    // Check sample values
    const sampleMin = Math.min(...Array.from(samples.slice(0, 10000)));
    const sampleMax = Math.max(...Array.from(samples.slice(0, 10000)));
    console.log(`   → [STEP 3] Sample range: [${sampleMin.toFixed(4)}, ${sampleMax.toFixed(4)}]`);
    
    // Normalize if needed (samples should already be in -1 to 1 range for Float32Array)
    if (sampleMax > 1 || sampleMin < -1) {
      console.log(`   → [STEP 4] Normalizing samples...`);
      const normalizeStart = Date.now();
      const maxAbs = Math.max(Math.abs(sampleMin), Math.abs(sampleMax));
      if (maxAbs > 0) {
        for (let i = 0; i < samples.length; i++) {
          samples[i] = samples[i] / maxAbs;
        }
      }
      console.log(`   → [STEP 4] Normalized in ${Date.now() - normalizeStart}ms`);
    }
    
    const finalMin = Math.min(...Array.from(samples.slice(0, 10000)));
    const finalMax = Math.max(...Array.from(samples.slice(0, 10000)));
    console.log(`   → [STEP 4] Final sample range: [${finalMin.toFixed(4)}, ${finalMax.toFixed(4)}]`);
    
    // Extract pitch at intervals - use longer chunks for better vocal pitch detection
    const interval = Math.floor(sampleRate * 0.3); // 0.3 second jumps (more frequent)
    const pitchData = [];
    const chunkSize = Math.floor(sampleRate * 0.25); // Use 250ms chunks (longer = more accurate for vocals)
    const totalChunks = Math.floor((samples.length - chunkSize) / interval);
    
    console.log(`   → [STEP 5] Processing ${totalChunks} chunks (every 0.3s, 250ms chunks)...`);
    
    if (totalChunks <= 0) {
      console.warn(`   ⚠️ [SKIP] Not enough data for chunks (samples: ${samples.length}, chunkSize: ${chunkSize})`);
      return [];
    }
    
    let processed = 0;
    let validPitches = 0;
    let nullPitches = 0;
    const pitchStart = Date.now();
    for (let i = 0; i < samples.length - chunkSize; i += interval) {
      const chunk = samples.slice(i, i + chunkSize);
      
      // Apply simple high-pass filter to reduce low-frequency noise
      const filteredChunk = new Float32Array(chunk.length);
      const alpha = 0.95; // High-pass filter coefficient
      filteredChunk[0] = chunk[0];
      for (let j = 1; j < chunk.length; j++) {
        filteredChunk[j] = alpha * (filteredChunk[j-1] + chunk[j] - chunk[j-1]);
      }
      
      const pitch = detectPitchFast(filteredChunk, sampleRate);
      
      if (pitch) {
        const time = i / sampleRate;
        pitchData.push({
          time: parseFloat(time.toFixed(3)),
          pitch: parseFloat(pitch.toFixed(2))
        });
        validPitches++;
      } else {
        nullPitches++;
      }
      
      processed++;
      // Log progress every 50 chunks
      if (processed % 50 === 0 || processed === totalChunks) {
        console.log(`   → [PROGRESS] ${processed}/${totalChunks} (${((processed / totalChunks) * 100).toFixed(0)}%) - ${validPitches} valid, ${nullPitches} null`);
      }
    }
    
    console.log(`   → [STEP 5] Pitch detection: ${validPitches} valid pitches, ${nullPitches} null pitches`);
    console.log(`   → [STEP 5] Pitch detection done in ${Date.now() - pitchStart}ms`);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Extracted ${pitchData.length} pitch points in ${elapsed}s`);
    
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
 * NOW WITH BETTER NORMALIZATION AND DISTRIBUTION
 */
export function generateNotesFromPitch(pitchData, segments) {
  if (!pitchData || pitchData.length === 0) {
    console.warn('⚠️ [NOTES] No pitch data provided to generateNotesFromPitch');
    return [];
  }

  console.log(`📊 [NOTES] Generating normalized notes from ${pitchData.length} pitch points...`);
  
  // Step 1: Analyze pitch range for normalization
  const validPitches = pitchData.filter(p => p.pitch && p.pitch > 50 && p.pitch < 2000);
  if (validPitches.length === 0) {
    console.warn('⚠️ [NOTES] No valid pitch data found');
    return [];
  }
  
  const allPitches = validPitches.map(p => p.pitch).sort((a, b) => a - b);
  
  // Use percentiles to ignore outliers
  const p10 = allPitches[Math.floor(allPitches.length * 0.1)];
  const p90 = allPitches[Math.floor(allPitches.length * 0.9)];
  const medianPitch = allPitches[Math.floor(allPitches.length * 0.5)];
  
  console.log(`   → Pitch analysis: p10=${p10.toFixed(0)}Hz, median=${medianPitch.toFixed(0)}Hz, p90=${p90.toFixed(0)}Hz`);
  
  // Step 2: Use segment-aware note generation
  // Generate notes that align with lyric segments when possible
  const notes = [];
  const minNoteDuration = 0.3; // Slightly longer minimum
  const maxNoteDuration = 4.0; // Shorter max for better rhythm
  
  // Use relative pitch tolerance (percentage of pitch range)
  const pitchRange = p90 - p10;
  const pitchTolerance = Math.max(30, pitchRange * 0.15); // 15% of range, minimum 30Hz
  const maxTimeGap = 0.4;

  let currentNote = null;
  let noteCount = 0;

  for (const point of pitchData) {
    const { time, pitch } = point;
    
    // Skip invalid or outlier pitches
    if (!pitch || pitch < p10 * 0.8 || pitch > p90 * 1.2) {
      if (currentNote && currentNote.duration >= minNoteDuration) {
        notes.push(finalizeNote(currentNote));
        noteCount++;
      }
      currentNote = null;
      continue;
    }

    if (!currentNote) {
      currentNote = {
        start: time,
        end: time,
        pitchSum: pitch,
        pitchCount: 1,
        minPitch: pitch,
        maxPitch: pitch,
      };
    } else {
      const avgPitch = currentNote.pitchSum / currentNote.pitchCount;
      const pitchDiff = Math.abs(pitch - avgPitch);
      const timeGap = time - currentNote.end;
      const currentDuration = time - currentNote.start;
      
      // Continue note if: similar pitch, small gap, not too long
      if (pitchDiff <= pitchTolerance && timeGap <= maxTimeGap && currentDuration < maxNoteDuration) {
        currentNote.end = time;
        currentNote.pitchSum += pitch;
        currentNote.pitchCount++;
        currentNote.minPitch = Math.min(currentNote.minPitch, pitch);
        currentNote.maxPitch = Math.max(currentNote.maxPitch, pitch);
      } else {
        // Finish current note
        if (currentNote.end - currentNote.start >= minNoteDuration) {
          notes.push(finalizeNote(currentNote));
          noteCount++;
        }
        
        // Start new note
        currentNote = {
          start: time,
          end: time,
          pitchSum: pitch,
          pitchCount: 1,
          minPitch: pitch,
          maxPitch: pitch,
        };
      }
    }
  }

  // Finalize last note
  if (currentNote && currentNote.end - currentNote.start >= minNoteDuration) {
    notes.push(finalizeNote(currentNote));
  }

  function finalizeNote(note) {
    const avgPitch = note.pitchSum / note.pitchCount;
    const duration = Math.max(minNoteDuration, note.end - note.start);
    
    return {
      start: parseFloat(note.start.toFixed(3)),
      end: parseFloat((note.start + duration).toFixed(3)),
      duration: parseFloat(duration.toFixed(3)),
      targetPitch: Math.round(avgPitch),
      confidence: note.pitchCount, // More samples = more confident
    };
  }

  console.log(`   → Generated ${notes.length} raw notes`);
  
  // Step 3: Sort and remove overlaps
  notes.sort((a, b) => a.start - b.start);
  
  const cleanNotes = [];
  for (const note of notes) {
    if (cleanNotes.length === 0) {
      cleanNotes.push({ ...note });
    } else {
      const prev = cleanNotes[cleanNotes.length - 1];
      if (note.start >= prev.end) {
        // No overlap
        cleanNotes.push({ ...note });
      } else if (note.start >= prev.start) {
        // Overlap - keep the one with higher confidence, or merge
        if (note.confidence > prev.confidence * 1.5) {
          // New note is much more confident - shorten previous
          prev.end = note.start;
          prev.duration = prev.end - prev.start;
          if (prev.duration >= minNoteDuration) {
            cleanNotes.push({ ...note });
          } else {
            cleanNotes.pop();
            cleanNotes.push({ ...note });
          }
        } else {
          // Keep previous, extend it to cover both
          prev.end = Math.max(prev.end, note.end);
          prev.duration = prev.end - prev.start;
          prev.targetPitch = Math.round((prev.targetPitch + note.targetPitch) / 2);
        }
      }
    }
  }
  
  // Step 4: Ensure notes are well-distributed and have good variety
  // Remove notes that are too close together (keep more spaced notes)
  const spacedNotes = [];
  const minSpacing = 0.5; // Minimum gap between notes
  
  for (const note of cleanNotes) {
    if (spacedNotes.length === 0) {
      spacedNotes.push(note);
    } else {
      const lastNote = spacedNotes[spacedNotes.length - 1];
      const gap = note.start - lastNote.end;
      
      if (gap >= 0) {
        // No overlap, add the note
        spacedNotes.push(note);
      }
    }
  }
  
  // Step 5: Cap total notes per segment for performance
  // If using segments, distribute notes across them
  let finalNotes = spacedNotes;
  
  if (segments && segments.length > 0) {
    console.log(`   → Distributing notes across ${segments.length} segments...`);
    const notesPerSegment = [];
    
    for (const segment of segments) {
      const segStart = Number(segment.start) || 0;
      const segEnd = Number(segment.end) || segStart + 5;
      
      // Find notes in this segment
      const segNotes = finalNotes.filter(n => 
        n.start < segEnd && n.end > segStart
      );
      
      // Keep up to 6 notes per segment, prefer higher confidence
      segNotes.sort((a, b) => (b.confidence || 1) - (a.confidence || 1));
      notesPerSegment.push(...segNotes.slice(0, 6));
    }
    
    // Remove duplicates and sort
    const seen = new Set();
    finalNotes = notesPerSegment
      .filter(n => {
        const key = `${n.start}-${n.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.start - b.start);
  }
  
  console.log(`✅ Final: ${finalNotes.length} notes`);
  
  if (finalNotes.length > 0) {
    const pitches = finalNotes.map(n => n.targetPitch);
    console.log(`   → Pitch range: ${Math.min(...pitches)}Hz - ${Math.max(...pitches)}Hz`);
    console.log(`   → Duration range: ${Math.min(...finalNotes.map(n => n.duration)).toFixed(2)}s - ${Math.max(...finalNotes.map(n => n.duration)).toFixed(2)}s`);
    console.log(`   → Time span: ${finalNotes[0].start.toFixed(2)}s - ${finalNotes[finalNotes.length - 1].end.toFixed(2)}s`);
    
    // Log sample notes
    console.log(`   → Sample notes:`);
    finalNotes.slice(0, 5).forEach((n, i) => {
      console.log(`      [${i}] ${n.start.toFixed(2)}s-${n.end.toFixed(2)}s: ${n.targetPitch}Hz`);
    });
  }
  
  return finalNotes;
}

