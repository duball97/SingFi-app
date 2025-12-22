import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const toolsDir = join(__dirname, '../../tools');
const isWindows = process.platform === 'win32';

// Create tools directory
if (!fs.existsSync(toolsDir)) {
  fs.mkdirSync(toolsDir, { recursive: true });
}

function downloadFile(url, dest, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }
    
    const protocol = url.startsWith('https') ? https : require('http');
    const file = fs.createWriteStream(dest);
    
    protocol.get(url, (response) => {
      // Handle ALL redirect status codes (301, 302, 303, 307, 308)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(dest); // Remove empty file
        // Follow redirect
        return downloadFile(response.headers.location, dest, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function downloadYtDlp() {
  const ytDlpPath = join(toolsDir, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
  
  if (fs.existsSync(ytDlpPath)) {
    console.log('✅ yt-dlp already exists');
    return ytDlpPath;
  }

  console.log('📥 Downloading yt-dlp...');
  
  if (isWindows) {
    // Download Windows executable
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    await downloadFile(url, ytDlpPath);
  } else {
    // Download Unix executable
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    await downloadFile(url, ytDlpPath);
    // Make executable
    await execAsync(`chmod +x "${ytDlpPath}"`);
  }
  
  console.log('✅ yt-dlp downloaded');
  return ytDlpPath;
}

async function downloadFfmpeg() {
  // First, check if ffmpeg is available in system PATH
  const cmd = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
  try {
    await execAsync(`${cmd} -version`);
    console.log(`✅ Found ffmpeg in system PATH: ${cmd}`);
    return cmd; // Return the command name if found in PATH
  } catch (err) {
    // Not in PATH, continue to check local tools or download
  }

  if (!isWindows) {
    console.log('⚠️ Auto-download of ffmpeg only supported on Windows. Please install via package manager.');
    return null;
  }

  const ffmpegDir = join(toolsDir, 'ffmpeg');
  const ffmpegExe = join(ffmpegDir, 'bin', 'ffmpeg.exe');
  
  // Check if ffmpeg already exists at target location
  if (fs.existsSync(ffmpegExe)) {
    console.log('✅ ffmpeg already exists in tools folder');
    return ffmpegExe;
  }
  
  // Check if extracted folder already exists (from previous failed attempt)
  // If so, try to rename it instead of re-downloading
  let existingExtractedPath = null;
  try {
    const existingFolders = fs.readdirSync(toolsDir).filter(f => 
      f.startsWith('ffmpeg-') && fs.statSync(join(toolsDir, f)).isDirectory()
    );
    for (const folder of existingFolders) {
      const tempExe = join(toolsDir, folder, 'bin', 'ffmpeg.exe');
      if (fs.existsSync(tempExe)) {
        existingExtractedPath = join(toolsDir, folder);
        console.log(`📦 Found existing extracted ffmpeg folder, attempting to rename...`);
        break;
      }
    }
  } catch (err) {
    // Continue with download if check fails
  }
  
  // Only download if we don't have an extracted folder
  if (!existingExtractedPath) {
    console.log('📥 Downloading ffmpeg (this may take a while)...');
    
    // Download from gyan.dev (official Windows builds)
    const url = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
    const zipPath = join(toolsDir, 'ffmpeg.zip');
    
    try {
      await downloadFile(url, zipPath);
      console.log('📦 Extracting ffmpeg...');
      
      // Use PowerShell to extract
      await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${toolsDir}' -Force"`);
      
      // Wait a bit for Windows to release file locks
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the extracted folder
      const extractedFolders = fs.readdirSync(toolsDir).filter(f => 
        f.startsWith('ffmpeg-') && fs.statSync(join(toolsDir, f)).isDirectory()
      );
      
      if (extractedFolders.length > 0) {
        existingExtractedPath = join(toolsDir, extractedFolders[0]);
      }
    } catch (downloadErr) {
      console.error('❌ Failed to download or extract ffmpeg automatically:', downloadErr.message);
      console.log('📝 Please manually extract ffmpeg.zip from tools/ folder');
      console.log('   Or download from: https://www.gyan.dev/ffmpeg/builds/');
      throw downloadErr;
    }
  }
  
  // Now try to rename/copy the extracted folder to the target location
  if (existingExtractedPath) {
    try {
      // Remove existing ffmpeg dir if it exists
      if (fs.existsSync(ffmpegDir)) {
        try {
          fs.rmSync(ffmpegDir, { recursive: true, force: true });
          // Wait again after removal
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (rmErr) {
          console.warn('⚠️ Could not remove existing ffmpeg folder, will try copy instead');
        }
      }
      
      // Try rename with retries (Windows sometimes locks files)
      let renamed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
          fs.renameSync(existingExtractedPath, ffmpegDir);
          renamed = true;
          break;
        } catch (renameErr) {
          if (attempt === 4) {
            // Last attempt failed, try copying instead using xcopy (Windows)
            console.log('⚠️ Rename failed, trying copy operation...');
            try {
              await execAsync(`xcopy /E /I /Y "${existingExtractedPath}\\*" "${ffmpegDir}\\"`);
              // Remove source after successful copy
              await new Promise(resolve => setTimeout(resolve, 500));
              try {
                fs.rmSync(existingExtractedPath, { recursive: true, force: true });
              } catch {}
              renamed = true;
              break;
            } catch (copyErr) {
              throw new Error(`Failed to rename or copy: ${copyErr.message}`);
            }
          }
        }
      }
      
      if (!renamed) {
        throw new Error('Failed to rename or copy extracted ffmpeg folder');
      }
      
      // Clean up zip file if it exists
      const zipPath = join(toolsDir, 'ffmpeg.zip');
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
      } catch {}
      
      console.log('✅ ffmpeg extracted');
    } catch (err) {
      console.error('❌ Failed to rename/copy ffmpeg folder:', err.message);
      console.log('📝 Please manually rename the extracted ffmpeg folder to "ffmpeg"');
      return null;
    }
  }
  
  // Verify ffmpeg.exe exists at target location
  if (fs.existsSync(ffmpegExe)) {
    return ffmpegExe;
  }
  
  return null;
}

// Cache the setup result so we don't check every request
let toolsSetupPromise = null;
let toolsSetupComplete = false;

export async function setupTools() {
  // If already complete, return cached paths immediately
  if (toolsSetupComplete) {
    return getToolPaths();
  }
  
  // If setup is in progress, wait for it
  if (toolsSetupPromise) {
    return toolsSetupPromise;
  }
  
  // Start setup
  toolsSetupPromise = (async () => {
    try {
      const ytDlpPath = await downloadYtDlp();
      const ffmpegPath = await downloadFfmpeg();
      
      toolsSetupComplete = true;
      return {
        ytDlp: ytDlpPath,
        ffmpeg: ffmpegPath,
      };
    } catch (err) {
      console.error('Error setting up tools:', err);
      toolsSetupPromise = null; // Allow retry on next request
      throw err;
    }
  })();
  
  return toolsSetupPromise;
}

export function getToolPaths() {
  const ytDlpPath = join(toolsDir, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
  const ffmpegPath = isWindows 
    ? join(toolsDir, 'ffmpeg', 'bin', 'ffmpeg.exe')
    : 'ffmpeg'; // Assume in PATH on Unix
  
  return {
    ytDlp: fs.existsSync(ytDlpPath) ? ytDlpPath : null,
    ffmpeg: fs.existsSync(ffmpegPath) ? ffmpegPath : (isWindows ? null : 'ffmpeg'),
  };
}

