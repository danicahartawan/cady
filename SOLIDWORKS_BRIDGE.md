# Cady to SolidWorks MCP bridge

Cady keeps editing in Three.js and translates supported features into calls for
[`alisamsam/solidworks-mcp`](https://github.com/alisamsam/solidworks-mcp).

## What works

- Boxes become `create_sketch`, `draw_rectangle`, and `extrude_sketch` calls.
- Cylinders become `create_sketch`, `draw_circle`, and `extrude_sketch` calls.
- Dimensions are sent in millimeters.
- Projects without a configured bridge download a `.solidworks-mcp.json` plan.

Spheres are reported as unsupported because the referenced MCP server does not
currently expose a revolve tool. Cady does not substitute an inaccurate shape.

## Windows requirements

The referenced MCP server requires Windows 10 or 11, SolidWorks 2023 through
2025, Python 3.10 or newer, and a valid SolidWorks license. SolidWorks must be
available on the Windows machine that runs the MCP process.

## Connecting a remote bridge

Run an authenticated HTTP service on the Windows machine that:

1. Accepts `POST /build` with a Cady plan.
2. Starts or connects to `solidworks_mcp_server.py` over MCP stdio.
3. Calls each entry in `plan.calls` in order using MCP `tools/call`.
4. Returns JSON containing the call results.

Configure the Cady server:

```env
SOLIDWORKS_BRIDGE_URL=http://windows-host:8765
SOLIDWORKS_BRIDGE_TOKEN=replace-with-a-private-token
```

Do not expose an unauthenticated SolidWorks automation bridge to the public
internet. Keep it on a private network or behind a secure tunnel with TLS and
authentication.

## Bridge request contract

```json
{
  "schema": "cady.solidworks-mcp-plan.v1",
  "project": "Untitled project 1",
  "units": "mm",
  "calls": [
    { "tool": "connect_solidworks", "arguments": {} },
    { "tool": "set_units", "arguments": { "unit": "mm" } },
    { "tool": "create_new_part", "arguments": {} }
  ],
  "unsupported": []
}
```
