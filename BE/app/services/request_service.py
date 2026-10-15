"""Request Service convenience wrapper around Authoritative Routing Engine."""
from app.services.routing_service import (
    create_service_request,
    resend_service_request,
    cancel_service_request,
    auto_close_accepted_requests,
)
