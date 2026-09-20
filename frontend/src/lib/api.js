const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "https://price-tracker-3bxr.onrender.com"
).replace(/\/$/, "");

export { API_BASE };

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  }
  return data;
}

export function unwrapArray(data, keys = []) {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
}
