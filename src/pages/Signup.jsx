import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './Auth.css';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showWallet, setShowWallet] = useState(false);
  const navigate = useNavigate();

  const handleEmailSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: displayName,
          },
        },
      });

      if (error) throw error;

      // Create user profile with proper error handling
      if (data.user) {
        const { error: profileError } = await supabase.from('singfi_users').upsert({
          id: data.user.id,
          email: data.user.email,
          display_name: displayName,
          auth_provider: 'email',
        }, { onConflict: 'id' });

        if (profileError) {
          console.error('Signup: Failed to create user profile:', profileError);
          // Don't block signup, AuthContext will attempt self-healing
        }

        // Refresh session to trigger auth state update
        await supabase.auth.getSession();

        // Force page reload to ensure auth state is updated in all components
        window.location.href = '/';
        return;
      }

      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err) {
      setError(err.message || 'Failed to sign up with Google');
      setLoading(false);
    }
  };

  const handleWalletSignup = async () => {
    setError('');
    setLoading(true);

    try {
      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask or another Web3 wallet is not installed. Please install MetaMask to continue.');
      }

      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];

      if (!walletAddress) {
        throw new Error('No wallet address found');
      }

      // Sign a message for authentication
      const message = `Sign up for SingFi\n\nWallet: ${walletAddress}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress],
      });

      // Create account with wallet
      const { data, error } = await supabase.auth.signUp({
        email: `${walletAddress}@wallet.singfi.app`,
        password: signature,
      });

      if (error) throw error;

      // Create user profile with wallet info
      if (data.user) {
        await supabase.from('singfi_users').insert({
          id: data.user.id,
          email: `${walletAddress}@wallet.singfi.app`,
          wallet_address: walletAddress,
          wallet_type: 'metamask',
          auth_provider: 'wallet',
        });

        // Refresh session to trigger auth state update
        await supabase.auth.getSession();

        // Force page reload to ensure auth state is updated in all components
        window.location.href = '/';
        return;
      }

      navigate('/');
    } catch (err) {
      setError(err.message || 'Failed to sign up with wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container-split">
      <div className="auth-left-panel">
        <div className="auth-content">
          <div className="auth-header">
            <h1 className="auth-title">Join SingFi</h1>
            <p className="auth-subtitle">Create your account and start singing</p>
          </div>

          {error && (
            <div className="auth-error">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleEmailSignup} className="auth-form">
            <div className="form-group">
              <label htmlFor="displayName">Display Name</label>
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <svg className="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="auth-button primary"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>

            <div className="auth-divider">
              <span>OR</span>
            </div>

            <div className="auth-social-buttons">
              <button
                type="button"
                onClick={handleGoogleSignup}
                className="auth-button social google"
                disabled={loading}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              <button
                type="button"
                onClick={handleWalletSignup}
                className="auth-button social wallet"
                disabled={loading}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1h-9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h9z" />
                </svg>
                {loading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            </div>

            <div className="auth-footer">
              <p>
                Already have an account?{' '}
                <Link to="/login" className="auth-link">
                  Sign in
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>

      <div className="auth-right-panel">
        <div className="auth-illustration">
          <div className="illustration-content">
            <div className="illustration-icon"></div>
            <h2>Start Your Journey</h2>
            <p>Join our community and discover your singing potential</p>
          </div>
        </div>
      </div>
    </div>
  );
}

