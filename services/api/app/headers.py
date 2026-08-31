"""Security response headers.

This service answers JSON, so the useful headers are the ones that stop a
browser from reinterpreting that JSON as something executable, or framing it.
Written by hand rather than pulled from a dependency -- it is a dozen lines
and one fewer package to keep patched.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

# FastAPI's interactive docs load Swagger UI and ReDoc from a CDN, so the
# strict CSP below would blank them out. They get everything except the CSP.
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")

_BASE_HEADERS = {
    # Don't let a browser sniff a JSON body into HTML/JS -- the main way an
    # API response turns into stored XSS.
    "X-Content-Type-Options": "nosniff",
    # Nothing here is meant to be framed; blocks clickjacking on /docs too.
    "X-Frame-Options": "DENY",
    # Don't leak the full URL (which carries player ids and query terms) to
    # third parties in the Referer header.
    "Referrer-Policy": "no-referrer",
    # No reason for this API to be granted any of these.
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

# frame-ancestors duplicates X-Frame-Options for browsers that prefer CSP.
_JSON_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        for key, value in _BASE_HEADERS.items():
            response.headers.setdefault(key, value)

        if not request.url.path.startswith(_DOCS_PATHS):
            response.headers.setdefault("Content-Security-Policy", _JSON_CSP)

        # Only meaningful over TLS, and actively wrong to send on plain HTTP.
        # Render terminates TLS and forwards the original scheme here.
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto == "https":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )

        return response


def add_security_headers(app: ASGIApp) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
