const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const gemini = require('./services/gemini');
const wordpress = require('./services/wordpress');

const prisma = new PrismaClient();

/**
 * Publish a single topic
 */
async function publishTopic(topic) {
  try {
    console.log(`[CRON] Publishing topic: ${topic.topic}`);

    // Generate content
    const [title, content, meta] = await Promise.all([
      gemini.generateTitle(topic.topic),
      gemini.generateContent(topic.topic, topic.keywords),
      gemini.generateMeta(topic.topic)
    ]);

    // Publish to WordPress
    const wpResult = await wordpress.publishPost(title, content, meta);

    // Update status
    await prisma.topic.update({
      where: { id: topic.id },
      data: { status: 'published' }
    });

    console.log(`[CRON] Successfully published: ${wpResult.postUrl}`);
    return true;
  } catch (error) {
    console.error(`[CRON] Failed to publish topic ${topic.id}:`, error.message);
    
    // Update status to failed
    await prisma.topic.update({
      where: { id: topic.id },
      data: { status: 'failed' }
    });
    
    return false;
  }
}

/**
 * Check and publish scheduled topics
 */
async function checkScheduledTopics() {
  try {
    const now = new Date();
    
    // Find pending topics that should be published
    const pendingTopics = await prisma.topic.findMany({
      where: {
        status: 'pending',
        publishDate: {
          lte: now
        }
      },
      orderBy: {
        publishDate: 'asc'
      }
    });

    if (pendingTopics.length === 0) {
      console.log('[CRON] No topics to publish');
      return;
    }

    console.log(`[CRON] Found ${pendingTopics.length} topic(s) to publish`);

    // Publish each topic
    for (const topic of pendingTopics) {
      await publishTopic(topic);
      // Wait 2 seconds between publications to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error('[CRON] Error checking scheduled topics:', error);
  }
}

/**
 * Start cron scheduler
 * Runs every 5 minutes
 */
function startScheduler() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('[CRON] Running scheduled check...');
    checkScheduledTopics();
  });

  console.log('[CRON] Scheduler started - checking every 5 minutes');

  // Run once on startup
  console.log('[CRON] Running initial check...');
  checkScheduledTopics();
}

module.exports = {
  startScheduler,
  checkScheduledTopics
};