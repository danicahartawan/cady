import assert from "node:assert/strict";
import { CadCommandBus } from "./cad-command-bus.js";

const bus = new CadCommandBus();
const calls = [];
const events = [];
bus.subscribe((event) => events.push(event));
bus.register("shape.box", {
  label: "Create box",
  execute: ({ width }) => {
    calls.push(["box", width]);
    return { width };
  },
});
bus.register("shape.resize", {
  label: "Resize shape",
  canExecute: ({ width }) => width > 0,
  execute: ({ width }, context) => {
    calls.push([context.source, width]);
    return width;
  },
});

assert.deepEqual(await bus.execute("shape.box", { width: 20 }, { source: "ui" }), { width: 20 });
assert.equal(bus.list().length, 2);
assert.equal(bus.describe("shape.box").label, "Create box");
assert.deepEqual(
  await bus.runScript(
    [
      { command: "shape.box", input: { width: 10 } },
      { command: "shape.resize", input: { width: 12 } },
    ],
    { source: "script" },
  ),
  [{ width: 10 }, 12],
);
await assert.rejects(() => bus.execute("shape.resize", { width: 0 }), /unavailable/);
await assert.rejects(() => bus.execute("missing.command"), /Unknown CAD command/);
assert.equal(events.filter((event) => event.type === "completed").length, 3);
assert.deepEqual(calls, [["box", 20], ["box", 10], ["script", 12]]);

console.log("CAD command bus tests passed");

