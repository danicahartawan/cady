import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./app.js", import.meta.url), "utf8");
const registered = new Set(
  [...source.matchAll(/\.register\("([^"]+)"/g)].map((match) => match[1]),
);
const required = [
  "model.add",
  "model.transform",
  "model.duplicate",
  "model.delete",
  "feature.select",
  "feature.setDimensions",
  "feature.transform",
  "project.create",
  "project.createAircraft",
  "project.createClock",
  "project.openRobotArm",
  "sketch.start",
  "sketch.finish",
  "reference.place",
  "view.standard",
  "view.fit",
  "view.showAll",
  "history.undo",
  "history.redo",
  "drawing.open",
  "drawing.regenerate",
  "settings.update",
  "export.step",
];
const missing = required.filter((command) => !registered.has(command));
assert.deepEqual(missing, [], `Missing shared CAD commands: ${missing.join(", ")}`);
assert.match(source, /source: "ui"/);
assert.match(source, /source: "ai"/);
assert.match(source, /source: "mcp"/);
assert.match(source, /source: "script"/);

console.log(`CAD command surface complete: ${required.length} commands`);

