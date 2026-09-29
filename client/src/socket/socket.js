import { io } from 'socket.io-client';
import config from '../utils/config.js';

let socketInstance = null;

export function getSocket(token) {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  socketInstance = io(config.SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.close();
    socketInstance = null;
  }
}
