const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const gemini = require('../services/gemini');
const wordpress = require('../services/wordpress');
const imageService = require('../services/image');

/**
 * GET / - Dashboard
 * Display all topics
 */
router.get('/', async (req, res) => {
  try {
    const topics = await prisma.topic.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.render('index', { 
      topics,
      message: req.query.message || null,
      error: req.query.error || null
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.render('index', { 
      topics: [],
      message: null,
      error: 'Failed to load topics'
    });
  }
});

/**
 * POST /add-topic
 * Create new topic
 */
router.post('/add-topic', async (req, res) => {
  try {
    const { topic, keywords, publishDate } = req.body;

    if (!topic || !keywords || !publishDate) {
      return res.redirect('/?error=All fields are required');
    }

    await prisma.topic.create({
      data: {
        topic,
        keywords,
        publishDate: new Date(publishDate),
        status: 'pending'
      }
    });

    res.redirect('/?message=Topic added successfully');
  } catch (error) {
    console.error('Error adding topic:', error);
    res.redirect('/?error=Failed to add topic');
  }
});

/**
 * POST /publish/:id
 * Manually publish a topic
 */
router.post('/publish/:id', async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);

    const topic = await prisma.topic.findUnique({
      where: { id: topicId }
    });

    if (!topic) {
      return res.redirect('/?error=Topic not found');
    }

    if (topic.status === 'published') {
      return res.redirect('/?error=Already published');
    }

    // ✅ mark processing
    await prisma.topic.update({
      where: { id: topicId },
      data: { status: 'processing' }
    });

    console.log(`🚀 Generating: ${topic.topic}`);

    // ✅ fast first
    const [title, meta] = await Promise.all([
      gemini.generateTitle(topic.topic),
      gemini.generateMeta(topic.topic)
    ]);

    if (!title) {
      await prisma.topic.update({
        where: { id: topicId },
        data: { status: 'failed' }
      });

      return res.redirect('/?error=Title generation failed');
    }

    // ✅ heavy content after
    const content = await gemini.generateContent(topic.topic, topic.keywords);

    // ✅ FINAL VALIDATION (critical)
    if (!content || content.length < 500) {
      await prisma.topic.update({
        where: { id: topicId },
        data: { status: 'failed' }
      });

      return res.redirect('/?error=Content generation failed');
    }

   console.log("🖼️ Generating featured image...");

let mediaId = null;

try {
  // 1. Generate image URL
  const imageUrl = imageService.generateImage(topic.topic);

  // 2. Download image
  const imageBuffer = await imageService.downloadImage(imageUrl);

  // 3. Upload to WordPress
  mediaId = await wordpress.uploadImage(
    imageBuffer,
    `${topic.topic.replace(/\s+/g, "-")}.jpg`
  );

  console.log("✅ Image uploaded:", mediaId);

} catch (imgError) {
  console.log("⚠️ Image failed, continuing without it...");
}

console.log("✅ Publishing to WordPress...");

// 4. Publish with image
const wpResult = await wordpress.publishPost(
  title,
  content,
  meta,
  mediaId // 👈 IMPORTANT
);

    await prisma.topic.update({
      where: { id: topicId },
      data: { status: 'published' }
    });

    console.log("✅ Published:", wpResult.postUrl);

    res.redirect(`/?message=Published: ${wpResult.postUrl}`);

  } catch (error) {
    console.error("❌ Publish error:", error);

    res.redirect(`/?error=${error.message}`);
  }
});

/**
 * POST /delete/:id
 * Delete a topic
 */
router.post('/delete/:id', async (req, res) => {
  try {
    const topicId = parseInt(req.params.id);

    await prisma.topic.delete({
      where: { id: topicId }
    });

    res.redirect('/?message=Topic deleted successfully');
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.redirect('/?error=Failed to delete topic');
  }
});

module.exports = router;