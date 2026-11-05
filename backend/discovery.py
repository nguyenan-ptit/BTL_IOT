"""Bounded LAN UDP discovery; the authenticated reply source supplies the broker IP."""
import hashlib
import hmac
import ipaddress
import json
import re
import socket
import threading
import time

from prepare_discovery import KEY_FILE, read_discovery_key

DISCOVERY_PORT = 41884
MAX_PACKET = 512
NONCE = re.compile(r"[0-9a-f]{32}\Z")
PRIVATE_NETWORKS = tuple(ipaddress.ip_network(value) for value in
                         ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))

def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def parse_query(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_PACKET:
        return None
    try:
        query = json.loads(raw.decode("ascii"), object_pairs_hook=_unique_object)
    except (ValueError, UnicodeError, RecursionError):
        return None
    if (type(query) is not dict or set(query) != {"v", "kind", "nonce"}
            or type(query["v"]) is not int or query["v"] != 1
            or query["kind"] != "fire-alarm-discover"
            or type(query["nonce"]) is not str or not NONCE.fullmatch(query["nonce"])):
        return None
    return query


def private_unicast(address):
    try:
        ip = ipaddress.IPv4Address(address)
    except (ipaddress.AddressValueError, TypeError):
        return False
    # Discovery is intentionally limited to conventional private LAN host addresses.
    return (any(ip in network for network in PRIVATE_NETWORKS)
            and int(ip) & 255 not in (0, 255)
            and not ip.is_multicast and not ip.is_unspecified)


def choose_reply_host(source):
    """Ask the routing table for this peer's outgoing IPv4 without sending a datagram."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
            route.connect(source)
            host = route.getsockname()[0]
        return host if private_unicast(host) else None
    except OSError:
        return None


def signed_reply(nonce, host, port, key):
    canonical = f"fire-alarm-broker|1|{nonce}|{host}|{port}".encode("ascii")
    return {"v": 1, "kind": "fire-alarm-broker", "nonce": nonce, "host": host, "port": port,
            "mac": hmac.new(key.encode("ascii"), canonical, hashlib.sha256).hexdigest()}


class DiscoveryResponder:
    def __init__(self, config, is_mqtt_connected, host_for_peer=None):
        self.enabled = config.get("discovery_enabled", False) is True
        self.port = config["mqtt_port"]
        self.key_path = config.get("discovery_key_path", KEY_FILE)
        self.is_mqtt_connected = is_mqtt_connected
        self.host_for_peer = host_for_peer or choose_reply_host
        self.lock = threading.Lock()
        self.halt = threading.Event()
        self.sock = None
        self.thread = None
        self.running = False
        self.error = None
        self.replies = {}

    def snapshot(self):
        with self.lock:
            return {"enabled": self.enabled, "running": self.running, "error": self.error}

    def start(self):
        if not self.enabled or (self.thread and self.thread.is_alive()):
            return
        connection = None
        try:
            self.key = read_discovery_key(self.key_path)
            connection = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            connection.settimeout(.25)
            connection.bind(("0.0.0.0", DISCOVERY_PORT))
        except (OSError, ValueError):
            if connection:
                connection.close()
            with self.lock:
                self.error = "Chưa mở được tìm MQTT trong LAN; kiểm tra khóa và UDP 41884."
                self.running = False
            return
        self.sock = connection
        self.halt.clear()
        self.replies.clear()
        with self.lock:
            self.running, self.error = True, None
        self.thread = threading.Thread(target=self._run, name="mqtt-discovery", daemon=True)
        self.thread.start()

    def _response(self, raw, source, now):
        if (not private_unicast(source[0]) or type(source[1]) is not int
                or not 1 <= source[1] <= 65535 or not self.is_mqtt_connected()):
            return None
        query = parse_query(raw)
        if query is None:
            return None
        self.replies = {ip: sent for ip, sent in self.replies.items() if now - sent < 60}
        previous = self.replies.get(source[0])
        if previous is not None and now - previous < 1:
            return None
        if previous is None and len(self.replies) >= 256:
            return None
        host = self.host_for_peer(source)
        if not private_unicast(host):
            return None
        self.replies[source[0]] = now
        return json.dumps(signed_reply(query["nonce"], host, self.port, self.key),
                          separators=(",", ":")).encode("ascii")

    def _run(self):
        try:
            while not self.halt.is_set():
                try:
                    raw, source = self.sock.recvfrom(MAX_PACKET + 1)
                except socket.timeout:
                    continue
                except ConnectionResetError:
                    # Windows reports an earlier unicast reply's peer ICMP reset here.
                    continue
                except OSError:
                    if self.halt.is_set():
                        break
                    raise
                response = self._response(raw, source, time.monotonic())
                if response is not None:
                    try:
                        self.sock.sendto(response, source)
                    except OSError:
                        if self.halt.is_set():
                            break
                        # One ESP can disappear between its query and our reply.
                        continue
        except (OSError, ValueError, TypeError, RuntimeError):
            with self.lock:
                self.error = "Tìm MQTT trong LAN tạm dừng; kiểm tra UDP 41884."
        finally:
            if self.sock:
                self.sock.close()
            with self.lock:
                self.running = False

    def stop(self):
        self.halt.set()
        if self.sock:
            self.sock.close()
        if self.thread and self.thread is not threading.current_thread():
            self.thread.join(timeout=1)
        with self.lock:
            self.running = False
