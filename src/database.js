import pg from 'pg';
import { config } from './config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 10,
  idleTimeoutMillis: 30000
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

export async function initDatabase() {
  const sqlPath = join(__dirname, '..', 'sql', 'init.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Database initialized');
}

export async function upsertStore(store) {
  const sql = `
    INSERT INTO ms_stores (id, name, external_code, archived, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      external_code = EXCLUDED.external_code,
      archived = EXCLUDED.archived,
      updated_at = NOW()
  `;
  await query(sql, [store.id, store.name, store.externalCode, store.archived || false]);
}

export async function createSnapshot() {
  const result = await query(
    'INSERT INTO ms_snapshots (collected_at, status) VALUES (NOW(), $1) RETURNING id, collected_at',
    ['in_progress']
  );
  return result.rows[0];
}

export async function updateSnapshotStatus(snapshotId, status, rowsProcessed, storesSynced) {
  await query(
    'UPDATE ms_snapshots SET status = $2, rows_processed = $3, stores_synced = $4 WHERE id = $1',
    [snapshotId, status, rowsProcessed, storesSynced]
  );
}

export async function insertStockByStore(client, records) {
  if (!records.length) return;

  const values = [];
  const params = [];
  let idx = 1;

  for (const r of records) {
    values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    params.push(
      r.snapshotId, r.productId, r.productName, r.productCode, r.productArticle,
      r.storeId, r.stock, r.reserve, r.inTransit, r.available, r.minStock
    );
  }

  const sql = `
    INSERT INTO ms_stock_by_store
    (snapshot_id, product_id, product_name, product_code, product_article, store_id, stock, reserve, in_transit, available, min_stock)
    VALUES ${values.join(', ')}
    ON CONFLICT (snapshot_id, product_id, store_id) DO UPDATE SET
      stock = EXCLUDED.stock,
      reserve = EXCLUDED.reserve,
      in_transit = EXCLUDED.in_transit,
      available = EXCLUDED.available,
      min_stock = EXCLUDED.min_stock
  `;

  await client.query(sql, params);
}

export async function calculateAndInsertTotals(snapshotId) {
  const sql = `
    INSERT INTO ms_stock_totals
    (snapshot_id, product_id, product_name, product_code, product_article, total_stock, total_reserve, total_in_transit, total_available, min_stock)
    SELECT
      snapshot_id, product_id,
      MAX(product_name), MAX(product_code), MAX(product_article),
      SUM(stock), SUM(reserve), SUM(in_transit), SUM(available), MAX(min_stock)
    FROM ms_stock_by_store
    WHERE snapshot_id = $1
    GROUP BY snapshot_id, product_id
    ON CONFLICT (snapshot_id, product_id) DO UPDATE SET
      total_stock = EXCLUDED.total_stock,
      total_reserve = EXCLUDED.total_reserve,
      total_in_transit = EXCLUDED.total_in_transit,
      total_available = EXCLUDED.total_available,
      min_stock = EXCLUDED.min_stock
  `;
  await query(sql, [snapshotId]);
}

export async function createJobLog(jobStart) {
  const result = await query(
    'INSERT INTO ms_job_log (job_start, status) VALUES ($1, $2) RETURNING id',
    [jobStart, 'running']
  );
  return result.rows[0].id;
}

export async function updateJobLog(jobId, data) {
  const fields = [];
  const params = [jobId];
  let idx = 2;
  
  if (data.jobEnd !== undefined) { fields.push(`job_end = $${idx++}`); params.push(data.jobEnd); }
  if (data.snapshotId !== undefined) { fields.push(`snapshot_id = $${idx++}`); params.push(data.snapshotId); }
  if (data.status !== undefined) { fields.push(`status = $${idx++}`); params.push(data.status); }
  if (data.storesCount !== undefined) { fields.push(`stores_count = $${idx++}`); params.push(data.storesCount); }
  if (data.productsCount !== undefined) { fields.push(`products_count = $${idx++}`); params.push(data.productsCount); }
  if (data.stockRowsCount !== undefined) { fields.push(`stock_rows_count = $${idx++}`); params.push(data.stockRowsCount); }
  if (data.httpRequests !== undefined) { fields.push(`http_requests = $${idx++}`); params.push(data.httpRequests); }
  if (data.retries !== undefined) { fields.push(`retries = $${idx++}`); params.push(data.retries); }
  if (data.errorMessage !== undefined) { fields.push(`error_message = $${idx++}`); params.push(data.errorMessage); }
  
  if (fields.length) {
    await query(`UPDATE ms_job_log SET ${fields.join(', ')} WHERE id = $1`, params);
  }
}

export async function closePool() {
  await pool.end();
}
