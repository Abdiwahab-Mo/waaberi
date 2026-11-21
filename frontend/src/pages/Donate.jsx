import { useEffect, useRef, useState } from "react";
import { call, getPosts } from "../api.js";
import { useLang } from "../i18n.jsx";

const AMOUNTS = [0.1, 0.2, 1, 5, 10, 25, 50, 100]; // minimum is $0.10; any custom amount from $0.10 to $10,000
const fmt = (a) => (a < 1 ? a.toFixed(2) : a); // $0.10 / $0.20, but still $1 / $5 / … for whole dollars
const TIERS = [100, 50, 25, 10, 5, 1]; // impact line shown for the highest tier reached
const GIFTS = [["general", "d_g_general", "d_g_general_d"], ["campaign", "d_g_campaign", "d_g_campaign_d"], ["region", "d_g_region", "d_g_region_d"]];

// Checkout methods: key, group, title, subtitle, icon, config field. "Coming soon" when the config field is empty.
const METHODS = [
  // WaafiPay sends a payment prompt to the donor's phone for either wallet
  ["evc", "mobile", "Hormuud EVC Plus", "WaafiPay · EVC Plus", "📱", "waafi"],
  ["sahal", "mobile", "Golis Sahal", "WaafiPay · Sahal", "📱", "waafi"],
];

function PayPal({ clientId, amount, extra, onDone }) {
  const { t, tErr } = useLang();
  const box = useRef(null);
  const live = useRef({ amount, extra });
  live.current = { amount, extra };
  const [err, setErr] = useState("");

  useEffect(() => {
    let dead = false;
    const draw = () => {
      if (dead || !window.paypal || !box.current) return;
      box.current.innerHTML = "";
      window.paypal.Buttons({
        style: { layout: "vertical", shape: "pill" },
        createOrder: async () => (await call("/donations/paypal/order", { method: "POST", body: { amount: live.current.amount } })).id,
        onApprove: async (d) => {
          try { await call("/donations/paypal/capture", { method: "POST", body: { order_id: d.orderID, ...live.current.extra } }); onDone(); }
          catch (e) { setErr(tErr(e.message)); }
        },
        onError: () => setErr(t("d_pp_problem")),
      }).render(box.current);
    };
    if (window.paypal) draw();
    else {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
      s.onload = draw; s.onerror = () => setErr(t("d_pp_load"));
      document.body.appendChild(s);
    }
    return () => { dead = true; };
  }, [clientId]);

  return <><div ref={box} className="pp-box" />{err && <p role="alert" className="err">{err}</p>}</>;
}

