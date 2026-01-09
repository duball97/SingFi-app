import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export default function Profile() {
  const { user, userProfile, loading: authLoading, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({
    songsPlayed: 0,
    friendsCount: 0,
    averageScore: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.display_name || '');
    }
  }, [userProfile]);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  const loadStats = async () => {
    if (!user) return;

    try {
      setLoadingStats(true);

      // Load songs played count
      const { count: songsCount } = await supabase
        .from('singfi_game_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Load friends count
      const { count: friendsCount } = await supabase
        .from('singfi_friends')
        .select('*', { count: 'exact', head: true })
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');

      // Load average score
      const { data: scores } = await supabase
        .from('singfi_game_sessions')
        .select('score')
        .eq('user_id', user.id);

      const avgScore = scores && scores.length > 0
        ? scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length
        : 0;

      setStats({
        songsPlayed: songsCount || 0,
        friendsCount: friendsCount || 0,
        averageScore: Math.round(avgScore),
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSaveName = async () => {
    if (!user || !displayName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('singfi_users')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id);

      if (error) throw error;

      setEditingName(false);
      refreshProfile();
    } catch (error) {
      console.error('Error updating name:', error);
      alert('Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update user profile
      const { error: updateError } = await supabase
        .from('singfi_users')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      refreshProfile();
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar');
    }
  };

  const handleConnectWallet = async () => {
    setWalletConnecting(true);
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

      // Update user profile with wallet
      const { error } = await supabase
        .from('singfi_users')
        .update({
          wallet_address: walletAddress,
          wallet_type: 'metamask',
        })
        .eq('id', user.id);

      if (error) throw error;

      refreshProfile();
      alert('Wallet connected successfully!');
    } catch (error) {
      console.error('Error connecting wallet:', error);
      alert(error.message || 'Failed to connect wallet');
    } finally {
      setWalletConnecting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="profile-avatar-section">
          <div className="avatar-wrapper">
            {userProfile?.avatar_url ? (
              <img
                src={userProfile.avatar_url}
                alt={displayName || user.email}
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar-placeholder">
                {displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            <label className="avatar-upload-label">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                style={{ display: 'none' }}
              />
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </label>
          </div>
        </div>

        <div className="profile-info">
          {editingName ? (
            <div className="name-edit">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="name-input"
                placeholder="Enter your name"
                autoFocus
              />
              <div className="name-actions">
                <button
                  onClick={handleSaveName}
                  disabled={saving || !displayName.trim()}
                  className="save-button"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setDisplayName(userProfile?.display_name || '');
                    setEditingName(false);
                  }}
                  className="cancel-button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="name-display">
              <h1 className="profile-name">
                {displayName || user.email?.split('@')[0] || 'User'}
              </h1>
              <button
                onClick={() => setEditingName(true)}
                className="edit-name-button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit
              </button>
            </div>
          )}

          <p className="profile-email">{user.email}</p>

          {!userProfile?.wallet_address && (
            <button
              onClick={handleConnectWallet}
              disabled={walletConnecting}
              className="connect-wallet-button"
            >
              {walletConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}

          {userProfile?.wallet_address && (
            <div className="wallet-info">
              <span className="wallet-label">Wallet:</span>
              <span className="wallet-address">
                {userProfile.wallet_address.slice(0, 6)}...{userProfile.wallet_address.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="profile-dashboard">
        <h2 className="dashboard-title">Dashboard</h2>

        {loadingStats ? (
          <div className="stats-loading">
            <div className="loading-spinner-small"></div>
            <p>Loading stats...</p>
          </div>
        ) : (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon"></div>
              <div className="stat-content">
                <div className="stat-value">{stats.songsPlayed}</div>
                <div className="stat-label">Songs Played</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon"></div>
              <div className="stat-content">
                <div className="stat-value">{stats.friendsCount}</div>
                <div className="stat-label">Friends</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon"></div>
              <div className="stat-content">
                <div className="stat-value">{stats.averageScore.toLocaleString()}</div>
                <div className="stat-label">Average Score</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="profile-logout-container">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/');
          }}
          className="profile-logout-button"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
