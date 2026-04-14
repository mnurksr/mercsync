-- Add location_deduction_order to shop_settings
ALTER TABLE public.shop_settings
ADD COLUMN IF NOT EXISTS location_deduction_order text[] NULL DEFAULT '{}'::text[];

-- Update the view or functions if necessary (usually not needed for direct column add)
