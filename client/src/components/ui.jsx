import React, { useState } from 'react';

export const QUESTION_TIME_PRESETS = [15, 30, 45, 60, 90];

export const MODE_INFO = {
  normal: {
    label: 'Normal',
    description: 'Fixed points per correct answer. Speed does not affect the score.',
  },
  intermediate: {
    label: 'Intermediate',
    description: 'Faster correct answers earn more points. Timing is measured by the server.',
  },
  expert: {
    label: 'Expert',
    description: 'Raise-hand priority queue. The fastest hand answers first.',
  },
};

export function StatusBadge({ status }) {
  const normalized = (status || 'waiting').toLowerCase();
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return (
    <span className={`badge badge-${normalized}`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="page" role="status" aria-live="polite">
      <div className="skeleton skeleton-card" style={{ marginBottom: '1rem' }}>
        <div className="skeleton" style={{ width: '40%', height: '1.5rem', marginBottom: '0.75rem' }} />
        <div className="skeleton" style={{ width: '90%', marginBottom: '0.5rem' }} />
        <div className="skeleton" style={{ width: '70%' }} />
      </div>
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ icon = '📋', title, message, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel, loading = false }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn-danger"
            disabled={loading}
          >
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function emptyQuestionForm(order = 0) {
  return {
    text: '',
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
    ],
    correctAnswerIndex: 0,
    explanation: '',
    marks: 10,
    durationSeconds: 30,
    order,
  };
}

export function QuestionForm({ initial, submitLabel = 'Save Question', onSubmit, onCancel, saving = false }) {
  const [form, setForm] = useState(() => ({
    ...emptyQuestionForm(),
    ...(initial || {}),
    options: (initial?.options?.length ? initial.options : emptyQuestionForm().options).map((o, i) => ({
      label: o.label || OPTION_LABELS[i] || `Option ${i + 1}`,
      text: o.text || '',
    })),
  }));

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const updateOption = (index, text) => {
    set({
      options: form.options.map((opt, i) => (i === index ? { ...opt, text } : opt)),
    });
  };

  const addOption = () => {
    if (form.options.length >= 6) return;
    const label = OPTION_LABELS[form.options.length] || `Option ${form.options.length + 1}`;
    set({ options: [...form.options, { label, text: '' }] });
  };

  const removeOption = (index) => {
    if (form.options.length <= 2) return;
    set({
      options: form.options.filter((_, i) => i !== index),
      correctAnswerIndex:
        form.correctAnswerIndex >= index && form.correctAnswerIndex > 0
          ? form.correctAnswerIndex - 1
          : form.correctAnswerIndex,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      durationSeconds: Number(form.durationSeconds) || 30,
      marks: Number(form.marks) || 0,
      order: Number(form.order) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="q-text">Question</label>
        <textarea
          id="q-text"
          value={form.text}
          onChange={(e) => set({ text: e.target.value })}
          required
          maxLength={2000}
          rows={3}
          placeholder="Type the question here"
        />
      </div>

      <div className="form-group">
        <label>Answer options (select the correct one)</label>
        {form.options.map((opt, idx) => (
          <div key={idx} className="option-input-row">
            <span className="option-label" aria-hidden="true">{opt.label}</span>
            <input
              type="text"
              value={opt.text}
              onChange={(e) => updateOption(idx, e.target.value)}
              placeholder={`Option ${opt.label}`}
              required
              aria-label={`Option ${opt.label}`}
            />
            <label className="correct-radio">
              <input
                type="radio"
                name="correctAnswer"
                checked={form.correctAnswerIndex === idx}
                onChange={() => set({ correctAnswerIndex: idx })}
                aria-label={`Mark option ${opt.label} as correct`}
              />
              Correct
            </label>
            {form.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="btn btn-secondary btn-sm"
                aria-label={`Remove option ${opt.label}`}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {form.options.length < 6 && (
          <button type="button" onClick={addOption} className="btn btn-secondary btn-sm">
            + Add Option
          </button>
        )}
      </div>

      <div className="form-group">
        <label id="q-time-label">Answer time per question</label>
        <div className="preset-row" role="group" aria-labelledby="q-time-label">
          {QUESTION_TIME_PRESETS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              className={`preset-btn${Number(form.durationSeconds) === seconds ? ' selected' : ''}`}
              onClick={() => set({ durationSeconds: seconds })}
              aria-pressed={Number(form.durationSeconds) === seconds}
            >
              {seconds}s
            </button>
          ))}
        </div>
        <input
          type="number"
          value={form.durationSeconds}
          onChange={(e) => set({ durationSeconds: e.target.value })}
          min={5}
          max={600}
          aria-label="Custom answer time in seconds"
        />
        <p className="form-hint">The server enforces this deadline. Timers shown to participants are display-only.</p>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="q-marks">Marks</label>
          <input
            id="q-marks"
            type="number"
            value={form.marks}
            onChange={(e) => set({ marks: e.target.value })}
            min={0}
          />
        </div>
        <div className="form-group">
          <label htmlFor="q-order">Order</label>
          <input
            id="q-order"
            type="number"
            value={form.order}
            onChange={(e) => set({ order: e.target.value })}
            min={0}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="q-explanation">Explanation (optional, shown in results)</label>
        <input
          id="q-explanation"
          type="text"
          value={form.explanation}
          onChange={(e) => set({ explanation: e.target.value })}
          maxLength={1000}
        />
      </div>

      <div className="modal-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={saving}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
