CREATE TABLE IF NOT EXISTS ms_stores (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    external_code VARCHAR(255),
    archived BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ms_snapshots (
    id SERIAL PRIMARY KEY,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'in_progress',
    rows_processed INTEGER DEFAULT 0,
    stores_synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ms_stock_by_store (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES ms_snapshots(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name VARCHAR(500),
    product_code VARCHAR(255),
    product_article VARCHAR(255),
    store_id UUID NOT NULL REFERENCES ms_stores(id),
    stock NUMERIC(15, 4) DEFAULT 0,
    reserve NUMERIC(15, 4) DEFAULT 0,
    in_transit NUMERIC(15, 4) DEFAULT 0,
    available NUMERIC(15, 4) DEFAULT 0,
    min_stock NUMERIC(15, 4) DEFAULT 0,
    UNIQUE(snapshot_id, product_id, store_id)
);

CREATE TABLE IF NOT EXISTS ms_stock_totals (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES ms_snapshots(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name VARCHAR(500),
    product_code VARCHAR(255),
    product_article VARCHAR(255),
    total_stock NUMERIC(15, 4) DEFAULT 0,
    total_reserve NUMERIC(15, 4) DEFAULT 0,
    total_in_transit NUMERIC(15, 4) DEFAULT 0,
    total_available NUMERIC(15, 4) DEFAULT 0,
    min_stock NUMERIC(15, 4) DEFAULT 0,
    UNIQUE(snapshot_id, product_id)
);

CREATE TABLE IF NOT EXISTS ms_job_log (
    id SERIAL PRIMARY KEY,
    job_start TIMESTAMPTZ NOT NULL,
    job_end TIMESTAMPTZ,
    snapshot_id INTEGER REFERENCES ms_snapshots(id),
    status VARCHAR(50) DEFAULT 'running',
    stores_count INTEGER DEFAULT 0,
    products_count INTEGER DEFAULT 0,
    stock_rows_count INTEGER DEFAULT 0,
    http_requests INTEGER DEFAULT 0,
    retries INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

