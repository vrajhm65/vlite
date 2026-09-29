import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    text: { type: String, required: true, maxlength: 2000 },
    imageUrl: { type: String, default: '' },
    options: [
      {
        label: { type: String, required: true, maxlength: 500 },
        text: { type: String, required: true, maxlength: 2000 },
      },
    ],
    correctAnswerIndex: { type: Number, required: true, min: 0 },
    explanation: { type: String, default: '', maxlength: 1000 },
    marks: { type: Number, default: 10, min: 0 },
    durationSeconds: { type: Number, default: 30, min: 5 },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes
questionSchema.index({ room: 1, order: 1 });
questionSchema.index({ room: 1, isActive: 1 });

export default mongoose.model('Question', questionSchema);
