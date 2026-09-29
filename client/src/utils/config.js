const config = {
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000',
  // Determine if running in production
  isProduction: import.meta.env.PROD || false,
};

export default config;
