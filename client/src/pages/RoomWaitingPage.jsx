import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api.js';
import { LoadingState, StatusBadge, MODE_INFO } from '../components/ui.jsx';

function RoomWaitingPage() {
  const { lrn } = useParams();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const fetchRoom = async () => {
      try {
        const res = await api.get(`/rooms/lrn/${lrn}`);
        if (cancelled) return;
        setRoom(res.data.room);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Room not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRoom();
    // Refresh the public room card (participant count, status)
    // every 10 seconds. No authentication needed.
    timer = setInterval(fetchRoom, 10000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [lrn]);

  if (loading) return <LoadingState message="Loading room..." />;
  if (error) {
    return (
      <div className="page">
        <div className="alert alert-error" role="alert">{error}</div>
        <Link to="/join" className="btn btn-secondary">Try Another Room Number</Link>
      </div>
    );
  }
  if (!room) return <div className="page">Room not found</div>;

  return (
    <div className="page waiting-page">
      <div className="waiting-card">
        <div className="lrn-big" aria-label={`Live Room Number ${room.lrn}`}>{room.lrn}</div>
        <h2>{room.name}</h2>
        <div className="room-meta" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', margin: '0.75rem 0', flexWrap: 'wrap' }}>
          <StatusBadge status={room.status} />
          <span className="badge badge-info">{MODE_INFO[room.mode]?.label || room.mode}</span>
        </div>
        <p className="waiting-status" aria-live="polite">
          👥 {room.participantCount ?? 0} participant{(room.participantCount ?? 0) === 1 ? '' : 's'} waiting
          {room.questionCount != null && <> · {room.questionCount} questions</>}
        </p>
        <div className="hero-actions">
          <Link to="/join" className="btn btn-primary">Join as Participant</Link>
          <Link to="/login" className="btn btn-secondary">Host Login</Link>
        </div>
      </div>
    </div>
  );
}

export default RoomWaitingPage;
