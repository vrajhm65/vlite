import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    participantSession: { type: mongoose.Schema.Types.ObjectId, ref: 'ParticipantSession', required: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    selectedOptionIndex: { type: Number, required: true },
    isCorrect: { type: Boolean, required: true },
    pointsAwarded: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    answeredAt: { type: Date }, // server timestamp
  },
  { timestamps: true }
);

// Prevent duplicate answers per participant per question
answerSchema.index({ participantSession: 1, question: 1 }, { unique: true });

export default mongoose.model('Answer', answerSchema);
