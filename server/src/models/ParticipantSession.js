import mongoose from 'mongoose';

const participantSessionSchema = new mongoose.Schema(
  {
    participantName: { type: String, required: true, maxlength: 100 },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    // The live session this participant joined.
    // Null only for legacy records created before sessions existed.
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
    token: { type: String, required: true, unique: true },
    score: { type: Number, default: 0 },
    answeredQuestions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    isConnected: { type: Boolean, default: true },
    socketId: { type: String, default: '' },
    joinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes (unique is defined in schema field)
participantSessionSchema.index({ room: 1 });
participantSessionSchema.index({ room: 1, token: 1 }, { unique: true });
participantSessionSchema.index({ room: 1, session: 1 });

export default mongoose.model('ParticipantSession', participantSessionSchema);
