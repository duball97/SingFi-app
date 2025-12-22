import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import supabaseRoutes from './routes/supabase.js';
import replicateRoutes from './routes/replicate.js';
import audioRoutes from './routes/audio.js';
import whisperRoutes from './routes/whisper.js';
import vocalsRoutes from './routes/vocals.js';
import getSongRoutes from './routes/getSong.js';
import saveSongRoutes from './routes/saveSong.js';
import searchRoutes from './routes/search.js';
import songsRoutes from './routes/songs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Serve static files from the Vite build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  
  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('Serving production build');
  }
});
