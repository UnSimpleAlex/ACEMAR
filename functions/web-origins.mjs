/** Exact origin allowlist: no wildcard Vercel tenant or user-controlled suffixes. */
const defaults = new Set([
  "https://acemar-preview.braceddog.chatgpt.site",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
export function allowedWebOrigin(origin, configured = "") {
  if (defaults.has(origin)) return true;
  return configured.split(",").some((entry) => {
    const value = entry.trim();
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.origin === value &&
        !url.username &&
        !url.password &&
        value === origin
      );
    } catch {
      return false;
    }
  });
}
