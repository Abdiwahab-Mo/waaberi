import { useState } from "react";
import { joinList } from "../api.js";
import { useLang } from "../i18n.jsx";

const Field = ({ label, optional, ...p }) => (
  <label className="field"><span>{label}{optional && <small className="muted"> ({optional})</small>}</span><input required={!optional} {...p} /></label>
);

export default function MailingForm({ compact }) {
  const { t, tErr } = useLang();
  const [f, setF] = useState({ name: "", phone: "", email: "", website: "" });
  const [st, setSt] = useState({ status: "idle", msg: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (f.website) return; // honeypot: bots fill every field, real visitors never see this one
    setSt({ status: "loading", msg: "" });
    try {
      await joinList(f);
      setF({ name: "", phone: "", email: "", website: "" });
      setSt({ status: "ok", msg: "" });
    } catch (err) { setSt({ status: "error", msg: err.message }); }
  };

  if (st.status === "ok") return (
    <div className="success" role="status">
      <div className="tick" aria-hidden="true">✓</div>
      <h3>{t("join_ok_title")}</h3>
      <p>{t("join_ok")}</p>
      <button className="link" onClick={() => setSt({ status: "idle", msg: "" })}>{t("join_another")}</button>
    </div>
  );

  return (
    <form className={`mform ${compact ? "compact" : ""}`} onSubmit={submit} noValidate>
      <Field label={t("f_name")} value={f.name} onChange={set("name")} autoComplete="name" placeholder={t("f_name_ph")} />
      <Field label={t("f_phone")} optional={t("f_optional")} type="tel" dir="ltr" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder="+252 …" />
      <Field label={t("f_email")} type="email" dir="ltr" value={f.email} onChange={set("email")} autoComplete="email" placeholder="you@example.com" />
      <input type="text" name="website" tabIndex="-1" autoComplete="off" value={f.website} onChange={set("website")} className="hp-field" aria-hidden="true" />
      <button className="btn btn-yellow block" disabled={st.status === "loading"}>
        {st.status === "loading" ? t("joining") : t("join_btn")}
      </button>
      <p className="fine">{t("join_fine")}</p>
      {st.status === "error" && <p role="alert" className="err">{tErr(st.msg)}</p>}
    </form>
  );
}
