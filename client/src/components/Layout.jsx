import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-brand">
          <Link to="/" className="brand-link">VLITE</Link>
        </div>
        <nav className="header-nav">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link>
          {user ? (
            <>
              {user.role === 'host' && (
                <Link to="/host/dashboard" className={location.pathname.startsWith('/host') ? 'active' : ''}>Dashboard</Link>
              )}
              <button onClick={handleLogout} className="btn-logout">Logout</button>
            </>
          ) : (
            <Link to="/login" className={location.pathname === '/login' ? 'active' : ''}>Login</Link>
          )}
        </nav>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>VLITE &copy; {new Date().getFullYear()} - Live Interactive Session Platform</p>
        <p className="footer-credit">Built by VR</p>
      </footer>
    </div>
  );
}

export default Layout;
