import { Link } from "react-router-dom";
import MailingForm from "./MailingForm.jsx";
import { useLang } from "../i18n.jsx";
export default function Join() {
  const { t } = useLang();
  return (
    <section className="section narrow">
      <p className="eyebrow">{t("join_eyebrow")}</p>
      <h1 className="title">{t("join_title")}</h1>
      <div className="panel-form"><MailingForm /></div>
      <p className="fine"><Link to="/join-party">{t("join_party_cta")}</Link></p>
    </section>
  );
}
