import { Link } from 'react-router-dom';
import './Header.css';

export default function Header() {
  return (
    <header className="site-header">
      <div className="header-container">
        <Link to="/" className="header-logo">
          <span className="logo-icon">🎤</span>
          <span className="logo-text">SingFi</span>
        </Link>
        <nav className="header-nav">
          <Link to="/" className="nav-link">Home</Link>
        </nav>
      </div>
    </header>
  );
}

