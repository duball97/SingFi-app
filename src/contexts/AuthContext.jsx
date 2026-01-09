/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Get initial session - Enhanced with Caching
    const initAuth = async () => {
      try {
        // 1. Check LocalStorage Cache for instant UI feedback
        const cachedProfile = localStorage.getItem('singfi_user_profile');
        if (cachedProfile) {
          try {
            const parsed = JSON.parse(cachedProfile);
            setUserProfile(parsed);
            // Only set loading false if we have a cache, otherwise wait for Auth
            setLoading(false);
          } catch (e) {
            console.error('AuthContext: Cache parse error', e);
          }
        }

        console.log('AuthContext: Getting initial session...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('AuthContext: Error getting session:', error);
        }

        console.log('AuthContext: Session retrieved:', session?.user ? session.user.id : 'No user');
        setUser(session?.user ?? null);

        // Set loading false IMMEDIATELY after we have session info
        // This prevents the "Loading..." from showing forever
        setLoading(false);

        if (session?.user) {
          // Fetch fresh data in background (non-blocking for UI)
          fetchUserProfile(session.user.id);
        } else {
          // If no user/session, clear cache
          localStorage.removeItem('singfi_user_profile');
          setUserProfile(null);
        }
      } catch (error) {
        console.error('AuthContext: Unexpected error in initAuth:', error);
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`AuthContext: Auth change event: ${event}`);
      if (!mounted) return;

      setUser(session?.user ?? null);

      // ALWAYS set loading false immediately to prevent UI freeze
      setLoading(false);

      if (session?.user) {
        // Fetch profile in background (non-blocking)
        fetchUserProfile(session.user.id);
      } else {
        localStorage.removeItem('singfi_user_profile');
        setUserProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId) => {
    try {
      // Increased timeout to 30 seconds and make it non-blocking
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 30000)
      );

      const fetchPromise = supabase
        .from('singfi_users')
        .select('*')
        .eq('id', userId)
        .single();

      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

      // Always set loading to false, even if profile doesn't exist
      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found - User exists in Auth but not in Table
          // Create the profile now (Self-Healing)
          console.log('AuthContext: User profile missing. Attempting to auto-create...');
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            const newProfile = {
              id: session.user.id,
              email: session.user.email,
              display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
              avatar_url: session.user.user_metadata?.avatar_url,
              auth_provider: session.user.app_metadata?.provider || 'email',
            };

            console.log('AuthContext: Inserting payload:', newProfile);

            const { data: createdUser, error: insertError } = await supabase
              .from('singfi_users')
              .upsert(newProfile)
              .select()
              .single();

            if (insertError) {
              console.error('AuthContext: FATAL - Could not auto-create user:', insertError);
              console.error('AuthContext: This suggests a Row Level Security (RLS) policy violation.');
              // Fallback to local only so the app doesn't crash
              setUserProfile(newProfile);
            } else {
              console.log('AuthContext: User profile auto-created successfully:', createdUser);
              setUserProfile(createdUser);
            }
          } else {
            setUserProfile(null);
          }
        } else {
          console.error('Error fetching user profile:', error);
          setUserProfile(null);
        }
      } else if (data) {
        setUserProfile(data);
        localStorage.setItem('singfi_user_profile', JSON.stringify(data));
      } else {
        setUserProfile(null);
      }

      // ALWAYS set loading to false
      setLoading(false);
    } catch (error) {
      // Don't log timeout errors as errors - they're expected in slow networks
      if (error.message !== 'Profile fetch timeout') {
        console.error('Error fetching user profile:', error);
      }
      // ALWAYS set loading to false even on error or timeout
      // Still try to show something from auth user
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUserProfile({
            id: session.user.id,
            email: session.user.email,
            display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
            avatar_url: session.user.user_metadata?.avatar_url,
          });
        } else {
          setUserProfile(null);
        }
      } catch (e) {
        setUserProfile(null);
      }
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
  };

  const value = {
    user,
    userProfile,
    loading,
    signOut,
    refreshProfile: () => user && fetchUserProfile(user.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

