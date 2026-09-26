import base64
import ipaddress
import os
import struct
import subprocess
import sys
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path
from fastapi.testclient import TestClient
from telethon.sessions import StringSession
from bridge import app, validate_arguments, StdioServerParameters
from session import telethon_session


def gramjs(address="149.154.167.51"):
    raw = b"\x02" + struct.pack(">H", len(address)) + address.encode() + struct.pack(">H", 443) + bytes(range(256))
    return "1" + base64.b64encode(raw).decode()


class BridgeTests(unittest.TestCase):
    def test_session_conversion(self):
        for address in ["149.154.167.51", "2001:db8::1"]:
            converted = StringSession(telethon_session(gramjs(address)))
            self.assertEqual(converted.dc_id, 2)
            self.assertEqual(ipaddress.ip_address(converted.server_address), ipaddress.ip_address(address))
            self.assertEqual(converted.port, 443)
            self.assertEqual(converted.auth_key.key, bytes(range(256)))
        with self.assertRaises(ValueError):
            telethon_session("invalid")

    def test_arguments_are_bounded_and_no_other_account_or_mutations(self):
        self.assertEqual(validate_arguments("send_message", {"chat_id": "-10042", "message": "Hello"})["chat_id"], -10042)
        for name, args in [("get_chats", {"page_size": 1000}), ("get_chat", {"chat_id": "42", "account": "other"}), ("send_message", {"chat_id": "@guess", "message": "Hello"}), ("reply_to_message", {"chat_id": "42", "text": "Hello"})]:
            with self.assertRaises(ValueError):
                validate_arguments(name, args)

    def test_invalid_requests_do_not_echo_secrets(self):
        response = TestClient(app).post("/call", json={"name": "delete_messages", "session": "secret-value", "api_hash": "secret-hash"})
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("secret", response.text)
        self.assertEqual(TestClient(app).get("/docs").status_code, 404)

    def test_bridge_performs_real_mcp_initialize_and_tool_call(self):
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "fake_mcp.py"
            script.write_text("from mcp.server.fastmcp import FastMCP\nm = FastMCP('fixture')\n@m.tool()\ndef get_chats(): return 'Fixture chat history'\nm.run()\n")
            def parameters(**kwargs):
                return StdioServerParameters(command=sys.executable, args=[str(script)], env=kwargs["env"], cwd=directory)
            with patch("bridge.StdioServerParameters", side_effect=parameters):
                response = TestClient(app).post("/call", json={"name": "get_chats", "arguments": {}, "session": gramjs(), "api_id": 123, "api_hash": "a" * 32})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"text": "Fixture chat history"})

    def test_bridge_logs_only_safe_failure_stage_and_type(self):
        with patch("bridge.stdio_client", side_effect=RuntimeError("private session detail")):
            with self.assertLogs("telegram-mcp-bridge", level="ERROR") as captured:
                response = TestClient(app).post("/call", json={"name": "get_chats", "arguments": {}, "session": gramjs(), "api_id": 123, "api_hash": "a" * 32})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"error": "Telegram operation could not be verified"})
        self.assertIn("stage=mcp_stdio", captured.output[0])
        self.assertIn("error_type=RuntimeError", captured.output[0])
        self.assertNotIn("private session detail", captured.output[0])

    def test_real_upstream_import_registers_only_allowed_mcp_tools(self):
        env = {**os.environ, "TELEGRAM_API_ID": "123", "TELEGRAM_API_HASH": "a" * 32, "TELEGRAM_SESSION_STRING": telethon_session(gramjs()), "TELEGRAM_TRANSCRIBE": "off"}
        result = subprocess.run([sys.executable, "-c", "import runner; print(','.join(sorted(t.name for t in runner.runtime.mcp._tool_manager.list_tools())))"], cwd=Path(__file__).parent, env=env, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, "Upstream restricted entrypoint failed to import")
        self.assertEqual(set(result.stdout.strip().split(",")), {"get_chats", "get_chat", "get_messages", "search_messages", "send_message", "reply_to_message"})


if __name__ == "__main__":
    unittest.main()
