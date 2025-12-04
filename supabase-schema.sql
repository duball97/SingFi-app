-- Supabase Database Schema for SingFi
-- Run this in your Supabase SQL editor

create table singfi_songs (
  id bigint generated always as identity primary key,
  youtube_id text unique not null,
  title text,
  artist text,
  lyrics text, -- Full Whisper transcription as single text block
  segments jsonb, -- Whisper's timestamped segments array
  notes jsonb, -- SingStar note chart for pitch bars (optional, for future use)
  created_at timestamp default now()
);

-- Create index for faster lookups
create index idx_singfi_songs_youtube_id on singfi_songs(youtube_id);

