"""FastAPI Shared Request Dependencies."""
from DB.session import get_db
from app.core.security import get_current_staff, require_role
