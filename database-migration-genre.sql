-- Migration: Add genre column to singfi_songs table
-- Run this in your Supabase SQL editor

-- Add genre column
alter table singfi_songs 
add column if not exists genre text;

-- Create index for genre (useful for filtering and sorting)
create index if not exists idx_singfi_songs_genre on singfi_songs(genre);

-- Add comment
comment on column singfi_songs.genre is 'Music genre detected by AI (e.g., Rock, Hip Hop, Pop, Country, etc.)';

