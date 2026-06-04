#!/usr/bin/env node

/**
 * Cleanup Script for Soft-Deleted Bots
 * 
 * This script removes all data for bot_projects that have been soft-deleted (deleted_at IS NOT NULL)
 * 
 * Usage:
 *   node scripts/cleanup-soft-deleted-bots.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('🔍 Soft-Deleted Bots Cleanup Script\n');
  console.log(`Mode: ${DRY_RUN ? '🔎 DRY RUN (no changes will be made)' : '⚠️  LIVE (will delete data)'}\n`);

  // Check if wrangler is available
  try {
    const { execSync } = await import('child_process');
    execSync('wrangler --version', { stdio: 'ignore' });
  } catch (e) {
    console.error('❌ Error: wrangler CLI not found. Please install it first:');
    console.error('   npm install -g wrangler');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Running query to check soft-deleted bots...\n');
    
    const checkQuery = `
      SELECT 
        id, 
        name, 
        bot_username,
        deleted_at,
        datetime(deleted_at/1000, 'unixepoch') as deleted_date
      FROM bot_projects 
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC;
    `;
    
    console.log('Query:', checkQuery);
    console.log('\nTo see results, run:');
    console.log('  wrangler d1 execute DB --command "' + checkQuery.replace(/\n/g, ' ').trim() + '"');
    console.log('\nTo perform actual cleanup, run:');
    console.log('  node scripts/cleanup-soft-deleted-bots.js');
    console.log('  OR');
    console.log('  wrangler d1 execute DB --file=./scripts/cleanup-soft-deleted-bots.sql');
    return;
  }

  console.log('⚠️  WARNING: This will permanently delete ALL soft-deleted bots and their data!');
  console.log('⚠️  This action is IRREVERSIBLE!\n');
  
  console.log('To proceed, run:');
  console.log('  wrangler d1 execute DB --file=./scripts/cleanup-soft-deleted-bots.sql\n');
  
  console.log('Or to check what will be deleted first:');
  console.log('  node scripts/cleanup-soft-deleted-bots.js --dry-run\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
