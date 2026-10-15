"""FastAPI router for WebSockets and Server-Sent Events (SSE)."""

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse

from app.core.events import broadcaster

router = APIRouter(tags=["Realtime Events"])

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Bidirectional WebSocket connection for live restaurant events."""
    await broadcaster.connect_ws(websocket)
    try:
        # Send initial welcome / connection ack
        await websocket.send_text('{"event":"CONNECTED","data":{"message":"Realtime link established"}}')
        while True:
            # Keep connection open, handle client heartbeats
            data = await websocket.receive_text()
            await websocket.send_text('{"event":"PONG"}')
    except (WebSocketDisconnect, Exception):
        broadcaster.disconnect_ws(websocket)


@router.get("/events/stream")
async def sse_endpoint(request: Request):
    """Server-Sent Events (SSE) streaming endpoint."""
    q = broadcaster.subscribe_sse()

    async def event_generator():
        try:
            yield "event: CONNECTED\ndata: {\"status\":\"connected\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    # Keep-alive comment
                    yield ": ping\n\n"
        finally:
            broadcaster.unsubscribe_sse(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
