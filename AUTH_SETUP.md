# Authentication Setup Guide

## Database Setup

1. Run the SQL in `supabase-schema.sql` in your Supabase SQL editor to create the `singfi_users` table.

## Environment Variables

Add these to your `.env` file (frontend):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Supabase Configuration

1. **Enable Authentication Providers:**
   - Go to Supabase Dashboard → Authentication → Providers
   - Enable **Email** provider
   - Enable **Google** OAuth provider (configure with Google OAuth credentials)
   - Configure redirect URLs: `http://localhost:5173/auth/callback` (dev) and your production URL

2. **Row Level Security (RLS):**
   - The schema includes RLS policies for `singfi_users` table
   - Users can only read/update their own profile

## Features

- ✅ Email/Password authentication
- ✅ Google OAuth authentication
- ✅ Web3 Wallet authentication (MetaMask, etc.)
- ✅ User profile management
- ✅ Beautiful login/signup UI
- ✅ Protected routes ready

## Wallet Authentication Note

The wallet authentication currently uses a simplified approach. For production, you should:
1. Verify wallet signatures on the backend
2. Use a proper authentication flow (e.g., SIWE - Sign-In With Ethereum)
3. Store wallet addresses securely
4. Implement proper session management

## Usage

- Navigate to `/login` to sign in
- Navigate to `/signup` to create an account
- User info appears in the header when logged in
- Use `useAuth()` hook in components to access user data

