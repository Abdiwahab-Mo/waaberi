import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { verifyMember } from "../api.js";
import { useLang } from "../i18n.jsx";

export default function Verify() {
  const { token } = useParams();
  const { t } = useLang();
  const [result, setResult] = useState(undefined);

  useEffect(() => { verifyMember(token).then(setResult).catch(() => setResult(null)); }, [token]);

  return (
    <section className="section narrow center">
      <h1 className="title">{t("verify_title")}</h1>
      {result === undefined && <p className="muted">{t("loading")}</p>}
      {result === null && <p className="err">{t("verify_not_found")}</p>}
      {result && (
        <div className="panel-form" style={{ display: "inline-block", textAlign: "left" }}>
          {result.photo_url && <img src={result.photo_url} alt="" style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", marginBottom: "1rem" }} />}
          <p><b>{result.name}</b></p>
          <p className="muted">{t("verify_id")}: {result.membership_id || "—"}</p>
          <p className="muted">{t("verify_status")}: {result.status}</p>
        </div>
      )}
    </section>
  );
}
