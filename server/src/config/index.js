import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5174',
  allowedOrigins: [
  process.env.CLIENT_URL || 'http://localhost:5174',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
],
  mongoUri: process.env.MONGODB_URI || '',
  mongoDbName: process.env.MONGODB_DB_NAME || 'vlite',
  captchaProvider: process.env.CAPTCHA_PROVIDER || 'none',
  recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '',
  recaptchaSecretKey: process.env.RECAPTCHA_SECRET_KEY || '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',
  redisUrl: process.env.REDIS_URL || '',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
};

export default config;
