import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import supabaseRoutes from './routes/supabase.js';
import replicateRoutes from './routes/replicate.js';
import audioRoutes from './routes/audio.js';
import whisperRoutes from './routes/whisper.js';
import vocalsRoutes from './routes/vocals.js';
import getSongRoutes from './routes/getSong.js';
import saveSongRoutes from './routes/saveSong.js';
import searchRoutes from './routes/search.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/supabase', supabaseRoutes);
app.use('/api/replicate', replicateRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/whisper', whisperRoutes);
app.use('/api/vocals', vocalsRoutes);
app.use('/api/getSong', getSongRoutes);
app.use('/api/saveSong', saveSongRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

