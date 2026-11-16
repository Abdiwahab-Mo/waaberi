import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { call, login, uploadImage } from "../api.js";
import Logo from "../Logo.jsx";
import { useLang } from "../i18n.jsx";

// Image picker: upload from computer (or paste a link), with preview and remove
function ImageField({ label, value, onChange, token }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const send = async (file) => {
    if (!file) return;
    setErr(""); setBusy(true);
    try { onChange(await uploadImage(file, token)); } catch (x) { setErr(x.message); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return (
    <div className="field wide">
      <span>{label}</span>
      <div className={`imgfield ${drag ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]); }}>
        {value ? <img src={value} alt="" /> : <div className="imgfield-ph" aria-hidden="true">🖼</div>}
        <div className="imgfield-side">
          <div className="row-l">
            <button type="button" className="btn btn-blue small" disabled={busy} onClick={() => input.current.click()}>{busy ? "Uploading…" : value ? "Replace image" : "Upload image"}</button>
            {value && <button type="button" className="btn btn-plain small" onClick={() => onChange("")}>Remove</button>}
          </div>
          <small className="muted">JPG, PNG, WebP or GIF, up to 5 MB. You can also drag a file here.</small>
          <input className="mini-url" placeholder="…or paste an image link" value={value || ""} onChange={(e) => onChange(e.target.value)} aria-label={`${label} link`} />
          {err && <span role="alert" className="err">{err}</span>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => send(e.target.files[0])} />
      </div>
    </div>
  );
}

const KINDS = { campaign: "Campaign", news: "News", statement: "Statement" };
const fmt = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const blank = { id: null, kind: "news", title: "", summary: "", image_url: "", i18n: {} };

// Translations: English is stored in the main fields, Somali/Arabic in f.i18n.so / f.i18n.ar
const TLANGS = [["en", "English"], ["so", "Soomaali"], ["ar", "العربية"]];
const tv = (f, lang, k) => (lang === "en" ? f[k] : f.i18n?.[lang]?.[k]) || "";
const tset = (f, lang, k, v) => {
  if (lang === "en") return { ...f, [k]: v };
  const i18n = { ...(f.i18n || {}) };
  i18n[lang] = { ...(i18n[lang] || {}), [k]: v };
  return { ...f, i18n };
};
const hasLang = (f, lang, keys) => keys.some((k) => tv(f, lang, k).trim());
const tprops = (lang) => (lang === "ar" ? { dir: "rtl", lang: "ar", className: "rtl-in" } : { dir: "ltr", lang });

function LangTabs({ value, onChange, f, keys }) {
  return (
    <div className="ltabs wide" role="tablist" aria-label="Content language">
      {TLANGS.map(([k, l]) => (
        <button type="button" key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {l}{hasLang(f, k, keys) ? <i className="dot ok" title="Has text" /> : <i className="dot" title="Empty" />}
        </button>
      ))}
      <small className="muted">Empty languages show the English text (or whichever language is filled in).</small>
    </div>
  );
}

function Flags({ x, keys }) {
  return <span className="flags">{["so", "ar"].map((l) => <span key={l} className={hasLang(x, l, keys) ? "on" : ""} title={hasLang(x, l, keys) ? "Translated" : "Not translated"}>{l.toUpperCase()}</span>)}</span>;
}

function Login({ onToken }) {
  const { t, tErr } = useLang();
  const [c, setC] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const validate = () => {
    if (!c.email.trim()) return t("login_email_required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return t("login_email_invalid");
    if (!c.password) return t("login_password_required");
    return "";
  };
  const go = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(""); setBusy(true);
    try { const { token } = await login(c); sessionStorage.setItem("wtoken", token); onToken(token); }
    catch (x) { setErr(tErr(x.message)); }
    finally { setBusy(false); }
  };
  return (
    <div className="login-wrap">
      <form className="login" onSubmit={go} noValidate>
        <Logo className="logo-login" />
        <h1>{t("login_title")}</h1>
        <label className="field"><span>{t("login_email")}</span>
          <input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></label>
        <label className="field"><span>{t("login_password")}</span>
          <div className="pw-wrap">
            <input type={show ? "text" : "password"} value={c.password} onChange={(e) => setC({ ...c, password: e.target.value })} />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? t("login_hide") : t("login_show")}>{show ? "🙈" : "👁"}</button>
          </div>
        </label>
        <button className="btn btn-blue block" disabled={busy}>{busy ? t("login_signing_in") : t("login_signin")}</button>
        {err && <p role="alert" className="err">{err}</p>}
        <Link to="/" className="link">{t("login_back")}</Link>
      </form>
    </div>
  );
}

function Overview({ token }) {
  const [s, setS] = useState(null);
  useEffect(() => { call("/admin/stats", {}, token).then(setS).catch(() => {}); }, [token]);
  const defs = [["Members", "members"], ["Unread messages", "unread"], ["Campaigns", "campaigns"], ["News & statements", "news"], ["Raised (USD)", "raised"]];
  const cards = s ? defs.filter(([, k]) => s[k] !== undefined).map(([l, k]) => [l, k === "raised" ? `$${Number(s[k]).toLocaleString()}` : s[k]]) : [];
  return (
    <>
      <h2>Overview</h2>
      <div className="stats">{cards.map(([l, v]) => <div className="stat" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
    </>
  );
}

function Posts({ token }) {
  const [lang, setLang] = useState("en");
  const [list, setList] = useState([]);
  const [form, setForm] = useState(blank);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const load = useCallback(() => call("/posts", {}, token).then(setList), [token]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { kind: form.kind, title: form.title, summary: form.summary, image_url: form.image_url || null, i18n: form.i18n || {} };
      await call(form.id ? `/posts/${form.id}` : "/posts", { method: form.id ? "PUT" : "POST", body }, token);
      setMsg({ ok: true, text: form.id ? "Changes saved." : "Published." }); setForm(blank); load();
    } catch (x) { setMsg({ ok: false, text: x.message }); }
  };
  const del = async (p) => {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await call(`/posts/${p.id}`, { method: "DELETE" }, token); load();
  };
  const shown = filter === "all" ? list : list.filter((p) => p.kind === filter);

  return (
    <>
      <h2>Content</h2>
      <div className="panel">
        <h3>{form.id ? "Edit post" : "New post"}</h3>
        <form className="aform" onSubmit={save}>
          <label className="field"><span>Type</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <LangTabs value={lang} onChange={setLang} f={form} keys={["title", "summary"]} />
          <label className="field wide"><span>Title</span><input {...tprops(lang)} value={tv(form, lang, "title")} onChange={(e) => setForm(tset(form, lang, "title", e.target.value))} /></label>
          <label className="field wide"><span>Summary</span><textarea {...tprops(lang)} rows="4" value={tv(form, lang, "summary")} onChange={(e) => setForm(tset(form, lang, "summary", e.target.value))} /></label>
          <ImageField label="Image (optional)" token={token} value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} />
          <div className="wide row-l">
            <button className="btn btn-blue">{form.id ? "Save changes" : "Publish"}</button>
            {form.id && <button type="button" className="btn btn-plain" onClick={() => setForm(blank)}>Cancel</button>}
            {msg.text && <span role="status" className={msg.ok ? "ok" : "err"}>{msg.text}</span>}
          </div>
        </form>
      </div>
      <div className="tabs sub">
        {["all", ...Object.keys(KINDS)].map((k) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k === "all" ? "All" : KINDS[k]}</button>
        ))}
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Title</th><th>Type</th><th>Date</th><th /></tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td>{p.title} <Flags x={p} keys={["title", "summary"]} /></td><td><span className={`pill ${p.kind}`}>{KINDS[p.kind]}</span></td><td>{fmt(p.published_at)}</td>
              <td className="act"><button onClick={() => { setForm({ ...p, image_url: p.image_url || "" }); scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button className="danger" onClick={() => del(p)}>Delete</button></td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan="4" className="empty">Nothing here yet. Create your first post above.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Members({ token }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const load = useCallback(() => call("/members", {}, token).then(setRows), [token]);
  useEffect(() => { load(); }, [load]);
  const shown = rows.filter((m) => `${m.name} ${m.email} ${m.phone}`.toLowerCase().includes(q.toLowerCase()));
  const del = async (m) => { if (confirm(`Remove ${m.name}?`)) { await call(`/members/${m.id}`, { method: "DELETE" }, token); load(); } };
  const exportCsv = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ["Name,Phone,Email,Joined", ...shown.map((m) => [m.name, m.phone, m.email, m.created_at].map(esc).join(","))].join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "members.csv" });
    a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <h2>Members <small>({rows.length})</small></h2>
      <div className="toolbar">
        <input className="search" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search members" />
        <button className="btn btn-blue small" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Joined</th><th /></tr></thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.id}><td>{m.name}</td><td>{m.phone}</td><td>{m.email}</td><td>{fmt(m.created_at)}</td>
              <td className="act"><button className="danger" onClick={() => del(m)}>Remove</button></td></tr>
          ))}
          {shown.length === 0 && <tr><td colSpan="5" className="empty">No members found.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Messages({ token }) {
  const [rows, setRows] = useState([]);
  const load = useCallback(() => call("/messages", {}, token).then(setRows), [token]);
  useEffect(() => { load(); }, [load]);
  const toggle = async (m) => { await call(`/messages/${m.id}`, { method: "PATCH" }, token); load(); };
  const del = async (m) => { if (confirm("Delete this message?")) { await call(`/messages/${m.id}`, { method: "DELETE" }, token); load(); } };
  return (
    <>
      <h2>Messages</h2>
      {rows.length === 0 && <p className="empty">No messages yet.</p>}
      {rows.map((m) => (
        <article key={m.id} className={`msg ${m.is_read ? "" : "unread"}`}>
          <header><b>{m.name}</b> <a href={`mailto:${m.email}`}>{m.email}</a><time>{fmt(m.created_at)}</time></header>
          <p>{m.body}</p>
          <div className="act"><button onClick={() => toggle(m)}>{m.is_read ? "Mark unread" : "Mark read"}</button>
            <button className="danger" onClick={() => del(m)}>Delete</button></div>
        </article>
      ))}
    </>
  );
}

const METHOD = { evc: "Hormuud Telecom (EVC Plus)", zaad: "Telesom ZAAD", sahal: "Golis Telecom (Sahal)", paypal: "PayPal" };
const GIFT = { general: "General Fund", campaign: "Campaign", region: "Region" };
function Donations({ token }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const load = useCallback(() => call("/donations", {}, token).then(setRows), [token]);
  useEffect(() => { load(); }, [load]);
  const total = rows.filter((r) => r.status === "confirmed").reduce((a, r) => a + Number(r.amount), 0);
  const pending = rows.filter((r) => r.status === "pending").length;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  return (
    <>
      <h2>Donations</h2>
      <div className="stats">
        <div className="stat"><b>${total.toLocaleString()}</b><span>Confirmed total</span></div>
        <div className="stat"><b>{pending}</b><span>Pending</span></div>
        <div className="stat"><b>{rows.length}</b><span>All donations</span></div>
      </div>
      <div className="tabs sub">
        {["all", "pending", "confirmed", "rejected"].map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Date</th><th>Donor</th><th>Gift</th><th>Method</th><th>Amount</th><th>Transaction ID</th><th>Status</th></tr></thead>
        <tbody>
          {shown.map((d) => (
            <tr key={d.id}>
              <td>{fmt(d.created_at)}</td>
              <td>{d.donor_name}{d.anonymous && <span className="pill anon" title="Donor asked not to be named publicly">Anonymous</span>}<br /><small className="muted">{[d.phone, d.email].filter(Boolean).join(" · ")}</small></td>
              <td>{GIFT[d.designation] || "General Fund"}{d.target && <><br /><small className="muted">{d.target}</small></>}</td>
              <td>{METHOD[d.method]}{d.gateway === "waafipay" && <><br /><span className="pill auto" title={d.gateway_msg || ""}>Auto · WaafiPay</span></>}{d.gateway === "demo" && <><br /><span className="pill demo" title={d.gateway_msg || ""}>Demo · no money</span></>}</td><td><b>${Number(d.amount).toLocaleString()}</b>{d.frequency === "monthly" && <><br /><span className="pill monthly">Monthly</span></>}</td>
              <td>{d.reference || d.method === "paypal" && "via PayPal"}</td>
              <td><span className={`pill ${d.status}`}>{d.status}</span></td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan="7" className="empty">No donations yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

const PAGE_TABS = [["home-hero", "Homepage Hero"], ["who-we-are", "Who We Are"], ["where-we-stand", "Where We Stand"], ["leadership", "Our Leadership"]];
const FIELD_LABELS = {
  "home-hero": ["Kicker", "Headline", "Subheading"],
  default: ["Page title", "Introduction", "Main text"],
};
const blankLeader = { id: null, name: "", position: "", bio: "", photo_url: "", sort_order: 0, i18n: {} };

function Leaders({ token }) {
  const [lang, setLang] = useState("en");
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(blankLeader);
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const load = useCallback(() => call("/leaders").then(setRows), []);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try {
      await call(f.id ? `/leaders/${f.id}` : "/leaders", { method: f.id ? "PUT" : "POST", body: f }, token);
      setMsg({ ok: true, text: f.id ? "Profile updated." : "Profile added." }); setF(blankLeader); load();
    } catch (x) { setMsg({ ok: false, text: x.message }); }
  };
  const del = async (l) => { if (confirm(`Remove ${l.name}?`)) { await call(`/leaders/${l.id}`, { method: "DELETE" }, token); load(); } };
  return (
    <>
      <div className="panel" style={{ marginTop: "1.2rem" }}>
        <h3>{f.id ? `Edit ${f.name}` : "Add leader"}</h3>
        <form className="aform" onSubmit={save}>
          <label className="field"><span>Order</span><input type="number" value={f.sort_order} onChange={set("sort_order")} /></label>
          <label className="field"><span>Full name</span><input required value={f.name} onChange={set("name")} /></label>
          <LangTabs value={lang} onChange={setLang} f={f} keys={["position", "bio"]} />
          <label className="field wide"><span>Position</span><input {...tprops(lang)} placeholder={lang === "en" ? "e.g. Party Chairman" : ""} value={tv(f, lang, "position")} onChange={(e) => setF(tset(f, lang, "position", e.target.value))} /></label>
          <label className="field wide"><span>Short bio</span><textarea {...tprops(lang)} rows="3" value={tv(f, lang, "bio")} onChange={(e) => setF(tset(f, lang, "bio", e.target.value))} /></label>
          <ImageField label="Photo (optional)" token={token} value={f.photo_url} onChange={(v) => setF({ ...f, photo_url: v })} />
          <div className="wide row-l">
            <button className="btn btn-blue">{f.id ? "Save changes" : "Add leader"}</button>
            {f.id && <button type="button" className="btn btn-plain" onClick={() => setF(blankLeader)}>Cancel</button>}
            {msg.text && <span role="status" className={msg.ok ? "ok" : "err"}>{msg.text}</span>}
          </div>
        </form>
      </div>
      <div className="tablewrap" style={{ marginTop: "1.2rem" }}><table>
        <thead><tr><th>Order</th><th>Name</th><th>Position</th><th /></tr></thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}><td>{l.sort_order}</td><td>{l.name}</td><td>{l.position} <Flags x={l} keys={["position", "bio"]} /></td>
              <td className="act"><button onClick={() => setF({ ...l, photo_url: l.photo_url || "" })}>Edit</button>
                <button className="danger" onClick={() => del(l)}>Remove</button></td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="4" className="empty">No leaders yet. Add the first profile above.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function GeoColumn({ label, items, selectedId, onSelect, onAdd, onDelete, disabled }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr("");
    try { await onAdd(name.trim()); setName(""); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const del = async (id) => { if (confirm("Remove this area?")) { try { await onDelete(id); } catch (x) { setErr(x.message); } } };
  return (
    <div className="geo-col">
      <h4>{label}</h4>
      {disabled ? <p className="muted small">Select the parent area first.</p> : (
        <>
          <ul className="geo-list">
            {items.map((it) => (
              <li key={it.id} className={selectedId === it.id ? "on" : ""}>
                {onSelect ? <button type="button" className="link" onClick={() => onSelect(it.id)}>{it.name}</button> : <span>{it.name}</span>}
                <button type="button" className="danger small" onClick={() => del(it.id)} aria-label={`Remove ${it.name}`}>×</button>
              </li>
            ))}
            {items.length === 0 && <li className="muted">None yet.</li>}
          </ul>
          <form onSubmit={add} className="row-l">
            <input placeholder={`Add ${label.toLowerCase()}`} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-plain small" disabled={busy}>Add</button>
          </form>
          {err && <small className="err">{err}</small>}
        </>
      )}
    </div>
  );
}

function GeoAreas({ token }) {
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [sel, setSel] = useState({ country: null, state: null, region: null, city: null });

  const loadCountries = useCallback(() => call("/geo/countries").then(setCountries), []);
  const loadStates = useCallback((id) => (id ? call(`/geo/states?country_id=${id}`).then(setStates) : setStates([])), []);
  const loadRegions = useCallback((id) => (id ? call(`/geo/regions?state_id=${id}`).then(setRegions) : setRegions([])), []);
  const loadCities = useCallback((id) => (id ? call(`/geo/cities?region_id=${id}`).then(setCities) : setCities([])), []);
  const loadDistricts = useCallback((id) => (id ? call(`/geo/districts?city_id=${id}`).then(setDistricts) : setDistricts([])), []);
  useEffect(() => { loadCountries(); }, [loadCountries]);

  const selectCountry = (id) => { setSel({ country: id, state: null, region: null, city: null }); loadStates(id); setRegions([]); setCities([]); setDistricts([]); };
  const selectState = (id) => { setSel((s) => ({ ...s, state: id, region: null, city: null })); loadRegions(id); setCities([]); setDistricts([]); };
  const selectRegion = (id) => { setSel((s) => ({ ...s, region: id, city: null })); loadCities(id); setDistricts([]); };
  const selectCity = (id) => { setSel((s) => ({ ...s, city: id })); loadDistricts(id); };

  const add = (level, parent) => (name) => call(`/admin/geo/${level}`, { method: "POST", body: { ...parent, name } }, token);
  const del = (level) => (id) => call(`/admin/geo/${level}/${id}`, { method: "DELETE" }, token);

  return (
    <>
      <h2>Geographic areas</h2>
      <p className="muted">Countries, states, regions, cities and districts used for membership registration (and later, election scopes).</p>
      <div className="geo-cols">
        <GeoColumn label="Countries" items={countries} selectedId={sel.country} onSelect={selectCountry}
          onAdd={async (name) => { await add("countries", {})(name); loadCountries(); }}
          onDelete={async (id) => { await del("countries")(id); loadCountries(); if (sel.country === id) selectCountry(null); }} />
        <GeoColumn label="States" items={states} selectedId={sel.state} onSelect={selectState} disabled={!sel.country}
          onAdd={async (name) => { await add("states", { country_id: sel.country })(name); loadStates(sel.country); }}
          onDelete={async (id) => { await del("states")(id); loadStates(sel.country); if (sel.state === id) selectState(null); }} />
        <GeoColumn label="Regions" items={regions} selectedId={sel.region} onSelect={selectRegion} disabled={!sel.state}
          onAdd={async (name) => { await add("regions", { state_id: sel.state })(name); loadRegions(sel.state); }}
          onDelete={async (id) => { await del("regions")(id); loadRegions(sel.state); if (sel.region === id) selectRegion(null); }} />
        <GeoColumn label="Cities" items={cities} selectedId={sel.city} onSelect={selectCity} disabled={!sel.region}
          onAdd={async (name) => { await add("cities", { region_id: sel.region })(name); loadCities(sel.region); }}
          onDelete={async (id) => { await del("cities")(id); loadCities(sel.region); if (sel.city === id) selectCity(null); }} />
        <GeoColumn label="Districts" items={districts} disabled={!sel.city}
          onAdd={async (name) => { await add("districts", { city_id: sel.city })(name); loadDistricts(sel.city); }}
          onDelete={async (id) => { await del("districts")(id); loadDistricts(sel.city); }} />
      </div>
    </>
  );
}

const STATUS_LABELS = { pending: "Pending", under_review: "Under review", approved: "Approved", rejected: "Rejected", suspended: "Suspended", expired: "Expired" };
const STATUS_PILL = { pending: "pending", approved: "confirmed", rejected: "rejected", suspended: "rejected" };

function LocationEditForm({ member, token, onDone }) {
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [f, setF] = useState({
    country_id: member.country_id, state_id: member.state_id, region_id: member.region_id,
    city_id: member.city_id, district_id: member.district_id || "", reason: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { call("/geo/countries").then(setCountries); }, []);
  useEffect(() => { if (f.country_id) call(`/geo/states?country_id=${f.country_id}`).then(setStates); }, [f.country_id]);
  useEffect(() => { if (f.state_id) call(`/geo/regions?state_id=${f.state_id}`).then(setRegions); }, [f.state_id]);
  useEffect(() => { if (f.region_id) call(`/geo/cities?region_id=${f.region_id}`).then(setCities); }, [f.region_id]);
  useEffect(() => { if (f.city_id) call(`/geo/districts?city_id=${f.city_id}`).then(setDistricts); }, [f.city_id]);

  const set = (k) => (e) => {
    const v = e.target.value;
    const clears = { country_id: ["state_id", "region_id", "city_id", "district_id"], state_id: ["region_id", "city_id", "district_id"],
                     region_id: ["city_id", "district_id"], city_id: ["district_id"] };
    const reset = Object.fromEntries((clears[k] || []).map((c) => [c, ""]));
    setF({ ...f, [k]: v, ...reset });
  };

  const save = async (e) => {
    e.preventDefault();
    if (!f.reason.trim()) { setErr("Enter a reason for this change."); return; }
    setBusy(true); setErr("");
    try { await call(`/admin/party-members/${member.id}/location`, { method: "PUT", body: f }, token); onDone(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="panel" style={{ marginBottom: "1.2rem" }}>
      <h3>Edit location — {member.first_name} {member.last_name}</h3>
      <form className="aform" onSubmit={save}>
        <label className="field"><span>Country</span><select value={f.country_id} onChange={set("country_id")}>{countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>State</span><select value={f.state_id} onChange={set("state_id")}>{states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field"><span>Region</span><select value={f.region_id} onChange={set("region_id")}>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="field"><span>City</span><select value={f.city_id} onChange={set("city_id")}>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>District</span>
          <select value={f.district_id || ""} onChange={set("district_id")}><option value="">—</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <label className="field wide"><span>Reason for this correction (required)</span><textarea rows="2" value={f.reason} onChange={set("reason")} /></label>
        <div className="wide row-l">
          <button className="btn btn-blue" disabled={busy}>Save location</button>
          <button type="button" className="btn btn-plain" onClick={onDone}>Cancel</button>
          {err && <span className="err">{err}</span>}
        </div>
      </form>
    </div>
  );
}

function PartyMembers({ token }) {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const [locEdit, setLocEdit] = useState(null);
  const load = useCallback(() => call(`/admin/party-members${status ? `?status=${status}` : ""}`, {}, token).then(setRows), [token, status]);
  useEffect(() => { load(); }, [load]);

  const act = async (m, action) => {
    try { await call(`/admin/party-members/${m.id}/${action}`, { method: "POST" }, token); setMsg({ ok: true, text: "Updated." }); load(); }
    catch (x) { setMsg({ ok: false, text: x.message }); }
  };
  const setPassword = async (m) => {
    const p = prompt(`Set a portal password for ${m.first_name} ${m.last_name} (min 10 characters):`);
    if (!p) return;
    try { await call(`/admin/party-members/${m.id}/set-password`, { method: "PUT", body: { password: p } }, token); setMsg({ ok: true, text: "Password set." }); load(); }
    catch (x) { setMsg({ ok: false, text: x.message }); }
  };

  return (
    <>
      <h2>Party members <small>({rows.length})</small></h2>
      <p className="muted">Registered-member applications with an approved location. Distinct from the mailing-list "Members" tab.</p>
      {locEdit && <LocationEditForm member={locEdit} token={token} onDone={() => { setLocEdit(null); load(); }} />}
      <div className="toolbar">
        <select className="mini" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {msg.text && <span role="status" className={msg.ok ? "ok" : "err"}>{msg.text}</span>}
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Membership ID</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{m.first_name} {m.last_name}</td><td>{m.email}</td><td>{m.phone}</td>
              <td>{m.membership_id || "—"}</td>
              <td><span className={`pill ${STATUS_PILL[m.status] || ""}`}>{STATUS_LABELS[m.status]}</span></td>
              <td className="act">
                {m.status !== "approved" && <button onClick={() => act(m, "approve")}>Approve</button>}
                {m.status !== "rejected" && <button className="danger" onClick={() => act(m, "reject")}>Reject</button>}
                {m.status === "approved" && <button className="danger" onClick={() => act(m, "suspend")}>Suspend</button>}
                {m.status === "suspended" && <button onClick={() => act(m, "reactivate")}>Reactivate</button>}
                <button onClick={() => setLocEdit(m)}>Edit location</button>
                {m.status === "approved" && <button onClick={() => setPassword(m)}>{m.has_password ? "Reset portal password" : "Set portal password"}</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="6" className="empty">No applications found.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Pages({ token }) {
  const [lang, setLang] = useState("en");
  const [slug, setSlug] = useState("who-we-are");
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState({ ok: true, text: "" });
  useEffect(() => { setF(null); setMsg({ ok: true, text: "" }); call(`/pages/${slug}`).then(setF); }, [slug]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { await call(`/pages/${slug}`, { method: "PUT", body: f }, token); setMsg({ ok: true, text: "Page saved. It's live on the website now." }); }
    catch (x) { setMsg({ ok: false, text: x.message }); }
  };
  return (
    <>
      <h2>Site pages</h2>
      <div className="tabs sub">{PAGE_TABS.map(([k, l]) => <button key={k} className={slug === k ? "on" : ""} onClick={() => setSlug(k)}>{l}</button>)}</div>
      {!f ? <p className="muted">Loading…</p> : (
        <div className="panel">
          <form className="aform" onSubmit={save}>
            {(() => {
              const isHero = slug === "home-hero";
              const [titleLabel, introLabel, bodyLabel] = FIELD_LABELS[slug] || FIELD_LABELS.default;
              return (
                <>
                  <LangTabs value={lang} onChange={setLang} f={f} keys={["title", "intro", "body"]} />
                  <label className="field wide"><span>{titleLabel}</span><input {...tprops(lang)} value={tv(f, lang, "title")} onChange={(e) => setF(tset(f, lang, "title", e.target.value))} /></label>
                  <label className="field wide"><span>{introLabel}</span><textarea {...tprops(lang)} rows="3" value={tv(f, lang, "intro")} onChange={(e) => setF(tset(f, lang, "intro", e.target.value))} /></label>
                  <label className="field wide"><span>{bodyLabel}</span>
                    <textarea {...tprops(lang)} rows={isHero ? "3" : "12"} value={tv(f, lang, "body")} onChange={(e) => setF(tset(f, lang, "body", e.target.value))} />
                    {!isHero && <small className="muted">Leave a blank line between sections. In a section with more than one line, the first line becomes a heading.</small>}
                  </label>
                  <ImageField label={isHero ? "Hero background image (optional)" : "Banner image (optional)"} token={token} value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} />
                </>
              );
            })()}
            <div className="wide row-l">
              <button className="btn btn-blue">Save page</button>
              <a className="link" href={slug === "home-hero" ? "/" : `/${slug}`} target="_blank" rel="noreferrer">View page ↗</a>
              {msg.text && <span role="status" className={msg.ok ? "ok" : "err"}>{msg.text}</span>}
            </div>
          </form>
        </div>
      )}
      {slug === "leadership" && <Leaders token={token} />}
    </>
  );
}

function PaySettings({ token }) {
  const [f, setF] = useState(null);
  useEffect(() => { call("/admin/settings", {}, token).then(setF); }, [token]);
  if (!f) return <p className="muted">Loading…</p>;
  return (
    <>
      <h2>Payment settings</h2>
      <div className={`panel waafi-box ${f.waafi_ready ? "on" : ""}`}>
        <div><b>Automatic phone payments (WaafiPay)</b>
          <span className={`pill ${{ live: "confirmed", sandbox: "news", demo: "test", off: "pending" }[f.waafi_mode]}`}>{{ live: "Live", sandbox: "Sandbox (WaafiPay test)", demo: "Demo mode", off: "Off" }[f.waafi_mode]}</span></div>
        <p className="muted">{{
          live: "Donors type their EVC Plus or Sahal number, approve the prompt on their phone with their PIN, and the donation is confirmed automatically.",
          sandbox: "Connected to WaafiPay's test system. Try a donation; when it works, set WAAFI_ENV=live in backend/.env and rebuild.",
          demo: "Demo mode: the full phone-prompt flow works, but nothing is sent to Hormuud and no money moves. Demo donations are marked “test” and not counted in totals. Add your WaafiPay keys and set WAAFI_ENV=sandbox when you have them.",
          off: "Mobile donations are switched off. Add WAAFI_MERCHANT_UID, WAAFI_API_USER_ID and WAAFI_API_KEY (from your Hormuud WaafiPay merchant account) to backend/.env, or set WAAFI_ENV=demo to try the flow.",
        }[f.waafi_mode]}</p>
      </div>
    </>
  );
}

const ROLE = {
  super_admin: ["Super admin", "Full access, including site pages, team and roles."],
  editor: ["Editor", "Publishes campaigns, news and statements."],
  finance: ["Finance", "Views and confirms donations."],
  membership: ["Membership", "Manages members and contact messages."],
};

function Users({ token, me }) {
  const [rows, setRows] = useState([]);
  const [activity, setActivity] = useState([]);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "editor" });
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const load = useCallback(() => call("/admin/users", {}, token).then(setRows), [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { call("/admin/login-activity", {}, token).then(setActivity).catch(() => {}); }, [token]);
  const act = async (u, body, ok) => {
    try { await call(`/admin/users/${u.id}`, { method: "PATCH", body }, token); setMsg({ ok: true, text: ok }); load(); }
    catch (x) { setMsg({ ok: false, text: x.message }); load(); }
  };
  const create = async (e) => {
    e.preventDefault();
    try { await call("/admin/users", { method: "POST", body: f }, token); setF({ name: "", email: "", password: "", role: "editor" }); setMsg({ ok: true, text: "Account created." }); load(); }
    catch (x) { setMsg({ ok: false, text: x.message }); }
  };
  const reset = (u) => { const p = prompt(`New password for ${u.name} (min 10 characters):`); if (p) act(u, { password: p }, "Password updated."); };
  return (
    <>
      <h2>Team & roles</h2>
      <div className="roles">{Object.entries(ROLE).map(([k, [n, d]]) => <div key={k}><b>{n}</b><span>{d}</span></div>)}</div>
      <div className="panel">
        <h3>Add team member</h3>
        <form className="aform" onSubmit={create}>
          <label className="field"><span>Role</span>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label className="field"><span>Full name</span><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field"><span>Email</span><input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field"><span>Temporary password</span><input required type="password" minLength="10" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          <div className="wide row-l"><button className="btn btn-blue">Create account</button>{msg.text && <span role="status" className={msg.ok ? "ok" : "err"}>{msg.text}</span>}</div>
        </form>
      </div>
      <div className="tablewrap" style={{ marginTop: "1.2rem" }}><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rows.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id}>
                <td>{u.name}{self && <small className="muted"> (you)</small>}</td><td>{u.email}</td>
                <td><select className="mini" disabled={self} value={u.role} onChange={(e) => act(u, { role: e.target.value }, "Role updated.")} aria-label={`Role for ${u.name}`}>
                  {Object.entries(ROLE).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select></td>
                <td><span className={`pill ${u.is_active ? "confirmed" : "rejected"}`}>{u.is_active ? "Active" : "Disabled"}</span></td>
                <td className="act"><button onClick={() => reset(u)}>Reset password</button>
                  {!self && <button className={u.is_active ? "danger" : "ok-b"} onClick={() => act(u, { is_active: !u.is_active }, u.is_active ? "Account disabled." : "Account enabled.")}>{u.is_active ? "Disable" : "Enable"}</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
      <h3 style={{ marginTop: "1.5rem" }}>Recent login activity</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>When</th><th>Email</th><th>IP</th><th>Result</th></tr></thead>
        <tbody>
          {activity.map((a, i) => (
            <tr key={i}><td>{new Date(a.created_at).toLocaleString()}</td><td>{a.email}</td><td>{a.ip}</td>
              <td><span className={`pill ${a.success ? "confirmed" : "rejected"}`}>{a.success ? "Success" : "Failed"}</span></td></tr>
          ))}
          {activity.length === 0 && <tr><td colSpan="4" className="empty">No login activity yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

export default function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem("wtoken"));
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("overview");
  const out = () => { sessionStorage.removeItem("wtoken"); setToken(null); setMe(null); };
  useEffect(() => {
    if (token) call("/auth/me", {}, token).then(setMe).catch(out);
  }, [token]);
  if (!token) return <Login onToken={setToken} />;
  if (!me) return <div className="login-wrap"><p className="muted">Loading…</p></div>;
  const can = (p) => me.permissions.includes(p);
  const tabs = [["overview", "Overview"], can("pages") && ["pages", "Site pages"], can("posts") && ["posts", "Content"], can("members") && ["members", "Members"],
    can("members") && ["party-members", "Party Members"], can("members") && ["geo", "Geographic Areas"],
    can("donations") && ["donations", "Donations"], can("donations") && ["paysettings", "Payment settings"], can("messages") && ["messages", "Messages"], can("users") && ["users", "Team & roles"]].filter(Boolean);
  const View = { overview: Overview, pages: Pages, posts: Posts, members: Members, "party-members": PartyMembers, geo: GeoAreas,
    donations: Donations, paysettings: PaySettings, messages: Messages, users: Users }[tab] || Overview;
  return (
    <div className="admin">
      <aside>
        <div className="brand"><span className="logo-tile"><Logo /></span></div>
        <div className="chip-user"><b>{me.name}</b><span>{ROLE[me.role]?.[0]}</span></div>
        <nav className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="side-foot"><Link to="/">View website</Link><button onClick={out}>Sign out</button></div>
      </aside>
      <section className="admin-main"><ErrorGate onAuth={out}><View token={token} me={me} /></ErrorGate></section>
    </div>
  );
}

import React from "react";
class ErrorGate extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { if (err?.status === 401) this.props.onAuth(); }
  render() { return this.state.err ? <p className="err">Session expired or something went wrong. <button className="link" onClick={this.props.onAuth}>Sign in again</button></p> : this.props.children; }
}
