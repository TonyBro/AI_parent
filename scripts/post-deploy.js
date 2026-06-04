/**
 * Post-deployment script to sync Telegram bot configuration.
 * This script triggers an internal endpoint on the deployed worker
 * to update commands and menu buttons for the parent bot.
 */

const DEFAULT_URL = 'https://ai-parent-bot.anton-legkyy.workers.dev';
const SYNC_PATH = '/__debug/tg/setParentCommands';

async function runPostDeploySync() {
  // Use URL from argument if provided, otherwise fallback to default
  const baseUrl = process.argv[2] || DEFAULT_URL;
  const endpoint = `${baseUrl.replace(/\/$/, '')}${SYNC_PATH}`;

  console.log(`\n🚀 Starting post-deployment sync...`);
  console.log(`🔗 Target: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'User-Agent': 'ai-parent-bot-deploy-script'
      }
    });

    const resultText = await response.text();

    if (response.ok) {
      console.log(`✅ Success: ${resultText}`);
    } else {
      console.error(`❌ Error (${response.status}): ${resultText}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Connection failed: ${error.message}`);
    process.exit(1);
  }
}

runPostDeploySync();






