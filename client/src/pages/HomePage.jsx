import React from 'react';
import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div className="page home-page">
      <div className="hero">
        <h1>VLITE</h1>
        <p className="hero-subtitle">Live Interactive Session Platform</p>
        <p className="hero-description">
          Create and host live interactive sessions — quizzes, IQ tests, aptitude sessions,
          and more. Real-time scoring, leaderboards, and expert mode.
        </p>
        <div className="hero-actions">
          <Link to="/login" className="btn btn-primary">Host a Session</Link>
          <Link to="/join" className="btn btn-secondary">Join a Session</Link>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
