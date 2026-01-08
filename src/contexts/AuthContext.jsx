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
    
    // Get initial session - no timeout needed, session fetch is fast
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }
        
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error getting session:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoading(false);
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
          // No profile found - that's okay, user exists but profile doesn't
          // Create a minimal profile from auth user data
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
        } else {
          console.error('Error fetching user profile:', error);
          setUserProfile(null);
        }
      } else if (data) {
        setUserProfile(data);
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

