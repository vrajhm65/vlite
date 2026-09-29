import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api.js';

function JoinRoomPage() {
  const [name, setName] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [lrn, setLrn] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First verify room exists
      const roomRes = await api.get(`/rooms/lrn/${lrn}`);
      const roomId = roomRes.data.room._id;

      // Join room
      const res = await api.post('/participants/join', {
        name,
        captchaToken,
        roomId,
      });

      localStorage.setItem('vlite_token', res.data.token);
      navigate(`/session/${roomId}`);
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label htmlFor="captcha">CAPTCHA (Dev mode: enter any text)</label>
            <input
              id="captcha"
              type="text"
              value={captchaToken}
              onChange={(e) => setCaptchaToken(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="lrn">Room LRN (4-digit number)</label>
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
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default JoinRoomPage;
