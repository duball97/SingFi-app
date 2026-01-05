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
    
    // Check buffer size - skip if too large (> 500MB to handle longer songs)
    const bufferSizeMB = vocalsBuffer.length / (1024 * 1024);
    console.log(`   → [STEP 1] Buffer size: ${bufferSizeMB.toFixed(2)}MB`);
    
    if (bufferSizeMB > 500) {
      console.warn(`   ⚠️ [SKIP] Buffer too large (${bufferSizeMB.toFixed(0)}MB > 500MB limit), skipping pitch extraction`);
      return [];
    }
    
    // For very large buffers (> 200MB), log a warning but still process
    if (bufferSizeMB > 200) {
      console.warn(`   ⚠️ [WARN] Large buffer detected (${bufferSizeMB.toFixed(0)}MB) - pitch extraction may take longer`);
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
 * CRITICAL: Notes must never overlap - human voice can only sing one note at a time
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
  const minNoteDuration = 0.15; // Minimum note length in seconds
  const maxNoteDuration = 6.0; // Maximum note length in seconds
  const pitchTolerance = 80; // Hz tolerance for grouping similar pitches (reduced for better note separation)
  const maxTimeGap = 0.3; // Maximum gap in seconds before starting a new note (reduced for tighter clustering)
  const minTimeGap = 0.05; // Minimum gap between notes (ensures no overlaps)

  let currentNote = null;
  let skippedNotes = 0;
  let totalNotesCreated = 0;
  let lastNoteEnd = 0; // Track where the last note ended to prevent overlaps

  for (const point of pitchData) {
    const { time, pitch } = point;
    
    // Skip null/invalid pitches
    if (!pitch || pitch === null || isNaN(pitch) || pitch <= 0) {
      // If we have a current note, finish it
      if (currentNote) {
        // End note at current time (silence detected)
        currentNote.end = Math.max(currentNote.start + minNoteDuration, time);
        currentNote.duration = currentNote.end - currentNote.start;
        
        // Ensure note doesn't extend beyond max duration
        if (currentNote.duration > maxNoteDuration) {
          currentNote.duration = maxNoteDuration;
          currentNote.end = currentNote.start + maxNoteDuration;
        }
        
        if (currentNote.duration >= minNoteDuration) {
          // Ensure no overlap with previous note
          if (currentNote.start < lastNoteEnd) {
            currentNote.start = lastNoteEnd;
            currentNote.end = currentNote.start + currentNote.duration;
          }
          
          notes.push({
            start: currentNote.start,
            end: currentNote.end,
            targetPitch: Math.round(currentNote.targetPitch),
            duration: currentNote.duration,
          });
          lastNoteEnd = currentNote.end;
          totalNotesCreated++;
        } else {
          skippedNotes++;
        }
        currentNote = null;
      }
      continue;
    }

    if (!currentNote) {
      // Start new note - ensure it doesn't overlap with previous note
      const noteStart = Math.max(time, lastNoteEnd + minTimeGap);
      currentNote = {
        start: noteStart,
        end: noteStart,
        targetPitch: pitch,
        duration: 0,
        pointCount: 1,
        pitchSum: pitch,
      };
    } else {
      const pitchDiff = Math.abs(pitch - currentNote.targetPitch);
      const timeGap = time - currentNote.end;
      
      // Extend note if pitch is similar and time gap is small
      if (pitchDiff <= pitchTolerance && timeGap <= maxTimeGap) {
        // Continue current note (similar pitch, close in time)
        currentNote.end = time;
        currentNote.duration = currentNote.end - currentNote.start;
        currentNote.pointCount++;
        currentNote.pitchSum += pitch;
        // Update target pitch to average (not weighted - simpler and more accurate)
        currentNote.targetPitch = currentNote.pitchSum / currentNote.pointCount;
      } else {
        // Finish current note and start new one (pitch changed or gap too large)
        // Cap duration at max
        if (currentNote.duration === 0) {
          // Single point note - give it minimum duration
          currentNote.end = currentNote.start + minNoteDuration;
          currentNote.duration = minNoteDuration;
        } else if (currentNote.duration > maxNoteDuration) {
          currentNote.duration = maxNoteDuration;
          currentNote.end = currentNote.start + maxNoteDuration;
        } else {
          // Ensure note ends where we detected the change
          currentNote.end = Math.min(currentNote.end, time);
          currentNote.duration = currentNote.end - currentNote.start;
        }
        
        if (currentNote.duration >= minNoteDuration) {
          // Ensure no overlap with previous note
          if (currentNote.start < lastNoteEnd) {
            currentNote.start = lastNoteEnd + minTimeGap;
            currentNote.end = currentNote.start + currentNote.duration;
          }
          
          notes.push({
            start: currentNote.start,
            end: currentNote.end,
            targetPitch: Math.round(currentNote.targetPitch),
            duration: currentNote.duration,
          });
          lastNoteEnd = currentNote.end;
          totalNotesCreated++;
        } else {
          skippedNotes++;
        }
        
        // Start new note - ensure no overlap
        const noteStart = Math.max(time, lastNoteEnd + minTimeGap);
        currentNote = {
          start: noteStart,
          end: noteStart,
          targetPitch: pitch,
          duration: 0,
          pointCount: 1,
          pitchSum: pitch,
        };
      }
    }
  }

  // Add final note
  if (currentNote) {
    // Ensure note has minimum duration
    if (currentNote.duration === 0) {
      // Estimate duration based on typical spacing (use the average spacing from pitch data)
      const avgSpacing = pitchData.length > 1 
        ? (pitchData[pitchData.length - 1].time - pitchData[0].time) / (pitchData.length - 1)
        : 0.3;
      currentNote.duration = Math.max(minNoteDuration, Math.min(avgSpacing * 2, maxNoteDuration));
      currentNote.end = currentNote.start + currentNote.duration;
    }
    
    // Cap duration at max
    if (currentNote.duration > maxNoteDuration) {
      currentNote.duration = maxNoteDuration;
      currentNote.end = currentNote.start + maxNoteDuration;
    }
    
    if (currentNote.duration >= minNoteDuration) {
      // Ensure no overlap with previous note
      if (currentNote.start < lastNoteEnd) {
        currentNote.start = lastNoteEnd + minTimeGap;
        currentNote.end = currentNote.start + currentNote.duration;
      }
      
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

  console.log(`✅ Generated ${notes.length} notes from ${pitchData.length} pitch points`);
  if (skippedNotes > 0) {
    console.log(`   ⚠️ Skipped ${skippedNotes} notes that were too short (< ${minNoteDuration}s)`);
  }
  
  // CRITICAL: Filter notes to only include those that overlap with segments (actual vocals/lyrics)
  // This prevents notes from showing during silence, intro, outro, or non-vocal sections
  let filteredNotes = notes;
  if (segments && Array.isArray(segments) && segments.length > 0) {
    const segmentTimeRanges = segments.map(seg => ({
      start: Number(seg.start) || 0,
      end: Number(seg.end) || 0
    })).filter(seg => seg.end > seg.start); // Only valid segments
    
    if (segmentTimeRanges.length > 0) {
      const firstSegmentStart = Math.min(...segmentTimeRanges.map(s => s.start));
      const lastSegmentEnd = Math.max(...segmentTimeRanges.map(s => s.end));
      
      console.log(`   → Filtering notes by segments: ${segmentTimeRanges.length} segments, time range ${firstSegmentStart.toFixed(2)}s - ${lastSegmentEnd.toFixed(2)}s`);
      
      // Only keep notes that overlap with at least one segment
      filteredNotes = notes.filter(note => {
        // Check if note overlaps with any segment
        return segmentTimeRanges.some(seg => {
          // Note overlaps if: note.start < seg.end AND note.end > seg.start
          return note.start < seg.end && note.end > seg.start;
        });
      });
      
      const removedCount = notes.length - filteredNotes.length;
      if (removedCount > 0) {
        console.log(`   → Removed ${removedCount} notes that don't overlap with vocal segments`);
      }
    }
  } else {
    console.log(`   ⚠️ No segments provided - cannot filter notes by vocal timing`);
  }
  
  // Final pass: Ensure absolutely no overlaps (double-check and fix any remaining issues)
  const finalNotes = [];
  for (let i = 0; i < filteredNotes.length; i++) {
    const note = { ...filteredNotes[i] };
    
    if (i > 0) {
      const prevNote = finalNotes[i - 1];
      // If there's any overlap, adjust this note to start right after the previous one
      if (note.start < prevNote.end) {
        note.start = prevNote.end + minTimeGap;
        note.end = note.start + note.duration;
      }
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
  
  console.log(`✅ Created ${finalNotes.length} sequential notes (guaranteed non-overlapping)`);
  
  if (finalNotes.length > 0) {
    console.log(`   → Note duration range: ${Math.min(...finalNotes.map(n => n.duration)).toFixed(2)}s - ${Math.max(...finalNotes.map(n => n.duration)).toFixed(2)}s`);
    console.log(`   → Pitch range: ${Math.min(...finalNotes.map(n => n.targetPitch))}Hz - ${Math.max(...finalNotes.map(n => n.targetPitch))}Hz`);
    console.log(`   → Time range: ${finalNotes[0].start.toFixed(2)}s - ${finalNotes[finalNotes.length - 1].end.toFixed(2)}s`);
    
    // Verify no overlaps
    let hasOverlaps = false;
    for (let i = 1; i < finalNotes.length; i++) {
      if (finalNotes[i].start < finalNotes[i - 1].end) {
        hasOverlaps = true;
        console.error(`   ❌ Overlap detected: note ${i} starts at ${finalNotes[i].start.toFixed(3)}s but previous ends at ${finalNotes[i - 1].end.toFixed(3)}s`);
      }
    }
    if (!hasOverlaps) {
      console.log(`   ✅ Verified: No overlaps - notes form clean sequential timeline`);
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

