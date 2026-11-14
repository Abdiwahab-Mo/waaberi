import { useEffect, useState } from "react";
import { call } from "../api.js";
import { useLang } from "../i18n.jsx";

// Body text format: blank line = new section. In a section with several lines,
// the first line is shown as a heading and the rest as text.
export function Blocks({ text }) {
  return (text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b, i) => {
    const [first, ...rest] = b.split("\n");
    return rest.length
      ? <div className="block" key={i}><h2 className="h-slab">{first}</h2><p>{rest.join(" ")}</p></div>
      : <p key={i}>{first}</p>;
  });
}

export default function Simple({ slug }) {
  const { t, tErr, pick } = useLang();
  const [page, setPage] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(null); setError("");
    call(`/pages/${slug}`).then(setPage).catch((e) => setError(e.message));
    if (slug === "leadership") call("/leaders").then(setLeaders).catch(() => {});
  }, [slug]);

  if (error) return <section className="section narrow"><p className="err">{tErr(error)}</p></section>;
  if (!page) return <section className="section narrow"><p className="muted">{t("loading")}</p></section>;

  return (
    <section className={`section ${slug === "leadership" ? "" : "narrow"}`}>
      <h1 className="title">{pick(page, "title")}</h1>
      {page.image_url && <img className="page-img" src={page.image_url} alt="" />}
      {pick(page, "intro") && <p className="lead">{pick(page, "intro")}</p>}
      <div className="page-body"><Blocks text={pick(page, "body")} /></div>
      {slug === "leadership" && (
        <div className="grid leaders">
          {leaders.map((l) => (
            <article className="card" key={l.id}>
              {l.photo_url ? <img src={l.photo_url} alt={l.name} loading="lazy" /> : <div className="card-ph" aria-hidden="true">{l.name[0]}</div>}
              <div className="card-body"><h3>{l.name}</h3><p className="role">{pick(l, "position")}</p>{pick(l, "bio") && <p>{pick(l, "bio")}</p>}</div>
            </article>
          ))}
          {leaders.length === 0 && <p className="muted">{t("leaders_empty")}</p>}
        </div>
      )}
    </section>
  );
}
