import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Image Storage Service.
 *
 * Currently supports Cloudinary.
 * Uses environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 *
 * Images are stored in cloud storage. Only the URL is stored in MongoDB.
 * Large binary images are never stored directly in MongoDB documents.
 *
 * If Cloudinary is not configured, returns placeholder (development only).
 * Production requires valid Cloudinary credentials.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_DIMENSION = 4096;

/**
 * Validate an uploaded image file.
 * Returns { valid: boolean, error?: string }
 */
function validateImage(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return { valid: false, error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }

  return { valid: true };
}

/**
 * Upload an image to Cloudinary.
 * Returns { url: string, publicId: string } or throws on failure.
 */
async function uploadToCloudinary(file) {
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new Error('Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }

  // Dynamic import to avoid requiring cloudinary when not used
  const { CloudinaryStorage } = await import('multer-storage-cloudinary');
  const { v2: cloudinary } = await import('cloudinary');

  // Configure Cloudinary
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
  });

  // Upload the file
  const result = await cloudinary.uploader.upload(file.path || file.tempFilePath, {
    folder: 'vlite/questions',
    use_filename: true,
    unique_filename: true,
    transformation: [
      { width: MAX_DIMENSION, height: MAX_DIMENSION, crop: 'limit' },
    ],
  });

  logger.info(`Image uploaded to Cloudinary: ${result.public_id}`);
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Upload an image. Validates first, then uploads.
 * Returns { url: string } or throws on failure.
 */
async function uploadImage(file) {
  const validation = validateImage(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    const result = await uploadToCloudinary(file);
    return { url: result.url };
  } catch (error) {
    logger.error(`Image upload failed: ${error.message}`);
    throw new Error('Image upload failed. Please try again.');
  }
}

/**
 * Delete an image from Cloudinary by public ID.
 */
async function deleteImage(publicId) {
  if (!config.cloudinaryCloudName) {
    throw new Error('Cloudinary not configured');
  }

  const { v2: cloudinary } = await import('cloudinary');
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
  });

  await cloudinary.uploader.destroy(publicId);
  logger.info(`Image deleted from Cloudinary: ${publicId}`);
}

export { validateImage, uploadImage, deleteImage, MAX_FILE_SIZE, ALLOWED_TYPES };
