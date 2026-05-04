const axios = require("axios");

/**
 * Generate AI Image URL for Featured Image
 */
function generateImage(topic) {
  const prompt = `cinematic blog header, ${topic}, high resolution, professional photography, clean composition`;

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1200&height=630&nologo=true`;
}

/**
 * Generate AI Image URL for Article body
 */
function generateArticleImage(topic) {
  const prompt = `detailed illustration about ${topic}, digital art, vibrant colors, artistic, centered composition`;

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=600&nologo=true`;
}

/**
 * Download image as buffer
 */
async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
  });

  return response.data;
}

module.exports = {
  generateImage,
  generateArticleImage,
  downloadImage,
};