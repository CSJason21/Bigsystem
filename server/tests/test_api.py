import pytest
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


class TestHealthCheck:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"


class TestResourcesAPI:
    def test_get_nodes(self):
        response = client.get("/api/resources/nodes")
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert data["total"] > 0

    def test_get_node_history(self):
        response = client.get("/api/resources/nodes/1/history")
        assert response.status_code == 200
        data = response.json()
        assert "data" in data

    def test_get_topology(self):
        response = client.get("/api/resources/topology")
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "edges" in data


class TestTasksAPI:
    def test_get_tasks(self):
        response = client.get("/api/tasks")
        assert response.status_code == 200
        data = response.json()
        assert "tasks" in data

    def test_create_task(self):
        response = client.post("/api/tasks", json={
            "name": "Test Task",
            "type": "training",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Task"


class TestFraudAPI:
    def test_get_overview(self):
        response = client.get("/api/fraud/overview")
        assert response.status_code == 200

    def test_get_users(self):
        response = client.get("/api/fraud/users")
        assert response.status_code == 200
        data = response.json()
        assert "users" in data


class TestChatAPI:
    def test_chat(self):
        response = client.post("/api/chat", json={"message": "hello"})
        assert response.status_code == 200
        data = response.json()
        assert "reply" in data


class TestPredictionAllocationAPI:
    def test_get_daily_prediction(self):
        response = client.get("/api/prediction/daily")
        assert response.status_code == 200
        data = response.json()
        assert "labels" in data
        assert "cpu_actual" in data
        assert len(data["labels"]) == len(data["cpu_actual"])

    def test_get_allocation_results(self):
        response = client.get("/api/allocation/results")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert len(data["results"]) > 0
        assert "source_node_id" in data["results"][0]

    def test_get_allocation_nodes(self):
        response = client.get("/api/allocation/nodes")
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert len(data["nodes"]) > 0

    def test_get_node_dashboard(self):
        nodes_response = client.get("/api/allocation/nodes")
        node_id = nodes_response.json()["nodes"][0]["node_id"]
        response = client.get(f"/api/allocation/nodes/{node_id}/dashboard")
        assert response.status_code == 200
        data = response.json()
        assert data["node_id"] == node_id
        assert "updated_at" in data

    def test_get_node_history(self):
        nodes_response = client.get("/api/allocation/nodes")
        node_id = nodes_response.json()["nodes"][0]["node_id"]
        response = client.get(f"/api/allocation/nodes/{node_id}/history")
        assert response.status_code == 200
        data = response.json()
        assert data["node_id"] == node_id
        assert "labels" in data
        assert "updated_at" in data

    def test_node_endpoints_return_distinct_data_for_different_nodes(self):
        node_ids = [node["node_id"] for node in client.get("/api/allocation/nodes").json()["nodes"][:2]]
        first_dashboard = client.get(f"/api/allocation/nodes/{node_ids[0]}/dashboard").json()
        second_dashboard = client.get(f"/api/allocation/nodes/{node_ids[1]}/dashboard").json()
        first_history = client.get(f"/api/allocation/nodes/{node_ids[0]}/history").json()
        second_history = client.get(f"/api/allocation/nodes/{node_ids[1]}/history").json()

        assert first_dashboard["node_id"] != second_dashboard["node_id"]
        assert first_dashboard["cpu_total_usage"] != second_dashboard["cpu_total_usage"]
        assert first_history["cpu_usage"] != second_history["cpu_usage"]

    def test_missing_node_returns_404(self):
        response = client.get("/api/allocation/nodes/not-a-real-node/dashboard")
        assert response.status_code == 404
