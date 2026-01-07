-- Migration: Add singfi_games table and play_count to singfi_songs
-- Run this in your Supabase SQL editor

-- 1. Add play_count column to singfi_songs
alter table singfi_songs 
add column if not exists play_count integer default 0;

-- Create index for play_count (useful for sorting popular songs)
create index if not exists idx_singfi_songs_play_count on singfi_songs(play_count desc);

-- 2. Create singfi_games table
create table if not exists singfi_games (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  song_id bigint references singfi_songs(id) on delete set null,
  youtube_id text not null,
  title text,
  artist text,
  score numeric not null default 0,
  game_mode text not null default 'solo', -- 'solo', 'online', 'duet', etc.
  created_at timestamp default now()
);

-- Create indexes for faster lookups
create index if not exists idx_games_user_id on singfi_games(user_id);
create index if not exists idx_games_song_id on singfi_games(song_id);
create index if not exists idx_games_youtube_id on singfi_games(youtube_id);
create index if not exists idx_games_game_mode on singfi_games(game_mode);
create index if not exists idx_games_created_at on singfi_games(created_at desc);
create index if not exists idx_games_score on singfi_games(score desc);

-- Enable Row Level Security
alter table singfi_games enable row level security;

-- Policy: Users can view their own games
create policy "Users can view own games"
  on singfi_games for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own games
create policy "Users can insert own games"
  on singfi_games for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own games
create policy "Users can update own games"
  on singfi_games for update
  using (auth.uid() = user_id);

-- Policy: Allow public read access to game leaderboards (optional - for public leaderboards)
-- Uncomment if you want public leaderboards
-- create policy "Public can view games for leaderboards"
--   on singfi_games for select
--   using (true);

-- 3. Create RPC function to increment play_count (optional but more efficient)
create or replace function increment_song_play_count(song_id_param bigint)
returns void
language plpgsql
security definer
as $$
begin
  update singfi_songs
  set play_count = play_count + 1
  where id = song_id_param;
end;
$$;

