import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../services/api.js';
import { StatusBadge, LoadingState, EmptyState, MODE_INFO } from '../components/ui.jsx';

function HostDashboardPage() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [creating, setCreating] = useState(false);

  const [roomForm, setRoomForm] = useState({
    name: '',
    mode: 'normal',
    negativeMarking: false,
    correctPoints: 10,
    negativePoints: 2,
    maxParticipants: 500,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get('/rooms')
      .then((res) => {
        if (!cancelled) setRooms(res.data.rooms || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load rooms');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await api.post('/rooms', roomForm);
      const newRoom = { ...res.data.room, questionCount: 0, sessionCount: 0 };
      setRooms((prev) => [newRoom, ...prev]);
      setShowCreateRoom(false);
      setRoomForm({
        name: '',
        mode: 'normal',
        negativeMarking: false,
        correctPoints: 10,
        negativePoints: 2,
        maxParticipants: 500,
      });
      navigate(`/host/rooms/${newRoom._id}`);
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingState message="Loading your rooms..." />;

  const liveRooms = rooms.filter((r) => r.status === 'active').length;

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <div>
          <h2>Host Dashboard</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>Welcome, {user?.name}</p>
        </div>
        <div className="dashboard-actions">
          <span className="connection-status" aria-live="polite">
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="stat-grid" role="region" aria-label="Overview statistics">
        <div className="stat-card">
          <div className="stat-value">{rooms.length}</div>
          <div className="stat-label">Rooms</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{liveRooms}</div>
          <div className="stat-label">Live now</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rooms.reduce((sum, r) => sum + (r.questionCount || 0), 0)}</div>
          <div className="stat-label">Questions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rooms.reduce((sum, r) => sum + (r.sessionCount || 0), 0)}</div>
          <div className="stat-label">Sessions run</div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="section-header">
          <h3>My Rooms</h3>
          <button onClick={() => setShowCreateRoom(true)} className="btn btn-primary">
            + Create Room
          </button>
        </div>

        {rooms.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="🏠"
              title="No rooms yet"
              message="Create a room, build its question bank once, then run unlimited live sessions from it."
              action={
                <button onClick={() => setShowCreateRoom(true)} className="btn btn-primary">
                  Create Your First Room
                </button>
              }
            />
          </div>
        ) : (
          <ul className="room-list">
            {rooms.map((room) => (
              <li key={room._id} className="room-card">
                <div>
                  <div>
                    <strong>{room.name}</strong>{' '}
                    <span className="lrn-inline" aria-label={`Live Room Number ${room.lrn}`}>
                      LRN {room.lrn}
                    </span>
                  </div>
                  <div style={{ marginTop: '0.375rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge status={room.status} />
                    <span className="badge badge-info">{MODE_INFO[room.mode]?.label || room.mode}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {room.questionCount ?? '?'} questions · {room.sessionCount ?? 0} sessions
                    </span>
                  </div>
                </div>
                <div className="room-actions">
                  <Link to={`/host/rooms/${room._id}`} className="btn btn-primary btn-sm">
                    Open Room
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreateRoom && (
        <div className="modal-overlay" onClick={() => setShowCreateRoom(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Create room">
            <h3>Create Room</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Rooms are reusable: add questions once, then start as many sessions as you like.
            </p>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label htmlFor="room-name">Room name</label>
                <input
                  id="room-name"
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  required
                  maxLength={120}
                  placeholder="e.g. DBMS Quiz"
                />
              </div>
              <div className="form-group">
                <label>Session mode</label>
                <div className="mode-grid" style={{ margin: '0.5rem 0' }}>
                  {Object.entries(MODE_INFO).map(([value, info]) => (
                    <div
                      key={value}
                      role="button"
                      tabIndex={0}
                      aria-pressed={roomForm.mode === value}
                      className={`mode-card${roomForm.mode === value ? ' selected' : ''}`}
                      onClick={() => setRoomForm({ ...roomForm, mode: value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setRoomForm({ ...roomForm, mode: value });
                        }
                      }}
                    >
                      <h4>{info.label}</h4>
                      <p>{info.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={roomForm.negativeMarking}
                    onChange={(e) => setRoomForm({ ...roomForm, negativeMarking: e.target.checked })}
                  />
                  Enable negative marking
                </label>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="correct-points">Correct points</label>
                  <input
                    id="correct-points"
                    type="number"
                    value={roomForm.correctPoints}
                    onChange={(e) => setRoomForm({ ...roomForm, correctPoints: Number(e.target.value) || 0 })}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="negative-points">Negative points</label>
                  <input
                    id="negative-points"
                    type="number"
                    value={roomForm.negativePoints}
                    onChange={(e) => setRoomForm({ ...roomForm, negativePoints: Number(e.target.value) || 0 })}
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="max-participants">Max participants</label>
                  <input
                    id="max-participants"
                    type="number"
                    value={roomForm.maxParticipants}
                    onChange={(e) => setRoomForm({ ...roomForm, maxParticipants: Number(e.target.value) || 500 })}
                    min={1}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateRoom(false)} className="btn btn-secondary" disabled={creating}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HostDashboardPage;
