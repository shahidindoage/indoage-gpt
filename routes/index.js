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

    console.log(`✨ Creating topic and generating content: ${topic}`);

    // Fetch existing WP pages for internal linking
    const internalLinks = await wordpress.getPages();

    // Generate content and images immediately
    const [title, meta, rawContent] = await Promise.all([
      gemini.generateTitle(topic),
      gemini.generateMeta(topic),
      gemini.generateContent(topic, keywords, internalLinks)
    ]);

    const featuredAIUrl = imageService.generateImage(topic);
    const articleAIUrl = imageService.generateArticleImage(topic);

    let featuredWPUrl = featuredAIUrl;
    let featuredMediaId = null;
    let articleWPUrl = articleAIUrl;
    let articleMediaId = null;

    let imageError = false;
    try {
      console.log("  -> Uploading featured image to WP...");
      const featuredBuffer = await imageService.downloadImage(featuredAIUrl);
      const featuredMedia = await wordpress.uploadImage(featuredBuffer, `featured-${Date.now()}.jpg`);
      featuredWPUrl = featuredMedia.url;
      featuredMediaId = featuredMedia.id;

      console.log("  -> Uploading article image to WP...");
      const articleBuffer = await imageService.downloadImage(articleAIUrl);
      const articleMedia = await wordpress.uploadImage(articleBuffer, `article-${Date.now()}.jpg`);
      articleWPUrl = articleMedia.url;
      articleMediaId = articleMedia.id;
    } catch (imgError) {
      console.error("⚠️ Initial WP upload failed:", imgError.message);
      imageError = true;
    }

    // Inject article image into content (using WP URL if available)
    let content = rawContent;
    const paragraphs = content.split('</p>');
    if (paragraphs.length > 2) {
      const imgTag = `<figure style="text-align: center; margin: 30px 0;"><img class="article-image" src="${articleWPUrl}" alt="${topic}" style="border-radius: 12px; max-width: 100%; height: auto;"><figcaption style="font-size: 13px; color: #666; margin-top: 8px;">${topic}</figcaption></figure>`;
      paragraphs.splice(2, 0, imgTag);
      content = paragraphs.join('</p>');
    } else {
      content += `<figure style="text-align: center; margin: 30px 0;"><img class="article-image" src="${articleWPUrl}" alt="${topic}" style="border-radius: 12px; max-width: 100%; height: auto;"></figure>`;
    }

    await prisma.topic.create({
      data: {
        topic,
        keywords,
        title,
        metaDescription: meta,
        content,
        featuredImage: featuredWPUrl,
        featuredMediaId,
        articleImage: articleWPUrl,
        articleMediaId,
        publishDate: new Date(publishDate),
        status: 'Pending'
      }
    });

    if (imageError) {
      res.redirect('/?message=Topic added, but images failed to upload due to WordPress server downtime. Please try updating images later.');
    } else {
      res.redirect('/?message=Topic added and content generated successfully');
    }
  } catch (error) {
    console.error('Error adding topic:', error);
    res.redirect('/?error=Failed to add topic: ' + error.message);
  }
});

/**
 * GET /edit/:id
 * Edit topic content
 */
router.get('/edit/:id', async (req, res) => {
  try {
    const topic = await prisma.topic.findUnique({
      where: { id: parseInt(req.params.id) }
    });

    if (!topic) return res.redirect('/?error=Topic not found');

    res.render('edit', { topic });
  } catch (error) {
    console.error('Error loading edit page:', error);
    res.redirect('/?error=Failed to load edit page');
  }
});

/**
 * POST /update/:id
 * Save edited content
 */
router.post('/update/:id', async (req, res) => {
  try {
    const { title, metaDescription, content, featuredImage, articleImage } = req.body;
    const id = parseInt(req.params.id);

    const oldTopic = await prisma.topic.findUnique({ where: { id } });
    if (!oldTopic) return res.redirect('/?error=Topic not found');

    let updatedData = {
      title,
      metaDescription,
      content,
      featuredImage,
      articleImage
    };

    let imageError = false;

    // 1. Handle Featured Image Change
    if (featuredImage !== oldTopic.featuredImage) {
      console.log("  -> Featured Image changed, uploading to WP...");
      try {
        const buffer = await imageService.downloadImage(featuredImage);
        const media = await wordpress.uploadImage(buffer, `featured-${id}-${Date.now()}.jpg`);
        updatedData.featuredImage = media.url;
        updatedData.featuredMediaId = media.id;
      } catch (err) {
        console.error("⚠️ Failed to upload new featured image:", err.message);
        imageError = true;
      }
    }

    // 2. Handle Article Image Change
    if (articleImage !== oldTopic.articleImage) {
      console.log("  -> Article Image changed, uploading to WP...");
      try {
        const buffer = await imageService.downloadImage(articleImage);
        const media = await wordpress.uploadImage(buffer, `article-${id}-${Date.now()}.jpg`);
        updatedData.articleImage = media.url;
        updatedData.articleMediaId = media.id;
        
        // Also update the URL inside the content HTML if it exists
        updatedData.content = updatedData.content.split(articleImage).join(media.url);
      } catch (err) {
        console.error("⚠️ Failed to upload new article image:", err.message);
        imageError = true;
      }
    }

    await prisma.topic.update({
      where: { id },
      data: updatedData
    });

    if (imageError) {
      res.redirect('/?message=Content updated, but some images failed to upload due to WordPress server downtime. Please try again later.');
    } else {
      res.redirect('/?message=Content and images updated successfully');
    }
  } catch (error) {
    console.error('Error updating topic:', error);
    res.redirect(`/?error=Failed to update content`);
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

    if (topic.status === 'Published') {
      return res.redirect('/?error=Already published');
    }

    // ✅ mark processing
    await prisma.topic.update({
      where: { id: topicId },
      data: { status: 'Processing' }
    });

    console.log(`🚀 Publishing: ${topic.topic}`);

    const wpResult = await wordpress.publishPost(
      topic.title,
      topic.content,
      topic.metaDescription,
      topic.featuredMediaId // Already stored in WP
    );

    await prisma.topic.update({
      where: { id: topicId },
      data: { 
        status: 'Published',
        wpPostId: wpResult.postId // 👈 STORE THIS
      }
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

    // 1. Get topic to check for WP ID
    const topic = await prisma.topic.findUnique({
      where: { id: topicId }
    });

    if (topic && topic.wpPostId) {
      console.log(`🗑️ Deleting from WordPress: ${topic.wpPostId}`);
      await wordpress.deletePost(topic.wpPostId);
    }

    // 2. Delete locally
    await prisma.topic.delete({
      where: { id: topicId }
    });

    res.redirect('/?message=Topic deleted successfully from both app and WordPress');
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.redirect('/?error=Failed to delete topic');
  }
});

module.exports = router;