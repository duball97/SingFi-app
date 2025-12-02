-- Supabase Database Schema for SingFi
-- Run this in your Supabase SQL editor

create table songs (
  id bigint generated always as identity primary key,
  youtube_id text unique not null,
  title text,
  artist text,
  lyrics jsonb,
  segments jsonb,
  created_at timestamp default now()
);

-- Create index for faster lookups
create index idx_songs_youtube_id on songs(youtube_id);

