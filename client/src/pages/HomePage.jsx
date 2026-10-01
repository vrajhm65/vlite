import React from 'react';
import { Link } from 'react-router-dom';

function HomePage() {
  return (
    <div className="page home-page">
      <div className="hero">
        <h1>VLITE</h1>
        <p className="hero-subtitle">Live Interactive Sessions</p>
        <p className="hero-description">
          Create a reusable room once, build a question bank, and run
          unlimited live sessions — quizzes, IQ tests, aptitude rounds
          and more — with real-time scoring and leaderboards.
        </p>
        <div className="hero-actions">
          <Link to="/login" className="btn btn-primary">Host a Session</Link>
          <Link to="/join" className="btn btn-secondary">Join a Session</Link>
        </div>
      </div>

      <h3 className="section-title">How VLITE works</h3>
      <div className="steps-grid">
        <div className="step-card">
          <span className="step-number">1</span>
          <h4>Host creates a room</h4>
          <p>Set a name, session mode, scoring rules and timing. You get a unique 4-digit Live Room Number (LRN).</p>
        </div>
        <div className="step-card">
          <span className="step-number">2</span>
          <h4>Build the question bank</h4>
          <p>Add questions once. The bank stays with the room and is reused for every future session.</p>
        </div>
        <div className="step-card">
          <span className="step-number">3</span>
          <h4>Participants join live</h4>
          <p>Participants enter their name and the LRN — no accounts needed — and wait for the host to go live.</p>
        </div>
        <div className="step-card">
          <span className="step-number">4</span>
          <h4>Play, score, repeat</h4>
          <p>Questions go live in real time with server-side scoring. End the session, keep the results, and start the next one from the same room.</p>
        </div>
      </div>

      <h3 className="section-title">Supported session types</h3>
      <div className="mode-grid">
        <div className="mode-card">
          <h4>Quiz</h4>
          <p>Classic live quiz with fixed points per correct answer.</p>
        </div>
        <div className="mode-card">
          <h4>IQ &amp; Aptitude</h4>
          <p>Speed-based intermediate scoring rewards faster correct answers.</p>
        </div>
        <div className="mode-card">
          <h4>Expert buzzer</h4>
          <p>Priority-queue answering — fastest hand gets the first chance.</p>
        </div>
      </div>

      <h3 className="section-title">Host vs participant</h3>
      <div className="two-col">
        <div className="card card-muted">
          <h3>Host</h3>
          <p>Registers an account, creates reusable rooms, manages the question bank, controls live sessions and views per-session results.</p>
        </div>
        <div className="card card-muted">
          <h3>Participant</h3>
          <p>Joins with just a name and the room LRN. Answers live questions and follows the real-time leaderboard — no account required.</p>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
