import './Footer.css';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="footer-logo-icon">🎤</span>
            <span className="footer-logo-text">SingFi</span>
          </div>
          <div className="footer-info">
            <p className="footer-tagline">Sing along and perfect your pitch</p>
            <p className="footer-copyright">
              © {currentYear} SingFi. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}












