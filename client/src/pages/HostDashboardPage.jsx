import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../services/api.js';
import { useNavigate } from 'react-router-dom';

function HostDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms');
      setRooms(res.data.rooms);
    } catch (err) {
      setError(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <h2>Host Dashboard</h2>
        <div className="dashboard-actions">
          <span className="user-info">Welcome, {user?.name}</span>
          <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="dashboard-section">
        <h3>Your Rooms</h3>
        {loading ? (
          <p>Loading...</p>
        ) : rooms.length === 0 ? (
          <p>No rooms yet. Create one to get started.</p>
        ) : (
          <ul className="room-list">
            {rooms.map((room) => (
              <li key={room._id} className="room-card">
                <div>
                  <strong>LRN: {room.lrn}</strong> — {room.name}
                </div>
                <div className="room-status">{room.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default HostDashboardPage;
