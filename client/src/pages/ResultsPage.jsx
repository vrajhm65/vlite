import React from 'react';
import { useParams, Link } from 'react-router-dom';

function ResultsPage() {
  const { roomId } = useParams();

  return (
    <div className="page results-page">
      <div className="results-card">
        <h2>Session Results</h2>
        <p>Room: {roomId}</p>
        <p>Results will be displayed here once the session ends.</p>
        <Link to="/" className="btn btn-primary">Return Home</Link>
      </div>
    </div>
  );
}

export default ResultsPage;
