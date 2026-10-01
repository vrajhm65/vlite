import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import { StatusBadge, MODE_INFO } from '../components/ui.jsx';

function ActiveSessionPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const { user } = useAuth();
  const isHost = user?.role === 'host';

  const [roomMeta, setRoomMeta] = useState({ name: '', lrn: '', mode: 'normal', status: 'waiting' });
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [totalQuestions, setTotalQuestions] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const [answerState, setAnswerState] = useState(null); // { isCorrect, pointsAwarded }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Host-only: question bank for starting questions
  const [bankQuestions, setBankQuestions] = useState([]);
  const [expertQueue, setExpertQueue] = useState([]);
  const [myQueuePosition, setMyQueuePosition] = useState(null);

  // Display-only countdown from server-provided deadline
  useEffect(() => {
    if (!question?.questionEndsAt) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [question?._id, question?.questionEndsAt]);

  const remainingSeconds = (() => {
    if (!question?.questionEndsAt) return null;
    return Math.max(0, Math.ceil((new Date(question.questionEndsAt).getTime() - nowMs) / 1000));
  })();

  useEffect(() => {
    if (!socket) return;

    socket.emit('room:join', { roomId });
    socket.emit('session:sync', { roomId });

    const onState = (data) => {
      if (data.status === 'ended' && !data.activeQuestion) {
        navigate(`/results/${roomId}`);
        return;
      }
      setRoomMeta({
        name: data.name || '',
        lrn: data.lrn || '',
        mode: data.mode || 'normal',
        status: data.status || 'waiting',
      });
      setSession(data.session || null);
      setQuestion(data.activeQuestion || null);
      if (typeof data.totalQuestions === 'number') setTotalQuestions(data.totalQuestions);
      if (typeof data.participantCount === 'number') setParticipantCount(data.participantCount);
    };
    const onCount = (data) => {
      if (typeof data.participantCount === 'number') setParticipantCount(data.participantCount);
    };
    const onSessionStart = (data) => {
      setSession({ sessionId: data.sessionId, sessionNumber: data.sessionNumber, sessionStatus: 'active' });
      setRoomMeta((prev) => ({ ...prev, status: 'active' }));
      setAnswerState(null);
      setNotice(`Session ${data.sessionNumber ?? ''} started.`.trim());
    };
    const onQuestionStart = (data) => {
      setQuestion(data.question);
      if (typeof data.totalQuestions === 'number') setTotalQuestions(data.totalQuestions);
      setAnswerState(null);
      setMyQueuePosition(null);
      setError('');
    };
    const onQuestionEnd = () => setQuestion(null);
    const onBoard = (data) => setLeaderboard(data.leaderboard || []);
    const onSessionEnd = () => navigate(`/results/${roomId}`);
    const onAnswer = (data) => {
      if (!data.valid) {
        const reasons = {
          duplicate: 'You already answered this question.',
          time_expired: 'Time expired before your answer arrived.',
          question_not_active: 'This question is no longer active.',
          raise_hand_required: 'Raise your hand first to get answering priority.',
          not_priority_participant: 'Waiting for your turn in the queue.',
          expert_answer_timeout: 'Your answering window expired.',
        };
        setError(reasons[data.reason] || 'Answer was not accepted.');
        return;
      }
      setAnswerState({ isCorrect: data.isCorrect, pointsAwarded: data.pointsAwarded });
    };
    const onRaised = (data) => setMyQueuePosition(data.position);
    const onQueue = (data) => setExpertQueue(data.queue || []);
    const onExpertErr = (data) => {
      if (data.reason !== 'already_raised') {
        setError(data.reason === 'no_active_question' ? 'No active question right now.' : `Raise hand failed: ${data.reason}`);
      }
    };
    const onSockErr = (data) => setError(data.message || 'Realtime error');

    socket.on('room:state', onState);
    socket.on('participant:count', onCount);
    socket.on('session:start', onSessionStart);
    socket.on('question:start', onQuestionStart);
    socket.on('question:end', onQuestionEnd);
    socket.on('leaderboard:update', onBoard);
    socket.on('session:end', onSessionEnd);
    socket.on('answer:result', onAnswer);
    socket.on('expert:raised', onRaised);
    socket.on('expert:queue', onQueue);
    socket.on('expert:error', onExpertErr);
    socket.on('vlite:error', onSockErr);

    return () => {
      socket.off('room:state', onState);
      socket.off('participant:count', onCount);
      socket.off('session:start', onSessionStart);
      socket.off('question:start', onQuestionStart);
      socket.off('question:end', onQuestionEnd);
      socket.off('leaderboard:update', onBoard);
      socket.off('session:end', onSessionEnd);
      socket.off('answer:result', onAnswer);
      socket.off('expert:raised', onRaised);
      socket.off('expert:queue', onQueue);
      socket.off('expert:error', onExpertErr);
      socket.off('vlite:error', onSockErr);
    };
  }, [socket, roomId, navigate]);

  // Host loads the question bank for live control
  useEffect(() => {
    if (!socket || !isHost) return;
    let cancelled = false;
    api
      .get(`/rooms/${roomId}/questions`)
      .then((res) => {
        if (!cancelled) {
          setBankQuestions(res.data.questions || []);
          setTotalQuestions(res.data.questions?.length ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [socket, roomId, isHost]);

  const handleAnswer = useCallback(
    (optionIndex) => {
      if (!socket || !question) return;
      setError('');
      socket.emit('answer:submit', {
        roomId,
        questionId: question._id,
        selectedOptionIndex: optionIndex,
      });
    },
    [socket, roomId, question]
  );

  const myScore = (() => {
    const myId = user?.sessionId;
    if (!myId) return null;
    const entry = leaderboard.find((e) => String(e.participantId) === String(myId));
    return entry ? entry.score : null;
  })();

  const questionLabel = (() => {
    if (!question) return '';
    const num = typeof question.order === 'number' ? question.order + 1 : null;
    if (num && totalQuestions) return `Question ${num} of ${totalQuestions}`;
    if (num) return `Question ${num}`;
    return 'Live question';
  })();

  return (
    <div className="page session-page">
      <div className="session-header">
        <div>
          <h2>{roomMeta.name || 'Live Session'}</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {roomMeta.lrn && <>LRN {roomMeta.lrn} · </>}
            {MODE_INFO[roomMeta.mode]?.label || roomMeta.mode}
            {session?.sessionNumber ? <> · Session {session.sessionNumber}</> : null}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={roomMeta.status} />
          <span className="connection-status" aria-live="polite">
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="stat-grid" role="region" aria-label="Live statistics">
        <div className="stat-card">
          <div className="stat-value">👥 {participantCount}</div>
          <div className="stat-label">Participants joined</div>
        </div>
        {!isHost && myScore !== null && (
          <div className="stat-card">
            <div className="stat-value">{myScore}</div>
            <div className="stat-label">My score</div>
          </div>
        )}
        {remainingSeconds !== null && (
          <div className="stat-card">
            <div className="stat-value">{remainingSeconds}s</div>
            <div className="stat-label">Time left</div>
          </div>
        )}
      </div>

      {isHost && (
        <div className="card" aria-label="Host controls">
          <div className="section-header">
            <h3>Host controls</h3>
            {roomMeta.status === 'active' ? (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => socket && socket.emit('session:end', { roomId })}
              >
                End Session
              </button>
            ) : (
              <span className="form-hint">Start or resume from the room page.</span>
            )}
          </div>
          {roomMeta.status === 'active' && (
            <>
              <h4 style={{ marginBottom: '0.5rem' }}>Start a question</h4>
              {bankQuestions.length === 0 ? (
                <p className="form-hint">No questions in the bank.</p>
              ) : (
                <ol className="question-list">
                  {bankQuestions.map((q, idx) => (
                    <li key={q._id} className="question-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <div>
                        <div className="question-text">{idx + 1}. {q.text}</div>
                        <div className="question-meta">{q.durationSeconds}s · {q.marks} marks</div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => socket && socket.emit('question:next', { roomId, questionId: q._id })}
                      >
                        Start
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {expertQueue.length > 0 && (
                <>
                  <h4 style={{ margin: '1rem 0 0.5rem' }}>Raise-hand queue</h4>
                  <ol>
                    {expertQueue.map((entry) => (
                      <li key={entry.participantId}>
                        {entry.order}. {entry.participantName}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </div>
      )}

      {question ? (
        <div className="question-card">
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{questionLabel}</p>
          <h3>{question.text}</h3>
          {question.imageUrl && (
            <img src={question.imageUrl} alt="Question illustration" style={{ maxWidth: '100%', borderRadius: '8px', margin: '0.75rem 0' }} />
          )}
          {answerState && (
            <div className={`alert ${answerState.isCorrect ? 'alert-success' : 'alert-info'}`} role="status">
              {answerState.isCorrect ? '✓ Correct' : '✗ Incorrect'} ({answerState.pointsAwarded >= 0 ? '+' : ''}{answerState.pointsAwarded} pts)
              {question.explanation && isHost && <div style={{ marginTop: '0.25rem' }}>{question.explanation}</div>}
            </div>
          )}
          <div className="options-list" role="group" aria-label="Answer options">
            {question.options.map((option, idx) => (
              <button
                key={idx}
                className="option-btn"
                onClick={() => handleAnswer(idx)}
                disabled={!!answerState}
              >
                {option.label}: {option.text}
              </button>
            ))}
          </div>
          {remainingSeconds !== null && <div className="timer" aria-live="off">Time: {remainingSeconds}s</div>}
          <div className="progress-track" aria-hidden="true">
            <div
              className="progress-fill"
              style={{
                width: question.durationSeconds
                  ? `${Math.min(100, Math.max(0, ((question.durationSeconds - (remainingSeconds ?? 0)) / question.durationSeconds) * 100))}%`
                  : '0%',
              }}
            />
          </div>
          {!isHost && roomMeta.mode === 'expert' && !answerState && (
            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => socket && socket.emit('expert:raise-hand', { roomId })}
              >
                ✋ Raise Hand
              </button>
              {myQueuePosition && (
                <p className="form-hint">You are #{myQueuePosition} in the queue. Wait for your turn.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="waiting-question">
          <p>{roomMeta.status === 'active' ? 'Waiting for the next question...' : 'Waiting for host to start...'}</p>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="leaderboard-card">
          <h4>Leaderboard</h4>
          <table className="data-table">
            <thead><tr><th>Rank</th><th>Participant</th><th>Score</th></tr></thead>
            <tbody>
              {leaderboard.map((entry) => (
                <tr
                  key={entry.participantId}
                  className={user?.sessionId && String(entry.participantId) === String(user.sessionId) ? 'highlight' : ''}
                >
                  <td>{entry.rank}</td>
                  <td>{entry.participantName}</td>
                  <td>{entry.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isHost && (
        <div style={{ marginTop: '1rem' }}>
          <Link to={`/host/rooms/${roomId}`} className="btn btn-secondary">← Back to Room</Link>
        </div>
      )}
    </div>
  );
}

export default ActiveSessionPage;
