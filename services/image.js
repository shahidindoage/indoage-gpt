const axios = require("axios");

/**
 * Generate AI Image URL
 */
function generateImage(topic) {
  const prompt = `modern illustration, ${topic}, digital art, clean, professional, blog header`;

  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
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
  downloadImage,
};