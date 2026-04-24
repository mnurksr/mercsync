import React from 'react';

interface PlatformIconProps {
  className?: string;
  size?: number;
}

export const EtsyIcon: React.FC<PlatformIconProps> = ({ className = '', size = 20 }) => (
  <img src="/etsy.svg" alt="Etsy" width={size} height={size} className={className} style={{ display: 'inline-block' }} />
);

export const ShopifyIcon: React.FC<PlatformIconProps> = ({ className = '', size = 20 }) => (
  <img src="/shopify.svg" alt="Shopify" width={size} height={size} className={className} style={{ display: 'inline-block' }} />
);
