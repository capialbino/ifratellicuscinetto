export function withBase(path: string): string {
  const configuredBase = import.meta.env.BASE_URL;
  const base = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
  const relativePath = path.replace(/^\/+/, '');
  return relativePath ? `${base}${relativePath}` : base;
}
