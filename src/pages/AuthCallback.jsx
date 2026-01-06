import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) throw error;

        if (session?.user) {
          // Ensure user profile exists
          const { data: existing } = await supabase
            .from('singfi_users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (!existing) {
            await supabase.from('singfi_users').insert({
              id: session.user.id,
              email: session.user.email,
              display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
              avatar_url: session.user.user_metadata?.avatar_url,
              auth_provider: session.user.app_metadata?.provider || 'email',
            });
          }
        }

        navigate('/');
      } catch (error) {
        console.error('Auth callback error:', error);
        navigate('/login');
      }
    };

    handleAuthCallback();
  }, [navigate]);

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

