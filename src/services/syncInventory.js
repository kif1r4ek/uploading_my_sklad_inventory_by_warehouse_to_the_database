import * as api from '../api/mysklad.js';
import * as db from '../database.js';

const BATCH_SIZE = 500;

export async function syncInventory() {
  const jobStart = new Date();
  const jobId = await db.createJobLog(jobStart);
  
  let snapshotId = null;
  let storesCount = 0;
  let productsProcessed = new Set();
  let stockRowsCount = 0;
  
  api.resetStats();
  
  try {
    console.log('Fetching stores...');
    const stores = await api.fetchAllStores();
    storesCount = stores.length;
    console.log(`Found ${storesCount} stores`);
    
    for (const store of stores) {
      await db.upsertStore(store);
    }
    
    const snapshot = await db.createSnapshot();
    snapshotId = snapshot.id;
    console.log(`Created snapshot #${snapshotId}`);
    
    await db.updateJobLog(jobId, { snapshotId });
    
    console.log('Fetching products for name resolution...');
    const productsCache = await api.fetchAllProducts();
    console.log(`Loaded ${productsCache.size} products into cache`);

    console.log('Fetching stock by store...');
    const client = await db.getClient();

    try {
      let batch = [];

      for await (const record of api.fetchStockByStore(productsCache)) {
        productsProcessed.add(record.productId);
        
        batch.push({
          snapshotId,
          ...record
        });
        
        if (batch.length >= BATCH_SIZE) {
          await db.insertStockByStore(client, batch);
          stockRowsCount += batch.length;
          batch = [];
          
          if (stockRowsCount % 5000 === 0) {
            console.log(`Processed ${stockRowsCount} stock rows...`);
          }
        }
      }
      
      if (batch.length > 0) {
        await db.insertStockByStore(client, batch);
        stockRowsCount += batch.length;
      }
    } finally {
      client.release();
    }
    
    console.log(`Calculating totals for ${productsProcessed.size} products...`);
    await db.calculateAndInsertTotals(snapshotId);
    
    await db.updateSnapshotStatus(snapshotId, 'completed', stockRowsCount, storesCount);
    
    const stats = api.getStats();
    await db.updateJobLog(jobId, {
      jobEnd: new Date(),
      status: 'success',
      storesCount,
      productsCount: productsProcessed.size,
      stockRowsCount,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount
    });
    
    console.log(`Sync completed: ${stockRowsCount} stock rows, ${productsProcessed.size} products, ${storesCount} stores`);
    
    return {
      success: true,
      snapshotId,
      storesCount,
      productsCount: productsProcessed.size,
      stockRowsCount
    };
    
  } catch (error) {
    console.error('Sync failed:', error.message);
    
    if (snapshotId) {
      await db.updateSnapshotStatus(snapshotId, 'failed', stockRowsCount, storesCount);
    }
    
    const stats = api.getStats();
    await db.updateJobLog(jobId, {
      jobEnd: new Date(),
      status: 'failed',
      storesCount,
      productsCount: productsProcessed.size,
      stockRowsCount,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount,
      errorMessage: error.message
    });
    
    throw error;
  }
}
