import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api.js';

function RoomWaitingPage() {
  const { lrn } = useParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchRoom();
  }, [lrn]);

  const fetchRoom = async () => {
    try {
      const res = await api.get(`/rooms/lrn/${lrn}`);
      setRoom(res.data.room);
    } catch (err) {
      setError(err.message || 'Room not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="page">Loading...</div>;
  if (error) return <div className="page"><div className="alert alert-error">{error}</div></div>;
  if (!room) return <div className="page">Room not found</div>;

  return (
    <div className="page waiting-page">
      <div className="waiting-card">
        <h2>Room {room.lrn}</h2>
        <p>{room.name}</p>
        <p className="waiting-status">Status: {room.status}</p>
        <Link to="/join" className="btn btn-primary">Join as Participant</Link>
        <Link to="/login" className="btn btn-secondary">Host Login</Link>
      </div>
    </div>
  );
}

export default RoomWaitingPage;
