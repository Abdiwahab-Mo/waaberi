import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getGeo, registerMember } from "../api.js";
import { useLang } from "../i18n.jsx";

const blank = {
  first_name: "", middle_name: "", last_name: "", gender: "", date_of_birth: "",
  email: "", phone: "", alt_phone: "",
  country_id: "", state_id: "", region_id: "", city_id: "", district_id: "",
  membership_type: "", occupation: "", agreed_to_terms: false, consent_data_processing: false,
};

export default function Register() {
  const { t, tErr } = useLang();
  const [f, setF] = useState(blank);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [st, setSt] = useState({ status: "idle", msg: "" });

  useEffect(() => { getGeo("countries").then(setCountries).catch(() => {}); }, []);
  useEffect(() => { setStates([]); if (f.country_id) getGeo("states", f.country_id).then(setStates).catch(() => {}); }, [f.country_id]);
  useEffect(() => { setRegions([]); if (f.state_id) getGeo("regions", f.state_id).then(setRegions).catch(() => {}); }, [f.state_id]);
  useEffect(() => { setCities([]); if (f.region_id) getGeo("cities", f.region_id).then(setCities).catch(() => {}); }, [f.region_id]);
  useEffect(() => { setDistricts([]); if (f.city_id) getGeo("districts", f.city_id).then(setDistricts).catch(() => {}); }, [f.city_id]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    const clears = { country_id: ["state_id", "region_id", "city_id", "district_id"], state_id: ["region_id", "city_id", "district_id"],
                     region_id: ["city_id", "district_id"], city_id: ["district_id"] };
    const reset = Object.fromEntries((clears[k] || []).map((c) => [c, ""]));
    setF({ ...f, [k]: v, ...reset });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSt({ status: "loading", msg: "" });
    try {
      const res = await registerMember(f);
      setSt({ status: "ok", msg: "", id: res.id });
    } catch (err) { setSt({ status: "error", msg: err.message }); }
  };

  if (st.status === "ok") return (
    <section className="section narrow center">
      <div className="success" role="status">
        <div className="tick" aria-hidden="true">✓</div>
        <h3>{t("reg_ok_title")}</h3>
        <p>{t("reg_ok_body")}</p>
        <p className="muted">{t("reg_ref", { id: st.id })}</p>
        <p className="fine"><Link to="/member/login">{t("mlogin_title")} →</Link></p>
      </div>
    </section>
  );

  return (
    <section className="section narrow">
      <p className="eyebrow">{t("reg_eyebrow")}</p>
      <h1 className="title">{t("reg_title")}</h1>
      <p>{t("reg_intro")}</p>
      <div className="panel-form">
        <form className="mform" onSubmit={submit} noValidate>
          <div className="co-two">
            <label className="field"><span>{t("reg_first")}</span><input required value={f.first_name} onChange={set("first_name")} /></label>
            <label className="field"><span>{t("reg_last")}</span><input required value={f.last_name} onChange={set("last_name")} /></label>
          </div>
          <label className="field"><span>{t("reg_middle")}</span><input value={f.middle_name} onChange={set("middle_name")} /></label>
          <div className="co-two">
            <label className="field"><span>{t("reg_gender")}</span>
              <select value={f.gender} onChange={set("gender")}>
                <option value="">—</option>
                <option value="male">{t("reg_gender_male")}</option>
                <option value="female">{t("reg_gender_female")}</option>
              </select>
            </label>
            <label className="field"><span>{t("reg_dob")}</span><input type="date" dir="ltr" value={f.date_of_birth} onChange={set("date_of_birth")} /></label>
          </div>
          <div className="co-two">
            <label className="field"><span>{t("reg_email")}</span><input required type="email" dir="ltr" value={f.email} onChange={set("email")} /></label>
            <label className="field"><span>{t("reg_phone")}</span><input required type="tel" dir="ltr" value={f.phone} onChange={set("phone")} /></label>
          </div>
          <label className="field"><span>{t("reg_alt_phone")}</span><input type="tel" dir="ltr" value={f.alt_phone} onChange={set("alt_phone")} /></label>

          <label className="field"><span>{t("reg_country")}</span>
            <select required value={f.country_id} onChange={set("country_id")}>
              <option value="">—</option>
              {countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("reg_state")}</span>
            <select required disabled={!f.country_id} value={f.state_id} onChange={set("state_id")}>
              <option value="">—</option>
              {states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("reg_region")}</span>
            <select required disabled={!f.state_id} value={f.region_id} onChange={set("region_id")}>
              <option value="">—</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("reg_city")}</span>
            <select required disabled={!f.region_id} value={f.city_id} onChange={set("city_id")}>
              <option value="">—</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("reg_district")}</span>
            <select disabled={!f.city_id} value={f.district_id} onChange={set("district_id")}>
              <option value="">—</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <label className="field"><span>{t("reg_membership_type")}</span><input placeholder={t("reg_membership_type_ph")} value={f.membership_type} onChange={set("membership_type")} /></label>
          <label className="field"><span>{t("reg_occupation")}</span><input value={f.occupation} onChange={set("occupation")} /></label>

          <label className="check"><input type="checkbox" required checked={f.agreed_to_terms} onChange={set("agreed_to_terms")} /> {t("reg_agree")}</label>
          <label className="check"><input type="checkbox" required checked={f.consent_data_processing} onChange={set("consent_data_processing")} /> {t("reg_consent")}</label>

          <button className="btn btn-yellow block" disabled={st.status === "loading"}>
            {st.status === "loading" ? t("reg_submitting") : t("reg_submit")}
          </button>
          {st.status === "error" && <p role="alert" className="err">{tErr(st.msg)}</p>}
        </form>
      </div>
    </section>
  );
}
