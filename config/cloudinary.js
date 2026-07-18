const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'heartconnect/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
  },
});

// Extract the Cloudinary public_id from a stored image URL so we can delete it later.
function publicIdFromUrl(url) {
  if (!url) return null;
  try {
    const parts = url.split('/');
    const fileWithExt = parts[parts.length - 1];
    const file = fileWithExt.split('.')[0];
    const folderIndex = parts.findIndex((p) => p === 'profiles');
    if (folderIndex === -1) return `heartconnect/profiles/${file}`;
    return `heartconnect/${parts[folderIndex]}/${file}`;
  } catch {
    return null;
  }
}

module.exports = { cloudinary, storage, publicIdFromUrl };
