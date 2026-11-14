import { useState } from "react";
import { NavLink, Link, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home.jsx";
import News from "./pages/News.jsx";
import Join from "./pages/Join.jsx";
import Contact from "./pages/Contact.jsx";
import Admin from "./pages/Admin.jsx";
import Simple from "./pages/Simple.jsx";
import Donate from "./pages/Donate.jsx";
import Logo from "./Logo.jsx";
import { LANGS, useDocumentLang, useLang } from "./i18n.jsx";

const links = [
  ["/", "nav_home"], ["/who-we-are", "nav_who"], ["/where-we-stand", "nav_stand"],
  ["/leadership", "nav_lead"], ["/join", "nav_join"],
  ["/news", "nav_news"], ["/contact", "nav_contact"],
];

function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <div className="langs" role="group" aria-label={t("language")}>
      {LANGS.map(([k, label]) => (
        <button key={k} lang={k} className={lang === k ? "on" : ""} aria-pressed={lang === k} onClick={() => setLang(k)}>{label}</button>
      ))}
    </div>
  );
}

function Layout() {
  const [open, setOpen] = useState(false);
  const { t, lang, dir } = useLang();
  useDocumentLang(lang, dir);
  useLocation();
  return (
    <>
      <div className="topbar">
        <div className="topbar-r"><LangSwitch /><Link className="btn btn-blue small" to="/donate">{t("donate")}</Link></div>
      </div>
      <header className="nav">
        <div className="nav-in">
          <Link to="/" className="brand" onClick={() => setOpen(false)}>
            <Logo className="logo-img" />
          </Link>
          <button className="burger" aria-expanded={open} aria-label={t("menu")} onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
          <nav aria-label="Main" className={open ? "open" : ""} onClick={() => setOpen(false)}>
            {links.map(([to, k]) => <NavLink key={to} to={to} end={to === "/"}>{t(k)}</NavLink>)}
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="footer-in">
          <div><span className="logo-tile"><Logo /></span><p>{t("footer_about")}</p></div>
          <div><h4>{t("footer_explore")}</h4>{links.slice(1, 4).map(([to, k]) => <Link key={to} to={to}>{t(k)}</Link>)}</div>
          <div><h4>{t("footer_involved")}</h4><Link to="/join">{t("footer_join")}</Link><Link to="/donate">{t("donate")}</Link><Link to="/contact">{t("footer_contact")}</Link></div>
        </div>
        <p className="copy">© {new Date().getFullYear()} {t("rights")}</p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<Admin />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/who-we-are" element={<Simple slug="who-we-are" />} />
        <Route path="/where-we-stand" element={<Simple slug="where-we-stand" />} />
        <Route path="/leadership" element={<Simple slug="leadership" />} />
        <Route path="/donate" element={<Donate />} />
        <Route path="/join" element={<Join />} />
        <Route path="/news" element={<News />} />
        <Route path="/contact" element={<Contact />} />
      </Route>
    </Routes>
  );
}
