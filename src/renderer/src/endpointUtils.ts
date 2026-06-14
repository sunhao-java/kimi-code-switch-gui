export function parseEndpointUrl(value: string): URL | null {
  try {
    const parsed = new URL(value.trim());
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hostname.trim().length === 0) {
      return null;
    }
    if (/\/{2,}/.test(parsed.pathname)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
