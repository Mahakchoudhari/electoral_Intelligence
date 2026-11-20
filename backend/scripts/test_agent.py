"""Automated test suite for Electoral Intelligence AI Agent."""

import asyncio
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))
load_dotenv(PROJECT_ROOT / ".env")

import httpx
from app.main import app

test_queries = [
    ("Database Overview", "Give me an overview of the database and what data is available"),
    ("Constituency Winner", "Who won in Baghpat (AC 52) in 2022 and what was the margin?"),
    ("District Summary", "Give me a summary of election results for Meerut District"),
    ("Telephony / Calls", "What are the top voter grievances and call problems reported?"),
    ("Turnout Leaderboard", "Which constituencies had the highest voter turnout?"),
    ("Historical Comparison", "Compare 2017 vs 2022 election results for Deoband"),
    ("Recent Issues", "Show recent call issues reported from voters"),
]

async def run_tests():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        async with app.router.lifespan_context(app):
            print("🚀 Running AI Agent Integration Tests...\n" + "=" * 60)

            # Test 1: Status
            status_res = await client.get("/api/agent/status")
            assert status_res.status_code == 200, f"Status failed: {status_res.status_code}"
            print("✅ /api/agent/status: OK -", status_res.json()["status"], f"(provider: {status_res.json()['provider']})")

            # Test 2: Suggestions
            sugg_res = await client.get("/api/agent/suggestions?ac_no=42")
            assert sugg_res.status_code == 200, f"Suggestions failed: {sugg_res.status_code}"
            print(f"✅ /api/agent/suggestions: OK ({len(sugg_res.json()['suggestions'])} suggestions)")

            # Test 3: Chat queries
            for name, query in test_queries:
                print(f"\n🔍 Testing [{name}]: \"{query}\"")
                chat_res = await client.post("/api/agent/chat", json={
                    "message": query,
                    "history": [],
                    "context": {"election_year": 2022}
                })
                assert chat_res.status_code == 200, f"Query '{query}' failed: {chat_res.status_code} - {chat_res.text}"
                data = chat_res.json()
                tools_used = [t["tool"] for t in data["tools_called"]]
                print(f"   Tools called: {tools_used}")
                print(f"   Reply preview: {data['reply'][:120]}...")
                assert len(data["reply"]) > 20, "Reply was unexpectedly short"

            print("\n" + "=" * 60 + "\n🎉 All AI Agent tests passed successfully!")

if __name__ == "__main__":
    asyncio.run(run_tests())
