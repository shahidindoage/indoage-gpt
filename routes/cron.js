const express = require("express");
const router = express.Router();
const prisma = require("../lib/prisma");
const gemini = require("../services/gemini");
const wordpress = require("../services/wordpress");
const imageService = require("../services/image"); // ✅ ADD THIS

router.get("/run", async (req, res) => {
  try {
    console.log("[CRON] Running scheduled check...");

    const now = new Date();

    const topics = await prisma.topic.findMany({
      where: {
        status: "pending",
        publishDate: {
          lte: now,
        },
      },
    });

    if (!topics.length) {
      return res.json({ message: "No topics to publish" });
    }

    for (const topic of topics) {
      try {
        console.log(`[CRON] Publishing: ${topic.topic}`);

        await prisma.topic.update({
          where: { id: topic.id },
          data: { status: "processing" },
        });

        // ✅ FAST AI GENERATION
        const [title, meta, content] = await Promise.all([
          gemini.generateTitle(topic.topic),
          gemini.generateMeta(topic.topic),
          gemini.generateContent(topic.topic, topic.keywords),
        ]);

        if (!title || !content) {
          throw new Error("AI generation failed");
        }

        // 🖼️ IMAGE GENERATION (IMPORTANT FIX)
        let mediaId = null;

        try {
          console.log("🖼️ Generating image...");

          const imageUrl = imageService.generateImage(topic.topic);
          const imageBuffer = await imageService.downloadImage(imageUrl);

          mediaId = await wordpress.uploadImage(
            imageBuffer,
            `${topic.topic.replace(/\s+/g, "-")}.jpg`
          );

          console.log("✅ Image uploaded:", mediaId);
        } catch (imgErr) {
          console.log("⚠️ Image failed:", imgErr.message);
        }

        // 📤 PUBLISH TO WORDPRESS WITH IMAGE
        const wp = await wordpress.publishPost(
          title,
          content,
          meta,
          mediaId // ✅ featured image
        );

        await prisma.topic.update({
          where: { id: topic.id },
          data: {
            status: "Published",
          },
        });

        console.log(`[CRON] Published: ${wp.postUrl}`);
      } catch (err) {
        console.error(`[CRON] Failed topic ${topic.id}:`, err.message);

        await prisma.topic.update({
          where: { id: topic.id },
          data: { status: "Failed" },
        });
      }
    }

    res.json({
      success: true,
      published: topics.length,
    });
  } catch (error) {
    console.error("[CRON] Error:", error.message);

    res.status(500).json({
      error: "Cron failed",
    });
  }
});

module.exports = router;