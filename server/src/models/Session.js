import mongoose from 'mongoose';

/**
 * A Session represents ONE live execution of a reusable Room.
 *
 * ROOM    = reusable container (name, LRN, question bank, configuration)
 * SESSION = one live event using that room (participants, answers, results)
 *
 * A host creates a room once, adds questions once, then starts
 * Session 1, Session 2, ... from the same room without recreating
 * anything. Results always belong to a specific session.
 */
const sessionSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // 1-based number of this session within its room
    sessionNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: ['active', 'ended'],
      default: 'active',
    },

    // Snapshot of room configuration at session start.
    // Scoring rules are read from here so later room edits
    // cannot retroactively change a finished session.
    mode: {
      type: String,
      enum: ['normal', 'intermediate', 'expert'],
      required: true,
    },
    negativeMarking: { type: Boolean, default: false },
    correctPoints: { type: Number, default: 10 },
    negativePoints: { type: Number, default: 2 },

    questionCount: { type: Number, default: 0, min: 0 },
    participantCount: { type: Number, default: 0, min: 0 },

    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ room: 1, sessionNumber: -1 });
sessionSchema.index({ room: 1, sessionNumber: 1 }, { unique: true });
sessionSchema.index({ host: 1 });
sessionSchema.index({ status: 1 });

export default mongoose.model('Session', sessionSchema);
