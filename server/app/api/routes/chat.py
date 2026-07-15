from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import random

router = APIRouter()


class ChatMessage(BaseModel):
    """Schema for incoming chat messages."""
    message: str
    context: str = "general"


@router.post("/chat")
async def chat(msg: ChatMessage):
    """
    Chat endpoint for AI assistant.
    Currently returns mock response.
    TODO: Integrate with actual LLM API (OpenAI / local model).
    """
    mock_responses = {
        "general": "This is a mock response from the AI assistant. In production, this will connect to an LLM API for intelligent analysis and recommendations.",
        "security": "Based on the current security assessment, the system shows normal operation with no critical vulnerabilities detected. Recommendation: continue monitoring network traffic patterns.",
        "resource": "Current resource utilization is within normal parameters. CPU average at 65%, memory at 72%. Consider scaling edge node-3 if load continues to increase.",
        "fraud": "Analysis of recent communication patterns indicates 3 potential high-risk users. GCN model confidence: 94.2%. Recommend further investigation of flagged accounts.",
    }
    response_text = mock_responses.get(msg.context, mock_responses["general"])
    return {
        "reply": response_text,
        "context": msg.context,
        "model": "mock-v1",
    }


@router.post("/chat/stream")
async def chat_stream(msg: ChatMessage):
    """
    Streaming chat endpoint (SSE) for real-time AI responses.
    TODO: Replace with actual LLM streaming API.
    """
    response_text = (
        "This is a streaming mock response from the AI assistant. "
        "Each word is sent as a separate event to simulate real-time "
        "language model output. In production, this will use Server-Sent "
        "Events with an actual LLM backend."
    )

    async def generate():
        for word in response_text.split():
            yield f"data: {word} \n\n"
            await asyncio.sleep(random.uniform(0.05, 0.15))
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
