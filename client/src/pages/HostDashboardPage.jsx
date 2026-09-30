import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import api from '../services/api.js';
import { useNavigate } from 'react-router-dom';

function HostDashboardPage() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomQuestions, setRoomQuestions] = useState([]);
  const [showQuestions, setShowQuestions] = useState(false);

  // Room creation form
  const [roomForm, setRoomForm] = useState({
    name: '',
    mode: 'normal',
    negativeMarking: false,
    correctPoints: 10,
    negativePoints: 2,
    maxParticipants: 500,
  });

  // Question form
  const [questionForm, setQuestionForm] = useState({
    text: '',
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
    ],
    correctAnswerIndex: 0,
    explanation: '',
    marks: 10,
    durationSeconds: 30,
    order: 0,
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await api.get('/rooms');
      setRooms(res.data.rooms || []);
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

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/rooms', roomForm);
      const newRoom = res.data.room;
      setRooms((prev) => [...prev, newRoom]);
      setShowCreateRoom(false);
      setRoomForm({
        name: '',
        mode: 'normal',
        negativeMarking: false,
        correctPoints: 10,
        negativePoints: 2,
        maxParticipants: 500,
      });
    } catch (err) {
      setError(err.message || 'Failed to create room');
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post(`/rooms/${selectedRoom._id}/questions`, questionForm);
      const newQuestion = res.data.question;
      setRoomQuestions((prev) => [...prev, newQuestion]);
      setShowAddQuestion(false);
      setQuestionForm({
        text: '',
        options: [
          { label: 'A', text: '' },
          { label: 'B', text: '' },
        ],
        correctAnswerIndex: 0,
        explanation: '',
        marks: 10,
        durationSeconds: 30,
        order: roomQuestions.length,
      });
    } catch (err) {
      setError(err.message || 'Failed to add question');
    }
  };

  const handleViewQuestions = async (room) => {
    setSelectedRoom(room);
    try {
      const res = await api.get(`/rooms/${room._id}/questions`);
      setRoomQuestions(res.data.questions || []);
      setShowQuestions(true);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    }
  };

  const handleStartSession = () => {
    if (!socket || !selectedRoom) return;
    socket.emit('session:start', { roomId: selectedRoom._id });
  };

  const handleEndSession = () => {
    if (!socket || !selectedRoom) return;
    socket.emit('session:end', { roomId: selectedRoom._id });
  };

  const handleStartQuestion = (questionId) => {
    if (!socket || !selectedRoom) return;
    socket.emit('question:next', { roomId: selectedRoom._id, questionId });
  };

  const addOption = () => {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    const nextLabel = labels[questionForm.options.length] || `Option ${questionForm.options.length + 1}`;
    setQuestionForm((prev) => ({
      ...prev,
      options: [...prev.options, { label: nextLabel, text: '' }],
    }));
  };

  const removeOption = (index) => {
    if (questionForm.options.length <= 2) return;
    setQuestionForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
      correctAnswerIndex: prev.correctAnswerIndex >= index && prev.correctAnswerIndex > 0
        ? prev.correctAnswerIndex - 1
        : prev.correctAnswerIndex,
    }));
  };

  const updateOption = (index, field, value) => {
    setQuestionForm((prev) => ({
      ...prev,
      options: prev.options.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      ),
    }));
  };

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <h2>Host Dashboard</h2>
        <div className="dashboard-actions">
          <span className="user-info">Welcome, {user?.name}</span>
          <span className="connection-status">
            {connected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          <button onClick={handleLogout} className="btn btn-secondary">Logout</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="dashboard-section">
        <div className="section-header">
          <h3>Your Rooms</h3>
          <button
            onClick={() => setShowCreateRoom(true)}
            className="btn btn-primary"
          >
            Create Room
          </button>
        </div>

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
                  <span className={`room-status ${room.status}`}>{room.status}</span>
                </div>
                <div className="room-actions">
                  <button
                    onClick={() => handleViewQuestions(room)}
                    className="btn btn-secondary"
                  >
                    Questions
                  </button>
                  {room.status === 'waiting' && (
                    <button
                      onClick={() => {
                        setSelectedRoom(room);
                        handleStartSession();
                      }}
                      className="btn btn-primary"
                    >
                      Start Session
                    </button>
                  )}
                  {room.status === 'active' && (
                    <button
                      onClick={() => {
                        setSelectedRoom(room);
                        handleEndSession();
                      }}
                      className="btn btn-secondary"
                    >
                      End Session
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateRoom && (
        <div className="modal-overlay" onClick={() => setShowCreateRoom(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Create Room</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label htmlFor="room-name">Room Name</label>
                <input
                  id="room-name"
                  type="text"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  required
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label htmlFor="room-mode">Session Mode</label>
                <select
                  id="room-mode"
                  value={roomForm.mode}
                  onChange={(e) => setRoomForm({ ...roomForm, mode: e.target.value })}
                >
                  <option value="normal">Normal (fixed points)</option>
                  <option value="intermediate">Intermediate (speed-based)</option>
                  <option value="expert">Expert (priority queue)</option>
                </select>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={roomForm.negativeMarking}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, negativeMarking: e.target.checked })
                    }
                  />
                  Enable Negative Marking
                </label>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="correct-points">Correct Points</label>
                  <input
                    id="correct-points"
                    type="number"
                    value={roomForm.correctPoints}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, correctPoints: parseInt(e.target.value) || 0 })
                    }
                    min={0}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="negative-points">Negative Points</label>
                  <input
                    id="negative-points"
                    type="number"
                    value={roomForm.negativePoints}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, negativePoints: parseInt(e.target.value) || 0 })
                    }
                    min={0}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="max-participants">Max Participants</label>
                <input
                  id="max-participants"
                  type="number"
                  value={roomForm.maxParticipants}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, maxParticipants: parseInt(e.target.value) || 500 })
                  }
                  min={1}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateRoom(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Questions Modal */}
      {showQuestions && selectedRoom && (
        <div className="modal-overlay" onClick={() => setShowQuestions(false)}>
          <div className="modal-card modal-large" onClick={(e) => e.stopPropagation()}>
            <h3>Questions — {selectedRoom.name} (LRN: {selectedRoom.lrn})</h3>

            <div className="question-list">
              {roomQuestions.length === 0 ? (
                <p>No questions yet.</p>
              ) : (
                <ol>
                  {roomQuestions.map((q, idx) => (
                    <li key={q._id} className="question-item">
                      <div className="question-text">{q.text}</div>
                      <div className="question-meta">
                        {q.options.length} options | {q.durationSeconds}s | {q.marks} marks
                      </div>
                      {selectedRoom.status === 'active' && (
                        <button
                          onClick={() => handleStartQuestion(q._id)}
                          className="btn btn-primary btn-sm"
                        >
                          Start This Question
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {selectedRoom.status === 'waiting' && (
              <div className="add-question-section">
                <h4>Add Question</h4>
                <form onSubmit={handleAddQuestion}>
                  <div className="form-group">
                    <label htmlFor="q-text">Question Text</label>
                    <textarea
                      id="q-text"
                      value={questionForm.text}
                      onChange={(e) => setQuestionForm({ ...questionForm, text: e.target.value })}
                      required
                      maxLength={2000}
                      rows={3}
                    />
                  </div>

                  <div className="form-group">
                    <label>Options</label>
                    {questionForm.options.map((opt, idx) => (
                      <div key={idx} className="option-input-row">
                        <span className="option-label">{opt.label}</span>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => updateOption(idx, 'text', e.target.value)}
                          placeholder={`Option ${opt.label}`}
                          required
                        />
                        <label className="correct-radio">
                          <input
                            type="radio"
                            name="correctAnswer"
                            checked={questionForm.correctAnswerIndex === idx}
                            onChange={() =>
                              setQuestionForm({ ...questionForm, correctAnswerIndex: idx })
                            }
                          />
                          Correct
                        </label>
                        {questionForm.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeOption(idx)}
                            className="btn btn-secondary btn-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {questionForm.options.length < 6 && (
                      <button type="button" onClick={addOption} className="btn btn-secondary btn-sm">
                        + Add Option
                      </button>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="q-marks">Marks</label>
                      <input
                        id="q-marks"
                        type="number"
                        value={questionForm.marks}
                        onChange={(e) =>
                          setQuestionForm({ ...questionForm, marks: parseInt(e.target.value) || 10 })
                        }
                        min={0}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="q-duration">Duration (seconds)</label>
                      <input
                        id="q-duration"
                        type="number"
                        value={questionForm.durationSeconds}
                        onChange={(e) =>
                          setQuestionForm({
                            ...questionForm,
                            durationSeconds: parseInt(e.target.value) || 30,
                          })
                        }
                        min={5}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="q-explanation">Explanation (optional)</label>
                    <input
                      id="q-explanation"
                      type="text"
                      value={questionForm.explanation}
                      onChange={(e) =>
                        setQuestionForm({ ...questionForm, explanation: e.target.value })
                      }
                      maxLength={1000}
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" onClick={() => setShowQuestions(false)} className="btn btn-secondary">
                      Close
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Add Question
                    </button>
                  </div>
                </form>
              </div>
            )}

            {selectedRoom.status !== 'waiting' && (
              <div className="modal-actions">
                <button onClick={() => setShowQuestions(false)} className="btn btn-secondary">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HostDashboardPage;
