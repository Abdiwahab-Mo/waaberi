"""WaafiPay (Hormuud EVC Plus) donation flow, with the gateway mocked. No real API is called."""
import time
from unittest import mock

import pytest

import app as appmod

BODY = {"method": "evc", "amount": 5, "phone": "61 551 5230", "name": "Test Donor"}
OK = {"responseCode": "2001", "responseMsg": "RCS_SUCCESS", "params": {"state": "APPROVED", "transactionId": "T9"}}


@pytest.fixture()
def client(monkeypatch):
    for k, v in dict(DATABASE_URL="sqlite://", SECRET_KEY="test", ADMIN_EMAIL="a@example.com", ADMIN_PASSWORD="x",
                     WAAFI_ENV="sandbox", WAAFI_MERCHANT_UID="M1", WAAFI_API_USER_ID="U1", WAAFI_API_KEY="K1").items():
        monkeypatch.setenv(k, v)
    monkeypatch.delenv("WAAFI_URL", raising=False)
    monkeypatch.setattr(appmod, "add_missing_columns", lambda: None)  # Postgres-only ALTER ... IF NOT EXISTS
    monkeypatch.setattr(appmod, "generate_password_hash", lambda p: "x")  # system Python may lack hashlib.scrypt
    app = appmod.create_app()
    with app.app_context():
        yield app.test_client()
        appmod.db.session.remove(); appmod.db.drop_all()


def gateway(payload=None, **kw):
    resp = mock.Mock(); resp.json.return_value = payload
    return mock.patch.object(appmod.requests, "post", return_value=resp, **kw)


def donations():
    return appmod.Donation.query.all()


def test_request_matches_hormuud_format_and_confirms(client):
    before = time.time()
    with gateway(OK) as post:
        r = client.post("/api/donations/waafi", json=BODY)
    assert r.status_code == 201 and r.get_json()["transaction_id"] == "T9"
    sent = post.call_args.kwargs["json"]
    assert before - 1 <= sent["timestamp"] <= time.time() + 1  # epoch seconds, not ms
    assert sent["serviceName"] == "API_PURCHASE" and sent["channelName"] == "WEB"
    sp = sent["serviceParams"]
    assert sp["paymentMethod"] == "MWALLET_ACCOUNT" and sp["payerInfo"] == {"accountNo": "252615515230"}
    assert sp["transactionInfo"]["amount"] == "5.00" and sp["transactionInfo"]["currency"] == "USD"
    assert post.call_args.args[0] == "https://sandbox.waafipay.net/asm"
    (d,) = donations()
    assert (d.status, d.reference, d.method, d.gateway) == ("confirmed", "T9", "evc", "waafipay")


def test_declined_is_rejected(client):
    with gateway({"responseCode": "5310", "responseMsg": "RCS_USER_REJECTED", "params": {}}):
        r = client.post("/api/donations/waafi", json=BODY)
    assert r.status_code == 402 and r.get_json()["status"] == "failed"
    assert [d.status for d in donations()] == ["rejected"]


def test_2001_but_not_approved_is_rejected(client):
    with gateway({"responseCode": "2001", "params": {"state": "PENDING"}}):
        r = client.post("/api/donations/waafi", json=BODY)
    assert r.status_code == 402 and [d.status for d in donations()] == ["rejected"]


@pytest.mark.parametrize("exc", [appmod.requests.Timeout(), appmod.requests.ConnectionError()])
def test_network_failure_stays_pending(client, exc):
    with gateway(side_effect=exc):
        r = client.post("/api/donations/waafi", json=BODY)
    assert r.status_code == 202 and r.get_json()["status"] == "pending"
    (d,) = donations()
    assert d.status == "pending" and d.gateway_msg


def test_non_json_reply_stays_pending(client):
    resp = mock.Mock(); resp.json.side_effect = ValueError()
    with mock.patch.object(appmod.requests, "post", return_value=resp):
        r = client.post("/api/donations/waafi", json=BODY)
    assert r.status_code == 202 and [d.status for d in donations()] == ["pending"]


@pytest.mark.parametrize("change", [{"amount": 0}, {"phone": "12"}, {"phone": "90 123 4567"}, {"method": "x"}])
def test_bad_input_never_reaches_gateway(client, change):
    with gateway(OK) as post:
        r = client.post("/api/donations/waafi", json={**BODY, **change})
    assert r.status_code == 400
    post.assert_not_called()
    assert donations() == []


def test_sahal_number_accepted_and_normalised(client):
    with gateway(OK) as post:
        r = client.post("/api/donations/waafi", json={**BODY, "method": "sahal", "phone": "0901234567"})
    assert r.status_code == 201
    assert post.call_args.kwargs["json"]["serviceParams"]["payerInfo"] == {"accountNo": "252901234567"}


def test_rate_limit_per_number(client):
    with gateway(OK):
        codes = [client.post("/api/donations/waafi", json=BODY).status_code for _ in range(4)]
    assert codes == [201, 201, 201, 429]
