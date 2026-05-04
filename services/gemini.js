const axios = require("axios");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// ✅ Fast + free fallback models
const MODELS = [
  "inclusionai/ling-2.6-1t:free",// ✅ often available
 "tencent/hy3-preview:free"
];

// ✅ Delay helper
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
function formatToHTML(content) {
  if (content.includes("<h1>")) return content;

  const lines = content.split("\n").filter(l => l.trim() !== "");

  let html = `<h1>${lines[0]}</h1>`;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    // detect headings
    if (
      line.toLowerCase().includes("section") ||
      line.endsWith(":")
    ) {
      html += `<h2>${line.replace(":", "")}</h2>`;
    } else {
      html += `<p>${line}</p>`;
    }
  }

  return html;
}
/**
 * 🔥 Common OpenRouter caller (fast + retry + fallback)
 */
async function callOpenRouter(prompt) {
  for (const model of MODELS) {
    try {
      const res = await axios.post(
        OPENROUTER_URL,
        {
          model,
          messages: [{ role: "user", content: prompt }],
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000 // ✅ prevent hanging
        }
      );

      const output = res.data?.choices?.[0]?.message?.content;

      if (!output || output.length < 20) {
        throw new Error("Empty response");
      }

      console.log(`✅ Success with ${model}`);
      return output;

    } catch (err) {
      console.log(
        `❌ ${model} failed`,
        err.response?.data?.error?.message || err.message
      );

      await delay(2000); // small wait before next model
    }
  }

  throw new Error("All models failed");
}
function cleanHTML(content) {
  return content
    // ❌ remove meta + title tags completely
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<title[^>]*>.*?<\/title>/gi, "")

    // ❌ remove anything before first <h1>
    .replace(/^[\s\S]*?(<h1>)/i, "$1")

    // ❌ remove multiple <br>
    .replace(/(<br\s*\/?>\s*){1,}/gi, "")

    // ❌ remove empty paragraphs
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, "")

    // ❌ remove extra whitespace
    .replace(/\n\s*\n/g, "\n")

    .trim();
}
/**
 * 📝 Generate Blog Content
 */
async function generateContent(topic, keywords, internalLinks = []) {
  const linksContext = internalLinks.length > 0 
    ? `\n\nInternal Links (Use these naturally in the content where relevant):\n${internalLinks.map(l => `- ${l.title}: ${l.link}`).join('\n')}`
    : "";

  const prompt = `
Write a blog post about "${topic}".

Requirements:
- Length: 700-900 words
- SEO optimized using: ${keywords}
- Human-friendly tone
- Use headings (H1, H2, H3)
- Include intro, sections, FAQs, CTA
- Output in HTML format if possible${linksContext}
`;

  try {
    const content = await callOpenRouter(prompt);

    const cleaned = content
      .replace(/```html\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // ✅ VALIDATION (critical)
   if (!cleaned || cleaned.length < 200) {
  throw new Error("Too short content");
}

  const formatted = formatToHTML(cleaned);
const finalHTML = cleanHTML(formatted);

return finalHTML;

  } catch (error) {
    console.error("❌ Content failed:", error.message);
    return ""; // prevent crash
  }
}

/**
 * 🏷️ Generate Title
 */
async function generateTitle(topic) {
  const prompt = `
Create a catchy SEO blog title for "${topic}".
- Max 10 words
- Use power words
- Make it click-worthy
- Output only title
`;

  try {
    const title = await callOpenRouter(prompt);

    if (!title || title.length < 5) {
      throw new Error("Invalid title");
    }

    return title.trim();

  } catch (error) {
    console.error("❌ Title failed:", error.message);
    return null;
  }
}

/**
 * 📄 Generate Meta Description
 */
async function generateMeta(topic) {
  const prompt = `
Write an engaging SEO meta description for "${topic}".
- Max 20 words
- Make it clickable
- Output only text
`;

  try {
    const meta = await callOpenRouter(prompt);
    return meta.trim();

  } catch (error) {
    console.error("❌ Meta failed:", error.message);
    return "";
  }
}

module.exports = {
  generateContent,
  generateTitle,
  generateMeta,
};