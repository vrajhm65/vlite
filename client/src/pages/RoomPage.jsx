import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../services/api.js';
import {
  StatusBadge,
  StatCard,
  LoadingState,
  EmptyState,
  ConfirmDialog,
  QuestionForm,
  emptyQuestionForm,
  MODE_INFO,
} from '../components/ui.jsx';

function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();

  const [room, setRoom] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [sessionResults, setSessionResults] = useState({});
  const [liveCount, setLiveCount] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);

  const [settingsForm, setSettingsForm] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showDeleteRoom, setShowDeleteRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);

  const [socketError, setSocketError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roomRes, qRes, sRes, pRes] = await Promise.all([
        api.get(`/rooms/${roomId}`),
        api.get(`/rooms/${roomId}/questions`),
        api.get(`/rooms/${roomId}/sessions`),
        api.get(`/rooms/${roomId}/participants`),
      ]);
      setRoom(roomRes.data.room);
      setQuestions(qRes.data.questions || []);
      setSessions(sRes.data.sessions || []);
      setParticipants(pRes.data.participants || []);
      setSettingsForm({
        name: roomRes.data.room.name,
        mode: roomRes.data.room.mode,
        negativeMarking: roomRes.data.room.negativeMarking,
        correctPoints: roomRes.data.room.correctPoints,
        negativePoints: roomRes.data.room.negativePoints,
        maxParticipants: roomRes.data.room.maxParticipants,
      });
    } catch (err) {
      setError(err.message || 'Unable to load this room.');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live socket state (participant count, session state)
  useEffect(() => {
    if (!socket) return;
    socket.emit('room:join', { roomId });
    socket.emit('session:sync', { roomId });

    const onState = (data) => {
      setLiveCount(data.participantCount ?? null);
      setLiveState({
        status: data.status,
        session: data.session || null,
        activeQuestion: data.activeQuestion || null,
      });
      if (data.status === 'active' && data.session) {
        setRoom((prev) => (prev ? { ...prev, status: 'active' } : prev));
      }
    };
    const onCount = (data) => setLiveCount(data.participantCount);
    const onStart = (data) => {
      setLiveState((prev) => ({
        status: 'active',
        session: {
          sessionId: data.sessionId,
          sessionNumber: data.sessionNumber,
          sessionStatus: 'active',
        },
        activeQuestion: prev?.activeQuestion || null,
      }));
      setNotice(`Session ${data.sessionNumber ?? ''} started.`.trim());
      loadAll();
    };
    const onEnd = () => {
      setLiveState((prev) => ({
        status: 'ended',
        session: prev?.session || null,
        activeQuestion: null,
      }));
      setNotice('Session ended. Results saved to session history.');
      loadAll();
    };
    const onSockErr = (data) => setSocketError(data.message || 'Realtime error');

    socket.on('room:state', onState);
    socket.on('participant:count', onCount);
    socket.on('session:start', onStart);
    socket.on('session:end', onEnd);
    socket.on('vlite:error', onSockErr);

    return () => {
      socket.off('room:state', onState);
      socket.off('participant:count', onCount);
      socket.off('session:start', onStart);
      socket.off('session:end', onEnd);
      socket.off('vlite:error', onSockErr);
    };
  }, [socket, roomId, loadAll]);

  const refreshQuestions = async () => {
    const res = await api.get(`/rooms/${roomId}/questions`);
    setQuestions(res.data.questions || []);
  };

  const refreshSessions = async () => {
    const res = await api.get(`/rooms/${roomId}/sessions`);
    setSessions(res.data.sessions || []);
  };

  const handleSaveQuestion = async (payload) => {
    setSavingQuestion(true);
    setError('');
    try {
      if (editingQuestion) {
        const res = await api.put(`/rooms/${roomId}/questions/${editingQuestion._id}`, payload);
        setQuestions((prev) => prev.map((q) => (q._id === editingQuestion._id ? res.data.question : q)));
      } else {
        const res = await api.post(`/rooms/${roomId}/questions`, {
          ...payload,
          order: questions.length,
        });
        setQuestions((prev) => [...prev, res.data.question]);
      }
      setShowQuestionModal(false);
      setEditingQuestion(null);
      setNotice(editingQuestion ? 'Question updated.' : 'Question added to the bank.');
    } catch (err) {
      setError(err.message || 'Failed to save question');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!deletingQuestionId) return;
    try {
      await api.delete(`/rooms/${roomId}/questions/${deletingQuestionId}`);
      setQuestions((prev) => prev.filter((q) => q._id !== deletingQuestionId));
      setDeletingQuestionId(null);
      setNotice('Question deleted.');
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    try {
      const res = await api.patch(`/rooms/${roomId}`, settingsForm);
      setRoom(res.data.room);
      setNotice('Room settings saved.');
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteRoom = async () => {
    setDeletingRoom(true);
    try {
      await api.delete(`/rooms/${roomId}`);
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to delete room');
      setDeletingRoom(false);
      setShowDeleteRoom(false);
    }
  };

  const handleStartSession = () => {
    if (!socket) return;
    setSocketError('');
    socket.emit('session:start', { roomId });
  };

  const handleEndSession = () => {
    if (!socket) return;
    socket.emit('session:end', { roomId });
  };

  const loadSessionResults = async (sessionId) => {
    if (sessionResults[sessionId]) return;
    try {
      const res = await api.get(`/rooms/${roomId}/sessions/${sessionId}/results`);
      setSessionResults((prev) => ({ ...prev, [sessionId]: res.data.results || [] }));
    } catch (err) {
      setError(err.message || 'Failed to load session results');
    }
  };

  if (loading) return <LoadingState message="Loading room..." />;
  if (error && !room) {
    return (
      <div className="page">
        <div className="alert alert-error">{error}</div>
        <Link to="/host/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>
    );
  }
  if (!room) return null;

  const isLive = (liveState?.status || room.status) === 'active';
  const displayCount = liveCount ?? room.participantCount ?? 0;
  const currentSession = liveState?.session || null;

  return (
    <div className="page room-page">
      <Link to="/host/dashboard" className="btn btn-ghost">← All rooms</Link>

      <div className="room-identity">
        <div className="lrn-big" aria-label={`Live Room Number ${room.lrn}`}>{room.lrn}</div>
        <h2>{room.name}</h2>
        <div className="room-meta">
          <StatusBadge status={liveState?.status || room.status} />
          <span className="badge badge-info">{MODE_INFO[room.mode]?.label || room.mode}</span>
          {currentSession && (
            <span className="badge badge-info">Session {currentSession.sessionNumber}</span>
          )}
          <span className="connection-status" style={{ color: 'white' }}>
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}
      {socketError && <div className="alert alert-error">{socketError}</div>}

      <div className="stat-grid" role="region" aria-label="Room statistics">
        <StatCard value={`👥 ${displayCount}`} label="Participants joined" />
        <StatCard value={questions.length} label="Questions in bank" />
        <StatCard value={sessions.length} label="Sessions run" />
        <StatCard value={`+${room.correctPoints}`} label="Correct points" />
      </div>

      <div className="card">
        <div className="section-header">
          <h3>{isLive ? 'Session is live' : room.status === 'ended' || sessions.length > 0 ? 'Ready for next session' : 'Ready when you are'}</h3>
          {!isLive ? (
            <button
              onClick={handleStartSession}
              className="btn btn-primary"
              disabled={!socket || questions.length === 0}
              title={questions.length === 0 ? 'Add at least one question first' : 'Start a new live session'}
            >
              Start New Session
            </button>
          ) : (
            <button onClick={handleEndSession} className="btn btn-danger">
              End Session
            </button>
          )}
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          {isLive
            ? `Session ${currentSession?.sessionNumber ?? ''} is live. Control questions from the live screen.`
            : questions.length === 0
              ? 'Add at least one question to the bank before starting a session.'
              : 'The question bank and configuration are saved. Starting a session does not change them.'}
        </p>
        {isLive && (
          <Link to={`/session/${room._id}`} className="btn btn-secondary" style={{ marginTop: '0.75rem' }}>
            Open Live Host Screen
          </Link>
        )}
      </div>

      <div className="tabs" role="tablist" aria-label="Room sections">
        {['overview', 'questions', 'sessions', 'settings'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`tab-btn${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Overview' : t === 'questions' ? `Questions (${questions.length})` : t === 'sessions' ? `Sessions (${sessions.length})` : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="two-col">
          <div className="card">
            <h3 className="section-title">Session configuration</h3>
            <table className="data-table">
              <tbody>
                <tr><td>Mode</td><td><strong>{MODE_INFO[room.mode]?.label}</strong> — {MODE_INFO[room.mode]?.description}</td></tr>
                <tr><td>Correct answer</td><td><strong>+{room.correctPoints}</strong> points</td></tr>
                <tr><td>Negative marking</td><td>{room.negativeMarking ? <strong>ON</strong> : 'OFF'}{room.negativeMarking && ` (−${room.negativePoints})`}</td></tr>
                <tr><td>Max participants</td><td>{room.maxParticipants}</td></tr>
                <tr><td>Questions available</td><td>{questions.length}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 className="section-title">Participants ({displayCount})</h3>
            {participants.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)' }}>No participants have joined yet. Share the LRN <strong>{room.lrn}</strong>.</p>
            ) : (
              <table className="data-table">
                <thead><tr><th>Name</th><th>Score</th><th>Status</th></tr></thead>
                <tbody>
                  {participants.slice(0, 20).map((p) => (
                    <tr key={p._id}>
                      <td>{p.participantName}</td>
                      <td>{p.score}</td>
                      <td>{p.isConnected ? '🟢' : '⚪'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {participants.length > 20 && (
              <p className="form-hint">Showing 20 of {participants.length} participants.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'questions' && (
        <div className="card">
          <div className="section-header">
            <h3>Question bank</h3>
            <button
              onClick={() => { setEditingQuestion(null); setShowQuestionModal(true); }}
              className="btn btn-primary"
              disabled={isLive}
              title={isLive ? 'Questions cannot change during a live session' : 'Add a question'}
            >
              Add Question
            </button>
          </div>
          {questions.length === 0 ? (
            <EmptyState
              icon="❓"
              title="No questions yet"
              message="Add your first question to build this room's question bank."
              action={<button onClick={() => { setEditingQuestion(null); setShowQuestionModal(true); }} className="btn btn-primary">Add Question</button>}
            />
          ) : (
            <ol className="question-list">
              {questions.map((q, idx) => (
                <li key={q._id} className="question-item">
                  <div className="question-text">{idx + 1}. {q.text}</div>
                  <div className="question-meta">
                    {q.options.length} options · {q.durationSeconds}s · {q.marks} marks · correct: {q.options[q.correctAnswerIndex]?.label}
                  </div>
                  <div className="room-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={isLive}
                      onClick={() => { setEditingQuestion(q); setShowQuestionModal(true); }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={isLive}
                      onClick={() => setDeletingQuestionId(q._id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {isLive && <p className="form-hint">Questions are locked while a session is live.</p>}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="card">
          <h3 className="section-title">Session history</h3>
          {sessions.length === 0 ? (
            <EmptyState
              icon="📊"
              title="No sessions yet"
              message="Start your first session from the Overview tab. Each session's results are saved separately here."
            />
          ) : (
            <table className="data-table">
              <thead><tr><th>Session</th><th>Status</th><th>Date</th><th>Participants</th><th>Results</th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <React.Fragment key={s._id}>
                    <tr>
                      <td><strong>Session {s.sessionNumber}</strong></td>
                      <td><StatusBadge status={s.status} /></td>
                      <td>{new Date(s.startedAt).toLocaleString()}</td>
                      <td>{s.participantCount}</td>
                      <td>
                        {s.status === 'ended' && s.resultCount > 0 ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => loadSessionResults(s._id)}>
                            View Results ({s.resultCount})
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                    {sessionResults[s._id] && (
                      <tr>
                        <td colSpan={5}>
                          <ol>
                            {sessionResults[s._id].map((r, i) => (
                              <li key={i}>{r.rank}. {r.participantName} — {r.score}</li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'settings' && settingsForm && (
        <div className="card">
          <h3 className="section-title">Room settings</h3>
          <form onSubmit={handleSaveSettings}>
            <div className="form-group">
              <label htmlFor="set-name">Room name</label>
              <input
                id="set-name"
                type="text"
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                required
                maxLength={120}
                disabled={isLive}
              />
            </div>
            <div className="form-group">
              <label htmlFor="set-mode">Session mode</label>
              <select
                id="set-mode"
                value={settingsForm.mode}
                onChange={(e) => setSettingsForm({ ...settingsForm, mode: e.target.value })}
                disabled={isLive}
              >
                <option value="normal">Normal (fixed points)</option>
                <option value="intermediate">Intermediate (speed-based)</option>
                <option value="expert">Expert (priority queue)</option>
              </select>
              <p className="form-hint">{MODE_INFO[settingsForm.mode]?.description}</p>
            </div>
            <div className="form-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settingsForm.negativeMarking}
                  onChange={(e) => setSettingsForm({ ...settingsForm, negativeMarking: e.target.checked })}
                  disabled={isLive}
                />
                Enable negative marking
              </label>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="set-correct">Correct points</label>
                <input
                  id="set-correct"
                  type="number"
                  value={settingsForm.correctPoints}
                  onChange={(e) => setSettingsForm({ ...settingsForm, correctPoints: Number(e.target.value) || 0 })}
                  min={0}
                  disabled={isLive}
                />
              </div>
              <div className="form-group">
                <label htmlFor="set-negative">Negative points</label>
                <input
                  id="set-negative"
                  type="number"
                  value={settingsForm.negativePoints}
                  onChange={(e) => setSettingsForm({ ...settingsForm, negativePoints: Number(e.target.value) || 0 })}
                  min={0}
                  disabled={isLive}
                />
              </div>
              <div className="form-group">
                <label htmlFor="set-max">Max participants</label>
                <input
                  id="set-max"
                  type="number"
                  value={settingsForm.maxParticipants}
                  onChange={(e) => setSettingsForm({ ...settingsForm, maxParticipants: Number(e.target.value) || 500 })}
                  min={1}
                  disabled={isLive}
                />
              </div>
            </div>
            {isLive && <p className="form-hint">Settings are locked while a session is live.</p>}
            <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="submit" className="btn btn-primary" disabled={savingSettings || isLive}>
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          <h3 className="section-title" style={{ color: 'var(--color-danger)' }}>Danger zone</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Deleting a room removes it and its question bank. Past session results are preserved.
            Ending a session never deletes the room.
          </p>
          <button
            className="btn btn-danger"
            disabled={isLive}
            onClick={() => setShowDeleteRoom(true)}
          >
            Delete Room
          </button>
        </div>
      )}

      {showQuestionModal && (
        <div className="modal-overlay" onClick={() => { setShowQuestionModal(false); setEditingQuestion(null); }}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>{editingQuestion ? 'Edit Question' : 'Add Question'}</h3>
            <QuestionForm
              initial={editingQuestion || emptyQuestionForm(questions.length)}
              submitLabel={editingQuestion ? 'Save Changes' : 'Add Question'}
              saving={savingQuestion}
              onCancel={() => { setShowQuestionModal(false); setEditingQuestion(null); }}
              onSubmit={handleSaveQuestion}
            />
          </div>
        </div>
      )}

      {deletingQuestionId && (
        <ConfirmDialog
          title="Delete question?"
          message="This removes the question from the room's bank. This cannot be undone."
          confirmLabel="Delete"
          onCancel={() => setDeletingQuestionId(null)}
          onConfirm={handleDeleteQuestion}
        />
      )}

      {showDeleteRoom && (
        <ConfirmDialog
          title={`Delete room "${room.name}"?`}
          message={`This removes the room (LRN ${room.lrn}) and its ${questions.length} question(s). Past session results are preserved. This cannot be undone.`}
          confirmLabel="Delete Room"
          loading={deletingRoom}
          onCancel={() => setShowDeleteRoom(false)}
          onConfirm={handleDeleteRoom}
        />
      )}
    </div>
  );
}

export default RoomPage;
