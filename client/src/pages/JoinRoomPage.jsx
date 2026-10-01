import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';

function JoinRoomPage() {
  const [participantName, setParticipantName] = useState('');
  const [lrn, setLrn] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { loginParticipant } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/participants/join', {
        participantName,
        lrn,
      });

      loginParticipant(
        {
          participantName: res.data.participantName,
          roomId: res.data.roomId,
          lrn: res.data.lrn,
          sessionId: res.data.sessionId,
        },
        res.data.token
      );
      navigate(`/session/${res.data.roomId}`);
    } catch (err) {
      setError(err.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page join-page">
      <div className="form-card">
        <h2>Join a VLITE Session</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              id="name"
              type="text"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label htmlFor="lrn">Live Room Number (4-digit number)</label>
            <input
              id="lrn"
              type="text"
              value={lrn}
              onChange={(e) => setLrn(e.target.value)}
              required
              maxLength={4}
              pattern="\d{4}"
              placeholder="e.g. 1234"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Joining...' : 'Join Live Room'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default JoinRoomPage;
