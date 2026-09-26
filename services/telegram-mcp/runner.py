"""Restricted upstream MCP entrypoint. Stdout is reserved for MCP frames."""
import asyncio
import logging
import os

# Upstream can log arguments in errors. Never create its file logger.
class SilentFileHandler(logging.FileHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(os.devnull)


logging.FileHandler = SilentFileHandler
logging.disable(logging.CRITICAL)

from telegram_mcp.install_guard import assert_safe_distribution
assert_safe_distribution()
from telegram_mcp import runtime
from telegram_mcp import tools  # Registers upstream implementations.

ALLOWED = {"get_chats", "get_chat", "get_messages", "search_messages", "send_message", "reply_to_message"}
for tool in list(runtime.mcp._tool_manager.list_tools()):
    if tool.name not in ALLOWED:
        runtime.mcp._tool_manager.remove_tool(tool.name)


async def main():
    try:
        for client in runtime.clients.values():
            # Avoid hidden retries for sends and never start interactive authorization.
            client._request_retries = 0
            client.flood_sleep_threshold = 0
            await client.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("Account disconnected")
            # Memory-only StringSession has no saved entity/access-hash cache.
            await client.get_dialogs(limit=1000)
        await runtime.mcp.run_stdio_async()
    finally:
        for client in runtime.clients.values():
            await client.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        raise SystemExit(1) from None
