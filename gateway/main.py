
from collections import defaultdict, deque
from threading import Lock
from time import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="CyberShield Gateway")

WINDOW_SECONDS = 60
MAX_REQUESTS = 20

requests_by_ip = defaultdict(deque)
lock = Lock()


@app.get("/")
def home():
    return {
        "service": "CyberShield Gateway",
        "status": "online"
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/demo")
def demo():
    return {"message": "Demo endpoint reached"}


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    # Only demonstrate enforcement on /demo.
    if request.url.path != "/demo":
        return await call_next(request)

    # Never trust arbitrary client-supplied IP headers.
    # Use the direct peer address unless a trusted proxy is configured.
    client = request.client.host if request.client else "unknown"
    now = time()

    with lock:
        recent = requests_by_ip[client]
        while recent and now - recent[0] >= WINDOW_SECONDS:
            recent.popleft()

        if len(recent) >= MAX_REQUESTS:
            return JSONResponse(
                status_code=429,
                content={
                    "blocked": True,
                    "message": "Rate limit exceeded. Try again later."
                },
                headers={"Retry-After": str(WINDOW_SECONDS)}
            )

        recent.append(now)

    return await call_next(request)
