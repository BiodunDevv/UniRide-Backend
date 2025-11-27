/**
 * Socket Manager
 * Singleton to store and access Socket.IO instance across the application
 */

let io = null;

const setIO = (socketIO) => {
  io = socketIO;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO instance not initialized");
  }
  return io;
};

module.exports = {
  setIO,
  getIO,
};
