import { useState } from "react";
import { sendContact } from "../api.js";
import { useLang } from "../i18n.jsx";

export default function Contact() {
  const { t, tErr } = useLang();
  const [f, setF] = useState({ name: "", email: "", body: "" });
  const [msg, setMsg] = useState({ ok: false, text: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await sendContact(f); setF({ name: "", email: "", body: "" }); setMsg({ ok: true, text: t("contact_ok") }); }
    catch (err) { setMsg({ ok: false, text: tErr(err.message) }); }
  };
  return (
    <section className="section narrow">
      <p className="eyebrow">{t("contact_eyebrow")}</p>
      <h1 className="title">{t("contact_title")}</h1>
      <form className="panel-form mform" onSubmit={submit}>
        <label className="field"><span>{t("f_name")}</span><input value={f.name} onChange={set("name")} required /></label>
        <label className="field"><span>{t("f_email")}</span><input type="email" dir="ltr" value={f.email} onChange={set("email")} required /></label>
        <label className="field"><span>{t("f_message")}</span><textarea rows="5" value={f.body} onChange={set("body")} required /></label>
        <button className="btn btn-blue">{t("contact_send")}</button>
        {msg.text && <p role="status" className={msg.ok ? "ok" : "err"}>{msg.text}</p>}
      </form>
    </section>
  );
}
