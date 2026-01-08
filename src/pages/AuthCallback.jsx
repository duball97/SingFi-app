import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  const { user } = useAuth(); // Access global user state

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('AuthCallback: Checking session...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('AuthCallback: Error getting session -', error.message);
          throw error;
        }

        if (session?.user) {
          console.log('AuthCallback: Session found:', session.user.id);

          // 1. Check if user exists
          const { data: existing, error: selectError } = await supabase
            .from('singfi_users')
            .select('id')
            .eq('id', session.user.id)
            .single();

          if (selectError && selectError.code !== 'PGRST116') {
            console.error('AuthCallback: Error checking User table -', selectError);
          }

          if (!existing) {
            console.log('AuthCallback: User not found in DB. Creating profile...');

            const newProfile = {
              id: session.user.id,
              email: session.user.email,
              display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0],
              avatar_url: session.user.user_metadata?.avatar_url,
              auth_provider: session.user.app_metadata?.provider || 'email',
            };

            console.log('AuthCallback: Inserting payload:', newProfile);

            // 2. Insert User (using upsert for safety)
            const { data, error: insertError } = await supabase
              .from('singfi_users')
              .upsert(newProfile)
              .select();

            if (insertError) {
              console.error('AuthCallback: FAILED to insert user:', insertError);
              console.error('AuthCallback: This might be an RLS policy issue.');
            } else {
              console.log('AuthCallback: User profile created successfully:', data);
            }
          } else {
            console.log('AuthCallback: User profile already exists.');
          }
        } else {
          console.warn('AuthCallback: No session/user found.');
        }

        console.log('AuthCallback: Initial check done. Waiting for context sync...');
      } catch (error) {
        console.error('Auth callback fatal error:', error);
        // Don't redirect immediately on error, allow user to see logs
      }
    };

    handleAuthCallback();
  }, [navigate]);

  // Effect to handle navigation only when User is synced in Context
  useEffect(() => {
    if (user) {
      console.log('AuthCallback: User detected in context, navigating to Home');
      // Small delay to ensure state propagation
      const timer = setTimeout(() => navigate('/'), 100);
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      color: 'white'
    }}>
      <div>Completing sign in...</div>
    </div>
  );
}

