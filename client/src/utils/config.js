const config = {
  // In development, VITE_API_URL is empty so requests use relative
  // paths (e.g. /api/auth/host) and go through the Vite proxy.
  // In production, set VITE_API_URL to the backend base including
  // the /api prefix, e.g. https://api.example.com/api
  API_URL: import.meta.env.VITE_API_URL || '/api',
  // In development, empty SOCKET_URL means connect to the same
  // origin (frontend), which Vite proxies to the backend.
  // In production, set to the backend origin, e.g. https://api.example.com
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL || undefined,
  isProduction: import.meta.env.PROD || false,
};

export default config;
