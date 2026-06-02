from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers():
    response = client.post("/api/auth/register", json={"email": "tester@example.com", "password": "password123"})
    if response.status_code == 409:
        response = client.post("/api/auth/login", json={"email": "tester@example.com", "password": "password123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_sequence_endpoint_requires_auth():
    response = client.post("/api/analyze/sequence", json={"sequence": "ATGC"})
    assert response.status_code == 401


def test_sequence_endpoint_with_auth():
    response = client.post("/api/analyze/sequence", json={"sequence": "ATGAAATAG"}, headers=auth_headers())
    assert response.status_code == 200
    assert response.json()["result"]["sequence_type"] == "dna"
