"""Convert the existing GramJS StringSession to Telethon, without disk storage."""
import base64
import ipaddress
import struct


def telethon_session(value: str) -> str:
    if not value.startswith("1") or len(value) > 2048:
        raise ValueError("Invalid session")
    raw = base64.b64decode(value[1:], validate=True)
    if len(raw) == 263:  # Existing Telethon IPv4 representation.
        packed = raw
    else:
        if len(raw) < 261:
            raise ValueError("Invalid session")
        length = int.from_bytes(raw[1:3], "big")
        if length < 1 or length > 100 or len(raw) != 3 + length + 2 + 256:
            raise ValueError("Invalid session")
        address = ipaddress.ip_address(raw[3:3 + length].decode("ascii")).packed
        packed = raw[:1] + address + raw[3 + length:]
    if len(packed) not in (263, 275) or not 1 <= packed[0] <= 5:
        raise ValueError("Invalid session")
    address_len = len(packed) - 259
    if struct.unpack(">H", packed[1 + address_len:3 + address_len])[0] == 0:
        raise ValueError("Invalid session")
    return "1" + base64.urlsafe_b64encode(packed).decode("ascii")
