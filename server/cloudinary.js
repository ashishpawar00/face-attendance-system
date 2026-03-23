const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a buffer or file stream directly to Cloudinary
 * @param {Buffer} buffer - file buffer
 * @param {string} folder - cloudinary folder
 * @returns {Promise<{url, public_id}>}
 */
function uploadToCloudinary(buffer, folder = 'face-attendance/students') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

/**
 * Delete an image from Cloudinary by public_id
 */
function deleteFromCloudinary(public_id) {
  if (!public_id) return Promise.resolve();
  return cloudinary.uploader.destroy(public_id);
}

module.exports = { uploadToCloudinary, deleteFromCloudinary };
