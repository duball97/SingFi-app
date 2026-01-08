import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Header.css';

export default function Header() {
  const { user, userProfile, signOut, loading } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="site-header">
      <div className="header-container">
        <Link to="/" className="header-logo">
          <img src="/iconlogo.png" alt="SingFi" className="logo-image" />
        </Link>
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
          {loading ? (
            <div className="nav-link" style={{ opacity: 0.7 }}>Loading...</div>
          ) : user ? (
            <div className="user-menu">
              <Link to="/profile" className="user-info">
                {userProfile?.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt={userProfile.display_name || user.email}
                    className="user-avatar"
                  />
                ) : (
                  <div className="user-avatar-placeholder">
                    {userProfile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                <span className="user-name">
                  {userProfile?.display_name || user.email?.split('@')[0] || 'User'}
                </span>
              </Link>
              <button onClick={handleSignOut} className="nav-link logout-button">
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <Link to="/login" className="nav-link" style={{ visibility: 'visible', opacity: 1 }}>Sign In</Link>
              <Link to="/signup" className="nav-link signup-button" style={{ visibility: 'visible', opacity: 1 }}>Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}












