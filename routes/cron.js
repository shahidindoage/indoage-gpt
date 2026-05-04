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
    const windowNow = new Date(now.getTime() + 10 * 60 * 1000); // 10 minute buffer
    console.log(`[CRON] Server Time: ${now.toISOString()}`);
    console.log(`[CRON] Window Time (LTE): ${windowNow.toISOString()}`);

    // Check all pending topics regardless of date to see what's in DB
    const allPending = await prisma.topic.findMany({ where: { status: "pending" } });
    console.log(`[CRON] Total pending in DB: ${allPending.length}`);
    allPending.forEach(t => {
      console.log(`  -> Topic: ${t.topic}, PublishDate: ${t.publishDate.toISOString()}`);
    });

    const topics = await prisma.topic.findMany({
      where: {
        status: "pending",
        publishDate: {
          lte: windowNow, // Using the buffer
        },
      },
    });

    if (!topics.length) {
      console.log("[CRON] No topics due for publication (LTE now).");
      return res.json({ message: "No topics to publish" });
    }

    console.log(`[CRON] Found ${topics.length} topics to publish.`);

    for (const topic of topics) {
      try {
        console.log(`[CRON] Processing topic: ${topic.topic}`);

        // Update to processing to avoid double runs
        await prisma.topic.update({
          where: { id: topic.id },
          data: { status: "processing" },
        });

        // Publish to WordPress using pre-stored content and media
        const wpResult = await wordpress.publishPost(
          topic.title, 
          topic.content, 
          topic.metaDescription, 
          topic.featuredMediaId
        );

        // Update status to published and store the WP post ID
        await prisma.topic.update({
          where: { id: topic.id },
          data: { 
            status: "published",
            wpPostId: wpResult.postId
          },
        });

        console.log(`[CRON] ✅ Successfully published: ${wpResult.postUrl}`);
      } catch (err) {
        console.error(`[CRON] ❌ Failed topic ${topic.id}:`, err.message);

        await prisma.topic.update({
          where: { id: topic.id },
          data: { status: "failed" },
        });
      }
    }

    res.json({
      success: true,
      published: topics.length,
    });
  } catch (error) {
    console.error("[CRON] Global Error:", error.message);
    res.status(500).json({ error: "Cron failed" });
  }
});

module.exports = router;