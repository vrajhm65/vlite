import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../services/api.js';

function ActiveSessionPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const [sessionState, setSessionState] = useState({
    question: null,
    timer: 0,
    participants: 0,
    leaderboard: [],
  });
  const [error, setError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Display-only countdown, driven by server-provided questionEndsAt.
  // Scoring/validation always uses server time; this is visual only.
  useEffect(() => {
    if (!sessionState.question?.questionEndsAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionState.question?._id, sessionState.question?.questionEndsAt]);

  const remainingSeconds = (() => {
    const endsAt = sessionState.question?.questionEndsAt;
    if (!endsAt) return sessionState.timer;
    return Math.max(0, Math.ceil((new Date(endsAt).getTime() - nowMs) / 1000));
  })();

  useEffect(() => {
    if (!socket) return;

    // Join room socket room, then request full state sync
    // (covers refresh/reconnect recovery)
    socket.emit('room:join', { roomId });
    socket.emit('session:sync', { roomId });

    socket.on('room:state', (data) => {
      // If the session already ended (e.g. missed session:end
      // during a reconnect), go straight to results.
      if (data.status === 'ended') {
        navigate(`/results/${roomId}`);
        return;
      }
      setSessionState((prev) => ({
        ...prev,
        question: data.activeQuestion || null,
        participants: data.participantCount ?? prev.participants,
      }));
    });

    socket.on('question:end', () => {
      setSessionState((prev) => ({ ...prev, question: null }));
    });

    // Listen for session events
    socket.on('session:start', (data) => {
      setSessionState((prev) => ({ ...prev, ...data }));
    });

    socket.on('question:start', (data) => {
      setSessionState((prev) => ({
        ...prev,
        question: data.question,
        timer: data.durationSeconds,
      }));
    });

    socket.on('timer:tick', (data) => {
      setSessionState((prev) => ({ ...prev, timer: data.remaining }));
    });

    socket.on('leaderboard:update', (data) => {
      setSessionState((prev) => ({ ...prev, leaderboard: data.leaderboard }));
    });

    socket.on('session:end', () => {
      navigate(`/results/${roomId}`);
    });

    socket.on('error', (data) => {
      setError(data.message);
    });

    return () => {
      socket.off('room:state');
      socket.off('question:end');
      socket.off('session:start');
      socket.off('question:start');
      socket.off('timer:tick');
      socket.off('leaderboard:update');
      socket.off('session:end');
      socket.off('error');
    };
  }, [socket, roomId, navigate]);

  const handleAnswer = useCallback(
    (optionIndex) => {
      if (!socket) return;
      socket.emit('answer:submit', {
        roomId,
        questionId: sessionState.question?._id,
        selectedOptionIndex: optionIndex,
      });
    },
    [socket, roomId, sessionState.question]
  );

  return (
    <div className="page session-page">
      {error && <div className="alert alert-error">{error}</div>}

      <div className="session-header">
        <h2>Live Session</h2>
        <div className="connection-status">
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>

      {sessionState.question ? (
        <div className="question-card">
          <h3>{sessionState.question.text}</h3>
          {sessionState.question.imageUrl && (
            <img src={sessionState.question.imageUrl} alt="Question" />
          )}
          <div className="options-list">
            {sessionState.question.options.map((option, idx) => (
              <button
                key={idx}
                className="option-btn"
                onClick={() => handleAnswer(idx)}
              >
                {option.label}: {option.text}
              </button>
            ))}
          </div>
          <div className="timer">Time: {remainingSeconds}s</div>
        </div>
      ) : (
        <div className="waiting-question">
          <p>Waiting for host to start...</p>
        </div>
      )}

      {sessionState.leaderboard.length > 0 && (
        <div className="leaderboard-card">
          <h4>Leaderboard</h4>
          <ol>
            {sessionState.leaderboard.map((entry) => (
              <li key={entry.participantId}>
                {entry.rank}. {entry.participantName} — {entry.score}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default ActiveSessionPage;
