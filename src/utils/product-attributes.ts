export function extractProductAttributes(configuration: unknown, sizeSnapshot: unknown): string[] {
  const attributes: string[] = [];
  const seenKeys = new Set<string>();

  const humaniseKey = (key: string) => {
    if (!key) return '';
    const lower = key.toLowerCase().trim();
    if (lower === 'gsm') return 'GSM';
    if (lower === 'id' || lower === 'sku') return key.toUpperCase();

    const spaced = key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim();

    return spaced
      .split(/\s+/)
      .map((word) => {
        const wLower = word.toLowerCase();
        if (wLower === 'gsm') return 'GSM';
        if (wLower === 'at') return 'at';
        if (wLower === 'of') return 'of';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };

  const formatAttributeValue = (val: unknown): string | null => {
    if (val == null) return null;
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return null;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) return null;
      if (trimmed.startsWith('SIZE_')) return trimmed.replace(/^SIZE_/i, '');
      if (trimmed.includes('_') || trimmed.includes('-')) return humaniseKey(trimmed);
      if (/^[a-z]+$/.test(trimmed)) return humaniseKey(trimmed);
      return trimmed;
    }
    return null;
  };

  const addEntry = (label: string, value: string | null) => {
    if (!value) return;
    const cleanLabel = humaniseKey(label);
    const key = cleanLabel.toLowerCase();
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    attributes.push(`${cleanLabel}: ${value}`);
  };

  if (sizeSnapshot && typeof sizeSnapshot === 'object') {
    const size = sizeSnapshot as any;
    if (size.width && size.height) {
      addEntry('Size', `${size.width}x${size.height} ${size.unit || 'in'}`);
    }
  }

  const SYSTEM_KEYS = new Set([
    'id', 'productid', 'versionid', 'slug', 'thumbnailurl', 'orderid', 'draftid',
    'capturedat', 'captured_at', 'createdat', 'created_at', 'updatedat', 'updated_at',
    'timestamp', 'strategy', 'validationsnapshot', 'coveragesnapshot', 'printprocess',
    'fileassetid', 'fileasset', 'printspecification', 'mindpi', 'bleedmm', 'safeareamm',
    'colormode', 'maxfilesizemb', 'previewenabled', 'validationenabled', 'autoartworkanalysis',
    'coverageanalysisenabled', 'artworkrequirements', 'resolution', 'name'
  ]);

  const isSystemKey = (key: string) => {
    const lower = key.toLowerCase().trim();
    if (SYSTEM_KEYS.has(lower)) return true;
    if (
      lower.includes('captured') || lower.includes('timestamp') ||
      lower.includes('createdat') || lower.includes('updatedat') ||
      lower.includes('bleed') || lower.includes('dpi') ||
      lower.includes('safearea') || lower.includes('colormode') ||
      lower.includes('filesize') || lower.includes('analysis')
    ) return true;
    return false;
  };

  const extractSelections = (obj: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || isSystemKey(k)) continue;

      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        addEntry(k, formatAttributeValue(v));
        continue;
      }

      if (typeof v === 'object' && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        const label = (rec['fieldLabel'] ?? rec['label'] ?? rec['name'] ?? rec['title']) as string | undefined;
        const val = (rec['selectedLabel'] ?? rec['selectedValue'] ?? rec['value'] ?? rec['optionLabel']) as string | undefined;

        if (label && val && !isSystemKey(label)) {
          addEntry(label, formatAttributeValue(val));
        }
      }
    }
  };

  if (configuration && typeof configuration === 'object') {
    const configRecord = configuration as Record<string, unknown>;
    if (configRecord['selections'] && typeof configRecord['selections'] === 'object') {
      extractSelections(configRecord['selections'] as Record<string, unknown>);
    } else {
      extractSelections(configRecord);
    }
  }

  return attributes;
}
