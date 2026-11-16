import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPage, getPosts } from "../api.js";
import { useLang } from "../i18n.jsx";
import MailingForm from "./MailingForm.jsx";

export default function Home() {
  const { t, tErr, pick } = useLang();
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState("");
  const [hero, setHero] = useState(null);
  useEffect(() => { getPosts("campaign").then(setCampaigns).catch((e) => setError(e.message)); }, []);
  useEffect(() => { getPage("home-hero").then(setHero).catch(() => {}); }, []);

  return (
    <>
      <section className="hero" style={hero?.image_url ? { "--hero-img": `url(${hero.image_url})` } : undefined}>
        <div className="hero-inner">
          <p className="hero-kicker">{hero ? pick(hero, "title") : t("hero_kicker")}</p>
          <h1>{hero ? pick(hero, "intro") : t("hero_title")}</h1>
          <p className="hero-sub">{hero ? pick(hero, "body") : t("hero_sub")}</p>
          <div className="row">
            <Link to="/join" className="btn btn-yellow">{t("join_us")}</Link>
            <Link to="/where-we-stand" className="btn btn-ghost">{t("where_we_stand")}</Link>
          </div>
        </div>
      </section>

      <section className="pillars">
        {[1, 2, 3, 4].map((n) => <div key={n}><h3>{t(`p${n}_t`)}</h3><p>{t(`p${n}_d`)}</p></div>)}
      </section>

      <section className="section" id="subscribe">
        <div className="split">
          <div className="split-copy">
            <p className="eyebrow light">{t("about_eyebrow")}</p>
            <h2>{t("about_title")}</h2>
            <p>{t("about_text")}</p>
            <ul className="ticks">
              <li>{t("tick1")}</li>
              <li>{t("tick2")}</li>
              <li>{t("tick3")}</li>
            </ul>
          </div>
          <div className="split-form"><MailingForm /></div>
        </div>
      </section>

      <section className="section center">
        <p className="eyebrow">{t("campaigns_eyebrow")}</p>
        <h2 className="title">{t("campaigns_title")}</h2>
        {error && <p className="err">{tErr(error)}</p>}
        {campaigns === null && !error && <p className="muted">{t("campaigns_loading")}</p>}
        <div className="grid">
          {campaigns?.map((c) => (
            <article className="card" key={c.id}>
              {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <div className="card-ph" aria-hidden="true">☀</div>}
              <div className="card-body"><h3>{pick(c, "title")}</h3><p>{pick(c, "summary")}</p></div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
