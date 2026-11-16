import os, re, time, uuid, datetime as dt
from functools import wraps
from io import BytesIO
import jwt, requests
import qrcode
import qrcode.image.svg
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from email_validator import validate_email, EmailNotValidError

load_dotenv()
db = SQLAlchemy()


class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), default="Admin", nullable=False)
    role = db.Column(db.String(20), default="super_admin", nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)


class Member(db.Model):  # mailing list / "Join us"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)


class Country(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)

    def to_dict(self):
        return {"id": self.id, "name": self.name}


class State(db.Model):  # "administrative area" per party constitution
    id = db.Column(db.Integer, primary_key=True)
    country_id = db.Column(db.Integer, db.ForeignKey("country.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {"id": self.id, "country_id": self.country_id, "name": self.name}


class Region(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    state_id = db.Column(db.Integer, db.ForeignKey("state.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {"id": self.id, "state_id": self.state_id, "name": self.name}


class City(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    region_id = db.Column(db.Integer, db.ForeignKey("region.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {"id": self.id, "region_id": self.region_id, "name": self.name}


class District(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    city_id = db.Column(db.Integer, db.ForeignKey("city.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)

    def to_dict(self):
        return {"id": self.id, "city_id": self.city_id, "name": self.name}


MEMBERSHIP_STATUSES = ("pending", "under_review", "approved", "rejected", "suspended", "expired")


class PartyMember(db.Model):  # a verified, approved party member (distinct from the mailing-list Member)
    id = db.Column(db.Integer, primary_key=True)
    membership_id = db.Column(db.String(20), unique=True)  # e.g. "WB-2026-000123", set on approval
    first_name = db.Column(db.String(80), nullable=False)
    middle_name = db.Column(db.String(80))
    last_name = db.Column(db.String(80), nullable=False)
    gender = db.Column(db.String(10))
    date_of_birth = db.Column(db.Date)
    email = db.Column(db.String(255), unique=True, nullable=False)
    phone = db.Column(db.String(32), nullable=False)
    alt_phone = db.Column(db.String(32))
    photo_url = db.Column(db.String(500))
    country_id = db.Column(db.Integer, db.ForeignKey("country.id"), nullable=False)
    state_id = db.Column(db.Integer, db.ForeignKey("state.id"), nullable=False)
    region_id = db.Column(db.Integer, db.ForeignKey("region.id"), nullable=False)
    city_id = db.Column(db.Integer, db.ForeignKey("city.id"), nullable=False)
    district_id = db.Column(db.Integer, db.ForeignKey("district.id"))  # optional, finest level
    membership_type = db.Column(db.String(40))
    occupation = db.Column(db.String(120))
    agreed_to_terms = db.Column(db.Boolean, default=False, nullable=False)
    consent_data_processing = db.Column(db.Boolean, default=False, nullable=False)
    status = db.Column(db.String(20), default="pending", nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)
    reviewed_at = db.Column(db.DateTime)
    reviewed_by = db.Column(db.Integer, db.ForeignKey("admin.id"))
    password_hash = db.Column(db.String(255))  # null until an admin sets a portal password
    verification_token = db.Column(db.String(32), unique=True)  # set at approval, alongside membership_id

    def to_dict(self):
        return {"id": self.id, "membership_id": self.membership_id,
                "first_name": self.first_name, "middle_name": self.middle_name, "last_name": self.last_name,
                "gender": self.gender, "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
                "email": self.email, "phone": self.phone, "alt_phone": self.alt_phone, "photo_url": self.photo_url,
                "country_id": self.country_id, "state_id": self.state_id, "region_id": self.region_id,
                "city_id": self.city_id, "district_id": self.district_id,
                "membership_type": self.membership_type, "occupation": self.occupation,
                "status": self.status, "created_at": self.created_at.isoformat(),
                "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
                "has_password": bool(self.password_hash)}


class MemberLocationHistory(db.Model):  # written whenever an approved member's location is corrected
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("party_member.id"), nullable=False)
    old_region_id = db.Column(db.Integer)
    new_region_id = db.Column(db.Integer)
    old_city_id = db.Column(db.Integer)
    new_city_id = db.Column(db.Integer)
    old_district_id = db.Column(db.Integer)
    new_district_id = db.Column(db.Integer)
    reason = db.Column(db.String(300), nullable=False)
    changed_by = db.Column(db.Integer, db.ForeignKey("admin.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)


class Post(db.Model):  # campaigns + news & statements
    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(20), nullable=False, index=True)  # campaign | news | statement
    title = db.Column(db.String(200), nullable=False)
    summary = db.Column(db.Text, nullable=False)
    image_url = db.Column(db.String(500))
    published_at = db.Column(db.DateTime, default=dt.datetime.utcnow, index=True)
    i18n = db.Column(db.JSON)  # {"so": {"title":..,"summary":..}, "ar": {...}}; English is in the main columns

    def to_dict(self):
        return {"id": self.id, "kind": self.kind, "title": self.title, "summary": self.summary,
                "image_url": self.image_url, "published_at": self.published_at.isoformat(), "i18n": self.i18n or {}}


class LoginAttempt(db.Model):  # one row per login POST (admin or member); success flag doubles as the activity log
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    ip = db.Column(db.String(45))
    success = db.Column(db.Boolean, default=False, nullable=False)
    kind = db.Column(db.String(10), default="admin", nullable=False)  # "admin" | "member"
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)


class Message(db.Model):  # contact form
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)


class Donation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    method = db.Column(db.String(10), nullable=False)  # evc (Hormuud) | sahal (Golis) | paypal  (older rows may say zaad)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(3), default="USD", nullable=False)
    donor_name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(32))
    reference = db.Column(db.String(100))
    paypal_order_id = db.Column(db.String(64), unique=True)
    status = db.Column(db.String(12), default="pending", nullable=False, index=True)  # pending|confirmed|rejected
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)
    frequency = db.Column(db.String(10), default="one_time", nullable=False)   # one_time | monthly
    designation = db.Column(db.String(10), default="general", nullable=False)  # general | campaign | region
    target = db.Column(db.String(200))       # campaign title or region name
    campaign_id = db.Column(db.Integer)
    email = db.Column(db.String(255))
    anonymous = db.Column(db.Boolean, default=False, nullable=False)
    gateway = db.Column(db.String(20))        # "waafipay" when paid by phone prompt
    gateway_msg = db.Column(db.String(200))   # last message from the gateway (for finance staff)

    def to_dict(self):
        return {"id": self.id, "method": self.method, "amount": str(self.amount), "currency": self.currency,
                "donor_name": self.donor_name, "phone": self.phone, "reference": self.reference,
                "status": self.status, "created_at": self.created_at.isoformat(), "frequency": self.frequency,
                "designation": self.designation, "target": self.target, "email": self.email, "anonymous": self.anonymous,
                "gateway": self.gateway, "gateway_msg": self.gateway_msg}


class Page(db.Model):  # editable site pages: who-we-are, where-we-stand, leadership
    slug = db.Column(db.String(40), primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    intro = db.Column(db.Text, default="", nullable=False)
    body = db.Column(db.Text, default="", nullable=False)
    image_url = db.Column(db.String(500))
    updated_at = db.Column(db.DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
    i18n = db.Column(db.JSON)

    def to_dict(self):
        return {"slug": self.slug, "title": self.title, "intro": self.intro, "body": self.body, "image_url": self.image_url,
                "updated_at": self.updated_at.isoformat() if self.updated_at else None, "i18n": self.i18n or {}}


class Setting(db.Model):  # simple key/value settings editable in the admin (e.g. payment numbers)
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(500), default="", nullable=False)


class Leader(db.Model):  # "Our Leadership" profiles
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    position = db.Column(db.String(120), nullable=False)
    bio = db.Column(db.Text, default="", nullable=False)
    photo_url = db.Column(db.String(500))
    sort_order = db.Column(db.Integer, default=0, nullable=False)
    i18n = db.Column(db.JSON)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "position": self.position, "bio": self.bio,
                "photo_url": self.photo_url, "sort_order": self.sort_order, "i18n": self.i18n or {}}


PAGES = {"who-we-are": "Who We Are", "where-we-stand": "Where We Stand", "leadership": "Our Leadership",
         "home-hero": "Waaberi Party"}

LANGS = ("so", "ar")  # extra languages; English lives in the main columns


def clean_i18n(d, fields):
    """Keep only Somali/Arabic text for the allowed fields."""
    raw, out = (d or {}).get("i18n") or {}, {}
    if not isinstance(raw, dict):
        return {}
    for lang in LANGS:
        vals = raw.get(lang) or {}
        if isinstance(vals, dict):
            kept = {f: str(vals[f]).strip() for f in fields if isinstance(vals.get(f), str) and vals[f].strip()}
            if kept:
                out[lang] = kept
    return out


def text_in_any(d, tr, field):
    """English value, or if that is empty, the Somali/Arabic one (used as the fallback text)."""
    v = (d.get(field) or "").strip()
    return v or next((tr[l][field] for l in LANGS if field in tr.get(l, {})), "")


NEW_COLUMNS = [  # (model, column, SQL type) added to existing databases on startup
    (Post, "i18n", "JSON"), (Page, "i18n", "JSON"), (Leader, "i18n", "JSON"),
    (Donation, "frequency", "VARCHAR(10) NOT NULL DEFAULT 'one_time'"),
    (Donation, "designation", "VARCHAR(10) NOT NULL DEFAULT 'general'"),
    (Donation, "target", "VARCHAR(200)"), (Donation, "campaign_id", "INTEGER"),
    (Donation, "email", "VARCHAR(255)"), (Donation, "anonymous", "BOOLEAN NOT NULL DEFAULT FALSE"),
    (Donation, "gateway", "VARCHAR(20)"), (Donation, "gateway_msg", "VARCHAR(200)"),
    (PartyMember, "password_hash", "VARCHAR(255)"), (PartyMember, "verification_token", "VARCHAR(32)"),
    (LoginAttempt, "kind", "VARCHAR(10) NOT NULL DEFAULT 'admin'"),
]


def add_missing_columns():
    """Small upgrade step so existing databases get new columns.
    Uses IF NOT EXISTS (not a pre-check) so concurrent gunicorn workers running this at boot can't race each other."""
    for model, col, sqltype in NEW_COLUMNS:
        t = model.__tablename__
        with db.engine.begin() as conn:
            conn.execute(text(f'ALTER TABLE "{t}" ADD COLUMN IF NOT EXISTS {col} {sqltype}'))

ROLES = {  # role -> permissions
    "super_admin": {"posts", "members", "messages", "donations", "users", "pages"},
    "editor": {"posts"},
    "finance": {"donations"},
    "membership": {"members", "messages"},
}


def me_dict(a):
    return {"id": a.id, "name": a.name, "email": a.email, "role": a.role,
            "permissions": sorted(ROLES.get(a.role, set()))}


def create_app():
    app = Flask(__name__)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=os.environ["DATABASE_URL"],
        SECRET_KEY=os.environ["SECRET_KEY"],
        MAX_CONTENT_LENGTH=5 * 1024 * 1024,  # 5 MB upload limit
        UPLOAD_DIR=os.environ.get("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")),
    )
    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)

    @app.errorhandler(413)
    def too_large(_):
        return jsonify(error="That file is too big. The limit is 5 MB."), 413
    CORS(app, origins=[os.environ.get("CORS_ORIGIN", "*")])
    db.init_app(app)

    with app.app_context():
        db.create_all()
        add_missing_columns()
        seed()

    def load_admin():
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        try:
            data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            if data.get("typ") != "admin":
                return None
            a = db.session.get(Admin, int(data["sub"]))
        except (jwt.PyJWTError, KeyError, ValueError):
            return None
        return a if a and a.is_active else None  # checked on every request, so deactivation is instant

    def load_member():
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        try:
            data = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
            if data.get("typ") != "member":
                return None
            m = db.session.get(PartyMember, int(data["sub"]))
        except (jwt.PyJWTError, KeyError, ValueError):
            return None
        return m if m and m.status == "approved" else None  # suspension/rejection revokes access instantly

    def member_required(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            member = load_member()
            if not member:
                return jsonify(error="Unauthorized"), 401
            g.member = member
            return fn(*a, **kw)
        return wrapper

    def needs(perm=None):
        def deco(fn):
            @wraps(fn)
            def wrapper(*a, **kw):
                admin = load_admin()
                if not admin:
                    return jsonify(error="Unauthorized"), 401
                if perm and perm not in ROLES.get(admin.role, set()):
                    return jsonify(error="You don’t have permission to do this."), 403
                g.admin = admin
                return fn(*a, **kw)
            return wrapper
        return deco

    admin_required = needs()  # any signed-in admin

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.get("/api/posts")
    def list_posts():
        q = Post.query.order_by(Post.published_at.desc())
        if kind := request.args.get("kind"):
            q = q.filter_by(kind=kind)
        return jsonify([p.to_dict() for p in q.limit(50)])

    @app.post("/api/posts")
    @needs("posts")
    def create_post():
        d = request.get_json(silent=True) or {}
        tr = clean_i18n(d, ("title", "summary"))
        title, summary = text_in_any(d, tr, "title"), text_in_any(d, tr, "summary")
        if d.get("kind") not in {"campaign", "news", "statement"} or not title or not summary:
            return jsonify(error="Enter a title and summary in at least one language."), 400
        p = Post(kind=d["kind"], title=title, summary=summary, image_url=d.get("image_url"), i18n=tr)
        db.session.add(p); db.session.commit()
        return jsonify(p.to_dict()), 201

    @app.delete("/api/posts/<int:pid>")
    @needs("posts")
    def delete_post(pid):
        db.session.delete(db.get_or_404(Post, pid)); db.session.commit()
        return "", 204

    @app.post("/api/members")
    def join():
        d = request.get_json(silent=True) or {}
        name, phone = (d.get("name") or "").strip(), (d.get("phone") or "").strip()
        if not name:
            return jsonify(error="Enter your name."), 400
        if not re.fullmatch(r"\+?[0-9 ()-]{7,20}", phone):
            return jsonify(error="Enter a valid phone number."), 400
        try:
            email = validate_email(d.get("email", ""), check_deliverability=False).normalized
        except EmailNotValidError:
            return jsonify(error="Enter a valid email address."), 400
        try:
            db.session.add(Member(name=name, phone=phone, email=email)); db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify(error="This email is already on the list."), 409
        return jsonify(ok=True), 201

    # ---------------- Geography ----------------
    GEO_LEVELS = {
        "countries": (Country, None, None),
        "states": (State, "country_id", Country),
        "regions": (Region, "state_id", State),
        "cities": (City, "region_id", Region),
        "districts": (District, "city_id", City),
    }

    @app.get("/api/geo/countries")
    def geo_countries():
        return jsonify([c.to_dict() for c in Country.query.order_by(Country.name)])

    @app.get("/api/geo/states")
    def geo_states():
        q = State.query.order_by(State.name)
        if cid := request.args.get("country_id"):
            q = q.filter_by(country_id=cid)
        return jsonify([s.to_dict() for s in q])

    @app.get("/api/geo/regions")
    def geo_regions():
        q = Region.query.order_by(Region.name)
        if sid := request.args.get("state_id"):
            q = q.filter_by(state_id=sid)
        return jsonify([r.to_dict() for r in q])

    @app.get("/api/geo/cities")
    def geo_cities():
        q = City.query.order_by(City.name)
        if rid := request.args.get("region_id"):
            q = q.filter_by(region_id=rid)
        return jsonify([c.to_dict() for c in q])

    @app.get("/api/geo/districts")
    def geo_districts():
        q = District.query.order_by(District.name)
        if cid := request.args.get("city_id"):
            q = q.filter_by(city_id=cid)
        return jsonify([d.to_dict() for d in q])

    @app.post("/api/admin/geo/<level>")
    @needs("members")
    def geo_create(level):
        spec = GEO_LEVELS.get(level)
        if not spec:
            return jsonify(error="Unknown geographic level."), 404
        Model, parent_field, ParentModel = spec
        d = request.get_json(silent=True) or {}
        name = (d.get("name") or "").strip()
        if not name:
            return jsonify(error="Enter a name."), 400
        kwargs = {"name": name}
        if parent_field:
            try:
                parent_id = int(d.get(parent_field))
            except (TypeError, ValueError):
                parent_id = None
            if not parent_id or not db.session.get(ParentModel, parent_id):
                return jsonify(error="Choose a valid parent area."), 400
            kwargs[parent_field] = parent_id
        x = Model(**kwargs)
        db.session.add(x); db.session.commit()
        return jsonify(x.to_dict()), 201

    @app.put("/api/admin/geo/<level>/<int:gid>")
    @needs("members")
    def geo_update(level, gid):
        spec = GEO_LEVELS.get(level)
        if not spec:
            return jsonify(error="Unknown geographic level."), 404
        Model, parent_field, ParentModel = spec
        x = db.get_or_404(Model, gid)
        d = request.get_json(silent=True) or {}
        name = (d.get("name") or "").strip()
        if not name:
            return jsonify(error="Enter a name."), 400
        x.name = name
        if parent_field and parent_field in d:
            try:
                parent_id = int(d.get(parent_field))
            except (TypeError, ValueError):
                parent_id = None
            if not parent_id or not db.session.get(ParentModel, parent_id):
                return jsonify(error="Choose a valid parent area."), 400
            setattr(x, parent_field, parent_id)
        db.session.commit()
        return jsonify(x.to_dict())

    @app.delete("/api/admin/geo/<level>/<int:gid>")
    @needs("members")
    def geo_delete(level, gid):
        spec = GEO_LEVELS.get(level)
        if not spec:
            return jsonify(error="Unknown geographic level."), 404
        Model = spec[0]
        try:
            db.session.delete(db.get_or_404(Model, gid)); db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify(error="Remove the areas inside this one first."), 409
        return "", 204

    def valid_location_chain(d):
        """Validate country/state/region/city[/district] form a real parent chain; return (ids, error)."""
        try:
            country_id, state_id = int(d.get("country_id")), int(d.get("state_id"))
            region_id, city_id = int(d.get("region_id")), int(d.get("city_id"))
        except (TypeError, ValueError):
            return None, "Choose your country, state, region and city."
        state, region, city = db.session.get(State, state_id), db.session.get(Region, region_id), db.session.get(City, city_id)
        if not (state and state.country_id == country_id):
            return None, "Choose a valid state for your country."
        if not (region and region.state_id == state_id):
            return None, "Choose a valid region for your state."
        if not (city and city.region_id == region_id):
            return None, "Choose a valid city for your region."
        district_id = None
        if d.get("district_id"):
            try:
                district_id = int(d["district_id"])
            except (TypeError, ValueError):
                return None, "Invalid district."
            district = db.session.get(District, district_id)
            if not (district and district.city_id == city_id):
                return None, "Choose a valid district for your city."
        return {"country_id": country_id, "state_id": state_id, "region_id": region_id,
                "city_id": city_id, "district_id": district_id}, None

    # ---------------- Party membership ----------------
    @app.post("/api/members/register")
    def register_member():
        d = request.get_json(silent=True) or {}
        first, last = (d.get("first_name") or "").strip(), (d.get("last_name") or "").strip()
        if not first or not last:
            return jsonify(error="Enter your first and last name."), 400
        phone = (d.get("phone") or "").strip()
        if not re.fullmatch(r"\+?[0-9 ()-]{7,20}", phone):
            return jsonify(error="Enter a valid phone number."), 400
        try:
            email = validate_email(d.get("email", ""), check_deliverability=False).normalized
        except EmailNotValidError:
            return jsonify(error="Enter a valid email address."), 400
        loc, err = valid_location_chain(d)
        if err:
            return jsonify(error=err), 400
        if not (d.get("agreed_to_terms") and d.get("consent_data_processing")):
            return jsonify(error="You must agree to the membership terms and consent to data processing."), 400
        dob = None
        if d.get("date_of_birth"):
            try:
                dob = dt.date.fromisoformat(d["date_of_birth"])
            except ValueError:
                return jsonify(error="Enter a valid date of birth."), 400
        m = PartyMember(first_name=first, last_name=last, middle_name=(d.get("middle_name") or "").strip() or None,
                        gender=(d.get("gender") or "").strip() or None, date_of_birth=dob, email=email, phone=phone,
                        alt_phone=(d.get("alt_phone") or "").strip() or None,
                        membership_type=(d.get("membership_type") or "").strip() or None,
                        occupation=(d.get("occupation") or "").strip() or None,
                        agreed_to_terms=True, consent_data_processing=True, **loc)
        try:
            db.session.add(m); db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify(error="An application with this email already exists."), 409
        return jsonify(id=m.id, status=m.status), 201

    @app.get("/api/admin/party-members")
    @needs("members")
    def party_members():
        q = PartyMember.query.order_by(PartyMember.id.desc())
        if status := request.args.get("status"):
            q = q.filter_by(status=status)
        return jsonify([m.to_dict() for m in q.limit(200)])

    @app.get("/api/admin/party-members/<int:mid>")
    @needs("members")
    def party_member_detail(mid):
        return jsonify(db.get_or_404(PartyMember, mid).to_dict())

    def set_member_status(mid, status):
        m = db.get_or_404(PartyMember, mid)
        m.status, m.reviewed_at, m.reviewed_by = status, dt.datetime.utcnow(), g.admin.id
        if status == "approved" and not m.membership_id:
            m.membership_id = f"WB-{dt.datetime.utcnow().year}-{m.id:06d}"
            m.verification_token = uuid.uuid4().hex
        db.session.commit()
        return m

    @app.post("/api/admin/party-members/<int:mid>/approve")
    @needs("members")
    def approve_member(mid):
        return jsonify(set_member_status(mid, "approved").to_dict())

    @app.post("/api/admin/party-members/<int:mid>/reject")
    @needs("members")
    def reject_member(mid):
        return jsonify(set_member_status(mid, "rejected").to_dict())

    @app.post("/api/admin/party-members/<int:mid>/suspend")
    @needs("members")
    def suspend_member(mid):
        return jsonify(set_member_status(mid, "suspended").to_dict())

    @app.post("/api/admin/party-members/<int:mid>/reactivate")
    @needs("members")
    def reactivate_member(mid):
        return jsonify(set_member_status(mid, "approved").to_dict())

    @app.put("/api/admin/party-members/<int:mid>/location")
    @needs("members")
    def update_member_location(mid):
        m = db.get_or_404(PartyMember, mid)
        d = request.get_json(silent=True) or {}
        reason = (d.get("reason") or "").strip()
        if not reason:
            return jsonify(error="Enter a reason for this location change."), 400
        loc, err = valid_location_chain(d)
        if err:
            return jsonify(error=err), 400
        db.session.add(MemberLocationHistory(
            member_id=m.id, old_region_id=m.region_id, new_region_id=loc["region_id"],
            old_city_id=m.city_id, new_city_id=loc["city_id"],
            old_district_id=m.district_id, new_district_id=loc["district_id"],
            reason=reason, changed_by=g.admin.id))
        m.country_id, m.state_id, m.region_id = loc["country_id"], loc["state_id"], loc["region_id"]
        m.city_id, m.district_id = loc["city_id"], loc["district_id"]
        db.session.commit()
        return jsonify(m.to_dict())

    @app.put("/api/admin/party-members/<int:mid>/set-password")
    @needs("members")
    def set_member_password(mid):
        m = db.get_or_404(PartyMember, mid)
        if m.status != "approved":
            return jsonify(error="Only approved members can have a portal password."), 400
        d = request.get_json(silent=True) or {}
        pw = d.get("password") or ""
        if len(pw) < 10:
            return jsonify(error="Password must be at least 10 characters."), 400
        m.password_hash = generate_password_hash(pw)
        db.session.commit()
        return jsonify(m.to_dict())

    @app.post("/api/members/login")
    def member_login():
        d = request.get_json(silent=True) or {}
        email = (d.get("email") or "").strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        if login_rate_limited(email, "member"):
            return jsonify(error="Too many attempts. Wait 15 minutes and try again."), 429
        m = PartyMember.query.filter_by(email=email).first()
        ok = bool(m and m.status == "approved" and m.password_hash
                  and check_password_hash(m.password_hash, d.get("password", "")))
        db.session.add(LoginAttempt(email=email, ip=ip, success=ok, kind="member")); db.session.commit()
        if not ok:
            return jsonify(error="Wrong email or password."), 401
        token = jwt.encode({"sub": str(m.id), "typ": "member", "exp": dt.datetime.utcnow() + dt.timedelta(hours=8)},
                           app.config["SECRET_KEY"], algorithm="HS256")
        return jsonify(token=token, member=m.to_dict())

    def location_names(m):
        nm = lambda Model, id_: db.session.get(Model, id_).name if id_ else None
        return {"country_name": nm(Country, m.country_id), "state_name": nm(State, m.state_id),
                "region_name": nm(Region, m.region_id), "city_name": nm(City, m.city_id),
                "district_name": nm(District, m.district_id)}

    @app.get("/api/members/me")
    @member_required
    def member_me():
        return jsonify({**g.member.to_dict(), **location_names(g.member)})

    @app.put("/api/members/me")
    @member_required
    def member_update_me():
        m, d = g.member, (request.get_json(silent=True) or {})
        m.alt_phone = (d.get("alt_phone") or "").strip() or None
        m.occupation = (d.get("occupation") or "").strip() or None
        m.membership_type = (d.get("membership_type") or "").strip() or None
        m.photo_url = (d.get("photo_url") or "").strip() or None
        db.session.commit()
        return jsonify(m.to_dict())

    @app.post("/api/members/me/change-password")
    @member_required
    def member_change_password():
        m, d = g.member, (request.get_json(silent=True) or {})
        if not (m.password_hash and check_password_hash(m.password_hash, d.get("current_password", ""))):
            return jsonify(error="Your current password is incorrect."), 400
        new_pw = d.get("new_password") or ""
        if len(new_pw) < 10:
            return jsonify(error="New password must be at least 10 characters."), 400
        m.password_hash = generate_password_hash(new_pw)
        db.session.commit()
        return jsonify(ok=True)

    @app.get("/api/members/me/card")
    @member_required
    def member_card():
        m = g.member
        url = f"{request.host_url.rstrip('/')}/verify/{m.verification_token}"
        img = qrcode.make(url, image_factory=qrcode.image.svg.SvgImage)
        buf = BytesIO(); img.save(buf)
        return jsonify(**m.to_dict(), **location_names(m), qr_svg=buf.getvalue().decode("utf-8"))

    @app.get("/api/members/verify/<token>")
    def member_verify(token):
        m = PartyMember.query.filter_by(verification_token=token).first()
        if not m:
            return jsonify(error="Not found."), 404
        return jsonify(name=f"{m.first_name} {m.last_name}", membership_id=m.membership_id,
                       status=m.status, photo_url=m.photo_url)

    @app.post("/api/contact")
    def contact():
        d = request.get_json(silent=True) or {}
        if not all((d.get(k) or "").strip() for k in ("name", "email", "body")):
            return jsonify(error="Name, email and message are required."), 400
        db.session.add(Message(name=d["name"], email=d["email"], body=d["body"])); db.session.commit()
        return jsonify(ok=True), 201

    def login_rate_limited(email, kind):
        recent = dt.datetime.utcnow() - dt.timedelta(minutes=15)
        fails = LoginAttempt.query.filter(LoginAttempt.email == email, LoginAttempt.kind == kind,
                                          LoginAttempt.success.is_(False), LoginAttempt.created_at > recent).count()
        return fails >= 5

    @app.post("/api/auth/login")
    def login():
        d = request.get_json(silent=True) or {}
        email = (d.get("email") or "").strip().lower()
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        if login_rate_limited(email, "admin"):
            return jsonify(error="Too many attempts. Wait 15 minutes and try again."), 429
        a = Admin.query.filter_by(email=email).first()
        ok = bool(a and a.is_active and check_password_hash(a.password_hash, d.get("password", "")))
        db.session.add(LoginAttempt(email=email, ip=ip, success=ok, kind="admin")); db.session.commit()
        if not ok:
            return jsonify(error="Wrong email or password."), 401
        token = jwt.encode({"sub": str(a.id), "typ": "admin", "exp": dt.datetime.utcnow() + dt.timedelta(hours=8)},
                           app.config["SECRET_KEY"], algorithm="HS256")
        return jsonify(token=token, user=me_dict(a))

    @app.get("/api/members")
    @needs("members")
    def members():
        return jsonify([{"id": m.id, "name": m.name, "phone": m.phone, "email": m.email,
                         "created_at": m.created_at.isoformat()} for m in Member.query.order_by(Member.id.desc())])

    @app.put("/api/posts/<int:pid>")
    @needs("posts")
    def update_post(pid):
        p, d = db.get_or_404(Post, pid), (request.get_json(silent=True) or {})
        tr = clean_i18n(d, ("title", "summary"))
        title, summary = text_in_any(d, tr, "title"), text_in_any(d, tr, "summary")
        if d.get("kind") not in {"campaign", "news", "statement"} or not title or not summary:
            return jsonify(error="Enter a title and summary in at least one language."), 400
        p.kind, p.title, p.summary, p.i18n = d["kind"], title, summary, tr
        p.image_url = d.get("image_url") or None
        db.session.commit()
        return jsonify(p.to_dict())

    @app.delete("/api/members/<int:mid>")
    @needs("members")
    def delete_member(mid):
        db.session.delete(db.get_or_404(Member, mid)); db.session.commit()
        return "", 204

    @app.get("/api/messages")
    @needs("messages")
    def messages():
        return jsonify([{"id": m.id, "name": m.name, "email": m.email, "body": m.body,
                         "is_read": m.is_read, "created_at": m.created_at.isoformat()}
                        for m in Message.query.order_by(Message.id.desc())])

    @app.patch("/api/messages/<int:mid>")
    @needs("messages")
    def toggle_message(mid):
        m = db.get_or_404(Message, mid); m.is_read = not m.is_read; db.session.commit()
        return jsonify(is_read=m.is_read)

    @app.delete("/api/messages/<int:mid>")
    @needs("messages")
    def delete_message(mid):
        db.session.delete(db.get_or_404(Message, mid)); db.session.commit()
        return "", 204

    @app.get("/api/admin/stats")
    @admin_required
    def stats():
        can, out = ROLES.get(g.admin.role, set()), {}
        if "members" in can:
            out["members"] = Member.query.count()
        if "messages" in can:
            out["unread"] = Message.query.filter_by(is_read=False).count()
        if "posts" in can:
            out["campaigns"] = Post.query.filter_by(kind="campaign").count()
            out["news"] = Post.query.filter(Post.kind != "campaign").count()
        if "donations" in can:
            out["raised"] = float(db.session.query(db.func.coalesce(db.func.sum(Donation.amount), 0)).filter_by(status="confirmed").scalar())
        return jsonify(out)

    # ---------------- Donations ----------------
    def amount_from(d):
        try:
            a = round(float(d.get("amount")), 2)
        except (TypeError, ValueError):
            return None
        return a if 1 <= a <= 10000 else None

    def pp_base():
        return "https://api-m.paypal.com" if os.environ.get("PAYPAL_ENV") == "live" else "https://api-m.sandbox.paypal.com"

    def pp_headers():
        r = requests.post(pp_base() + "/v1/oauth2/token", timeout=15, data={"grant_type": "client_credentials"},
                          auth=(os.environ["PAYPAL_CLIENT_ID"], os.environ["PAYPAL_SECRET"]))
        r.raise_for_status()
        return {"Authorization": "Bearer " + r.json()["access_token"], "Content-Type": "application/json"}

    def regions():
        raw = os.environ.get("DONATION_REGIONS", "Puntland,Banadir,Jubaland,South West,Hirshabelle,Galmudug,Diaspora")
        return [r.strip() for r in raw.split(",") if r.strip()]

    def gift_from(d):
        """Validate the shared donation choices. Returns (fields, error)."""
        freq = d.get("frequency") or "one_time"
        if freq not in {"one_time", "monthly"}:
            return None, "Choose one-time or monthly."
        desig, target, cid = d.get("designation") or "general", None, None
        if desig == "campaign":
            try:
                c = db.session.get(Post, int(d.get("campaign_id")))
            except (TypeError, ValueError):
                c = None
            if not c or c.kind != "campaign":
                return None, "Choose a campaign."
            target, cid = c.title, c.id
        elif desig == "region":
            target = (d.get("region") or "").strip()
            if target not in regions():
                return None, "Choose a region."
        elif desig != "general":
            return None, "Choose where your gift should go."
        anonymous = bool(d.get("anonymous"))
        name = (d.get("name") or "").strip()[:120]
        if not name and not anonymous:
            return None, "Enter your name."
        email = (d.get("email") or "").strip()
        if email:
            try:
                email = validate_email(email, check_deliverability=False).normalized
            except EmailNotValidError:
                return None, "Enter a valid email address."
        return dict(frequency=freq, designation=desig, target=target, campaign_id=cid, anonymous=anonymous,
                    donor_name=name or "Anonymous", email=email or None), None

    def setting(key):
        """Admin-entered value first, then .env. Placeholders like "+252 90 XXX XXXX" count as not set up."""
        row = db.session.get(Setting, key)
        v = (row.value if row and row.value.strip() else os.environ.get(key, "")).strip()
        return "" if "XXX" in v.upper() else v


    @app.get("/api/donate/config")
    def donate_config():
        return jsonify(evc_number=setting("EVC_NUMBER"), sahal_number=setting("SAHAL_NUMBER"),
                       paypal_client_id=setting("PAYPAL_CLIENT_ID"), currency="USD", regions=regions(), waafi=waafi_ready(), waafi_demo=waafi_demo())

    # ---------------- WaafiPay: phone prompt (USSD) for Hormuud EVC Plus & Golis Sahal ----------------
    def waafi_keys():
        return all(os.environ.get(k, "").strip() for k in ("WAAFI_MERCHANT_UID", "WAAFI_API_USER_ID", "WAAFI_API_KEY"))

    def waafi_demo():
        """Demo = simulate WaafiPay, no money moves. On when WAAFI_ENV=demo, or when no keys and no WAAFI_ENV are set."""
        env = os.environ.get("WAAFI_ENV", "").strip().lower()
        return env == "demo" or (not env and not waafi_keys())

    def waafi_ready():
        return waafi_demo() or waafi_keys()

    def waafi_mode():
        return "demo" if waafi_demo() else ("live" if os.environ.get("WAAFI_ENV") == "live" else "sandbox") if waafi_ready() else "off"

    def waafi_url():
        if os.environ.get("WAAFI_URL"):  # optional override (e.g. a local test server)
            return os.environ["WAAFI_URL"]
        return "https://api.waafipay.net/asm" if os.environ.get("WAAFI_ENV") == "live" else "https://sandbox.waafipay.net/asm"

    def wallet_number(phone):
        """Normalise to the 252XXXXXXXXX format WaafiPay expects."""
        n = re.sub(r"\D", "", phone or "")
        if n.startswith("00"):
            n = n[2:]
        if n.startswith("0"):
            n = "252" + n[1:]
        if len(n) == 9:
            n = "252" + n
        return n if re.fullmatch(r"252\d{9}", n) else None

    @app.post("/api/donations/waafi")
    def donate_waafi():
        d = request.get_json(silent=True) or {}
        if not waafi_ready():
            return jsonify(error="Phone payments are not available yet."), 503
        if d.get("method") not in {"evc", "sahal"}:
            return jsonify(error="Choose a payment method."), 400
        amount = amount_from(d)
        if amount is None:
            return jsonify(error="Enter an amount between $1 and $10,000."), 400
        gift, err = gift_from(d)
        if err:
            return jsonify(error=err), 400
        acct = wallet_number(d.get("phone"))
        if not acct:
            return jsonify(error="Enter your mobile money number, e.g. 61 234 5678."), 400
        wallet = d["method"]
        if wallet == "sahal" and not acct.startswith("2529"):
            return jsonify(error="Enter a Golis Sahal number (starts with 90)."), 400
        if wallet == "evc" and acct.startswith("2529"):
            return jsonify(error="This looks like a Sahal number. Choose Golis Sahal instead."), 400
        recent = dt.datetime.utcnow() - dt.timedelta(minutes=2)
        if Donation.query.filter(Donation.phone == acct, Donation.gateway == "waafipay", Donation.created_at > recent).count() >= 3:
            return jsonify(error="Too many requests for this number. Wait a couple of minutes and try again."), 429

        if waafi_demo():  # pretend the donor approved on their phone (numbers ending 0000 = declined)
            x = Donation(method=wallet, amount=amount, phone=acct, gateway="demo", status="pending", **gift)
            db.session.add(x); db.session.commit()
            time.sleep(3)
            if acct.endswith("0000"):
                x.status, x.gateway_msg = "rejected", "DEMO: declined on phone"
                db.session.commit()
                return jsonify(status="failed", id=x.id, error="The payment was not approved. Check your balance and PIN, then try again."), 402
            x.status, x.reference, x.gateway_msg = "test", f"DEMO-{x.id}", "DEMO: approved (no money moved)"
            db.session.commit()
            return jsonify(status="confirmed", demo=True, id=x.id, transaction_id=x.reference), 201

        x = Donation(method=wallet, amount=amount, phone=acct, gateway="waafipay", status="pending", **gift)
        db.session.add(x); db.session.commit()
        what = f"Waaberi donation - {gift['target'] or 'General Fund'}"[:100]
        body = {
            "schemaVersion": "1.0", "requestId": f"wb{x.id}{uuid.uuid4().hex[:8]}",
            "timestamp": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), "channelName": "WEB",
            "serviceName": "API_PURCHASE",
            "serviceParams": {
                "merchantUid": os.environ["WAAFI_MERCHANT_UID"], "apiUserId": os.environ["WAAFI_API_USER_ID"],
                "apiKey": os.environ["WAAFI_API_KEY"], "paymentMethod": "MWALLET_ACCOUNT",
                "payerInfo": {"accountNo": acct},
                "transactionInfo": {"referenceId": f"WB-{x.id}", "invoiceId": f"WB-{x.id}", "amount": f"{amount:.2f}",
                                    "currency": "USD", "description": what},
            },
        }
        try:  # WaafiPay waits here while the donor approves the prompt on their phone
            r = requests.post(waafi_url(), json=body, timeout=95)
            res = r.json()
        except (requests.RequestException, ValueError):
            x.gateway_msg = "No answer from WaafiPay (timeout or network error)"
            db.session.commit()
            return jsonify(status="pending", id=x.id), 202
        params = res.get("params") or {}
        ok = str(res.get("responseCode")) == "2001" and str(params.get("state", "APPROVED")).upper() == "APPROVED"
        x.gateway_msg = f"{res.get('responseCode')} {res.get('responseMsg') or ''} {params.get('state') or ''}".strip()[:200]
        if ok:
            x.status, x.reference = "confirmed", str(params.get("transactionId") or params.get("referenceId") or f"WB-{x.id}")[:100]
            db.session.commit()
            return jsonify(status="confirmed", id=x.id, transaction_id=x.reference), 201
        x.status = "rejected"
        db.session.commit()
        return jsonify(status="failed", id=x.id, error="The payment was not approved. Check your balance and PIN, then try again."), 402

    @app.post("/api/donations/paypal/order")
    def paypal_order():
        d = request.get_json(silent=True) or {}
        amount = amount_from(d)
        if amount is None:
            return jsonify(error="Enter an amount between $1 and $10,000."), 400
        if d.get("frequency") == "monthly":
            return jsonify(error="Monthly giving is available with mobile money. Card payments are one-time."), 400
        if not os.environ.get("PAYPAL_CLIENT_ID"):
            return jsonify(error="PayPal is not available yet."), 503
        try:
            r = requests.post(pp_base() + "/v2/checkout/orders", headers=pp_headers(), timeout=15, json={
                "intent": "CAPTURE",
                "purchase_units": [{"description": "Donation to Waaberi Party",
                                    "amount": {"currency_code": "USD", "value": f"{amount:.2f}"}}]})
            r.raise_for_status()
        except requests.RequestException:
            return jsonify(error="Could not reach PayPal. Try again."), 502
        return jsonify(id=r.json()["id"])

    @app.post("/api/donations/paypal/capture")
    def paypal_capture():
        d = request.get_json(silent=True) or {}
        oid = d.get("order_id") or ""
        if not oid:
            return jsonify(error="Missing order."), 400
        if Donation.query.filter_by(paypal_order_id=oid).first():
            return jsonify(ok=True)
        gift, err = gift_from({**d, "frequency": "one_time", "name": (d.get("name") or "").strip() or "PayPal donor"})
        if err:
            return jsonify(error=err), 400
        try:
            r = requests.post(f"{pp_base()}/v2/checkout/orders/{oid}/capture", headers=pp_headers(), timeout=15)
            r.raise_for_status()
            cap = r.json()["purchase_units"][0]["payments"]["captures"][0]
        except (requests.RequestException, KeyError, IndexError):
            return jsonify(error="PayPal could not complete the payment."), 502
        if cap.get("status") != "COMPLETED":
            return jsonify(error="Payment is pending. We’ll confirm it shortly."), 202
        payer = r.json().get("payer", {})
        pname = f"{payer.get('name', {}).get('given_name', '')} {payer.get('name', {}).get('surname', '')}".strip()
        if gift["donor_name"] == "PayPal donor" and pname:
            gift["donor_name"] = pname  # kept for records; the anonymous flag still applies
        gift["email"] = gift["email"] or payer.get("email_address")
        db.session.add(Donation(method="paypal", amount=cap["amount"]["value"], currency=cap["amount"]["currency_code"],
                                paypal_order_id=oid, status="confirmed", **gift))
        db.session.commit()
        return jsonify(ok=True), 201

    @app.get("/api/donations")
    @needs("donations")
    def donations():
        return jsonify([x.to_dict() for x in Donation.query.order_by(Donation.id.desc()).limit(500)])

    # ---------------- Image uploads ----------------
    def image_ext(head):  # check the file's real type from its first bytes, not its name
        if head.startswith(b"\x89PNG\r\n\x1a\n"): return "png"
        if head.startswith(b"\xff\xd8\xff"): return "jpg"
        if head[:6] in (b"GIF87a", b"GIF89a"): return "gif"
        if head[:4] == b"RIFF" and head[8:12] == b"WEBP": return "webp"
        return None

    @app.post("/api/uploads")
    @admin_required
    def upload():
        if not ({"posts", "pages"} & ROLES.get(g.admin.role, set())):
            return jsonify(error="You don’t have permission to do this."), 403
        f = request.files.get("file")
        if not f:
            return jsonify(error="Choose an image to upload."), 400
        ext = image_ext(f.stream.read(12)); f.stream.seek(0)
        if not ext:
            return jsonify(error="Upload a JPG, PNG, WebP or GIF image."), 400
        name = f"{uuid.uuid4().hex}.{ext}"
        f.save(os.path.join(app.config["UPLOAD_DIR"], name))
        return jsonify(url=f"/api/uploads/{name}"), 201

    @app.get("/api/uploads/<name>")
    def uploaded(name):
        if not re.fullmatch(r"[0-9a-f]{32}\.(png|jpg|gif|webp)", name):
            return jsonify(error="Not found."), 404
        r = send_from_directory(app.config["UPLOAD_DIR"], name, max_age=31536000)
        r.headers["X-Content-Type-Options"] = "nosniff"
        return r

    # ---------------- Site pages & leadership ----------------
    @app.get("/api/pages/<slug>")
    def get_page(slug):
        if slug not in PAGES:
            return jsonify(error="Page not found."), 404
        return jsonify(db.get_or_404(Page, slug).to_dict())

    @app.put("/api/pages/<slug>")
    @needs("pages")
    def update_page(slug):
        if slug not in PAGES:
            return jsonify(error="Page not found."), 404
        p, d = db.get_or_404(Page, slug), (request.get_json(silent=True) or {})
        tr = clean_i18n(d, ("title", "intro", "body"))
        title = text_in_any(d, tr, "title")
        if not title:
            return jsonify(error="Enter a page title in at least one language."), 400
        p.title, p.intro, p.body, p.i18n = title, text_in_any(d, tr, "intro"), text_in_any(d, tr, "body"), tr
        p.image_url = (d.get("image_url") or "").strip() or None
        db.session.commit()
        return jsonify(p.to_dict())

    @app.get("/api/leaders")
    def list_leaders():
        return jsonify([x.to_dict() for x in Leader.query.order_by(Leader.sort_order, Leader.id)])

    def leader_from(x, d):
        tr = clean_i18n(d, ("position", "bio"))
        name, position = (d.get("name") or "").strip(), text_in_any(d, tr, "position")
        if not name or not position:
            return "Enter a name, and a position in at least one language."
        try:
            order = int(d.get("sort_order") or 0)
        except (TypeError, ValueError):
            return "Order must be a number."
        x.name, x.position, x.sort_order = name, position, order
        x.bio, x.i18n = text_in_any(d, tr, "bio"), tr
        x.photo_url = (d.get("photo_url") or "").strip() or None
        return None

    @app.post("/api/leaders")
    @needs("pages")
    def create_leader():
        x = Leader()
        if err := leader_from(x, request.get_json(silent=True) or {}):
            return jsonify(error=err), 400
        db.session.add(x); db.session.commit()
        return jsonify(x.to_dict()), 201

    @app.put("/api/leaders/<int:lid>")
    @needs("pages")
    def update_leader(lid):
        x = db.get_or_404(Leader, lid)
        if err := leader_from(x, request.get_json(silent=True) or {}):
            return jsonify(error=err), 400
        db.session.commit()
        return jsonify(x.to_dict())

    @app.delete("/api/leaders/<int:lid>")
    @needs("pages")
    def delete_leader(lid):
        db.session.delete(db.get_or_404(Leader, lid)); db.session.commit()
        return "", 204

    # ---------------- Payment settings (Super admin & Finance) ----------------
    PAY_KEYS = ("EVC_NUMBER",)

    @app.get("/api/admin/settings")
    @needs("donations")
    def get_settings():
        return jsonify({k: setting(k) for k in PAY_KEYS} | {"paypal_ready": bool(setting("PAYPAL_CLIENT_ID") and setting("PAYPAL_SECRET")),
                                                          "paypal_env": os.environ.get("PAYPAL_ENV", "sandbox"),
                                                          "waafi_ready": waafi_ready(), "waafi_mode": waafi_mode()})

    @app.put("/api/admin/settings")
    @needs("donations")
    def put_settings():
        d = request.get_json(silent=True) or {}
        for k in PAY_KEYS:
            if k not in d:
                continue
            v = (d.get(k) or "").strip()
            if v and not re.fullmatch(r"[+0-9 ()*#-]{3,30}", v):
                return jsonify(error="Use only digits, spaces and + ( ) - * # in the numbers."), 400
            row = db.session.get(Setting, k) or Setting(key=k)
            row.value = v
            db.session.add(row)
        db.session.commit()
        return get_settings()

    # ---------------- Team & roles ----------------
    @app.get("/api/auth/me")
    @admin_required
    def me():
        return jsonify(me_dict(g.admin))

    @app.get("/api/admin/users")
    @needs("users")
    def list_users():
        return jsonify([{**me_dict(u), "is_active": u.is_active} for u in Admin.query.order_by(Admin.id)])

    @app.post("/api/admin/users")
    @needs("users")
    def create_user():
        d = request.get_json(silent=True) or {}
        name, pw = (d.get("name") or "").strip(), d.get("password") or ""
        if not name:
            return jsonify(error="Enter a name."), 400
        if d.get("role") not in ROLES:
            return jsonify(error="Choose a role."), 400
        if len(pw) < 10:
            return jsonify(error="Password must be at least 10 characters."), 400
        try:
            email = validate_email(d.get("email", ""), check_deliverability=False).normalized
        except EmailNotValidError:
            return jsonify(error="Enter a valid email address."), 400
        if Admin.query.filter_by(email=email).first():
            return jsonify(error="That email already has an account."), 409
        u = Admin(name=name, email=email, role=d["role"], password_hash=generate_password_hash(pw))
        db.session.add(u); db.session.commit()
        return jsonify({**me_dict(u), "is_active": True}), 201

    @app.patch("/api/admin/users/<int:uid>")
    @needs("users")
    def update_user(uid):
        u, d = db.get_or_404(Admin, uid), (request.get_json(silent=True) or {})
        if u.id == g.admin.id and ("role" in d or "is_active" in d):
            return jsonify(error="You can’t change your own role or status."), 400
        if "role" in d:
            if d["role"] not in ROLES:
                return jsonify(error="Invalid role."), 400
            u.role = d["role"]
        if "is_active" in d:
            u.is_active = bool(d["is_active"])
        if d.get("password"):
            if len(d["password"]) < 10:
                return jsonify(error="Password must be at least 10 characters."), 400
            u.password_hash = generate_password_hash(d["password"])
        if not Admin.query.filter_by(role="super_admin", is_active=True).count():
            db.session.rollback()
            return jsonify(error="At least one active super admin is required."), 400
        db.session.commit()
        return jsonify({**me_dict(u), "is_active": u.is_active})

    @app.get("/api/admin/login-activity")
    @needs("users")
    def login_activity():
        return jsonify([{"email": x.email, "ip": x.ip, "success": x.success, "created_at": x.created_at.isoformat()}
                        for x in LoginAttempt.query.filter_by(kind="admin").order_by(LoginAttempt.id.desc()).limit(50)])

    return app


CAMPAIGNS = [
    ("Education for Every Child",
     "An initiative to promote access to quality education across Puntland and Somalia, especially for girls.",
     {"so": {"title": "Waxbarasho Ilmo Kasta",
             "summary": "Hindise lagu horumarinayo helitaanka waxbarasho tayo leh guud ahaan Puntland iyo Soomaaliya, gaar ahaan gabdhaha."},
      "ar": {"title": "التعليم لكل طفل",
             "summary": "مبادرة لتعزيز الوصول إلى تعليم جيد في بونتلاند والصومال، وخاصة للفتيات."}}),
    ("Clean Leadership Drive",
     "Promoting transparency, accountability, and ethical leadership from local councils to national offices.",
     {"so": {"title": "Ololaha Hoggaan Daahir ah",
             "summary": "Kor u qaadista daah-furnaanta, isla xisaabtanka iyo hoggaan anshax leh, laga bilaabo golayaasha deegaanka ilaa xafiisyada qaranka."},
      "ar": {"title": "حملة القيادة النزيهة",
             "summary": "تعزيز الشفافية والمساءلة والقيادة الأخلاقية من المجالس المحلية إلى المناصب الوطنية."}}),
    ("Peace and Unity Forums",
     "Dialogue forums bringing together elders, youth, and civic leaders to strengthen peace and national identity.",
     {"so": {"title": "Madasha Nabadda iyo Midnimada",
             "summary": "Madallo wada-hadal oo isu keenaya odayaasha, dhallinyarada iyo hoggaamiyeyaasha bulshada si loo xoojiyo nabadda iyo aqoonsiga qaranka."},
      "ar": {"title": "منتديات السلام والوحدة",
             "summary": "منتديات حوار تجمع الشيوخ والشباب وقادة المجتمع المدني لتعزيز السلام والهوية الوطنية."}}),
]

PAGE_DEFAULTS = {
    "who-we-are": ("WAABERI is a national political party born from the hopes of the Somali people: a vision of renewal, unity, and progress.", "",
                   {"so": {"title": "Yaa Nahay", "intro": "WAABERI waa xisbi siyaasadeed qaran oo ka dhashay rajada shacabka Soomaaliyeed: aragti dib-u-cusboonaysiin, midnimo iyo horumar."},
                    "ar": {"title": "من نحن", "intro": "وابيري حزب سياسي وطني وُلد من آمال الشعب الصومالي: رؤية للتجديد والوحدة والتقدم."}}),
    "where-we-stand": ("Our positions on the issues that matter most to Somalis.",
                       "Education\nQuality schooling for every child, especially girls.\n\nGood governance\nTransparent, accountable institutions people can trust.\n\nPeace and unity\nDialogue that brings communities together.\n\nEconomy\nJobs and opportunity for young people.",
                       {"so": {"title": "Halka Aan Taaganahay", "intro": "Mawqifyadayada arrimaha ugu muhiimsan Soomaalida.",
                               "body": "Waxbarasho\nWaxbarasho tayo leh oo ilmo kasta helo, gaar ahaan gabdhaha.\n\nMaamul wanaag\nHay'ado daah-furan oo la isla xisaabin karo, dadkuna ku kalsoonaan karaan.\n\nNabad iyo midnimo\nWada-hadal isu keena bulshooyinka.\n\nDhaqaale\nShaqo iyo fursado loogu talagalay dhallinyarada."},
                        "ar": {"title": "مواقفنا", "intro": "مواقفنا من القضايا الأكثر أهمية للصوماليين.",
                               "body": "التعليم\nتعليم جيد لكل طفل، وخاصة الفتيات.\n\nالحكم الرشيد\nمؤسسات شفافة وخاضعة للمساءلة يثق بها الناس.\n\nالسلام والوحدة\nحوار يجمع المجتمعات معًا.\n\nالاقتصاد\nوظائف وفرص للشباب."}}),
    "leadership": ("Meet the people leading the Waaberi movement.", "",
                   {"so": {"title": "Hoggaankeena", "intro": "La kulan dadka hoggaaminaya dhaqdhaqaaqa Waaberi."},
                    "ar": {"title": "قيادتنا", "intro": "تعرّف على الأشخاص الذين يقودون حركة وابيري."}}),
    "home-hero": ("New Dawn for Somalia",
                  "Building a united, peaceful, and democratic nation through integrity, education, and good governance.",
                  {"so": {"title": "Xisbiga Waaberi", "intro": "Waaberi Cusub oo Soomaaliya ah",
                          "body": "Dhisidda qaran midaysan, nabad ah oo dimuqraadi ah, iyadoo lagu salaynayo daacadnimo, waxbarasho iyo maamul wanaag."},
                   "ar": {"title": "حزب وابيري", "intro": "فجر جديد للصومال",
                          "body": "نبني أمة موحدة ومسالمة وديمقراطية من خلال النزاهة والتعليم والحكم الرشيد."}}),
}


def seed():
    if not Admin.query.first():
        db.session.add(Admin(email=os.environ["ADMIN_EMAIL"],
                             password_hash=generate_password_hash(os.environ["ADMIN_PASSWORD"])))
    if not Post.query.filter_by(kind="campaign").first():
        db.session.add_all([Post(kind="campaign", title=t, summary=s, i18n=tr) for t, s, tr in CAMPAIGNS])
    else:  # add translations to the original sample campaigns if they are unchanged
        for t, s, tr in CAMPAIGNS:
            p = Post.query.filter_by(kind="campaign", title=t, summary=s).first()
            if p and not p.i18n:
                p.i18n = tr
    for slug, title in PAGES.items():
        intro, body, tr = PAGE_DEFAULTS[slug]
        p = db.session.get(Page, slug)
        if not p:
            db.session.add(Page(slug=slug, title=title, intro=intro, body=body, i18n=tr))
        elif not p.i18n and p.title == title and p.intro == intro and p.body == body:
            p.i18n = tr
    db.session.commit()


if __name__ == "__main__":
    create_app().run(debug=True, port=5000)