export default function Donate() {
  const { t, tErr, pick } = useLang();
  const [cfg, setCfg] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [step, setStep] = useState("form"); // form -> review -> done
  const [freq, setFreq] = useState("one_time");
  const [gift, setGift] = useState("general");
  const [campaignId, setCampaignId] = useState("");
  const [region, setRegion] = useState("");
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState("");
  const [f, setF] = useState({ name: "", phone: "", email: "", reference: "" });
  const [anon, setAnon] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [paidBy, setPaidBy] = useState("");
  const [push, setPush] = useState("idle"); // phone prompt: idle | waiting | confirmed | pending
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    call("/donate/config").then(setCfg).catch(() => setCfg({}));
    getPosts("campaign").then(setCampaigns).catch(() => {});
  }, []);

  const value = custom ? Math.round(Number(custom) * 100) / 100 : amount;
  const valid = value >= 0.1 && value <= 10000;
  const tier = TIERS.find((n) => value >= n);
  const money = `$${valid ? (value < 1 ? value.toFixed(2) : value.toLocaleString("en-US")) : "…"}`;
  const due = `US$${valid ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "…"}`;
  const per = freq === "monthly" ? t("d_per_month") : "";
  const campaign = campaigns.find((c) => String(c.id) === String(campaignId));
  const giftLabel = gift === "campaign" && campaign ? pick(campaign, "title") : gift === "region" && region ? region : t("d_g_general");
  const txt = (k) => (k.startsWith("r_") ? t(k) : k);
  const ready = (m) => !!cfg?.[m[5]] && !(m[0] === "paypal" && freq === "monthly");
  const WALLET = method === "sahal" ? "Sahal" : "EVC Plus";
  const sel = METHODS.find((m) => m[0] === method);
  const isMobile = sel?.[1] === "mobile";
  const methodName = sel ? txt(sel[2]) : "";

  const extra = { frequency: freq, designation: gift, campaign_id: campaignId || null, region, anonymous: anon, name: anon ? "" : f.name, email: f.email };

  const toReview = (e) => {
    e.preventDefault(); setErr("");
    if (!valid) return setErr(t("d_range"));
    if (gift === "campaign" && !campaignId) return setErr(t("d_need_campaign"));
    if (gift === "region" && !region) return setErr(t("d_need_region"));
    setMethod(""); setStep("review"); scrollTo({ top: 0, behavior: "smooth" }); // donor chooses EVC Plus or Sahal
  };

  const sendPrompt = async () => {
    if (!/^\+?[0-9 ()-]{7,20}$/.test(f.phone.trim())) return setErr(tErr("Enter your mobile money number, e.g. 61 234 5678."));
    setPush("waiting");
    try {
      const r = await call("/donations/waafi", { method: "POST", body: { ...extra, method, amount: value, phone: f.phone } });
      setPush(r.status === "confirmed" ? "confirmed" : "pending");
      setPaidBy(methodName); setStep("done"); scrollTo({ top: 0, behavior: "smooth" });
    } catch (x) { setPush("idle"); setErr(tErr(x.message)); }
  };

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    if (!anon && !f.name.trim()) return setErr(tErr("Enter your name."));
    if (isMobile) return sendPrompt(); // always automatic: phone prompt, no transaction ID
  };

  const restart = () => { setStep("form"); setErr(""); setMethod(""); setPush("idle"); setF({ name: "", phone: "", email: "", reference: "" }); setAnon(false); };

  const side = (
    <aside className="d-side">
      <div className="d-card">
        <h3>{t("d_why")}</h3>
        <ul className="ticks">{[1, 2, 3].map((n) => <li key={n}><b>{t(`d_why${n}_t`)}</b><br /><span>{t(`d_why${n}_d`)}</span></li>)}</ul>
      </div>
      <div className="d-card">
        <h3>{t("d_impact")}</h3>
        <ul className="d-tiers">
          {[...TIERS].reverse().map((n) => <li key={n} className={valid && tier === n ? "on" : ""}><b>${n}+</b><span>{t(`d_imp_${n}`)}</span></li>)}
        </ul>
      </div>
    </aside>
  );

  /* ---------- Step 3: thank you ---------- */
  if (step === "done") return (
    <section className="section narrow"><div className="success panel-form" role="status">
      <div className="tick" aria-hidden="true">✓</div><h2 className="h-slab">{t("d_thanks")}</h2>
      <div className="d-summary">
        <div><small>{t("d_sum_amount")}</small><b>{money}{per}</b></div>
        <div><small>{t("d_sum_for")}</small><b>{giftLabel}</b></div>
        <div><small>{t("d_sum_method")}</small><b>{paidBy}</b></div>
      </div>
      <p>{method === "paypal" ? t("d_thanks_paid") : push === "confirmed" ? (cfg?.waafi_demo ? t("w_done_demo") : t("w_done")) : push === "pending" ? t("w_pending") : t("d_thanks_text")}</p>
      {freq === "monthly" && <p className="muted">{t("d_monthly_note")}</p>}
      <button className="link" onClick={restart}>{t("d_another")}</button>
    </div></section>
  );

  /* ---------- Step 2: review & pay (checkout) ---------- */
  if (step === "review") {
    const group = (g, title) => (
      <>
        <p className="co-group">{t(title)}</p>
        {METHODS.filter((m) => m[1] === g).map((m) => {
          const ok = ready(m);
          const on = method === m[0];
          return (
            <div key={m[0]} className={`co-method ${on ? "on" : ""} ${ok ? "" : "off"}`}>
              <label>
                <input type="radio" name="method" value={m[0]} checked={on} disabled={!ok} onChange={() => { setMethod(m[0]); setErr(""); setF((v) => ({ ...v, phone: "" })); }} />
                <span className="co-ico" aria-hidden="true">{m[4]}</span>
                <span className="co-txt"><b>{txt(m[2])}</b><small>{ok ? txt(m[3]) : (m[0] === "paypal" && freq === "monthly" ? t("r_once_only") : t("d_soon"))}</small></span>
                <span className="co-end" aria-hidden="true">{m[1] === "mobile" ? "☎" : "▭"}</span>
              </label>
              {on && m[1] === "mobile" && (
                <div className="co-pay">
                  <p className="co-hint">📲 {t("w_hint", { m: WALLET })}</p>
                  <label className="field"><span>{t("w_phone", { m: WALLET })}</span>
                    <input type="tel" dir="ltr" value={f.phone} onChange={set("phone")} autoComplete="tel" placeholder={m[0] === "sahal" ? "90 …" : "61 …"} disabled={push === "waiting"} /></label>
                </div>
              )}
              {on && m[0] === "paypal" && <p className="co-pay fine">{t("r_pp_hint")}</p>}
            </div>
          );
        })}
      </>
    );

    return (
      <section className="section donate-wrap">
        <div className="checkout">
          <div className="co-head">
            <button className="co-back" onClick={() => { setStep("form"); setErr(""); }} aria-label={t("d_back")}>←</button>
            <h1>{t("r_title")}</h1>
          </div>
          {cfg?.waafi_demo && <p className="co-demo" role="note">🧪 {t("w_demo")}</p>}
          <div className="co-body">
            <form className="co-left" onSubmit={submit} noValidate id="co-form">
              <h2>{t("r_to")}</h2>
              <p className="co-sub">{giftLabel} · {freq === "monthly" ? t("d_monthly") : t("d_once")}</p>
              <h3>{t("r_details")}</h3>
              {group("mobile", "r_mobile")}
              <div className="co-two co-who">
                {!anon && <label className="field"><span>{t("r_fullname")}</span><input value={f.name} onChange={set("name")} autoComplete="name" /></label>}
                <label className="field"><span>{t("r_email")}</span><input type="email" dir="ltr" value={f.email} onChange={set("email")} autoComplete="email" /></label>
              </div>
              <label className="check"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> {t("d_anon")}</label>
              {anon && <p className="fine">{t("d_anon_note")}</p>}
              <p className="co-badges"><span>🛡 {t("r_secure")}</span><span>🔒 {t("r_tls")}</span></p>
            </form>

            <aside className="co-right">
              <div className="co-sumhead"><h2>{t("r_summary")}</h2><span className="co-cur">🇺🇸 USD</span></div>
              <p className="co-line">{t("r_to")}</p>
              <div className="co-due"><span>{t("r_due")}</span><b>{due}{per}</b></div>
              {push === "waiting" ? (
                <div className="co-wait" role="status" aria-live="polite">
                  <div className="co-spin" aria-hidden="true" />
                  <b>{t("w_wait_t")}</b>
                  <p>{t("w_wait", { a: money, p: f.phone, m: WALLET })}</p>
                  <small>{t("w_wait_small")}</small>
                </div>
              ) : method === "paypal" && cfg?.paypal_client_id ? (
                <PayPal key={cfg.paypal_client_id} clientId={cfg.paypal_client_id} amount={value} extra={extra}
                  onDone={() => { setPaidBy("PayPal"); setStep("done"); scrollTo({ top: 0, behavior: "smooth" }); }} />
              ) : (
                <button className="co-pay-btn" form="co-form" disabled={!method || busy}>
                  {!method ? t("r_select") : busy ? t("d_sending") : isMobile ? t("w_send", { a: money }) : t("r_sent", { a: money })}
                </button>
              )}
              {err && <p role="alert" className="err">{err}</p>}
              <ul className="co-notes">
                <li><span aria-hidden="true">🛡</span>{t("r_note1")}</li>
                <li><span aria-hidden="true">🕒</span>{t("r_note2")}</li>
              </ul>
              <div className="co-comp">
                <b>{t("r_comp_t")}</b>
                <p>{t("r_comp")}</p>
              </div>
              <details className="co-get">
                <summary>{t("r_get")}</summary>
                <ul className="ticks">
                  {valid && tier && <li>{t(`d_imp_${tier}`)}</li>}
                  <li>{t("r_get2")}</li>
                  <li>{t("r_get3")}</li>
                </ul>
              </details>
            </aside>
          </div>
        </div>
      </section>
    );
  }

  /* ---------- Step 1: choose gift ---------- */
  return (
    <section className="section donate-wrap">
      <p className="eyebrow">{t("d_eyebrow")}</p>
      <h1 className="title">{t("d_title")}</h1>
      <div className="d-grid">
        <form className="panel-form donate" onSubmit={toReview} noValidate>
          <div className="seg" role="radiogroup" aria-label={t("d_type")}>
            {[["one_time", "d_once"], ["monthly", "d_monthly"]].map(([k, l]) => (
              <button type="button" key={k} role="radio" aria-checked={freq === k} className={freq === k ? "on" : ""} onClick={() => setFreq(k)}>{t(l)}</button>
            ))}
          </div>

          <h3>{t("d_direct")}</h3>
          <div className="d-gifts" role="radiogroup">
            {GIFTS.map(([k, n, d]) => (
              <button type="button" key={k} role="radio" aria-checked={gift === k} className={gift === k ? "on" : ""} onClick={() => setGift(k)}>
                <b>{t(n)}</b><span>{t(d)}</span>
              </button>
            ))}
          </div>
          {gift === "campaign" && (
            <label className="field"><span>{t("d_g_campaign")}</span>
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">{t("d_choose")}</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{pick(c, "title")}</option>)}
              </select></label>
          )}
          {gift === "region" && (
            <label className="field"><span>{t("d_g_region")}</span>
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">{t("d_choose")}</option>
                {(cfg?.regions || []).map((r) => <option key={r} value={r}>{r}</option>)}
              </select></label>
          )}

          <h3>{t("d_amount")}</h3>
          <div className="chips">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" className={!custom && amount === a ? "on" : ""} onClick={() => { setAmount(a); setCustom(""); }}>${fmt(a)}</button>
            ))}
            <label className="chip-in"><span>$</span><input type="number" min="0.1" max="10000" step="0.01" placeholder={t("d_other")} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label={t("d_other")} /></label>
          </div>
          {valid && tier && <p className="d-impact">✦ {t(`d_imp_${tier}`)}</p>}
          {freq === "monthly" && <p className="fine">{t("d_monthly_mm")}</p>}

          <button className="btn btn-yellow block d-go">{t("d_go", { a: money })}{per}</button>
          {err && <p role="alert" className="err">{err}</p>}
          <p className="fine">🔒 {t("d_secure")}</p>
        </form>
        {side}
      </div>
    </section>
  );
}
