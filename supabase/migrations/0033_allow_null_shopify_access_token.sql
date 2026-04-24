-- Shopify uninstall cleanup nulls access_token and marks the shop inactive.
-- Older schemas still have access_token as NOT NULL from the initial tenancy migration.
-- This aligns the database with the current OAuth lifecycle.

ALTER TABLE public.shops
ALTER COLUMN access_token DROP NOT NULL;
