import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api.js';
import { LoadingState, EmptyState } from '../components/ui.jsx';
import { formatScore } from '../utils/format.js';

function ResultsPage() {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [session, setSession] = useState(null);
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
        setSession(res.data.session || null);
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

  if (loading) return <LoadingState message="Loading results..." />;

  return (
    <div className="page results-page">
      <div className="results-card">
        <h2>Session Results</h2>
        {room && (
          <p>
            {room.name} · LRN {room.lrn}
            {session?.sessionNumber ? <> · <strong>Session {session.sessionNumber}</strong></> : null}
          </p>
        )}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {!error && results.length === 0 && (
          <EmptyState
            icon="📊"
            title="No results yet"
            message="Results appear here after the host ends the session."
          />
        )}
        {!error && results.length > 0 && (
          <table className="data-table" aria-label="Session results">
            <thead><tr><th>Rank</th><th>Participant</th><th>Score</th></tr></thead>
            <tbody>
              {results.map((entry, idx) => (
                <tr key={idx} className={idx === 0 ? 'highlight' : ''}>
                  <td>{entry.rank}</td>
                  <td>{entry.participantName}</td>
                  <td>{formatScore(entry.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary">Return Home</Link>
          <Link to="/join" className="btn btn-secondary">Join Another Session</Link>
        </div>
      </div>
    </div>
  );
}

export default ResultsPage;
