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
export const getPage = (slug) => call(`/pages/${slug}`);
export const joinList = (body) => call("/members", { method: "POST", body });
const GEO_PARENT_PARAM = { states: "country_id", regions: "state_id", cities: "region_id", districts: "city_id" };
export const getGeo = (level, parentId) => call(`/geo/${level}${parentId ? `?${GEO_PARENT_PARAM[level]}=${parentId}` : ""}`);
export const registerMember = (body) => call("/members/register", { method: "POST", body });
export const memberLogin = (body) => call("/members/login", { method: "POST", body });
export const getMemberMe = (token) => call("/members/me", {}, token);
export const updateMemberMe = (body, token) => call("/members/me", { method: "PUT", body }, token);
export const changeMemberPassword = (body, token) => call("/members/me/change-password", { method: "POST", body }, token);
export const getMembershipCard = (token) => call("/members/me/card", {}, token);
export const verifyMember = (token) => call(`/members/verify/${token}`);
export const sendContact = (body) => call("/contact", { method: "POST", body });
export const login = (body) => call("/auth/login", { method: "POST", body });
export const getElections = (token) => call("/elections", {}, token);
export const castVote = (eid, candidate_id, token) => call(`/elections/${eid}/vote`, { method: "POST", body: { candidate_id } }, token);
export const getElectionResults = (eid, token) => call(`/elections/${eid}/results`, {}, token);
export const uploadImage = async (file, token) => {
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 413 ? "That file is too big. The limit is 5 MB." : "Upload failed. Try again."));
  return data.url;
};
