export const call = async (path, opts = {}, token) => {
  const res = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data?.error || "Something went wrong. Try again."); e.status = res.status; throw e; }
  return data;
};
export const getPosts = (kind) => call(`/posts${kind ? `?kind=${kind}` : ""}`);
export const joinList = (body) => call("/members", { method: "POST", body });
export const sendContact = (body) => call("/contact", { method: "POST", body });
export const login = (body) => call("/auth/login", { method: "POST", body });
export const uploadImage = async (file, token) => {
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 413 ? "That file is too big. The limit is 5 MB." : "Upload failed. Try again."));
  return data.url;
};
