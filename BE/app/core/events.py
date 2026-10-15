"""Realtime Event Broadcaster supporting WebSockets and Server-Sent Events (SSE)."""

import asyncio
import json
from typing import Any, Dict, Set
from fastapi import WebSocket

class EventBroadcaster:
    """Manages active WebSocket connections and SSE subscriber queues."""

    def __init__(self):
        self._active_websockets: Set[WebSocket] = set()
        self._sse_subscribers: Set[asyncio.Queue] = set()

    async def connect_ws(self, websocket: WebSocket):
        await websocket.accept()
        self._active_websockets.add(websocket)

    def disconnect_ws(self, websocket: WebSocket):
        self._active_websockets.discard(websocket)

    def subscribe_sse(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._sse_subscribers.add(q)
        return q

    def unsubscribe_sse(self, q: asyncio.Queue):
        self._sse_subscribers.discard(q)

    async def broadcast(self, event_type: str, data: Dict[str, Any] = None):
        """Broadcast an event to all connected WebSockets and SSE clients."""
        payload = {"event": event_type, "data": data or {}}
        raw_json = json.dumps(payload)

        # Broadcast to active WebSockets
        dead_sockets = set()
        for ws in list(self._active_websockets):
            try:
                await ws.send_text(raw_json)
            except Exception:
                dead_sockets.add(ws)
        self._active_websockets.difference_update(dead_sockets)

        # Broadcast to active SSE subscribers
        sse_chunk = f"event: {event_type}\ndata: {json.dumps(data or {})}\n\n"
        for q in list(self._sse_subscribers):
            try:
                q.put_nowait(sse_chunk)
            except Exception:
                pass

broadcaster = EventBroadcaster()
