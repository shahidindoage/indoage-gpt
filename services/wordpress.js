const axios = require('axios');

const WORDPRESS_URL = process.env.WORDPRESS_URL;
const WORDPRESS_USERNAME = process.env.WORDPRESS_USERNAME;
const WORDPRESS_APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;

// 🔐 Auth helper
function getAuthHeader() {
  return {
    Authorization:
      'Basic ' +
      Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APP_PASSWORD}`).toString('base64'),
  };
}

/**
 * 📤 Upload Image to WordPress
 */
async function uploadImage(imageBuffer, filename) {
  const url = `${WORDPRESS_URL}/wp-json/wp/v2/media`;

  try {
    const response = await axios.post(url, imageBuffer, {
      headers: {
        ...getAuthHeader(),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'image/jpeg',
      },
    });

    return response.data.id; // ✅ media ID
  } catch (error) {
    console.error('❌ Image Upload Error:', error.response?.data || error.message);
    throw new Error('Failed to upload image');
  }
}

/**
 * 📝 Publish Post
 */
async function publishPost(title, content, excerpt, featuredImageId = null) {
  const url = `${WORDPRESS_URL}/wp-json/wp/v2/posts`;

  const payload = {
    title,
    content,
    excerpt,
    status: 'publish',
  };

  // ✅ Attach featured image if exists
  if (featuredImageId) {
    payload.featured_media = featuredImageId;
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });

    return {
      success: true,
      postId: response.data.id,
      postUrl: response.data.link,
      data: response.data,
    };
  } catch (error) {
    console.error('❌ WordPress API Error:', error.response?.data || error.message);
    throw new Error('Failed to publish to WordPress');
  }
}

/**
 * 🔌 Check Connection
 */
async function checkConnection() {
  const url = `${WORDPRESS_URL}/wp-json/wp/v2/posts?per_page=1`;

  try {
    await axios.get(url, {
      headers: getAuthHeader(),
    });
    return true;
  } catch (error) {
    console.error('❌ WordPress connection failed:', error.message);
    return false;
  }
}

module.exports = {
  publishPost,
  uploadImage,
  checkConnection,
};