import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { castVote, changeMemberPassword, getElectionResults, getElections, getMemberMe, getMembershipCard, memberLogin, updateMemberMe } from "../api.js";
import Logo from "../Logo.jsx";
import { useLang } from "../i18n.jsx";

function timeLeft(target) {
  const ms = new Date(target).getTime() - Date.now();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function ElectionResults({ eid, token, t }) {
  const [r, setR] = useState(null);
  useEffect(() => { getElectionResults(eid, token).then(setR).catch(() => {}); }, [eid, token]);
  if (!r) return <p className="muted">{t("loading")}</p>;
  return (
    <div className="election-results">
      <p className="muted">{t("mp_turnout")}: {r.turnout}% ({r.total_votes}/{r.eligible_members})</p>
      {r.results.map((c) => (
        <div className="result-row" key={c.candidate_id}>
          <span>{c.name}{c.leading && <b className="ok"> · {t("mp_leading")}</b>}</span>
          <div className="result-bar"><div style={{ width: `${c.percent}%` }} /></div>
          <span className="muted">{c.votes} {t("mp_votes")} ({c.percent}%)</span>
        </div>
      ))}
    </div>
  );
}

function ElectionCard({ el, token, t, tErr, date, onVoted }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const [, setTick] = useState(0);
  useEffect(() => {
    if (el.phase !== "live") return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [el.phase]);

  const vote = async (c) => {
    if (!confirm(t("mp_confirm_vote", { name: c.name }))) return;
    setBusy(true); setMsg({ ok: true, text: "" });
    try { await castVote(el.id, c.id, token); setMsg({ ok: true, text: t("mp_voted_thanks") }); onVoted(); }
    catch (x) { setMsg({ ok: false, text: tErr(x.message) }); }
    finally { setBusy(false); }
  };

  const badge = { live: ["mp_live", "confirmed"], upcoming: ["mp_upcoming", "pending"], closed: ["mp_closed_badge", "anon"] }[el.phase];

  return (
    <div className="panel election-card">
      <div className="row-l election-card-head">
        <h3>{el.title}</h3>
        <span className={`pill ${badge[1]}`}>{t(badge[0])}</span>
      </div>
      {el.phase === "upcoming" && <p className="muted">{t("mp_starts", { date: date(el.starts_at) })}</p>}
      {el.phase === "live" && <p className="muted">{t("mp_time_left", { time: timeLeft(el.ends_at) || "—" })}</p>}
      {el.phase === "closed" && <p className="muted">{t("mp_ends", { date: date(el.ends_at) })}</p>}

      {el.phase === "live" && !el.has_voted && (
        <div className="election-candidates">
          {el.candidates.map((c) => (
            <div className="candidate-row" key={c.id}>
              <div><b>{c.name}</b>{c.bio && <p className="muted">{c.bio}</p>}</div>
              <button type="button" className="btn btn-blue small" disabled={busy} title={t("mp_vote_for")} onClick={() => vote(c)}>{t("mp_vote")}</button>
            </div>
          ))}
        </div>
      )}
      {el.phase === "live" && el.has_voted && <p className="ok">{t("mp_already_voted")}</p>}
      {el.phase === "upcoming" && (
        <div className="election-candidates">
          <p className="muted">{t("mp_candidates")}: {el.candidates.map((c) => c.name).join(", ")}</p>
        </div>
      )}
      {el.phase === "closed" && <ElectionResults eid={el.id} token={token} t={t} />}
      {msg.text && <p className={msg.ok ? "ok" : "err"} role="status">{msg.text}</p>}
    </div>
  );
}

function ElectionsTab({ member, token, t, tErr, date }) {
  const [data, setData] = useState(null);
  const load = () => getElections(token).then(setData).catch(() => setData({ elections: [] }));
  useEffect(() => { load(); }, [token]);
  if (!member.region_id) return <><h2>{t("mp_elections")}</h2><p className="empty">{t("mp_no_region")}</p></>;
  if (!data) return <><h2>{t("mp_elections")}</h2><p className="muted">{t("loading")}</p></>;
  const open = data.elections.filter((e) => e.phase !== "closed");
  return (
    <>
      <h2>{t("mp_elections")}</h2>
      {open.length === 0 && <p className="empty">{t("mp_no_elections")}</p>}
      <div className="stack">
        {open.map((el) => <ElectionCard key={el.id} el={el} token={token} t={t} tErr={tErr} date={date} onVoted={load} />)}
      </div>
    </>
  );
}

function HistoryTab({ member, token, t, date }) {
  const [data, setData] = useState(null);
  useEffect(() => { getElections(token).then(setData).catch(() => setData({ elections: [] })); }, [token]);
  if (!member.region_id) return <><h2>{t("mp_history")}</h2><p className="empty">{t("mp_no_region")}</p></>;
  if (!data) return <><h2>{t("mp_history")}</h2><p className="muted">{t("loading")}</p></>;
  const closed = data.elections.filter((e) => e.phase === "closed" && e.has_voted);
  return (
    <>
      <h2>{t("mp_history")}</h2>
      {closed.length === 0 && <p className="empty">{t("mp_no_history")}</p>}
      <div className="stack">
        {closed.map((el) => <ElectionCard key={el.id} el={el} token={token} t={t} tErr={() => ""} date={date} onVoted={() => {}} />)}
      </div>
    </>
  );
}

const STATUS_LABELS = { pending: "Pending", under_review: "Under review", approved: "Approved", rejected: "Rejected", suspended: "Suspended", expired: "Expired" };
const STATUS_PILL = { pending: "pending", approved: "confirmed", rejected: "rejected", suspended: "rejected" };

function MemberLogin({ onToken }) {
  const { t, tErr } = useLang();
  const [c, setC] = useState({ email: "", password: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const validate = () => {
    if (!c.email.trim()) return t("mlogin_email_required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return t("mlogin_email_invalid");
    if (!c.password) return t("mlogin_password_required");
    return "";
  };
  const go = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(""); setBusy(true);
    try { const { token } = await memberLogin(c); sessionStorage.setItem("wmember_token", token); onToken(token); }
    catch (x) { setErr(tErr(x.message)); }
    finally { setBusy(false); }
  };
  return (
    <div className="login-wrap">
      <form className="login" onSubmit={go} noValidate>
        <Logo className="logo-login" />
        <h1>{t("mlogin_title")}</h1>
        <label className="field"><span>{t("mlogin_email")}</span>
          <input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></label>
        <label className="field"><span>{t("mlogin_password")}</span>
          <div className="pw-wrap">
            <input type={show ? "text" : "password"} value={c.password} onChange={(e) => setC({ ...c, password: e.target.value })} />
            <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? t("login_hide") : t("login_show")}>{show ? "🙈" : "👁"}</button>
          </div>
        </label>
        <button className="btn btn-blue block" disabled={busy}>{busy ? t("login_signing_in") : t("mlogin_signin")}</button>
        {err && <p role="alert" className="err">{err}</p>}
        <Link to="/" className="link">{t("login_back")}</Link>
      </form>
    </div>
  );
}

function Dashboard({ member, t }) {
  return (
    <>
      <h2>{t("mp_welcome", { name: member.first_name })}</h2>
      <div className="roles">
        <div><b>{member.membership_id || "—"}</b><span>{t("verify_id")}</span></div>
        <div><b>{STATUS_LABELS[member.status]}</b><span>{t("mp_status")}</span></div>
        <div><b>{[member.city_name, member.region_name].filter(Boolean).join(", ") || "—"}</b><span>{t("mp_location")}</span></div>
      </div>
    </>
  );
}

function Profile({ member, token, onUpdate, t }) {
  const [f, setF] = useState({ alt_phone: member.alt_phone || "", occupation: member.occupation || "", membership_type: member.membership_type || "" });
  const [msg, setMsg] = useState("");
  const save = async (e) => {
    e.preventDefault();
    const updated = await updateMemberMe(f, token);
    onUpdate(updated); setMsg(t("mp_saved"));
  };
  return (
    <>
      <h2>{t("mp_profile")}</h2>
      <div className="panel">
        <form className="aform" onSubmit={save}>
          <label className="field"><span>{t("reg_alt_phone")}</span><input value={f.alt_phone} onChange={(e) => setF({ ...f, alt_phone: e.target.value })} /></label>
          <label className="field"><span>{t("reg_occupation")}</span><input value={f.occupation} onChange={(e) => setF({ ...f, occupation: e.target.value })} /></label>
          <label className="field"><span>{t("reg_membership_type")}</span><input value={f.membership_type} onChange={(e) => setF({ ...f, membership_type: e.target.value })} /></label>
          <div className="wide row-l"><button className="btn btn-blue">{t("mp_save")}</button>{msg && <span className="ok" role="status">{msg}</span>}</div>
        </form>
      </div>
    </>
  );
}

function Card({ token, t }) {
  const [card, setCard] = useState(null);
  useEffect(() => { getMembershipCard(token).then(setCard).catch(() => {}); }, [token]);
  if (!card) return <p className="muted">{t("loading")}</p>;
  return (
    <>
      <h2>{t("mp_card")}</h2>
      <div className="panel" style={{ maxWidth: 360, textAlign: "center" }}>
        <Logo className="logo-login" />
        <p><b>{card.first_name} {card.last_name}</b></p>
        <p className="muted">{card.membership_id}</p>
        <p><span className={`pill ${STATUS_PILL[card.status] || ""}`}>{STATUS_LABELS[card.status]}</span></p>
        <div dangerouslySetInnerHTML={{ __html: card.qr_svg }} style={{ width: 160, margin: "1rem auto" }} />
      </div>
    </>
  );
}

function LocationTab({ member, t }) {
  return (
    <>
      <h2>{t("mp_location")}</h2>
      <div className="panel">
        <p>{t("reg_country")}: <b>{member.country_name || "—"}</b></p>
        <p>{t("reg_state")}: <b>{member.state_name || "—"}</b></p>
        <p>{t("reg_region")}: <b>{member.region_name || "—"}</b></p>
        <p>{t("reg_city")}: <b>{member.city_name || "—"}</b></p>
        <p>{t("reg_district")}: <b>{member.district_name || "—"}</b></p>
      </div>
    </>
  );
}

function StatusTab({ member, t, date }) {
  return (
    <>
      <h2>{t("mp_status")}</h2>
      <p><span className={`pill ${STATUS_PILL[member.status] || ""}`}>{STATUS_LABELS[member.status]}</span></p>
      <p className="muted">{member.reviewed_at ? t("mp_approved_on", { date: date(member.reviewed_at) }) : t("mp_status_pending")}</p>
    </>
  );
}

function SettingsTab({ token, t, tErr }) {
  const [f, setF] = useState({ current_password: "", new_password: "" });
  const [msg, setMsg] = useState({ ok: true, text: "" });
  const save = async (e) => {
    e.preventDefault();
    try { await changeMemberPassword(f, token); setMsg({ ok: true, text: t("mp_password_changed") }); setF({ current_password: "", new_password: "" }); }
    catch (x) { setMsg({ ok: false, text: tErr(x.message) }); }
  };
  return (
    <>
      <h2>{t("mp_settings")}</h2>
      <div className="panel">
        <form className="aform" onSubmit={save}>
          <label className="field"><span>{t("mp_current_password")}</span><input type="password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} /></label>
          <label className="field"><span>{t("mp_new_password")}</span><input type="password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} /></label>
          <div className="wide row-l"><button className="btn btn-blue">{t("mp_change_password")}</button>{msg.text && <span className={msg.ok ? "ok" : "err"} role="status">{msg.text}</span>}</div>
        </form>
      </div>
    </>
  );
}

const TABS = [
  ["dashboard", "mp_dashboard", Dashboard],
  ["profile", "mp_profile", Profile],
  ["card", "mp_card", Card],
  ["location", "mp_location", LocationTab],
  ["status", "mp_status", StatusTab],
  ["elections", "mp_elections", ElectionsTab],
  ["history", "mp_history", HistoryTab],
  ["notifications", "mp_notifications", ({ member, t, date }) => (
    <><h2>{t("mp_notifications")}</h2><p>{member.reviewed_at ? t("mp_approved_on", { date: date(member.reviewed_at) }) : t("mp_status_pending")}</p></>
  )],
  ["settings", "mp_settings", SettingsTab],
];

export default function Member() {
  const { t, tErr, date } = useLang();
  const [token, setToken] = useState(() => sessionStorage.getItem("wmember_token"));
  const [member, setMember] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const out = () => { sessionStorage.removeItem("wmember_token"); setToken(null); setMember(null); };
  useEffect(() => { if (token) getMemberMe(token).then(setMember).catch(out); }, [token]);

  if (!token) return <MemberLogin onToken={setToken} />;
  if (!member) return <div className="login-wrap"><p className="muted">{t("loading")}</p></div>;

  const [, , View] = TABS.find(([k]) => k === tab) || TABS[0];
  return (
    <div className="admin">
      <div className="admin-body">
      <aside>
        <div className="brand"><span className="logo-tile"><Logo /></span></div>
        <div className="chip-user"><span className="avatar">{member.first_name[0]}{member.last_name[0]}</span><span className="chip-user-txt"><b>{member.first_name} {member.last_name}</b><small>{member.membership_id}</small></span></div>
        <nav className="tabs">{TABS.map(([k, labelKey]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(labelKey)}</button>)}</nav>
        <div className="side-foot"><Link to="/">{t("mp_view_site")}</Link><button onClick={out}>{t("mp_logout")}</button></div>
      </aside>
      <section className="admin-main">
        <View member={member} token={token} t={t} tErr={tErr} date={date} onUpdate={setMember} />
      </section>
      </div>
    </div>
  );
}
