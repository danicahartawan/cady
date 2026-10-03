#!/usr/bin/env python3
import json
import os
import ssl
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def load_local_env():
    """Load local development secrets without adding a package dependency."""
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


load_local_env()


def verified_ssl_context():
    """Use the bundled CA store when framework Python has no system CA file."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


SSL_CONTEXT = verified_ssl_context()

HOST = "127.0.0.1"
PORT = int(os.environ.get("CADY_PORT", "4173"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.5")

INSTRUCTIONS = """You are Cady, a concise and encouraging CAD copilot for beginner mechanical designers.
Help users understand modeling steps, feature order, sketches, constraints, dimensions, extrudes, revolves,
fillets, patterns, assemblies, and error recovery. Refer to the visible example as a robot arm assembly when
relevant. Give actionable steps in plain language. Make every workflow transferable to established parametric
CAD software. Default to SolidWorks terminology and exact menu or CommandManager paths, while naming the
software-neutral operation first. Structure build requests as an ordered feature plan with editable dimensions
and design intent. For iteration requests, identify the existing feature to edit before suggesting a new feature.
Never claim that you changed the CAD model unless the application explicitly reports that a tool action succeeded."""


def build_solidworks_plan(project):
    """Translate Cady's parametric primitives into solidworks-mcp tool calls."""
    calls = [
        {"tool": "connect_solidworks", "arguments": {}},
        {"tool": "set_units", "arguments": {"unit": "mm"}},
        {"tool": "create_new_part", "arguments": {}},
    ]
    unsupported = []
    for feature in project.get("features", []):
        kind = feature.get("type")
        params = feature.get("parameters", {})
        transform = feature.get("transform", {})
        position = transform.get("position", [0, 0, 0])
        x = float(position[0] if len(position) > 0 else 0)
        y = float(position[2] if len(position) > 2 else 0)
        calls.append({"tool": "create_sketch", "arguments": {"plane": "Front"}})
        if kind == "box":
            width = float(params.get("width", 1))
            depth = float(params.get("depth", 1))
            height = float(params.get("height", 1))
            calls.extend([
                {"tool": "draw_rectangle", "arguments": {
                    "x1": x - width / 2, "y1": y - depth / 2,
                    "x2": x + width / 2, "y2": y + depth / 2, "unit": "mm",
                }},
                {"tool": "extrude_sketch", "arguments": {"depth": height, "unit": "mm"}},
            ])
        elif kind == "cylinder":
            calls.extend([
                {"tool": "draw_circle", "arguments": {
                    "x": x, "y": y, "radius": float(params.get("radius", 1)), "unit": "mm",
                }},
                {"tool": "extrude_sketch", "arguments": {
                    "depth": float(params.get("height", 1)), "unit": "mm",
                }},
            ])
        else:
            calls.pop()
            unsupported.append({
                "feature_id": feature.get("id"),
                "type": kind,
                "reason": "solidworks-mcp does not expose a revolve tool for native spheres",
            })
    calls.append({"tool": "list_features", "arguments": {}})
    return {
        "schema": "cady.solidworks-mcp-plan.v1",
        "project": project.get("name", "Cady project"),
        "units": "mm",
        "server": "https://github.com/alisamsam/solidworks-mcp",
        "calls": calls,
        "unsupported": unsupported,
    }


def extract_output_text(payload):
    chunks = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                chunks.append(content["text"])
    return "\n".join(chunks).strip()


class CadyHandler(SimpleHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/solidworks/status":
            bridge_url = os.environ.get("SOLIDWORKS_BRIDGE_URL", "").strip()
            self.send_json(200, {
                "configured": bool(bridge_url),
                "bridge_url": bridge_url or None,
                "platform_requirement": "Windows 10 or 11 with SolidWorks 2023-2025",
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/solidworks/build":
            try:
                length = int(self.headers.get("Content-Length", "0"))
                incoming = json.loads(self.rfile.read(length) or b"{}")
                project = incoming.get("project")
                if not isinstance(project, dict):
                    self.send_json(400, {"error": "A Cady project is required."})
                    return
                plan = build_solidworks_plan(project)
                bridge_url = os.environ.get("SOLIDWORKS_BRIDGE_URL", "").strip()
                if not bridge_url:
                    self.send_json(200, {"connected": False, "plan": plan})
                    return
                headers = {"Content-Type": "application/json"}
                bridge_token = os.environ.get("SOLIDWORKS_BRIDGE_TOKEN", "").strip()
                if bridge_token:
                    headers["Authorization"] = f"Bearer {bridge_token}"
                request = urllib.request.Request(
                    f"{bridge_url.rstrip('/')}/build",
                    data=json.dumps(plan).encode("utf-8"),
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=180, context=SSL_CONTEXT) as response:
                    bridge_result = json.loads(response.read() or b"{}")
                self.send_json(200, {"connected": True, "plan": plan, "result": bridge_result})
            except Exception as error:
                self.send_json(502, {"error": f"SolidWorks bridge failed: {error}"})
            return
        if self.path != "/api/chat":
            self.send_json(404, {"error": "Not found"})
            return
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            self.send_json(503, {"error": "OPENAI_API_KEY is not configured on the local server."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            incoming = json.loads(self.rfile.read(length) or b"{}")
            messages = incoming.get("messages", [])[-16:]
            safe_messages = [
                {"role": message.get("role"), "content": str(message.get("content", ""))[:6000]}
                for message in messages
                if message.get("role") in {"user", "assistant"} and message.get("content")
            ]
            request_body = json.dumps({
                "model": MODEL,
                "instructions": INSTRUCTIONS,
                "input": safe_messages,
            }).encode("utf-8")
            request = urllib.request.Request(
                "https://api.openai.com/v1/responses",
                data=request_body,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=90, context=SSL_CONTEXT) as response:
                result = json.loads(response.read())
            text = extract_output_text(result)
            if not text:
                raise ValueError("The model returned no text output.")
            self.send_json(200, {"text": text})
        except urllib.error.HTTPError as error:
            try:
                detail = json.loads(error.read()).get("error", {}).get("message", str(error))
            except Exception:
                detail = str(error)
            self.send_json(error.code, {"error": detail})
        except Exception as error:
            print(f"Chat request failed: {error}")
            self.send_json(500, {"error": "Cady could not reach the AI service. Please try again."})


if __name__ == "__main__":
    print(f"cady running at http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), CadyHandler).serve_forever()
