export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let slug = slugify(base);
  if (!slug) slug = 'item';
  let candidate = slug;
  let i = 1;
  while (await exists(candidate)) {
    candidate = `${slug}-${i}`;
    i += 1;
  }
  return candidate;
}
