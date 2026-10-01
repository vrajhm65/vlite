import mongoose from 'mongoose';

const resultSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    // The live session these results belong to.
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
    sessionNumber: { type: Number, default: null },
    participantSession: { type: mongoose.Schema.Types.ObjectId, ref: 'ParticipantSession', required: true },
    participantName: { type: String, required: true },
    score: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    wrongAnswers: { type: Number, default: 0 },
    rank: { type: Number },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

resultSchema.index({ room: 1, score: -1 });
resultSchema.index({ room: 1, rank: 1 });
resultSchema.index({ room: 1, session: 1, rank: 1 });

export default mongoose.model('Result', resultSchema);
