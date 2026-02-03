import { syncInventory } from './services/syncInventory.js';
import { initDatabase, closePool } from './database.js';

async function main() {
  console.log('='.repeat(60));
  console.log(`MoySklad Sync started at ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    await initDatabase();
    const result = await syncInventory();
    
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Snapshot ID: ${result.snapshotId}`);
    console.log(`  Stores: ${result.storesCount}`);
    console.log(`  Products: ${result.productsCount}`);
    console.log(`  Stock rows: ${result.stockRowsCount}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
