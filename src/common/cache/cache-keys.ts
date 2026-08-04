/** Central cache key namespaces for Redis and request-scoped caches */
export const CacheKeys = {
  role: (name: string) => `role:${name}`,
  categoryTree: () => 'categories:tree:v1',
  deliverySettings: () => 'delivery:settings:v1',
  pricingVersion: (versionId: string) => `pricing:version:${versionId}`,
  slider: (key: string) => `slider:${key}`,
} as const;

export const CacheTtl = {
  ROLE_SEC: 3600,
  CATEGORY_TREE_SEC: 300,
  DELIVERY_SETTINGS_SEC: 120,
  PRICING_VERSION_SEC: 300,
  SLIDER_SEC: 60,
  VENDOR_PRICE_OVERRIDE_SEC: 60,
} as const;
