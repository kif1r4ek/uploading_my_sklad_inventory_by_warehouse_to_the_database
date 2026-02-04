-- Migration: Add available and min_stock columns to stock tables

ALTER TABLE ms_stock_by_store
ADD COLUMN IF NOT EXISTS available NUMERIC(15, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC(15, 4) DEFAULT 0;

ALTER TABLE ms_stock_totals
ADD COLUMN IF NOT EXISTS total_available NUMERIC(15, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS min_stock NUMERIC(15, 4) DEFAULT 0;
