import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api.js';

function ResultsPage() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/rooms/${roomId}/results`)
      .then((res) => {
        if (cancelled) return;
        setRoom(res.data.room);
        setResults(res.data.results || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load results');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (loading) return <div className="page">Loading results...</div>;

  return (
    <div className="page results-page">
      <div className="results-card">
        <h2>Session Results</h2>
        {room && (
          <p>
            Room {room.lrn} — {room.name} ({room.status})
          </p>
        )}
        {error && <div className="alert alert-error">{error}</div>}
        {!error && results.length === 0 && (
          <p>No results recorded for this session yet.</p>
        )}
        {!error && results.length > 0 && (
          <ol className="results-list">
            {results.map((entry, idx) => (
              <li key={idx}>
                {entry.rank}. {entry.participantName} — {entry.score}
              </li>
            ))}
          </ol>
        )}
        <Link to="/" className="btn btn-primary">Return Home</Link>
      </div>
    </div>
  );
}

export default ResultsPage;
