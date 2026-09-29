import Room from '../models/Room.js';
import logger from '../utils/logger.js';

/**
 * Generate a unique 4-digit LRN.
 * Uses collision-safe loop with unique index enforcement.
 */
async function generateUniqueLRN() {
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    const num = Math.floor(1000 + Math.random() * 9000).toString();
    const exists = await Room.findOne({ lrn: num, isDeleted: false });
    if (!exists) return num;
  }
  throw new Error('Unable to generate unique LRN after multiple attempts');
}

async function createRoom(hostId, roomData) {
  const lrn = await generateUniqueLRN();
  const room = await Room.create({
    lrn,
    name: roomData.name,
    host: hostId,
    mode: roomData.mode || 'normal',
    negativeMarking: roomData.negativeMarking || false,
    correctPoints: roomData.correctPoints || 10,
    negativePoints: roomData.negativePoints || 2,
    maxParticipants: roomData.maxParticipants || 500,
  });
  logger.info(`Room created: LRN=${lrn} by host=${hostId}`);
  return room;
}

async function getRoomByLRN(lrn) {
  return Room.findOne({ lrn, isDeleted: false });
}

async function getRoomById(id) {
  return Room.findById(id);
}

async function getActiveRooms() {
  return Room.find({ status: { $in: ['waiting', 'active'] }, isDeleted: false });
}

async function updateRoomStatus(roomId, status) {
  return Room.findByIdAndUpdate(roomId, { status }, { new: true });
}

async function addQuestionToRoom(roomId, questionId) {
  return Room.findByIdAndUpdate(roomId, { $push: { questions: questionId } }, { new: true });
}

export { createRoom, getRoomByLRN, getRoomById, getActiveRooms, updateRoomStatus, addQuestionToRoom, generateUniqueLRN };
