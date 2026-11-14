import { useEffect, useState } from "react";
import { getPosts } from "../api.js";
import { useLang } from "../i18n.jsx";

export default function News() {
  const { t, tErr, pick, date } = useLang();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([getPosts("news"), getPosts("statement")])
      .then(([a, b]) => setPosts([...a, ...b].sort((x, y) => y.published_at.localeCompare(x.published_at))))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <section className="section narrow">
      <p className="eyebrow">{t("news_eyebrow")}</p><h1 className="title">{t("news_title")}</h1>
      {error && <p className="err">{tErr(error)}</p>}
      {posts && posts.length === 0 && <p className="muted">{t("news_empty")}</p>}
      {posts?.map((p) => (
        <article key={p.id} className="post">
          <time dateTime={p.published_at}>{date(p.published_at)}</time>
          <h2 className="h-slab">{pick(p, "title")}</h2>
          {p.image_url && <img className="post-img" src={p.image_url} alt="" loading="lazy" />}
          <p>{pick(p, "summary")}</p>
        </article>
      ))}
    </section>
  );
}
