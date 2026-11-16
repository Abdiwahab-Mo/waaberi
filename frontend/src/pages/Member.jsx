import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { changeMemberPassword, getMemberMe, getMembershipCard, memberLogin, updateMemberMe } from "../api.js";
import Logo from "../Logo.jsx";
import { useLang } from "../i18n.jsx";

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
  ["elections", "mp_elections", ({ t }) => <><h2>{t("mp_elections")}</h2><p className="empty">{t("mp_no_elections")}</p></>],
  ["history", "mp_history", ({ t }) => <><h2>{t("mp_history")}</h2><p className="empty">{t("mp_no_history")}</p></>],
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
      <aside>
        <div className="brand"><span className="logo-tile"><Logo /></span></div>
        <div className="chip-user"><b>{member.first_name} {member.last_name}</b><span>{member.membership_id}</span></div>
        <nav className="tabs">{TABS.map(([k, labelKey]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(labelKey)}</button>)}</nav>
        <div className="side-foot"><Link to="/">{t("mp_view_site")}</Link><button onClick={out}>{t("mp_logout")}</button></div>
      </aside>
      <section className="admin-main">
        <View member={member} token={token} t={t} tErr={tErr} date={date} onUpdate={setMember} />
      </section>
    </div>
  );
}
