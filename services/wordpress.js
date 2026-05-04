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

    return {
      id: response.data.id,
      url: response.data.source_url
    }; // ✅ media info
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

/**
 * 🗑️ Delete Post
 */
async function deletePost(postId) {
  const url = `${WORDPRESS_URL}/wp-json/wp/v2/posts/${postId}`;

  try {
    await axios.delete(url, {
      headers: getAuthHeader(),
    });
    return true;
  } catch (error) {
    console.error('❌ WordPress Delete Error:', error.response?.data || error.message);
    // Don't throw, just log so local delete can continue
    return false;
  }
}

/**
 * 📄 Get all pages from WordPress
 */
async function getPages() {
  const url = `${WORDPRESS_URL}/wp-json/wp/v2/pages?per_page=100&_fields=title,link`;

  try {
    const response = await axios.get(url, {
      headers: getAuthHeader(),
    });
    return response.data.map(page => ({
      title: page.title.rendered,
      link: page.link
    }));
  } catch (error) {
    console.error('❌ WordPress Get Pages Error:', error.message);
    return [];
  }
}

module.exports = {
  publishPost,
  uploadImage,
  checkConnection,
  deletePost,
  getPages,
};