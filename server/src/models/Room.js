import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    // Unique 4-digit Live Room Number
    lrn: {
      type: String,
      required: true,
      unique: true,
      maxlength: 4,
      minlength: 4,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Session configuration
    mode: {
      type: String,
      enum: ['normal', 'intermediate', 'expert'],
      default: 'normal',
    },

    negativeMarking: {
      type: Boolean,
      default: false,
    },

    correctPoints: {
      type: Number,
      default: 10,
      min: 0,
    },

    negativePoints: {
      type: Number,
      default: 2,
      min: 0,
    },

    // Room status
    status: {
      type: String,
      enum: ['waiting', 'active', 'paused', 'ended'],
      default: 'waiting',
    },

    // Questions belonging to this room
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],

    // Participant count
    participantCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxParticipants: {
      type: Number,
      default: 500,
      min: 1,
    },

    // ----------------------------------------------------
    // REUSABLE-ROOM SESSION TRACKING
    // ----------------------------------------------------
    // A room is a reusable container. Each live event creates
    // a Session document; session-specific state (participants,
    // answers, results) is scoped to the current session.

    // Total sessions ever started from this room (1-based counter)
    sessionCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Currently live session, or null between sessions
    currentSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      default: null,
    },

    // ----------------------------------------------------
    // SERVER-AUTHORITATIVE LIVE QUESTION STATE
    // ----------------------------------------------------

    activeQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },

    currentQuestionOrder: {
      type: Number,
      default: -1,
    },

    questionStartedAt: {
      type: Date,
      default: null,
    },

    questionEndsAt: {
      type: Date,
      default: null,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (unique: true already in lrn schema field)
roomSchema.index({ host: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ host: 1, status: 1 });

export default mongoose.model('Room', roomSchema);