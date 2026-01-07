import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import supabaseRoutes from './routes/supabase.js';
import replicateRoutes from './routes/replicate.js';
import audioRoutes from './routes/audio.js';
import whisperRoutes from './routes/whisper.js';
import vocalsRoutes from './routes/vocals.js';
import getSongRoutes from './routes/getSong.js';
import saveSongRoutes from './routes/saveSong.js';
import searchRoutes from './routes/search.js';
import songsRoutes from './routes/songs.js';
import gameSessionRoutes from './routes/gameSession.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

// Debug middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/supabase', supabaseRoutes);
app.use('/api/replicate', replicateRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/whisper', whisperRoutes);
app.use('/api/vocals', vocalsRoutes);
app.use('/api/getSong', getSongRoutes);
app.use('/api/saveSong', saveSongRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/songs', songsRoutes);
app.use('/api/game-session', gameSessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Server is running',
    port: PORT,
    host: HOST,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Serve static files from the Vite build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../dist');
  
  if (!existsSync(distPath)) {
    console.error(`❌ ERROR: dist folder not found at ${distPath}`);
    console.error('   Make sure "npm run build" completed successfully');
  } else {
    console.log(`✅ Found dist folder at ${distPath}`);
    app.use(express.static(distPath));
    
    // Serve index.html for all non-API routes (SPA routing)
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      const indexPath = join(distPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).json({ error: 'Frontend build not found. Please rebuild the application.' });
      }
    });
  }
} else {
  // Development root endpoint
  app.get('/', (req, res) => {
    res.json({ message: 'SingFi API Server', status: 'running', mode: 'development' });
  });
}

// Listen on 0.0.0.0 to accept connections from outside the container
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('✅ Serving production build');
    const distPath = join(__dirname, '../dist');
    console.log(`📁 Static files from: ${distPath}`);
  }
});

// Handle errors
app.on('error', (err) => {
  console.error('❌ Server error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
