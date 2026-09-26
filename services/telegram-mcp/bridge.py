"""Private Cloud Run bridge. Invocation is restricted by Cloud Run IAM."""
import asyncio
import os
import sys
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import BaseModel, ConfigDict, Field
from session import telethon_session

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class Call(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Literal["get_chats", "get_chat", "get_messages", "search_messages", "send_message", "reply_to_message"]
    arguments: dict
    session: str = Field(min_length=1, max_length=2048)
    api_id: int = Field(gt=0)
    api_hash: str = Field(pattern=r"^[a-fA-F0-9]{32}$")


def validate_arguments(name: str, args: dict) -> dict:
    required = {
        "get_chats": set(), "get_chat": {"chat_id"}, "get_messages": {"chat_id"},
        "search_messages": {"chat_id", "query"}, "send_message": {"chat_id", "message"},
        "reply_to_message": {"chat_id", "message_id", "text"},
    }
    optional = {"get_chats": {"page", "page_size"}, "get_messages": {"page", "page_size"}, "search_messages": {"limit"}}
    if not required[name] <= args.keys() or args.keys() - required[name] - optional.get(name, set()):
        raise ValueError("Invalid arguments")
    for key, value in args.items():
        if key in {"page", "page_size", "limit", "message_id"}:
            maximum = 100 if key == "page" else (2147483647 if key == "message_id" else 50)
            if type(value) is not int or not 1 <= value <= maximum:
                raise ValueError("Invalid argument")
        else:
            maximum = 150 if key == "chat_id" else (200 if key == "query" else 4000)
            if not isinstance(value, str) or not 1 <= len(value) <= maximum:
                raise ValueError("Invalid argument")
    result = dict(args)
    if "chat_id" in result:
        peer = result["chat_id"]
        if peer.lstrip("-").isdigit():
            result["chat_id"] = int(peer)
        elif name in {"send_message", "reply_to_message"}:
            raise ValueError("Numeric recipient required")
    return result


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    # FastAPI's default response echoes invalid input, which can contain secrets.
    return JSONResponse({"error": "Invalid MCP request"}, status_code=400)


@app.post("/call")
async def call(request: Call):
    try:
        arguments = validate_arguments(request.name, request.arguments)
        session = telethon_session(request.session)
        with tempfile.TemporaryDirectory(prefix="telegram-mcp-") as directory, open(os.devnull, "w") as errors:
            env = {
                "PATH": os.environ.get("PATH", ""), "HOME": directory, "XDG_STATE_HOME": directory,
                "TELEGRAM_API_ID": str(request.api_id), "TELEGRAM_API_HASH": request.api_hash,
                "TELEGRAM_SESSION_STRING": session, "TELEGRAM_TRANSCRIBE": "off",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            server = StdioServerParameters(command=sys.executable, args=[str(Path(__file__).with_name("runner.py"))], env=env, cwd=directory)
            async with asyncio.timeout(30):
                async with stdio_client(server, errlog=errors) as (read, write):
                    async with ClientSession(read, write) as client:
                        await client.initialize()
                        result = await client.call_tool(request.name, arguments)
                        if result.isError:
                            raise RuntimeError("Tool failed")
                        text = "\n".join(part.text for part in result.content if part.type == "text")
                        if len(text) > 24000:
                            # Avoid silently truncated JSON/metadata and ask for smaller reads.
                            return JSONResponse({"error": "Result too large; request fewer messages"}, status_code=422)
                        return {"text": text}
    except Exception:
        return JSONResponse({"error": "Telegram operation could not be verified"}, status_code=502)
