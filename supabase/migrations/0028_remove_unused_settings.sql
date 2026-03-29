-- =================================================================
-- 0028_remove_unused_settings.sql
-- Removing 'conflict_strategy' and 'sync_frequency' as they are no longer used.
-- =================================================================

ALTER TABLE shop_settings 
DROP COLUMN IF EXISTS conflict_strategy,
DROP COLUMN IF EXISTS sync_frequency;
