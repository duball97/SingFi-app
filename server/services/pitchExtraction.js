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
 */
export function generateNotesFromPitch(pitchData, segments) {
  if (!pitchData || pitchData.length === 0) {
    console.warn('⚠️ [NOTES] No pitch data provided to generateNotesFromPitch');
    return [];
  }

  console.log(`📊 [NOTES] Generating notes from ${pitchData.length} pitch points...`);
  
  // Check first few pitch points for debugging
  if (pitchData.length > 0) {
    console.log(`   → First pitch point: time=${pitchData[0].time?.toFixed(2)}s, pitch=${pitchData[0].pitch?.toFixed(1)}Hz`);
    if (pitchData.length > 1) {
      const timeDiff = pitchData[1].time - pitchData[0].time;
      console.log(`   → Time spacing between points: ${timeDiff.toFixed(2)}s`);
    }
  }

  const notes = [];
  const minNoteDuration = 0.2; // Minimum note length in seconds (lower to show more notes)
  const maxNoteDuration = 8.0; // Maximum note length in seconds (increased for long held notes)
  const pitchTolerance = 100; // Hz tolerance for grouping similar pitches (increased for vocal variation)
  const maxTimeGap = 0.5; // Maximum gap in seconds before starting a new note (reduced - vocals shouldn't have big gaps)
  const defaultNoteDuration = 0.3; // Default duration for single-point notes

  let currentNote = null;
  let skippedNotes = 0;
  let totalNotesCreated = 0;
  let previousTime = null;

  for (const point of pitchData) {
    const { time, pitch } = point;
    
    // Skip null/invalid pitches
    if (!pitch || pitch === null || isNaN(pitch) || pitch <= 0) {
      // If we have a current note, finish it
      if (currentNote) {
        // Set duration based on interval if still 0
        if (currentNote.duration === 0 && previousTime !== null) {
          currentNote.duration = Math.max(0.5, time - currentNote.start); // At least 0.5s
          currentNote.end = time;
        }
        
        if (currentNote.duration >= minNoteDuration) {
          notes.push({
            start: currentNote.start,
            end: currentNote.end,
            targetPitch: Math.round(currentNote.targetPitch),
            duration: currentNote.duration,
          });
          totalNotesCreated++;
        } else {
          skippedNotes++;
        }
        currentNote = null;
      }
      previousTime = time;
      continue;
    }

    if (!currentNote) {
      // Start new note
      currentNote = {
        start: time,
        end: time,
        targetPitch: pitch,
        duration: 0,
        pointCount: 1,
      };
    } else {
      const pitchDiff = Math.abs(pitch - currentNote.targetPitch);
      const timeGap = time - currentNote.end;
      
      // Extend note if pitch is similar and time gap is small
      if (pitchDiff <= pitchTolerance && timeGap <= maxTimeGap) {
        // Continue current note (similar pitch, close in time)
        // Extend to current time (not just previous end)
        currentNote.end = time;
        currentNote.duration = currentNote.end - currentNote.start;
        currentNote.pointCount++;
        // Update target pitch to weighted average (more weight to recent pitches)
        const weight = 0.7; // Recent pitches have 70% weight
        currentNote.targetPitch = (currentNote.targetPitch * (1 - weight) + pitch * weight);
      } else {
        // Finish current note and start new one
        // Extend note end to include half the gap (for smoother transitions)
        if (currentNote.duration === 0) {
          // Single point note - extend forward
          currentNote.end = time;
          currentNote.duration = Math.min(time - currentNote.start, defaultNoteDuration);
        } else if (timeGap > 0 && timeGap < maxTimeGap * 2) {
          // Small gap - extend note slightly forward
          currentNote.end = currentNote.start + currentNote.duration + (timeGap * 0.3);
          currentNote.duration = currentNote.end - currentNote.start;
        }
        
        // Cap duration at max
        if (currentNote.duration > maxNoteDuration) {
          currentNote.duration = maxNoteDuration;
          currentNote.end = currentNote.start + maxNoteDuration;
        }
        
        if (currentNote.duration >= minNoteDuration) {
          notes.push({
            start: currentNote.start,
            end: currentNote.end,
            targetPitch: Math.round(currentNote.targetPitch),
            duration: currentNote.duration,
          });
          totalNotesCreated++;
        } else {
          skippedNotes++;
        }
        
        currentNote = {
          start: time,
          end: time,
          targetPitch: pitch,
          duration: 0,
          pointCount: 1,
        };
      }
    }
    
    previousTime = time;
  }

  // Add final note
  if (currentNote) {
    // Set duration based on interval if still 0 (single point note)
    if (currentNote.duration === 0) {
      if (previousTime !== null && previousTime > currentNote.start) {
        currentNote.duration = Math.min(previousTime - currentNote.start + defaultNoteDuration, defaultNoteDuration * 2);
        currentNote.end = currentNote.start + currentNote.duration;
      } else {
        currentNote.duration = defaultNoteDuration;
        currentNote.end = currentNote.start + defaultNoteDuration;
      }
    }
    
    // Cap duration at max
    if (currentNote.duration > maxNoteDuration) {
      currentNote.duration = maxNoteDuration;
      currentNote.end = currentNote.start + maxNoteDuration;
    }
    
    if (currentNote.duration >= minNoteDuration) {
      notes.push({
        start: currentNote.start,
        end: currentNote.end,
        targetPitch: Math.round(currentNote.targetPitch),
        duration: currentNote.duration,
      });
      totalNotesCreated++;
    } else {
      skippedNotes++;
    }
  }

  console.log(`✅ Generated ${notes.length} raw notes from ${pitchData.length} pitch points`);
  if (skippedNotes > 0) {
    console.log(`   ⚠️ Skipped ${skippedNotes} notes that were too short (< ${minNoteDuration}s)`);
  }
  
  // CRITICAL: Make notes non-overlapping and sequential (human voice can only sing one note at a time)
  // Sort notes by start time
  notes.sort((a, b) => a.start - b.start);
  
  // Merge overlapping notes and ensure sequential timeline
  const sequentialNotes = [];
  let mergedNote = null;
  
  for (const note of notes) {
    if (!mergedNote) {
      // First note
      mergedNote = { ...note };
    } else {
      // Check if this note overlaps with or is close to merged note
      const gap = note.start - mergedNote.end;
      const overlap = note.start < mergedNote.end;
      
      if (overlap || gap < 0.1) {
        // Overlapping or very close - merge them (take average pitch, extend duration)
        const totalDuration = Math.max(mergedNote.end, note.end) - mergedNote.start;
        const currentWeight = mergedNote.duration / (mergedNote.duration + note.duration);
        const newPitch = Math.round(mergedNote.targetPitch * currentWeight + note.targetPitch * (1 - currentWeight));
        
        mergedNote.end = Math.max(mergedNote.end, note.end);
        mergedNote.duration = totalDuration;
        mergedNote.targetPitch = newPitch;
      } else {
        // Gap between notes - finish current and start new
        sequentialNotes.push(mergedNote);
        mergedNote = { ...note };
      }
    }
  }
  
  // Add final note
  if (mergedNote) {
    sequentialNotes.push(mergedNote);
  }
  
  // Ensure notes are truly sequential (no overlaps, small gaps allowed)
  const finalNotes = [];
  for (let i = 0; i < sequentialNotes.length; i++) {
    const note = { ...sequentialNotes[i] };
    
    if (i > 0) {
      // Make sure this note starts where previous ended (no overlaps)
      const prevNote = finalNotes[i - 1];
      if (note.start < prevNote.end) {
        // Overlap - start this note where previous ends
        note.start = prevNote.end;
      }
      // If there's a gap, we keep it (silence between notes is OK)
    }
    
    // Ensure valid duration
    if (note.end <= note.start) {
      note.end = note.start + minNoteDuration;
      note.duration = minNoteDuration;
    } else {
      note.duration = note.end - note.start;
    }
    
    finalNotes.push(note);
  }
  
  console.log(`✅ Created ${finalNotes.length} sequential notes (non-overlapping timeline)`);
  
  if (finalNotes.length > 0) {
    console.log(`   → Note duration range: ${Math.min(...finalNotes.map(n => n.duration)).toFixed(2)}s - ${Math.max(...finalNotes.map(n => n.duration)).toFixed(2)}s`);
    console.log(`   → Pitch range: ${Math.min(...finalNotes.map(n => n.targetPitch))}Hz - ${Math.max(...finalNotes.map(n => n.targetPitch))}Hz`);
    console.log(`   → Time range: ${finalNotes[0].start.toFixed(2)}s - ${finalNotes[finalNotes.length - 1].end.toFixed(2)}s`);
    
    // Check for overlaps
    let hasOverlaps = false;
    for (let i = 1; i < finalNotes.length; i++) {
      if (finalNotes[i].start < finalNotes[i - 1].end) {
        hasOverlaps = true;
        console.warn(`   ⚠️ Overlap detected: note ${i} starts at ${finalNotes[i].start.toFixed(2)}s but previous ends at ${finalNotes[i - 1].end.toFixed(2)}s`);
      }
    }
    if (!hasOverlaps) {
      console.log(`   ✅ No overlaps - notes form clean timeline`);
    }
    
    // Log first 5 notes for debugging
    console.log(`   → First 5 sequential notes:`);
    finalNotes.slice(0, 5).forEach((note, idx) => {
      console.log(`      [${idx}] ${note.start.toFixed(2)}s-${note.end.toFixed(2)}s (${note.duration.toFixed(2)}s): ${note.targetPitch}Hz`);
    });
    
    // Check alignment with segments if provided
    if (segments && segments.length > 0) {
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      console.log(`   → Segments time range: ${firstSegment.start?.toFixed(2)}s - ${lastSegment.end?.toFixed(2)}s`);
    }
  } else {
    console.warn(`   ⚠️ [NOTES] No notes generated! This might indicate pitch detection issues.`);
    console.warn(`   → Check if pitch data has valid values (not all null/zero)`);
  }
  
  return finalNotes;
}

