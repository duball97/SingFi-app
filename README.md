# 🎤 SingFi - Karaoke Game MVP

A web karaoke game that syncs lyrics with YouTube videos, detects pitch, and scores your performance.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Express.js
- **Database**: Supabase (PostgreSQL)
- **AI**: Replicate Whisper (large-v3)
- **Audio**: yt-dlp (external binary), Web Audio API

## Setup

### 1. Install yt-dlp

**macOS:**
```bash
brew install yt-dlp
```

**Linux:**
```bash
sudo pip install yt-dlp
# or
sudo apt install yt-dlp
```

**Windows:**
```bash
# Download from https://github.com/yt-dlp/yt-dlp/releases
# Or use pip: pip install yt-dlp
```

Verify installation:
```bash
yt-dlp --version
```

**Note:** ffmpeg is NOT required - we download audio directly without conversion.

### 2. Install Node Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=3001

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Replicate
REPLICATE_API_TOKEN=your_replicate_api_token

# Frontend (optional)
VITE_API_URL=http://localhost:3001/api
```

### 4. Database Setup

Run the SQL schema in your Supabase SQL editor:

```sql
-- See supabase-schema.sql
create table songs (
  id bigint generated always as identity primary key,
  youtube_id text unique not null,
  title text,
  artist text,
  lyrics jsonb,
  segments jsonb,
  created_at timestamp default now()
);

create index idx_songs_youtube_id on songs(youtube_id);
```

### 5. Run the Application

**Start the server:**
```bash
npm run server:dev
```

**Start the frontend (in another terminal):**
```bash
npm run dev
```

## API Endpoints

- `POST /api/whisper` - Process YouTube video with Whisper (checks cache first)
- `GET /api/getSong?youtubeId=...` - Get cached song data
- `POST /api/saveSong` - Save song data to Supabase
- `GET /api/audio?url=...` - Stream audio from YouTube

## Features

- ✅ YouTube video playback
- ✅ Automatic lyric sync with Whisper timestamps
- ✅ Real-time pitch detection via microphone
- ✅ Scoring system
- ✅ Supabase caching to avoid reprocessing

## Project Structure

```
├── server/
│   ├── index.js              # Express server
│   ├── routes/               # API routes
│   │   ├── audio.js
│   │   ├── whisper.js
│   │   ├── getSong.js
│   │   └── saveSong.js
│   └── services/             # External service clients
│       ├── supabase.js
│       └── replicate.js
├── src/
│   ├── components/
│   │   ├── Player.jsx       # YouTube player
│   │   ├── Lyrics.jsx       # Synced lyrics display
│   │   ├── PitchDetector.jsx # Microphone pitch detection
│   │   └── Score.jsx         # Score display
│   ├── App.jsx              # Main app component
│   └── utils/
│       └── api.js           # API client utilities
└── supabase-schema.sql      # Database schema
```

## Usage

1. Select a song from the hardcoded list
2. Wait for Whisper to process (or use cached data)
3. Start the YouTube player
4. Enable microphone access
5. Sing along and watch your score!

## Notes

- Songs are cached in Supabase after first processing
- Pitch detection uses Web Audio API with autocorrelation
- MVP uses hardcoded song list (can be extended)
