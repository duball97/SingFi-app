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
  vocals text, -- Path to vocals file in Supabase Storage (e.g., "youtubeId.wav")
  thumbnail text, -- Path to thumbnail in Supabase Storage or YouTube URL
  first_verse_start_time numeric, -- Start time of first verse (filters out intros/talking)
  owner uuid, -- User UUID for Row-Level Security (null = public/shared)
  created_at timestamp default now()
);

-- Create index for faster lookups
create index idx_singfi_songs_youtube_id on singfi_songs(youtube_id);

-- Users table to store additional user information
-- Note: Supabase Auth handles the auth.users table automatically
-- This table extends auth.users with SingFi-specific data
create table singfi_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  wallet_address text, -- EVM wallet address (e.g., 0x...)
  wallet_type text, -- 'metamask', 'coinbase', 'walletconnect', etc.
  auth_provider text, -- 'email', 'google', 'wallet'
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Create indexes for faster lookups
create index idx_singfi_users_email on singfi_users(email);
create index idx_singfi_users_wallet_address on singfi_users(wallet_address);

-- Enable Row Level Security
alter table singfi_users enable row level security;

-- Policy: Users can read their own data
create policy "Users can view own profile"
  on singfi_users for select
  using (auth.uid() = id);

-- Policy: Users can update their own data
create policy "Users can update own profile"
  on singfi_users for update
  using (auth.uid() = id);

-- Policy: Users can insert their own data
create policy "Users can insert own profile"
  on singfi_users for insert
  with check (auth.uid() = id);

-- Game sessions table to track user gameplay
create table singfi_game_sessions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  song_id bigint references singfi_songs(id) on delete set null,
  youtube_id text not null,
  score numeric not null default 0,
  accuracy numeric, -- Average accuracy percentage
  notes_hit integer default 0,
  notes_total integer default 0,
  duration_seconds numeric, -- How long they played
  completed_at timestamp default now(),
  created_at timestamp default now()
);

-- Create indexes for faster lookups
create index idx_game_sessions_user_id on singfi_game_sessions(user_id);
create index idx_game_sessions_song_id on singfi_game_sessions(song_id);
create index idx_game_sessions_youtube_id on singfi_game_sessions(youtube_id);
create index idx_game_sessions_created_at on singfi_game_sessions(created_at desc);

-- Enable Row Level Security
alter table singfi_game_sessions enable row level security;

-- Policy: Users can view their own game sessions
create policy "Users can view own game sessions"
  on singfi_game_sessions for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own game sessions
create policy "Users can insert own game sessions"
  on singfi_game_sessions for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own game sessions
create policy "Users can update own game sessions"
  on singfi_game_sessions for update
  using (auth.uid() = user_id);

-- Friends table to track user friendships
create table singfi_friends (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  friend_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending', -- 'pending', 'accepted', 'blocked'
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(user_id, friend_id)
);

-- Create indexes
create index idx_friends_user_id on singfi_friends(user_id);
create index idx_friends_friend_id on singfi_friends(friend_id);
create index idx_friends_status on singfi_friends(status);

-- Enable Row Level Security
alter table singfi_friends enable row level security;

-- Policy: Users can view their own friendships
create policy "Users can view own friendships"
  on singfi_friends for select
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Policy: Users can insert their own friend requests
create policy "Users can insert own friend requests"
  on singfi_friends for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own friend requests (accept/decline)
create policy "Users can update own friend requests"
  on singfi_friends for update
  using (auth.uid() = friend_id or auth.uid() = user_id);
