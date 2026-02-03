import { config } from '../config.js';

const { token, baseUrl } = config.moysklad;
const { limit, delayMs, maxRetries, retryBackoffMs } = config.request;

let httpRequestCount = 0;
let retryCount = 0;

export function getStats() {
  return { httpRequestCount, retryCount };
}

export function resetStats() {
  httpRequestCount = 0;
  retryCount = 0;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 1) {
  httpRequestCount++;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 429 || response.status >= 500) {
      if (attempt <= maxRetries) {
        retryCount++;
        const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
        console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (HTTP ${response.status})`);
        await sleep(waitTime);
        return fetchWithRetry(url, attempt + 1);
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return response.json();
  } catch (error) {
    if (attempt <= maxRetries && error.code === 'ECONNRESET') {
      retryCount++;
      const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
      console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (${error.code})`);
      await sleep(waitTime);
      return fetchWithRetry(url, attempt + 1);
    }
    throw error;
  }
}

function extractUuidFromHref(href) {
  const match = href?.match(/([a-f0-9-]{36})(?:\?|$)/i);
  return match ? match[1] : null;
}

export async function fetchAllStores() {
  const stores = [];
  let offset = 0;

  while (true) {
    const url = `${baseUrl}/entity/store?limit=${limit}&offset=${offset}`;
    const data = await fetchWithRetry(url);

    if (!data.rows?.length) break;

    for (const row of data.rows) {
      stores.push({
        id: extractUuidFromHref(row.meta?.href),
        name: row.name,
        externalCode: row.externalCode,
        archived: row.archived
      });
    }

    offset += data.rows.length;
    if (data.rows.length < limit) break;

    await sleep(delayMs);
  }

  return stores;
}

export async function fetchAllProducts() {
  const products = new Map();
  let offset = 0;

  while (true) {
    const url = `${baseUrl}/entity/assortment?limit=${limit}&offset=${offset}`;
    const data = await fetchWithRetry(url);

    if (!data.rows?.length) break;

    for (const row of data.rows) {
      const id = extractUuidFromHref(row.meta?.href);
      if (id) {
        products.set(id, {
          name: row.name || null,
          code: row.code || null,
          article: row.article || null
        });
      }
    }

    offset += data.rows.length;
    console.log(`Loaded ${products.size} products...`);
    if (data.rows.length < limit) break;

    await sleep(delayMs);
  }

  return products;
}

export async function* fetchStockByStore(productsCache = null) {
  let offset = 0;

  while (true) {
    const url = `${baseUrl}/report/stock/bystore?limit=${limit}&offset=${offset}`;
    const data = await fetchWithRetry(url);

    if (!data.rows?.length) break;

    for (const row of data.rows) {
      const productId = extractUuidFromHref(row.meta?.href);

      if (!productId || !row.stockByStore?.length) continue;

      const cached = productsCache?.get(productId);
      const productName = cached?.name || row.name || null;
      const productCode = cached?.code || row.code || null;
      const productArticle = cached?.article || row.article || null;

      for (const storeStock of row.stockByStore) {
        const storeId = extractUuidFromHref(storeStock.meta?.href);
        if (!storeId) continue;

        yield {
          productId,
          productName,
          productCode,
          productArticle,
          storeId,
          stock: storeStock.stock || 0,
          reserve: storeStock.reserve || 0,
          inTransit: storeStock.inTransit || 0
        };
      }
    }

    offset += data.rows.length;
    if (data.rows.length < limit) break;

    await sleep(delayMs);
  }
}
