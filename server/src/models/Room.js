import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    // Unique 4-digit Live Room Number - server generated
    lrn: { type: String, required: true, unique: true, maxlength: 4, minlength: 4 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Session configuration
    mode: { type: String, enum: ['normal', 'intermediate', 'expert'], default: 'normal' },
    negativeMarking: { type: Boolean, default: false },
    correctPoints: { type: Number, default: 10, min: 0 },
    negativePoints: { type: Number, default: 2, min: 0 },

    // Room status
    status: {
      type: String,
      enum: ['waiting', 'active', 'paused', 'ended'],
      default: 'waiting',
    },

    // Questions reference
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],

    // Participant count
    participantCount: { type: Number, default: 0 },

    // Limits
    maxParticipants: { type: Number, default: 500 },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes (unique is defined in schema field, no need for schema.index)
roomSchema.index({ host: 1 });
roomSchema.index({ status: 1 });

export default mongoose.model('Room', roomSchema);
