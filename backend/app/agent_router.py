"""FastAPI router for the Electoral Intelligence AI Agent."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .agent import answer_question, get_database_overview

agent_router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    history: list[ChatMessage] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)
    api_key: str | None = None
    provider: str | None = None


class ToolCallInfo(BaseModel):
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    reply: str
    tools_called: list[ToolCallInfo] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list)
    mode: str


@agent_router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(req: ChatRequest, request: Request):
    """Chat with the Electoral Intelligence AI Agent."""
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise HTTPException(status_code=503, detail="Database connection is not available.")

    history_dicts = [{"role": h.role, "content": h.content} for h in req.history]

    result = await answer_question(
        pool=pool,
        user_message=req.message,
        history=history_dicts,
        context=req.context,
        api_key=req.api_key,
        provider=req.provider,
    )

    return ChatResponse(
        reply=result["reply"],
        tools_called=[ToolCallInfo(tool=t["tool"], args=t.get("args", {})) for t in result["tools_called"]],
        suggested_questions=result["suggested_questions"],
        mode=result["mode"],
    )


@agent_router.get("/suggestions")
async def get_suggestions(
    ac_no: str | None = None,
    district_code: str | None = None,
):
    """Return contextual starter suggestions for the landing page chat widget."""
    if ac_no:
        return {
            "suggestions": [
                f"Who won in AC #{ac_no} in 2022 and with what margin?",
                f"Compare AC #{ac_no} results between 2017 and 2022",
                f"What voter call complaints were logged in AC #{ac_no}?",
                "Which AC had the highest voter turnout in UP?",
            ]
        }
    if district_code:
        return {
            "suggestions": [
                "Summarize election results for this district",
                "Which constituencies in this district had the highest turnout?",
                "What voter call complaints were logged here?",
                "Show top 5 ACs by voter turnout statewide",
            ]
        }
    return {
        "suggestions": [
            "🏆 Who won in Baghpat (AC 52) in 2022?",
            "📞 What are the top voter grievances reported?",
            "📊 Show top 5 constituencies by voter turnout",
            "📈 Compare 2017 vs 2022 results for Deoband",
            "🏛️ Summarize election results for Meerut District",
        ]
    }


@agent_router.get("/status")
async def agent_status(request: Request):
    """Status of the AI Agent and LLM integration."""
    pool = getattr(request.app.state, "pool", None)
    db_connected = pool is not None
    gemini_configured = bool(os.getenv("GEMINI_API_KEY"))
    groq_configured = bool(os.getenv("GROQ_API_KEY"))
    openai_configured = bool(os.getenv("OPENAI_API_KEY"))

    active_provider = "gemini" if gemini_configured else ("groq" if groq_configured else ("openai" if openai_configured else "smart_database_agent"))

    return {
        "status": "ready" if db_connected else "database_unavailable",
        "provider": active_provider,
        "gemini_configured": gemini_configured,
        "groq_configured": groq_configured,
        "openai_configured": openai_configured,
        "db_connected": db_connected,
        "features": [
            "Assembly election analysis & winner detection",
            "Vote share & margin breakdown (BJP, RLD, SP, BSP, INC)",
            "2017 vs 2022 historical comparison",
            "District aggregated metrics for 16 focus districts",
            "Booth-level & village turnout lookup",
            "Telephony & citizen feedback grievance tracking",
            "Leaderboard rankings (turnout, margins)",
        ],
    }
