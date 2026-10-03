import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/TransformControls.js";
import {
  buildSketchExtrusion,
  downloadSTEP,
  initCadKernel,
} from "./vendor/cad-kernel.js";
import { cadCommands } from "./cad-command-bus.js";
const getTransformHelper = TransformControls.prototype.getHelper;
TransformControls.prototype.getHelper = function () {
  const helper = getTransformHelper.call(this);
  helper.traverse((part) => {
    if (part.name === "XYZ" && part.isMesh) {
      part.geometry = new THREE.SphereGeometry(0.19, 28, 20);
      if (part.material && part.material.opacity > 0.2) {
        part.material = part.material.clone();
        part.material.color.set(0x111111);
        part.material.opacity = 1;
      }
    }
  });
  return helper;
};
const opener = document.querySelector("#open-cady"),
  workspace = document.querySelector("#workspace"),
  host = document.querySelector("#cad-canvas"),
  chat = document.querySelector("#chat"),
  prompt = document.querySelector("#prompt"),
  toast = document.querySelector("#toast"),
  chatPanel = document.querySelector("#chat-panel"),
  chatDrag = document.querySelector("#chat-drag"),
  chatClose = document.querySelector("#chat-close"),
  messages = document.querySelector("#chat-messages"),
  sendButton = chat.querySelector(".send");
let toastTimer,
  started = false,
  dragging = false,
  dragX = 0,
  dragY = 0;
const conversation = [];
let selectCadFeature = () => {},
  createExactProject = async () => {},
  runModelAction = () => {},
  hasActiveProject = () => false,
  applySelectedDimensions = () => {},
  registerRecentProject = () => {},
  getActiveProjectData = () => null;
let startSketching = () => {},
  finishSketchFeature = async () => {},
  placeReferenceCanvas = async () => {},
  buildCadyClock = async () => {},
  buildCadyAirplane = async () => {},
  openRobotArmAssembly = () => {},
  exportActiveSTEP = async () => {},
  undoModel = () => {},
  redoModel = () => {},
  selectProjectFeature = () => {},
  applySelectedTransform = () => {},
  setStandardView = () => {},
  fitActiveView = () => {},
  showAllGeometry = () => {};

cadCommands
  .register("model.add", {
    label: "Add primitive",
    inputs: { type: "box | cylinder | sphere" },
    execute: ({ type }) => runModelAction(type),
  })
  .register("model.transform", {
    label: "Transform selection",
    inputs: { mode: "move | rotate | scale" },
    execute: ({ mode }) => runModelAction(mode),
  })
  .register("model.duplicate", {
    label: "Duplicate selection",
    execute: () => runModelAction("duplicate"),
  })
  .register("model.delete", {
    label: "Delete selection",
    execute: () => runModelAction("delete"),
  })
  .register("feature.setDimensions", {
    label: "Edit feature dimensions",
    inputs: { parameters: "object" },
    canExecute: () => hasActiveProject(),
    execute: ({ parameters }) => applySelectedDimensions(parameters),
  })
  .register("feature.select", {
    label: "Select feature",
    inputs: { featureId: "string" },
    canExecute: () => hasActiveProject(),
    execute: ({ featureId }) => selectProjectFeature(featureId),
  })
  .register("feature.transform", {
    label: "Set feature transform",
    inputs: { position: "[x,y,z]", rotation: "[x,y,z]", scale: "[x,y,z]" },
    canExecute: () => hasActiveProject(),
    execute: (transform) => applySelectedTransform(transform),
  })
  .register("project.create", {
    label: "Create project",
    inputs: { name: "string", description: "primitive description" },
    execute: ({ name = "Untitled project", description = "box 3 2 1" }) =>
      createExactProject(name, description),
  })
  .register("project.createAircraft", {
    label: "Create tutorial aircraft",
    inputs: { reset: "boolean" },
    execute: ({ reset = false } = {}) => buildCadyAirplane({ reset }),
  })
  .register("project.createClock", {
    label: "Create clock",
    execute: () => buildCadyClock(),
  })
  .register("project.openRobotArm", {
    label: "Open robot arm assembly",
    execute: () => openRobotArmAssembly(),
  })
  .register("sketch.start", {
    label: "Start sketch",
    execute: () => startSketching(),
  })
  .register("sketch.finish", {
    label: "Finish and extrude sketch",
    inputs: { kind: "rectangle | circle", width: "number", depth: "number", radius: "number", extrude: "number" },
    execute: (profile) => finishSketchFeature(profile),
  })
  .register("reference.place", {
    label: "Place reference canvas",
    inputs: { name: "string", dataUrl: "string", plane: "side | front | top" },
    execute: (reference) => placeReferenceCanvas(reference),
  })
  .register("view.standard", {
    label: "Set standard view",
    inputs: { view: "top | front | right" },
    execute: ({ view }) => setStandardView(view),
  })
  .register("view.fit", {
    label: "Fit active model",
    execute: () => fitActiveView(),
  })
  .register("view.showAll", {
    label: "Show all geometry",
    execute: () => showAllGeometry(),
  })
  .register("drawing.open", {
    label: "Open engineering drawing",
    canExecute: () => hasActiveProject(),
    execute: () => openEngineeringDrawing(),
  })
  .register("drawing.regenerate", {
    label: "Regenerate engineering drawing",
    canExecute: () => hasActiveProject(),
    execute: () => generateEngineeringDrawing(),
  })
  .register("settings.update", {
    label: "Update viewport settings",
    inputs: { grid: "boolean", edges: "boolean", shadows: "boolean", snap: "boolean", snapSize: "number", units: "mm | in" },
    execute: (settings) => updateViewportSettings(settings),
  })
  .register("history.undo", {
    label: "Undo",
    execute: () => undoModel(),
  })
  .register("history.redo", {
    label: "Redo",
    execute: () => redoModel(),
  })
  .register("export.step", {
    label: "Export STEP",
    canExecute: () => hasActiveProject(),
    execute: () => exportActiveSTEP(),
  });

window.cadyCommands = Object.freeze({
  list: () => cadCommands.list(),
  execute: (command, input = {}, source = "script") => cadCommands.execute(command, input, { source }),
  runScript: (steps) => cadCommands.runScript(steps, { source: "script" }),
});
window.cadyMcpAdapter = Object.freeze({
  listTools: () => [
    {
      name: "cady_list_commands",
      description: "List the CAD commands available to the manual UI, scripts, AI, and MCP.",
    },
    {
      name: "cady_execute_command",
      description: "Execute one registered CAD command using the same document and undo history as the UI.",
    },
    {
      name: "cady_run_script",
      description: "Execute an ordered array of registered CAD commands.",
    },
  ],
  callTool: (name, input = {}) => {
    if (name === "cady_list_commands") return cadCommands.list();
    if (name === "cady_execute_command")
      return cadCommands.execute(input.command, input.input || {}, { source: "mcp" });
    if (name === "cady_run_script")
      return cadCommands.runScript(input.steps || [], { source: "mcp" });
    throw new Error(`Unknown cady MCP tool: ${name}`);
  },
});
cadCommands.subscribe((event) => {
  const history = JSON.parse(localStorage.getItem("cady-command-log") || "[]");
  history.push({ ...event, timestamp: new Date().toISOString() });
  localStorage.setItem("cady-command-log", JSON.stringify(history.slice(-200)));
});
function updateViewportSettings(settings = {}) {
  const controls = {
    grid: "#setting-grid",
    edges: "#setting-edges",
    shadows: "#setting-shadows",
    snap: "#setting-snap",
    snapSize: "#setting-snap-size",
    units: "#setting-units",
  };
  Object.entries(settings).forEach(([key, value]) => {
    const control = document.querySelector(controls[key]);
    if (!control) return;
    if (control.type === "checkbox") control.checked = Boolean(value);
    else control.value = String(value);
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function mesh(g, m) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function edge(o) {
  const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(o.geometry, 28),
      new THREE.LineBasicMaterial({
        color: 0x555b58,
        transparent: true,
        opacity: 0.5,
      }),
    );
  outline.userData.cadyEdge = true;
  o.add(outline);
  return o;
}
function cylinder(r, h, m) {
  return edge(mesh(new THREE.CylinderGeometry(r, r, h, 48), m));
}
function joint(r, m) {
  const g = new THREE.Group(),
    body = cylinder(r, r * 0.62, m);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const hub = cylinder(
    r * 0.47,
    r * 0.72,
    new THREE.MeshStandardMaterial({
      color: 0x737b76,
      roughness: 0.35,
      metalness: 0.58,
    }),
  );
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 6; i++) {
    const b = mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.055, 18),
      new THREE.MeshStandardMaterial({
        color: 0x3e4441,
        metalness: 0.75,
        roughness: 0.26,
      }),
    );
    b.rotation.x = Math.PI / 2;
    b.position.set(
      Math.cos((i * Math.PI) / 3) * r * 0.7,
      Math.sin((i * Math.PI) / 3) * r * 0.7,
      r * 0.34,
    );
    g.add(b);
  }
  return g;
}
function link(a, b, w, m) {
  const mid = a.clone().add(b).multiplyScalar(0.5),
    o = edge(mesh(new THREE.BoxGeometry(w, w * 0.72, a.distanceTo(b)), m)),
    g = new THREE.Group();
  g.add(o);
  g.position.copy(mid);
  g.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    b.clone().sub(a).normalize(),
  );
  return g;
}
function init3D() {
  if (started) return;
  started = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(
    32,
    host.clientWidth / host.clientHeight,
    0.1,
    10000,
  );
  camera.position.set(8, 6.5, 10);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9beb9, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(5, 10, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcbd8ff, 1.2);
  fill.position.set(-6, 4, 4);
  scene.add(fill);
  const grid = new THREE.GridHelper(24, 48, 0xb9bfbb, 0xdfe2df);
  grid.material.transparent = true;
  grid.material.opacity = 0.48;
  scene.add(grid);
  const plane = mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ color: 0x67706b, opacity: 0.13 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.015;
  scene.add(plane);
  const silver = new THREE.MeshStandardMaterial({
      color: 0xc5cbc7,
      metalness: 0.58,
      roughness: 0.32,
    }),
    light = new THREE.MeshStandardMaterial({
      color: 0xe4e7e3,
      metalness: 0.42,
      roughness: 0.36,
    }),
    dark = new THREE.MeshStandardMaterial({
      color: 0x737b76,
      metalness: 0.62,
      roughness: 0.3,
    }),
    arm = new THREE.Group();
  const base1 = cylinder(1.48, 0.24, dark);
  base1.position.y = 0.12;
  arm.add(base1);
  const base2 = cylinder(1.15, 0.32, silver);
  base2.position.y = 0.36;
  arm.add(base2);
  const pedestal = cylinder(0.68, 1.45, light);
  pedestal.position.y = 1.15;
  arm.add(pedestal);
  const shoulder = new THREE.Vector3(0, 1.95, 0),
    elbow = new THREE.Vector3(1.55, 4.15, 0),
    wrist = new THREE.Vector3(4.15, 3.7, 0);
  const s = joint(0.76, silver);
  s.position.copy(shoulder);
  arm.add(s, link(shoulder, elbow, 0.65, light));
  const e = joint(0.68, silver);
  e.position.copy(elbow);
  arm.add(e, link(elbow, wrist, 0.58, light));
  const w = joint(0.57, silver);
  w.position.copy(wrist);
  arm.add(w, link(wrist, new THREE.Vector3(4.35, 2.85, 0), 0.4, dark));
  const palm = edge(mesh(new THREE.BoxGeometry(0.86, 0.62, 0.72), silver));
  palm.position.set(4.42, 2.48, 0);
  arm.add(palm);
  [-1, 1].forEach((side) => {
    const f = edge(mesh(new THREE.BoxGeometry(0.18, 0.85, 0.28), dark));
    f.position.set(4.42 + side * 0.34, 1.78, 0);
    f.rotation.z = side * -0.25;
    arm.add(f);
    const t = edge(mesh(new THREE.BoxGeometry(0.18, 0.42, 0.28), silver));
    t.position.set(4.42 + side * 0.45, 1.23, 0);
    t.rotation.z = side * 0.18;
    arm.add(t);
  });
  arm.position.set(-1.2, 0, -0.2);
  scene.add(arm);
  const defaultArmChildren = [...arm.children];
  const dimensionEditor = document.querySelector("#dimension-editor"),
    dimensionHeading = document.querySelector("#dimension-heading"),
    dimensionControls = document.querySelector("#dimension-controls"),
    partList = document.querySelector("#part-list");
  const robotPartListMarkup = partList.innerHTML;
  let projectModel = null,
    projectModelActive = false,
    activeProjectData = null;
  const referenceObjects = new Map();
  const kernelShapes = new Map();
  let history = [],
    historyIndex = -1,
    restoringHistory = false;
  function removeReferenceObjects() {
    referenceObjects.forEach((object) => {
      scene.remove(object);
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
    referenceObjects.clear();
  }
  function buildReferenceObject(reference) {
    const image = new Image();
    image.src = reference.image;
    const texture = new THREE.Texture(image);
    image.addEventListener("load", () => {
      texture.needsUpdate = true;
      const aspect = image.naturalHeight / Math.max(1, image.naturalWidth);
      const width = reference.length * reference.scale;
      const height = width * aspect;
      object.geometry.dispose();
      object.geometry = new THREE.PlaneGeometry(width, height);
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: reference.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const object = new THREE.Mesh(new THREE.PlaneGeometry(reference.length, reference.length * 0.6), material);
    object.userData.referenceId = reference.id;
    object.renderOrder = -1;
    const angle = THREE.MathUtils.degToRad(reference.rotation || 0);
    if (reference.plane === "front") {
      object.rotation.set(0, Math.PI / 2, angle);
      object.position.x = reference.offset;
    } else if (reference.plane === "top") {
      object.rotation.set(-Math.PI / 2, 0, angle);
      object.position.y = reference.offset;
    } else {
      object.rotation.set(0, 0, angle);
      object.position.z = reference.offset;
    }
    scene.add(object);
    referenceObjects.set(reference.id, object);
    return object;
  }
  function restoreReferences(references = []) {
    removeReferenceObjects();
    references.forEach(buildReferenceObject);
  }
  const axes = new THREE.AxesHelper(1.2);
  axes.position.set(5.6, 0.02, 3.8);
  scene.add(axes);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.target.set(1.1, 2.15, 0);
  controls.minDistance = 6;
  controls.maxDistance = 20;
  controls.update();
  function frameStandardView(view) {
    const featureIds = new Set(activeProjectData?.features?.map((feature) => feature.id) || []);
    const visible = arm.children.filter((child) => child.visible && featureIds.has(child.userData.featureId));
    const bounds = visible.length
      ? visible.reduce((box, object) => box.expandByObject(object), new THREE.Box3())
      : new THREE.Box3().setFromObject(arm);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 4) * 1.9;
    controls.target.copy(center);
    if (view === "top") camera.position.set(center.x, center.y + distance, center.z + 0.001);
    if (view === "front") camera.position.set(center.x, center.y, center.z + distance);
    if (view === "right") camera.position.set(center.x + distance, center.y, center.z);
    camera.lookAt(center);
    camera.near = Math.max(0.01, distance / 1000);
    camera.far = Math.max(10000, distance * 20);
    camera.updateProjectionMatrix();
    controls.update();
  }
  function frameModelIsometric() {
    const featureIds = new Set(activeProjectData?.features?.map((feature) => feature.id) || []);
    const visible = arm.children.filter((child) => child.visible && featureIds.has(child.userData.featureId));
    const bounds = visible.length
      ? visible.reduce((box, object) => box.expandByObject(object), new THREE.Box3())
      : new THREE.Box3().setFromObject(arm);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 4);
    controls.target.copy(center);
    camera.position.set(center.x + span * 1.35, center.y + span * 0.82, center.z + span * 1.45);
    camera.lookAt(center);
    controls.maxDistance = Math.max(20, span * 8);
    controls.update();
  }
  setStandardView = frameStandardView;
  fitActiveView = frameModelIsometric;
  document.querySelectorAll(".cube-face").forEach((face) =>
    face.addEventListener("click", () => {
      cadCommands.execute(
        "view.standard",
        { view: face.dataset.view },
        { source: "ui" },
      );
    }),
  );
  const transform = new TransformControls(camera, renderer.domElement);
  transform.setMode("translate");
  transform.setSize(0.72);
  scene.add(transform.getHelper());
  const gridSetting = document.querySelector("#setting-grid"),
    edgeSetting = document.querySelector("#setting-edges"),
    shadowSetting = document.querySelector("#setting-shadows"),
    snapSetting = document.querySelector("#setting-snap"),
    snapSizeSetting = document.querySelector("#setting-snap-size"),
    unitsSetting = document.querySelector("#setting-units");
  gridSetting.addEventListener("change", () => (grid.visible = gridSetting.checked));
  edgeSetting.addEventListener("change", () =>
    scene.traverse((item) => {
      if (item.userData.cadyEdge) item.visible = edgeSetting.checked;
    }),
  );
  shadowSetting.addEventListener("change", () => {
    renderer.shadowMap.enabled = shadowSetting.checked;
    plane.visible = shadowSetting.checked;
  });
  function updateSnapping() {
    const amount = snapSetting.checked ? Number(snapSizeSetting.value) : null;
    transform.setTranslationSnap(amount);
    transform.setScaleSnap(amount);
    transform.setRotationSnap(snapSetting.checked ? THREE.MathUtils.degToRad(15) : null);
  }
  snapSetting.addEventListener("change", updateSnapping);
  snapSizeSetting.addEventListener("change", updateSnapping);
  unitsSetting.addEventListener("change", () =>
    localStorage.setItem("cady-units", unitsSetting.value),
  );
  unitsSetting.value = localStorage.getItem("cady-units") || "mm";
  const transformPanel = document.querySelector("#transform-panel"),
    axisInputs = [...transformPanel.querySelectorAll("input")];
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    selection = new THREE.Box3Helper(new THREE.Box3(), 0x1d1d1f);
  selection.visible = false;
  scene.add(selection);
  let selectedObject = null,
    transformDragging = false;
  function clearSelection() {
    selection.visible = false;
    selectedObject = null;
    transform.detach();
    transformPanel.classList.remove("show");
    dimensionEditor.hidden = true;
    if (typeof featureMarker !== "undefined") featureMarker.style.opacity = "0";
    document
      .querySelectorAll("[data-part]")
      .forEach((node) => node.classList.remove("part-selected"));
  }
  function syncTransform() {
    if (!selectedObject) return;
    selection.box.copy(new THREE.Box3().setFromObject(selectedObject));
    axisInputs.forEach(
      (input) =>
        (input.value = selectedObject.position[input.dataset.axis].toFixed(2)),
    );
  }
  function selectDirectObject(direct, part) {
    if (!direct) return;
    selectedObject = direct;
    selection.visible = true;
    transform.attach(direct);
    transformPanel.classList.add("show");
    syncTransform();
    document
      .querySelectorAll("[data-part]")
      .forEach((node) =>
        node.classList.toggle("part-selected", node.dataset.part === part),
      );
    if (direct.userData.featureId) renderDimensionEditor();
  }
  selectProjectFeature = (featureId) => {
    const object = arm.children.find((child) => child.userData.featureId === featureId);
    if (!object) throw new Error(`Feature not found: ${featureId}`);
    selectDirectObject(object, "project");
    renderDimensionEditor();
    return activeProjectData.features.find((feature) => feature.id === featureId);
  };
  const featureObjects = {
    "Front plane": arm.children[0],
    "Revolve 01": arm.children[2],
    "Fillet 01": arm.children[1],
    "Extrude 02": arm.children[3],
    "Hole pattern": arm.children[3],
    "Extrude 03": arm.children[4],
    "Fillet 02": arm.children[4],
    "Revolve 02": arm.children[5],
    "Joint pattern": arm.children[5],
    "Wrist revolve": arm.children[7],
    "Gripper mirror": arm.children[9],
  };
  function geometryForFeature(type, parameters) {
    let geometry;
    if (type === "aircraft-fuselage") {
      const length = parameters.length;
      const radius = parameters.radius;
      const points = [
        [0, 0.03], [0.018, 0.28], [0.055, 0.62], [0.11, 0.88],
        [0.18, 1], [0.69, 1], [0.79, 0.9], [0.88, 0.64],
        [0.95, 0.36], [1, 0.045],
      ].map(([fraction, scale]) => new THREE.Vector2(radius * scale, fraction * length - length / 2));
      geometry = new THREE.LatheGeometry(points, 72);
      geometry.rotateX(Math.PI / 2);
    } else if (type === "aircraft-wing") {
      const span = parameters.span,
        root = parameters.rootChord,
        tip = parameters.tipChord,
        half = parameters.thickness / 2;
      const sweep = Number(parameters.sweep || 0);
      const positions = [
        0,-half,-root/2, span,-half,sweep-tip/2, span,-half,sweep+tip/2, 0,-half,root/2,
        0,half,-root/2, span,half,sweep-tip/2, span,half,sweep+tip/2, 0,half,root/2,
      ];
      const indices = [0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
    } else if (type === "aircraft-fin") {
      const length = parameters.length,
        height = parameters.finHeight,
        thickness = parameters.thickness / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-length/2,0); shape.lineTo(length/2,0); shape.lineTo(length/3,height); shape.lineTo(-length/3,height*0.72); shape.closePath();
      geometry = new THREE.ExtrudeGeometry(shape,{depth:thickness*2,bevelEnabled:false});
      geometry.translate(0,0,-thickness);
    } else if (type === "cone") {
      geometry = new THREE.CylinderGeometry(parameters.radiusTip,parameters.radius,parameters.height,64);
      geometry.translate(0,parameters.height/2,0);
    } else if (type === "torus") {
      geometry = new THREE.TorusGeometry(parameters.radius, parameters.tube, 24, 72);
    } else if (type === "sketch-extrude") {
      if (parameters.kind === "circle") {
        geometry = new THREE.CylinderGeometry(
          parameters.radius,
          parameters.radius,
          parameters.extrude,
          72,
        );
        geometry.translate(0, parameters.extrude / 2, 0);
      } else {
        geometry = new THREE.BoxGeometry(
          parameters.width,
          parameters.extrude,
          parameters.depth,
        );
        geometry.translate(0, parameters.extrude / 2, 0);
      }
    } else if (type === "sphere") {
      geometry = new THREE.SphereGeometry(parameters.radius, 64, 40);
      geometry.translate(0, parameters.radius, 0);
    } else if (type === "cylinder") {
      geometry = new THREE.CylinderGeometry(
        parameters.radius,
        parameters.radius,
        parameters.height,
        64,
      );
      geometry.translate(0, parameters.height / 2, 0);
    } else {
      geometry = new THREE.BoxGeometry(
        parameters.width,
        parameters.height,
        parameters.depth,
      );
      geometry.translate(0, parameters.height / 2, 0);
    }
    return geometry;
  }
  function threeGeometryFromKernel(kernelMesh) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(kernelMesh.vertices, 3),
    );
    if (kernelMesh.normals?.length)
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(kernelMesh.normals, 3),
      );
    geometry.setIndex(kernelMesh.triangles);
    if (!kernelMesh.normals?.length) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  async function rebuildKernelFeature(feature) {
    if (feature.type !== "sketch-extrude") return;
    const result = await buildSketchExtrusion(feature.parameters);
    kernelShapes.set(feature.id, result.shape);
    const object = arm.children.find(
      (child) => child.userData.featureId === feature.id,
    );
    if (!object) return;
    const oldGeometry = object.geometry;
    // Keep the fast Three.js preview aligned to the editor's Y-up scene.
    // The OpenCascade shape is retained as the authoritative export solid.
    object.geometry = geometryForFeature(feature.type, feature.parameters);
    oldGeometry?.dispose();
    object.children.forEach((child) => {
      if (!child.isLineSegments) return;
      child.geometry.dispose();
      child.geometry = new THREE.EdgesGeometry(object.geometry, 28);
    });
    syncTransform();
  }
  function saveActiveDocument() {
    if (!activeProjectData) return;
    const documents = JSON.parse(
      localStorage.getItem("cady-model-documents") || "{}",
    );
    documents[activeProjectData.name] = activeProjectData;
    localStorage.setItem("cady-model-documents", JSON.stringify(documents));
  }
  function updateHistoryButtons() {
    document.querySelector("#undo-model").disabled = historyIndex <= 0;
    document.querySelector("#redo-model").disabled =
      historyIndex < 0 || historyIndex >= history.length - 1;
  }
  function commitHistory() {
    if (!activeProjectData || restoringHistory) return;
    const snapshot = JSON.stringify(activeProjectData);
    if (history[historyIndex] === snapshot) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snapshot);
    if (history.length > 60) history.shift();
    historyIndex = history.length - 1;
    saveActiveDocument();
    updateHistoryButtons();
  }
  function removeProjectObjects() {
    arm.children
      .filter((child) => child.userData.featureId)
      .forEach((child) => {
        arm.remove(child);
        child.geometry?.dispose();
      });
  }
  openRobotArmAssembly = () => {
    clearSelection();
    removeProjectObjects();
    removeReferenceObjects();
    activeProjectData = null;
    projectModel = null;
    projectModelActive = false;
    kernelShapes.clear();
    defaultArmChildren.forEach((child) => (child.visible = true));
    document.querySelector('.group-row[data-part="assembly"]').textContent =
      "Robot arm assembly";
    document.querySelector('.group-row[data-part="base"]').textContent = "Base";
    partList.innerHTML = robotPartListMarkup;
    document
      .querySelectorAll(
        '.cad-group > .group-row[data-part]:not([data-part="assembly"]):not([data-part="base"])',
      )
      .forEach((row) => (row.parentElement.style.display = "block"));
    dimensionEditor.hidden = true;
    controls.maxDistance = 20;
    controls.target.set(1.1, 2.15, 0);
    camera.position.set(8, 6.5, 10);
    controls.update();
    history = [];
    historyIndex = -1;
    const stepButton = document.querySelector("#export-step");
    stepButton.disabled = true;
    stepButton.title = "STEP requires a kernel-backed sketch extrusion";
    updateHistoryButtons();
  };
  async function restoreDocument(documentData) {
    restoringHistory = true;
    clearSelection();
    removeProjectObjects();
    activeProjectData = structuredClone(documentData);
    activeProjectData.references ||= [];
    restoreReferences(activeProjectData.references);
    projectModelActive = true;
    arm.children.forEach((child) => {
      if (!child.userData.featureId) child.visible = false;
    });
    for (const feature of activeProjectData.features) {
      if (feature.type === "sketch-extrude") {
        if (feature.parameters.kind === "circle") {
          delete feature.parameters.width;
          delete feature.parameters.depth;
        } else {
          delete feature.parameters.radius;
        }
      }
      const featureMaterial = feature.appearance?.color !== undefined
        ? new THREE.MeshStandardMaterial({
            color: feature.appearance.color,
            roughness: feature.appearance.roughness ?? 0.62,
            metalness: feature.appearance.metalness ?? 0.03,
          })
        : light;
      const object = edge(mesh(geometryForFeature(feature.type, feature.parameters), featureMaterial));
      object.userData.part = "project";
      object.userData.featureId = feature.id;
      object.position.fromArray(feature.transform?.position || [0, 0, 0]);
      object.rotation.fromArray([...(feature.transform?.rotation || [0, 0, 0]), "XYZ"]);
      object.scale.fromArray(feature.transform?.scale || [1, 1, 1]);
      arm.add(object);
      if (!projectModel) projectModel = object;
      if (feature.type === "sketch-extrude") await rebuildKernelFeature(feature);
    }
    projectModel = arm.children.find((child) => child.userData.featureId) || null;
    document.querySelector('.group-row[data-part="assembly"]').textContent =
      activeProjectData.name;
    document.querySelector('.group-row[data-part="base"]').textContent =
      activeProjectData.features.length ? "Part" : "Setup";
    document
      .querySelectorAll(
        '.cad-group > .group-row[data-part]:not([data-part="assembly"]):not([data-part="base"])',
      )
      .forEach((row) => (row.parentElement.style.display = "none"));
    renderPartList();
    const restoredObjects = arm.children.filter((child) => child.userData.featureId);
    if (restoredObjects.length) {
      clearSelection();
      frameModelIsometric();
    } else if (activeProjectData.references?.length) {
      const reference = activeProjectData.references.at(-1);
      const span = Math.max(10, reference.length * reference.scale);
      controls.maxDistance = Math.max(20, span * 4);
      controls.target.set(0, 0, 0);
      if (reference.plane === "front") camera.position.set(span * 2.2, 0, 0.01);
      else if (reference.plane === "top") camera.position.set(0.01, span * 2.2, 0);
      else camera.position.set(0.01, 0, span * 2.2);
      camera.lookAt(0, 0, 0);
      controls.update();
    }
    restoringHistory = false;
    saveActiveDocument();
  }
  undoModel = async () => {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    await restoreDocument(JSON.parse(history[historyIndex]));
    saveActiveDocument();
    updateHistoryButtons();
  };
  redoModel = async () => {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    await restoreDocument(JSON.parse(history[historyIndex]));
    saveActiveDocument();
    updateHistoryButtons();
  };
  function buildMeshStarter(description = "") {
    const text = description.toLowerCase();
    const values = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    let geometry, feature, parameters, type;
    if (/sphere|ball/.test(text)) {
      const radius = values[0] || 1.25;
      type = "sphere";
      parameters = { radius };
      feature = `Sphere R${radius}`;
    } else if (/cylinder|tube|round|disc|disk/.test(text)) {
      const radius = values[0] || 1.25;
      const height = values[1] || 2.4;
      type = "cylinder";
      parameters = { radius, height };
      feature = `Cylinder R${radius} H${height}`;
    } else {
      const width = values[0] || 3;
      const depth = values[1] || 2;
      const height = values[2] || 1.4;
      type = "box";
      parameters = { width, depth, height };
      feature = `Box ${width} × ${depth} × ${height}`;
    }
    geometry = geometryForFeature(type, parameters);
    const object = edge(mesh(geometry, light));
    object.userData.feature = { type, parameters };
    return { object, feature, type, parameters };
  }
  function renderDimensionEditor() {
    if (!activeProjectData || !selectedObject) return;
    const feature = activeProjectData.features.find(
      (item) => item.id === selectedObject.userData.featureId,
    );
    if (!feature) return;
    const labels = {
      width: "Width",
      depth: "Depth",
      height: "Height",
      radius: "Radius",
      extrude: "Extrude",
      length: "Length",
      span: "Span",
      rootChord: "Root chord",
      tipChord: "Tip chord",
      thickness: "Thickness",
      sweep: "Sweep",
      finHeight: "Fin height",
      radiusTip: "Tip radius",
    };
    dimensionControls.innerHTML = "";
    const entries = Object.entries(feature.parameters).filter(
      ([, value]) => typeof value === "number",
    );
    dimensionHeading.querySelector("span").textContent = entries.length;
    entries.forEach(([key, value]) => {
      const row = document.createElement("label");
      row.className = "dimension-row";
      const controlMax = Math.max(12, Math.ceil(value * 2));
      row.innerHTML = `<span>${labels[key] || key}</span><input class="dimension-range" type="range" min="0.05" max="${controlMax}" step="0.05"><input class="dimension-number" type="number" min="0.05" max="1000" step="0.05">`;
      const range = row.querySelector(".dimension-range");
      const number = row.querySelector(".dimension-number");
      range.value = value;
      number.value = value;
      let commitTimer;
      const update = (nextValue) => {
        const next = Math.max(0.05, Number(nextValue) || 0.05);
        feature.parameters[key] = next;
        range.value = Math.min(controlMax, next);
        number.value = next;
        const oldGeometry = selectedObject.geometry;
        selectedObject.geometry = geometryForFeature(feature.type, feature.parameters);
        oldGeometry.dispose();
        selectedObject.children.forEach((child) => {
          if (!child.isLineSegments) return;
          child.geometry.dispose();
          child.geometry = new THREE.EdgesGeometry(selectedObject.geometry, 28);
        });
        if (feature.symmetryGroup) {
          activeProjectData.features
            .filter((candidate) => candidate.id !== feature.id && candidate.symmetryGroup === feature.symmetryGroup)
            .forEach((candidate) => {
              candidate.parameters[key] = next;
              const pairedObject = arm.children.find((child) => child.userData.featureId === candidate.id);
              if (!pairedObject) return;
              const pairedGeometry = pairedObject.geometry;
              pairedObject.geometry = geometryForFeature(candidate.type, candidate.parameters);
              pairedGeometry.dispose();
              pairedObject.children.forEach((child) => {
                if (!child.isLineSegments) return;
                child.geometry.dispose();
                child.geometry = new THREE.EdgesGeometry(pairedObject.geometry, 28);
              });
            });
        }
        syncTransform();
      };
      const commitDimension = async () => {
        clearTimeout(commitTimer);
        if (feature.type === "sketch-extrude") await rebuildKernelFeature(feature);
        renderPartList();
        commitHistory();
      };
      range.addEventListener("input", () => update(range.value));
      number.addEventListener("input", () => {
        update(number.value);
        clearTimeout(commitTimer);
        commitTimer = setTimeout(commitDimension, 320);
      });
      number.addEventListener("change", commitDimension);
      dimensionControls.appendChild(row);
    });
    dimensionEditor.hidden = false;
  }
  function featureLabel(feature) {
    const p = feature.parameters;
    if (feature.name) return feature.name;
    if (feature.type === "sketch-extrude")
      return p.kind === "circle"
        ? `Sketch circle R${p.radius} → Extrude ${p.extrude}`
        : `Sketch ${p.width} × ${p.depth} → Extrude ${p.extrude}`;
    if (feature.type === "sphere") return `Sphere R${p.radius}`;
    if (feature.type === "cylinder") return `Cylinder R${p.radius} H${p.height}`;
    return `Box ${p.width} × ${p.depth} × ${p.height}`;
  }
  function renderPartList() {
    if (!activeProjectData) return;
    partList.innerHTML = "";
    activeProjectData.features.forEach((feature, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cad-leaf";
      button.dataset.part = "project";
      button.dataset.featureId = feature.id;
      button.textContent = `${index + 1}. ${featureLabel(feature)}`;
      button.addEventListener("click", () => {
        document.querySelectorAll(".cad-leaf").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        moveFeatureMarker(button);
        cadCommands.execute(
          "feature.select",
          { featureId: feature.id },
          { source: "ui" },
        );
      });
      partList.appendChild(button);
    });
    (activeProjectData.references || []).forEach((reference) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cad-leaf reference-leaf";
      button.innerHTML = `${reference.name}<span>${reference.plane} · ${reference.length} mm</span>`;
      button.addEventListener("click", () => openReferenceEditor(reference));
      partList.appendChild(button);
    });
    const stepButton = document.querySelector("#export-step");
    const hasExactSolid = activeProjectData.features.some(
      (feature) => feature.type === "sketch-extrude",
    );
    stepButton.disabled = !hasExactSolid;
    stepButton.title = hasExactSolid
      ? "Export the exact kernel-backed solid as STEP"
      : "STEP requires a kernel-backed sketch extrusion";
  }
  dimensionHeading.addEventListener("click", () => {
    dimensionEditor.classList.toggle("collapsed");
  });
  createExactProject = async (name, description) => {
    const documents = JSON.parse(
      localStorage.getItem("cady-model-documents") || "{}",
    );
    if (documents[name]) {
      await restoreDocument(documents[name]);
      history = [JSON.stringify(activeProjectData)];
      historyIndex = 0;
      updateHistoryButtons();
      return { restored: true };
    }
    clearSelection();
    const result = buildMeshStarter(description);
    arm.children.forEach((child) => (child.visible = false));
    if (projectModel) arm.remove(projectModel);
    projectModel = result.object;
    projectModel.userData.part = "project";
    projectModel.userData.featureId = "feature-1";
    arm.add(projectModel);
    projectModelActive = true;
    activeProjectData = {
      version: 1,
      name,
      engine: "three.js",
      references: [],
      features: [
        {
          id: "feature-1",
          type: result.type,
          parameters: result.parameters,
          transform: {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        },
      ],
    };
    featureObjects.Origin = projectModel;
    featureObjects["Mesh solid"] = projectModel;
    featureObjects[result.feature] = projectModel;
    document.querySelector('.group-row[data-part="assembly"]').textContent =
      name;
    document.querySelector('.group-row[data-part="base"]').textContent = "Part";
    renderPartList();
    document
      .querySelectorAll(
        '.cad-group > .group-row[data-part]:not([data-part="assembly"]):not([data-part="base"])',
      )
      .forEach((row) => (row.parentElement.style.display = "none"));
    controls.target.set(-1.2, 1, -0.2);
    camera.position.set(6, 4.5, 7);
    controls.update();
    selectDirectObject(projectModel, "project");
    renderDimensionEditor();
    history = [];
    historyIndex = -1;
    commitHistory();
    return result;
  };
  finishSketchFeature = async (profile) => {
    if (!activeProjectData) {
      clearSelection();
      arm.children.forEach((child) => (child.visible = false));
      activeProjectData = {
        version: 2,
        name: "Untitled sketch",
        engine: "opencascade",
        references: [],
        features: [],
      };
      projectModelActive = true;
      document.querySelector('.group-row[data-part="assembly"]').textContent =
        activeProjectData.name;
      document.querySelector('.group-row[data-part="base"]').textContent = "Part";
      document
        .querySelectorAll(
          '.cad-group > .group-row[data-part]:not([data-part="assembly"]):not([data-part="base"])',
        )
        .forEach((row) => (row.parentElement.style.display = "none"));
    }
    const id = `feature-${Date.now()}`;
    const parameters =
      profile.kind === "circle"
        ? {
            kind: "circle",
            radius: Math.max(0.1, Number(profile.radius) || 20),
            extrude: Math.max(0.1, Number(profile.extrude) || 10),
          }
        : {
            kind: "rectangle",
            width: Math.max(0.1, Number(profile.width) || 60),
            depth: Math.max(0.1, Number(profile.depth) || 40),
            extrude: Math.max(0.1, Number(profile.extrude) || 10),
          };
    const feature = {
      id,
      type: "sketch-extrude",
      plane: "Top",
      parameters,
      constraints:
        parameters.kind === "circle"
          ? ["concentric-origin", "radius"]
          : ["horizontal", "vertical", "coincident", "width", "depth"],
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    const object = edge(mesh(geometryForFeature(feature.type, parameters), light));
    object.userData.part = "project";
    object.userData.featureId = id;
    arm.add(object);
    activeProjectData.features.push(feature);
    projectModel ||= object;
    await rebuildKernelFeature(feature);
    renderPartList();
    selectDirectObject(object, "project");
    renderDimensionEditor();
    const span = Math.max(
      parameters.width,
      parameters.depth,
      parameters.radius * 2,
      parameters.extrude,
    );
    controls.maxDistance = Math.max(20, span * 8);
    controls.target.set(0, parameters.extrude / 2, 0);
    camera.position.set(span * 1.2, span * 0.9, span * 1.35);
    controls.update();
    commitHistory();
    registerRecentProject(activeProjectData.name, "sketch");
    return feature;
  };
  placeReferenceCanvas = async (reference) => {
    if (!activeProjectData) {
      clearSelection();
      arm.children.forEach((child) => (child.visible = false));
      activeProjectData = {
        version: 2,
        name: "Untitled setup",
        engine: "opencascade",
        references: [],
        features: [],
      };
      projectModelActive = true;
      document.querySelector('.group-row[data-part="assembly"]').textContent = activeProjectData.name;
      document.querySelector('.group-row[data-part="base"]').textContent = "Setup";
      document
        .querySelectorAll('.cad-group > .group-row[data-part]:not([data-part="assembly"]):not([data-part="base"])')
        .forEach((row) => (row.parentElement.style.display = "none"));
    }
    activeProjectData.references ||= [];
    const existingIndex = activeProjectData.references.findIndex((item) => item.id === reference.id);
    if (existingIndex >= 0) {
      activeProjectData.references[existingIndex] = reference;
      const old = referenceObjects.get(reference.id);
      if (old) {
        scene.remove(old);
        old.geometry.dispose();
        old.material.map?.dispose();
        old.material.dispose();
      }
    } else {
      activeProjectData.references.push(reference);
    }
    buildReferenceObject(reference);
    renderPartList();
    commitHistory();
    registerRecentProject(activeProjectData.name, "reference setup");
    const span = Math.max(10, reference.length * reference.scale);
    controls.maxDistance = Math.max(20, span * 4);
    controls.target.set(0, 0, 0);
    if (reference.plane === "front") camera.position.set(span * 2.2, 0, 0.01);
    else if (reference.plane === "top") camera.position.set(0.01, span * 2.2, 0);
    else camera.position.set(0.01, 0, span * 2.2);
    camera.lookAt(0, 0, 0);
    controls.update();
    return reference;
  };
  buildCadyClock = async () => {
    const documents = JSON.parse(
      localStorage.getItem("cady-model-documents") || "{}",
    );
    delete documents["Cady clock"];
    localStorage.setItem("cady-model-documents", JSON.stringify(documents));
    await createExactProject("Cady clock", "cylinder 3.2 0.38");
    const faceFeature = activeProjectData.features[0];
    faceFeature.name = "Clock face";
    faceFeature.parameters = { radius: 3.2, height: 0.38 };
    projectModel.geometry.dispose();
    projectModel.geometry = geometryForFeature("cylinder", faceFeature.parameters);
    projectModel.rotation.x = Math.PI / 2;
    projectModel.position.set(0, 3.4, 0);
    faceFeature.transform = {
      position: projectModel.position.toArray(),
      rotation: projectModel.rotation.toArray().slice(0, 3),
      scale: [1, 1, 1],
    };
    const addClockPart = (name, type, parameters, position, rotation = [0, 0, 0]) => {
      const id = `feature-${Date.now()}-${activeProjectData.features.length}`;
      const object = edge(mesh(geometryForFeature(type, parameters), light));
      object.userData.part = "project";
      object.userData.featureId = id;
      object.position.fromArray(position);
      object.rotation.set(...rotation);
      arm.add(object);
      activeProjectData.features.push({
        id,
        name,
        type,
        parameters: { ...parameters },
        transform: {
          position: object.position.toArray(),
          rotation: object.rotation.toArray().slice(0, 3),
          scale: [1, 1, 1],
        },
      });
      return object;
    };
    addClockPart("Minute hand", "box", { width: 0.16, depth: 0.12, height: 2.25 }, [0, 4.35, 0.34], [0, 0, -0.48]);
    addClockPart("Hour hand", "box", { width: 0.2, depth: 0.14, height: 1.55 }, [0.48, 3.95, 0.4], [0, 0, 0.82]);
    const center = addClockPart("Center pin", "cylinder", { radius: 0.25, height: 0.24 }, [0, 3.4, 0.52], [Math.PI / 2, 0, 0]);
    center.material = dark;
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const marker = addClockPart(
        `Hour marker ${index + 1}`,
        "box",
        { width: index % 3 === 0 ? 0.18 : 0.1, depth: 0.1, height: index % 3 === 0 ? 0.52 : 0.34 },
        [Math.sin(angle) * 2.65, 3.4 + Math.cos(angle) * 2.65, 0.35],
        [0, 0, -angle],
      );
      marker.material = dark;
    }
    renderPartList();
    selectDirectObject(projectModel, "project");
    renderDimensionEditor();
    controls.maxDistance = 60;
    controls.target.set(0, 3.4, 0);
    camera.position.set(0.3, 3.7, 14);
    controls.update();
    commitHistory();
    registerRecentProject("Cady clock", "clock");
    return activeProjectData;
  };
  buildCadyAirplane = async ({ reset = false } = {}) => {
    const documents = JSON.parse(localStorage.getItem("cady-model-documents") || "{}");
    if (documents["Aircraft tutorial"] && !reset) {
      await restoreDocument(documents["Aircraft tutorial"]);
      history = [JSON.stringify(activeProjectData)];
      historyIndex = 0;
      updateHistoryButtons();
      return activeProjectData;
    }
    if (reset) {
      delete documents["Aircraft tutorial"];
      localStorage.setItem("cady-model-documents", JSON.stringify(documents));
    }
    await createExactProject("Aircraft tutorial", "cylinder 0.85 14");
    const fuselageFeature = activeProjectData.features[0];
    fuselageFeature.name = "Fuselage";
    fuselageFeature.type = "aircraft-fuselage";
    fuselageFeature.parameters = { radius: 0.9, length: 15.8 };
    projectModel.geometry.dispose();
    projectModel.geometry = geometryForFeature("aircraft-fuselage", fuselageFeature.parameters);
    projectModel.rotation.set(0,0,0);
    projectModel.position.set(0,1.8,0);
    fuselageFeature.transform = {position:projectModel.position.toArray(),rotation:[0,0,0],scale:[1,1,1]};
    const addAircraftPart=(name,type,parameters,position,rotation=[0,0,0],scale=[1,1,1],material=light)=>{
      const id=`feature-${Date.now()}-${activeProjectData.features.length}`;
      const object=edge(mesh(geometryForFeature(type,parameters),material));
      object.userData.part="project"; object.userData.featureId=id;
      object.position.fromArray(position); object.rotation.set(...rotation); object.scale.fromArray(scale); arm.add(object);
      activeProjectData.features.push({
        id,name,type,parameters:{...parameters},
        appearance:{color:material.color.getHex(),roughness:material.roughness,metalness:material.metalness},
        transform:{position:[...position],rotation:[...rotation],scale:[...scale]},
      });
      return object;
    };
    addAircraftPart("Right wing","aircraft-wing",{span:6.8,rootChord:4.5,tipChord:1.05,thickness:0.2,sweep:2.15},[0,1.95,-0.45],[0,0,-0.025]);
    activeProjectData.features.at(-1).symmetryGroup = "main-wings";
    addAircraftPart("Left wing","aircraft-wing",{span:6.8,rootChord:4.5,tipChord:1.05,thickness:0.2,sweep:2.15},[0,1.95,-0.45],[0,0,0.025],[-1,1,1]);
    activeProjectData.features.at(-1).symmetryGroup = "main-wings";
    addAircraftPart("Right stabilizer","aircraft-wing",{span:2.5,rootChord:2.05,tipChord:0.62,thickness:0.12,sweep:0.9},[0,2.15,6.05]);
    activeProjectData.features.at(-1).symmetryGroup = "stabilizers";
    addAircraftPart("Left stabilizer","aircraft-wing",{span:2.5,rootChord:2.05,tipChord:0.62,thickness:0.12,sweep:0.9},[0,2.15,6.05],[0,0,0],[-1,1,1]);
    activeProjectData.features.at(-1).symmetryGroup = "stabilizers";
    addAircraftPart("Vertical stabilizer","aircraft-fin",{length:3.15,finHeight:2.9,thickness:0.16},[0,2.2,6.15],[0,Math.PI/2,0]);
    [[-2.45,1.08,-1.05],[2.45,1.08,-1.05]].forEach((position,index)=>{
      const side=index?"Right":"Left";
      addAircraftPart(`${side} pylon`,`box`,{width:0.18,height:0.65,depth:1.25},[position[0],1.55,position[2]+0.15],[0,0,0],[1,1,1],silver);
      addAircraftPart(`${side} engine`,`cylinder`,{radius:0.5,height:2.25},position,[Math.PI/2,0,0],[1,1,1],silver);
      addAircraftPart(`${side} engine intake`,`torus`,{radius:0.38,tube:0.1},[position[0],position[1],position[2]-1.12],[0,0,0],[1,1,1],dark);
    });
    const glass=new THREE.MeshStandardMaterial({color:0x17242d,roughness:0.28,metalness:0.08});
    [-0.34,0.34].forEach((x,index)=>addAircraftPart(`Cockpit window ${index+1}`,"box",{width:0.42,height:0.28,depth:0.045},[x,2.18,-7.28],[0,index?0.18:-0.18,0],[1,1,1],glass));
    renderPartList();
    clearSelection();
    controls.maxDistance=120; controls.target.set(0,2,0); camera.position.set(16,10,19); controls.update();
    history = [JSON.stringify(activeProjectData)];
    historyIndex = 0;
    saveActiveDocument();
    updateHistoryButtons();
    registerRecentProject("Aircraft tutorial","airplane");
    return activeProjectData;
  };
  exportActiveSTEP = async () => {
    if (!activeProjectData?.features.length) throw new Error("Create a solid first");
    const feature = [...activeProjectData.features]
      .reverse()
      .find((item) => item.type === "sketch-extrude");
    if (!feature)
      throw new Error("STEP export is available for sketch extrusions");
    if (!kernelShapes.has(feature.id)) await rebuildKernelFeature(feature);
    downloadSTEP(
      kernelShapes.get(feature.id),
      `${activeProjectData.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.step`,
    );
  };
  function addPrimitive(type) {
    if (!activeProjectData) return null;
    const descriptions = {
      box: "box 2 2 2",
      cylinder: "cylinder 1 2",
      sphere: "sphere 1",
    };
    const result = buildMeshStarter(descriptions[type]);
    const id = `feature-${Date.now()}`;
    const object = result.object;
    object.userData.part = "project";
    object.userData.featureId = id;
    object.position.set(activeProjectData.features.length * 0.65, 0, 0);
    arm.add(object);
    activeProjectData.features.push({
      id,
      type: result.type,
      parameters: { ...result.parameters },
      transform: {
        position: object.position.toArray(),
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    });
    renderPartList();
    selectDirectObject(object, "project");
    renderDimensionEditor();
    commitHistory();
    return object;
  }
  function duplicateSelected() {
    if (!activeProjectData || !selectedObject?.userData.featureId) return;
    const source = activeProjectData.features.find(
      (feature) => feature.id === selectedObject.userData.featureId,
    );
    if (!source) return;
    const id = `feature-${Date.now()}`;
    const object = edge(mesh(geometryForFeature(source.type, source.parameters), light));
    object.userData.part = "project";
    object.userData.featureId = id;
    object.position.copy(selectedObject.position).add(new THREE.Vector3(0.6, 0, 0.6));
    object.rotation.copy(selectedObject.rotation);
    object.scale.copy(selectedObject.scale);
    arm.add(object);
    activeProjectData.features.push({
      id,
      type: source.type,
      parameters: { ...source.parameters },
      transform: {
        position: object.position.toArray(),
        rotation: object.rotation.toArray().slice(0, 3),
        scale: object.scale.toArray(),
      },
    });
    renderPartList();
    selectDirectObject(object, "project");
    renderDimensionEditor();
    commitHistory();
  }
  function deleteSelected() {
    if (!activeProjectData || !selectedObject?.userData.featureId) return;
    const doomed = selectedObject;
    activeProjectData.features = activeProjectData.features.filter(
      (feature) => feature.id !== doomed.userData.featureId,
    );
    clearSelection();
    arm.remove(doomed);
    doomed.geometry?.dispose();
    renderPartList();
    dimensionEditor.hidden = true;
    commitHistory();
  }
  runModelAction = (action) => {
    if (["box", "cylinder", "sphere"].includes(action)) return addPrimitive(action);
    else if (action === "duplicate") duplicateSelected();
    else if (action === "delete") deleteSelected();
    else if (["move", "rotate", "scale"].includes(action))
      transform.setMode(action === "move" ? "translate" : action);
  };
  hasActiveProject = () => Boolean(activeProjectData);
  getActiveProjectData = () =>
    activeProjectData ? structuredClone(activeProjectData) : null;
  applySelectedDimensions = (parameters) => {
    if (!activeProjectData || !selectedObject?.userData.featureId) return;
    const feature = activeProjectData.features.find(
      (item) => item.id === selectedObject.userData.featureId,
    );
    if (!feature) return;
    Object.assign(feature.parameters, parameters);
    const oldGeometry = selectedObject.geometry;
    selectedObject.geometry = geometryForFeature(feature.type, feature.parameters);
    oldGeometry.dispose();
    selectedObject.children.forEach((child) => {
      if (!child.isLineSegments) return;
      child.geometry.dispose();
      child.geometry = new THREE.EdgesGeometry(selectedObject.geometry, 28);
    });
    if (feature.symmetryGroup) {
      activeProjectData.features
        .filter((candidate) => candidate.id !== feature.id && candidate.symmetryGroup === feature.symmetryGroup)
        .forEach((candidate) => {
          Object.assign(candidate.parameters, parameters);
          const pairedObject = arm.children.find((child) => child.userData.featureId === candidate.id);
          if (!pairedObject) return;
          const oldPairedGeometry = pairedObject.geometry;
          pairedObject.geometry = geometryForFeature(candidate.type, candidate.parameters);
          oldPairedGeometry.dispose();
          pairedObject.children.forEach((child) => {
            if (!child.isLineSegments) return;
            child.geometry.dispose();
            child.geometry = new THREE.EdgesGeometry(pairedObject.geometry, 28);
          });
        });
    }
    syncTransform();
    renderPartList();
    renderDimensionEditor();
    if (feature.type === "sketch-extrude") rebuildKernelFeature(feature);
    commitHistory();
  };
  applySelectedTransform = ({ position, rotation, scale } = {}) => {
    if (!activeProjectData || !selectedObject?.userData.featureId) {
      throw new Error("Select a feature before transforming it");
    }
    const feature = activeProjectData.features.find(
      (item) => item.id === selectedObject.userData.featureId,
    );
    if (!feature) throw new Error("The selected feature is not editable");
    if (position) selectedObject.position.fromArray(position.map(Number));
    if (rotation) selectedObject.rotation.set(...rotation.map(Number));
    if (scale) selectedObject.scale.fromArray(scale.map(Number));
    feature.transform = {
      position: selectedObject.position.toArray(),
      rotation: selectedObject.rotation.toArray().slice(0, 3),
      scale: selectedObject.scale.toArray(),
    };
    syncTransform();
    commitHistory();
    return structuredClone(feature.transform);
  };
  selectCadFeature = (name, part) =>
    selectDirectObject(featureObjects[name], part);
  transform.addEventListener("dragging-changed", (event) => {
    transformDragging = event.value;
    controls.enabled = !event.value;
    if (!event.value) commitHistory();
  });
  transform.addEventListener("objectChange", () => {
    syncTransform();
    if (!activeProjectData || !selectedObject?.userData.featureId) return;
    const feature = activeProjectData.features.find(
      (item) => item.id === selectedObject.userData.featureId,
    );
    if (!feature) return;
    feature.transform.position = selectedObject.position.toArray();
    feature.transform.rotation = selectedObject.rotation.toArray().slice(0, 3);
    feature.transform.scale = selectedObject.scale.toArray();
  });
  axisInputs.forEach((input) =>
    input.addEventListener("change", () => {
      if (!selectedObject) return;
      selectedObject.position[input.dataset.axis] = Number(input.value) || 0;
      syncTransform();
      const feature = activeProjectData?.features.find(
        (item) => item.id === selectedObject.userData.featureId,
      );
      if (feature) feature.transform.position = selectedObject.position.toArray();
      commitHistory();
    }),
  );
  renderer.domElement.addEventListener("pointerdown", () => {
    transformDragging = false;
  });
  renderer.domElement.addEventListener("click", (event) => {
    if (transformDragging) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(arm.children, true)[0];
    if (!hit) {
      clearSelection();
      return;
    }
    let direct = hit.object;
    while (direct.parent && direct.parent !== arm) direct = direct.parent;
    const index = arm.children.indexOf(direct),
      part =
        direct.userData.part ||
        (index < 3
          ? "base"
          : index === 3
            ? "shoulder"
            : index === 4
              ? "upper"
              : index < 7
                ? "elbow"
                : "wrist");
    selectDirectObject(direct, part);
  });
  document.querySelector("#fit-view").addEventListener("click", () =>
    cadCommands.execute("view.fit", {}, { source: "ui" }),
  );
  showAllGeometry = () => {
    arm.children.forEach((child) => {
      child.visible = projectModelActive
        ? Boolean(child.userData.featureId)
        : !child.userData.kernelReplaced;
    });
    clearSelection();
    document
      .querySelectorAll(".hidden-part")
      .forEach((node) => node.classList.remove("hidden-part"));
  };
  document.querySelector("#show-all").addEventListener("click", () =>
    cadCommands.execute("view.showAll", {}, { source: "ui" }),
  );
  document.addEventListener("keydown", (event) => {
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      selectedObject &&
      !event.target.matches("input,textarea")
    ) {
      if (activeProjectData && selectedObject.userData.featureId) deleteSelected();
      else {
        selectedObject.visible = false;
        clearSelection();
      }
    }
  });
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  addEventListener("resize", () => {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  });
}
function openCady() {
  opener.classList.add("leaving");
  setTimeout(() => {
    workspace.classList.add("open");
    workspace.setAttribute("aria-hidden", "false");
    init3D();
    setTimeout(startGuide, 650);
  }, 150);
}
function closeCady() {
  workspace.classList.remove("open");
  workspace.setAttribute("aria-hidden", "true");
  setTimeout(() => opener.classList.remove("leaving"), 300);
}
function expandChat() {
  chatPanel.classList.add("expanded");
}
function collapseChat() {
  chatPanel.classList.remove("expanded");
  chatPanel.style.left = "";
  chatPanel.style.top = "";
  chatPanel.style.right = "24px";
  chatPanel.style.bottom = "24px";
}
function addMessage(text, className) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  messages.appendChild(p);
  messages.scrollTop = messages.scrollHeight;
  return p;
}
async function askCady(value) {
  conversation.push({ role: "user", content: value });
  addMessage(value, "user-message");
  const thinking = addMessage("Thinking…", "cady-message");
  sendButton.disabled = true;
  prompt.disabled = true;
  try {
    const buildResult = await runCadyCursorBuild(value);
    if (buildResult) {
      thinking.textContent = buildResult;
      conversation.push({ role: "assistant", content: buildResult });
      return;
    }
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: conversation }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Cady could not respond.");
    thinking.textContent = data.text;
    conversation.push({ role: "assistant", content: data.text });
  } catch (error) {
    thinking.textContent = error.message;
  } finally {
    sendButton.disabled = false;
    prompt.disabled = false;
    prompt.focus();
    messages.scrollTop = messages.scrollHeight;
  }
}

const guide = document.querySelector("#cursor-guide"),
  guidePackage = document.querySelector("#guide-package");
let guideRunId = 0;
function placeGuide() {
  if (guide.hidden) return;
  const rect = chatPanel.getBoundingClientRect(),
    workspaceRect = workspace.getBoundingClientRect(),
    packageWidth = innerWidth < 700 ? 64 : 72,
    packageX = Math.max(
      16,
      Math.min(
        workspaceRect.width - packageWidth - 16,
        rect.left - workspaceRect.left + 18,
      ),
    ),
    packageY = Math.max(16, rect.top - workspaceRect.top - 78);
  guide.style.setProperty("--guide-x", `${packageX}px`);
  guide.style.setProperty("--guide-y", `${packageY}px`);
}
async function startGuide() {
  const runId = ++guideRunId;
  guide.hidden = false;
  guide.classList.remove("finishing");
  placeGuide();
  const steps = [
    { target: document.querySelector("#new-sketch"), click: false },
    { target: document.querySelector("#part-list .cad-leaf"), click: false },
    { target: document.querySelector("#fit-view"), click: false },
    { target: prompt, click: false },
  ].filter(({ target }) => target && target.getClientRects().length);
  for (const { target, click } of steps) {
    if (runId !== guideRunId) return;
    await moveCadyCursorTo(target, click);
    if (runId !== guideRunId) return;
    await cursorPause(420);
  }
  if (runId === guideRunId) endGuide(true);
}
function endGuide(focusChat = false) {
  guideRunId++;
  guide.classList.add("finishing");
  setTimeout(() => {
    guide.hidden = true;
    guide.classList.remove("finishing");
    if (focusChat) prompt.focus();
  }, 220);
}
const cursorPause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
async function moveCadyCursorTo(element, shouldClick = false) {
  if (!element || !element.getClientRects().length) return;
  guide.hidden = false;
  guide.classList.remove("finishing");
  const rect = element.getBoundingClientRect();
  const workspaceRect = workspace.getBoundingClientRect();
  const x = Math.max(
    8,
    Math.min(workspaceRect.width - 80, rect.left - workspaceRect.left + 8),
  );
  const y = Math.max(
    8,
    Math.min(workspaceRect.height - 80, rect.top - workspaceRect.top + 5),
  );
  guide.style.setProperty("--guide-x", `${x}px`);
  guide.style.setProperty("--guide-y", `${y}px`);
  await cursorPause(780);
  if (shouldClick) {
    guidePackage.classList.add("pressing");
    await cursorPause(180);
    if (element === prompt) element.focus();
    else element.click();
    guidePackage.classList.remove("pressing");
  } else {
    await cursorPause(180);
  }
}
function parseCadyBuildRequest(value) {
  const text = value.toLowerCase();
  if (!/(make|build|create|add)/.test(text)) return null;
  let type;
  if (/clock|timepiece/.test(text)) type = "clock";
  else if (/airplane|aircraft|aeroplane/.test(text)) type = "airplane";
  else if (/sphere|ball/.test(text)) type = "sphere";
  else if (/cylinder|tube|disc|disk/.test(text)) type = "cylinder";
  else if (/box|cube|block/.test(text)) type = "box";
  else return null;
  const values = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  let parameters;
  if (type === "clock" || type === "airplane") parameters = {};
  else if (type === "sphere") parameters = { radius: values[0] || 1 };
  else if (type === "cylinder")
    parameters = { radius: values[0] || 1, height: values[1] || 2 };
  else
    parameters = {
      width: values[0] || 2,
      depth: values[1] || 2,
      height: values[2] || 2,
    };
  return { type, parameters, description: `${type} ${values.join(" ")}` };
}
function parseCadyEditRequest(value) {
  if (!hasActiveProject()) return null;
  const text = value.toLowerCase();
  if (!/(make|set|change|increase|decrease|shorten|lengthen|widen|narrow)/.test(text)) return null;
  const amount = Number(text.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(amount)) return null;
  const features = getActiveProjectData()?.features || [];
  let feature;
  if (/wing/.test(text)) feature = features.find((item) => /right wing/i.test(item.name || ""));
  else if (/stabilizer|tailplane/.test(text)) feature = features.find((item) => /right stabilizer/i.test(item.name || ""));
  else if (/fuselage|body/.test(text)) feature = features.find((item) => /fuselage/i.test(item.name || ""));
  if (!feature) return null;
  let key;
  if (/root chord/.test(text)) key = "rootChord";
  else if (/tip chord/.test(text)) key = "tipChord";
  else if (/chord/.test(text)) key = "rootChord";
  else if (/thick/.test(text)) key = "thickness";
  else if (/sweep/.test(text)) key = "sweep";
  else if (/radius/.test(text)) key = "radius";
  else if (feature.type === "aircraft-wing") key = "span";
  else if ("length" in feature.parameters) key = "length";
  else if ("height" in feature.parameters) key = "height";
  else return null;
  const current = Number(feature.parameters[key]);
  if (!Number.isFinite(current)) return null;
  const relative = /\bby\b|longer|shorter|wider|narrower|increase|decrease|lengthen|shorten/.test(text);
  const negative = /shorter|narrower|decrease|shorten/.test(text);
  const next = relative ? Math.max(0.05, current + (negative ? -amount : amount)) : Math.max(0.05, amount);
  return { featureId: feature.id, key, next, name: feature.name || "feature" };
}
async function runCadyCursorBuild(value) {
  const edit = parseCadyEditRequest(value);
  if (edit) {
    const object = document.querySelector(`[data-feature-id="${edit.featureId}"]`);
    await moveCadyCursorTo(object, false);
    const modelObject = document.querySelector(`[data-feature-id="${edit.featureId}"]`);
    modelObject?.click();
    await cadCommands.execute(
      "feature.setDimensions",
      { parameters: { [edit.key]: edit.next } },
      { source: "ai" },
    );
    endGuide();
    return `Done. I set ${edit.name} ${edit.key} to ${Number(edit.next.toFixed(2))} mm.`;
  }
  const request = parseCadyBuildRequest(value);
  if (!request) return null;
  const tool = document.querySelector(
    `[data-model-action="${["clock","airplane"].includes(request.type) ? "cylinder" : request.type}"]`,
  );
  await moveCadyCursorTo(tool, !["clock","airplane"].includes(request.type) && hasActiveProject());
  tool.classList.add("cursor-target");
  if (request.type === "clock") {
    await cadCommands.execute("project.createClock", {}, { source: "ai" });
  } else if (request.type === "airplane") {
    await cadCommands.execute("project.createAircraft", { reset: true }, { source: "ai" });
  } else if (hasActiveProject()) {
    await cadCommands.execute(
      "feature.setDimensions",
      { parameters: request.parameters },
      { source: "ai" },
    );
  } else {
    await createExactProject("Cady build", request.description);
    registerRecentProject("Cady build", request.description);
  }
  await cursorPause(280);
  const firstDimension = document.querySelector(".dimension-number");
  await moveCadyCursorTo(firstDimension, false);
  firstDimension?.focus();
  firstDimension?.classList.add("cursor-target");
  await cursorPause(520);
  tool.classList.remove("cursor-target");
  firstDimension?.classList.remove("cursor-target");
  endGuide();
  if (request.type === "clock")
    return "Done. I built an editable clock with a face, two hands, a center pin, and twelve hour markers.";
  if (request.type === "airplane")
    return "Done. I built an editable tutorial aircraft with a fuselage, tapered wings, stabilizers, tail, and twin engines.";
  const dimensions = Object.values(request.parameters).join(" × ");
  return `Done. I created a ${request.type} with dimensions ${dimensions}.`;
}
document.querySelector("#start-guide").addEventListener("click", startGuide);
addEventListener("resize", placeGuide);
prompt.addEventListener("pointerdown", () => {
  if (!guide.hidden) endGuide();
});
prompt.addEventListener("input", () => {
  if (!guide.hidden) endGuide();
});
opener.addEventListener("click", openCady);
document
  .querySelectorAll(".group-row")
  .forEach((r) =>
    r.addEventListener("click", () => r.parentElement.classList.toggle("open")),
  );
document.querySelectorAll(".cad-leaf").forEach((r) =>
  r.addEventListener("click", () => {
    document
      .querySelectorAll(".cad-leaf")
      .forEach((x) => x.classList.remove("active"));
    r.classList.add("active");
    selectCadFeature(r.textContent.trim(), r.dataset.part);
  }),
);
chatClose.addEventListener("click", collapseChat);
chat.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = prompt.value.trim();
  if (!value || sendButton.disabled) return;
  expandChat();
  prompt.value = "";
  askCady(value);
});
chatDrag.addEventListener("pointerdown", (e) => {
  if (e.target === chatClose) return;
  dragging = true;
  const r = chatPanel.getBoundingClientRect();
  dragX = e.clientX - r.left;
  dragY = e.clientY - r.top;
  chatPanel.setPointerCapture(e.pointerId);
});
chatDrag.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const x = Math.max(
      8,
      Math.min(innerWidth - chatPanel.offsetWidth - 8, e.clientX - dragX),
    ),
    y = Math.max(
      8,
      Math.min(innerHeight - chatPanel.offsetHeight - 8, e.clientY - dragY),
    );
  chatPanel.style.left = `${x}px`;
  chatPanel.style.top = `${y}px`;
  chatPanel.style.right = "auto";
  chatPanel.style.bottom = "auto";
});
chatDrag.addEventListener("pointerup", () => (dragging = false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("#sketch-workspace").hidden)
    document.querySelector("#sketch-workspace").hidden = true;
  else if (e.key === "Escape" && chatPanel.classList.contains("expanded"))
    collapseChat();
  else if (e.key === "Escape" && workspace.classList.contains("open"))
    closeCady();
});

const hubToggle = document.querySelector("#hub-toggle"),
  hubView = document.querySelector("#hub-view"),
  backToCad = document.querySelector("#back-to-cad"),
  newFileButton = document.querySelector("#new-file"),
  newProjectButton = document.querySelector("#new-project"),
  projectTree = document.querySelector("#project-tree"),
  drawingGrid = document.querySelector("#drawing-grid");
const defaultProjects = [
  { name: "Cady clock", description: "clock", files: ["Clock model"] },
  { name: "Robot arm", description: "robot-arm", files: ["Robot arm assembly"] },
];
let projects;
try {
  projects = JSON.parse(localStorage.getItem("cady-projects")) || defaultProjects;
} catch {
  projects = defaultProjects;
}
defaultProjects.forEach((defaultProject) => {
  if (!projects.some((project) => project.name === defaultProject.name))
    projects.push(structuredClone(defaultProject));
  else {
    const existing = projects.find((project) => project.name === defaultProject.name);
    existing.description ||= defaultProject.description;
  }
});
function saveProjects() {
  localStorage.setItem("cady-projects", JSON.stringify(projects));
}
function openDrawing() {
  workspace.classList.remove("hub-open");
}
function renderHub() {
  projectTree.innerHTML = "";
  drawingGrid.innerHTML = "";
  projects.forEach((project) => {
    const group = document.createElement("section");
    group.className = "project";
    const title = document.createElement("button");
    title.className = "project-title";
    title.textContent = project.name;
    const files = document.createElement("div");
    files.className = "project-files";
    project.files.forEach((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = file;
      button.addEventListener("click", async () => {
        if (project.description === "robot-arm") openRobotArmAssembly();
        else if (project.description === "clock")
          await cadCommands.execute("project.createClock", {}, { source: "ui" });
        else if (project.description === "airplane")
          await cadCommands.execute("project.createAircraft", {}, { source: "ui" });
        else if (project.description)
          await createExactProject(project.name, project.description);
        openDrawing();
      });
      files.appendChild(button);
      const card = document.createElement("article");
      card.className = "drawing-card";
      card.innerHTML =
        '<div class="drawing-thumb"></div><div class="drawing-meta"><b></b><span></span></div>';
      card.querySelector("b").textContent = file;
      card.querySelector("span").textContent = project.name + " · CAD drawing";
      card.addEventListener("click", openDrawing);
      drawingGrid.appendChild(card);
    });
    title.addEventListener("click", () => (files.hidden = !files.hidden));
    group.append(title, files);
    projectTree.appendChild(group);
  });
  saveProjects();
}
hubToggle.addEventListener("click", () => {
  workspace.classList.toggle("hub-open");
  renderHub();
});
backToCad.addEventListener("click", openDrawing);
registerRecentProject = (name, description = "box 3 2 1") => {
  const existing = projects.find((project) => project.name === name);
  if (!existing)
    projects.unshift({ name, description, files: [`${name} model`] });
  renderHub();
};
newProjectButton.addEventListener("click", async () => {
  const untitledCount = projects.filter((project) =>
    project.name.startsWith("Untitled project"),
  ).length;
  const name = `Untitled project ${untitledCount + 1}`;
  newProjectButton.disabled = true;
  newProjectButton.textContent = "Creating...";
  try {
    await cadCommands.execute(
      "project.create",
      { name, description: "box 3 2 1" },
      { source: "ui" },
    );
    registerRecentProject(name, "box 3 2 1");
    openDrawing();
  } catch (error) {
    console.error(error);
    toast.textContent = "Could not create project";
    toast.classList.add("show");
  } finally {
    newProjectButton.disabled = false;
    newProjectButton.textContent = "New project";
  }
});
newFileButton.addEventListener("click", () => {
  const name = window.prompt("File name");
  if (!name?.trim()) return;
  if (!projects.length) projects.push({ name: "My project", files: [] });
  projects[0].files.push(name.trim());
  renderHub();
});
renderHub();
const referenceDialog = document.querySelector("#reference-dialog"),
  referenceFile = document.querySelector("#reference-file"),
  referencePlane = document.querySelector("#reference-plane"),
  referenceLength = document.querySelector("#reference-length"),
  referenceOpacity = document.querySelector("#reference-opacity"),
  referenceOffset = document.querySelector("#reference-offset"),
  referenceRotation = document.querySelector("#reference-rotation"),
  referenceScale = document.querySelector("#reference-scale");
let editingReference = null;
function openReferenceEditor(reference = null) {
  editingReference = reference;
  referenceFile.value = "";
  referencePlane.value = reference?.plane || "side";
  referenceLength.value = reference?.length || 1000;
  referenceOpacity.value = reference?.opacity ?? 0.5;
  referenceOffset.value = reference?.offset || 0;
  referenceRotation.value = reference?.rotation || 0;
  referenceScale.value = reference?.scale || 1;
  referenceDialog.showModal();
}
document.querySelector("#insert-reference").addEventListener("click", () => openReferenceEditor());
referenceDialog.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const file = referenceFile.files[0];
  if (!file && !editingReference) {
    toast.textContent = "Choose a blueprint image first";
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
    return;
  }
  const image = file
    ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })
    : editingReference.image;
  await cadCommands.execute("reference.place", {
    id: editingReference?.id || `reference-${Date.now()}`,
    name: file?.name.replace(/\.[^.]+$/, "") || editingReference.name,
    image,
    plane: referencePlane.value,
    length: Math.max(1, Number(referenceLength.value) || 1000),
    opacity: Math.min(1, Math.max(0.1, Number(referenceOpacity.value) || 0.5)),
    offset: Number(referenceOffset.value) || 0,
    rotation: Number(referenceRotation.value) || 0,
    scale: Math.max(0.01, Number(referenceScale.value) || 1),
  }, { source: "ui" });
  referenceDialog.close();
  toast.textContent = "Reference canvas placed and calibrated";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
});
const sketchWorkspace = document.querySelector("#sketch-workspace"),
  sketchSvg = document.querySelector("#sketch-svg"),
  sketchEntities = document.querySelector("#sketch-entities"),
  sketchPreview = document.querySelector("#sketch-preview"),
  sketchHint = document.querySelector("#sketch-hint"),
  sketchWidth = document.querySelector("#sketch-width"),
  sketchDepth = document.querySelector("#sketch-depth"),
  sketchRadius = document.querySelector("#sketch-radius"),
  sketchExtrude = document.querySelector("#sketch-extrude"),
  sketchToolButtons = [...document.querySelectorAll("[data-sketch-tool]")];
let sketchTool = "rectangle",
  sketchStart = null,
  sketchAnchor = null,
  sketchEntity = null;
function sketchPoint(event) {
  const rect = sketchSvg.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 1000,
    y: ((event.clientY - rect.top) / rect.height) * 700,
  };
}
function renderSketchEntity(entity, target = sketchEntities) {
  target.innerHTML = "";
  if (!entity) return;
  const ns = "http://www.w3.org/2000/svg";
  let shape;
  if (entity.kind === "rectangle") {
    shape = document.createElementNS(ns, "rect");
    shape.setAttribute("x", Math.min(entity.x1, entity.x2));
    shape.setAttribute("y", Math.min(entity.y1, entity.y2));
    shape.setAttribute("width", Math.abs(entity.x2 - entity.x1));
    shape.setAttribute("height", Math.abs(entity.y2 - entity.y1));
  } else if (entity.kind === "circle") {
    shape = document.createElementNS(ns, "circle");
    shape.setAttribute("cx", entity.x1);
    shape.setAttribute("cy", entity.y1);
    shape.setAttribute("r", entity.radius);
  } else if (entity.kind === "arc") {
    shape = document.createElementNS(ns, "path");
    const radius = Math.hypot(entity.x2 - entity.x1, entity.y2 - entity.y1);
    shape.setAttribute(
      "d",
      `M${entity.x1 - radius} ${entity.y1}A${radius} ${radius} 0 0 1 ${entity.x1 + radius} ${entity.y1}`,
    );
  } else {
    shape = document.createElementNS(ns, "line");
    shape.setAttribute("x1", entity.x1);
    shape.setAttribute("y1", entity.y1);
    shape.setAttribute("x2", entity.x2);
    shape.setAttribute("y2", entity.y2);
  }
  shape.setAttribute(
    "class",
    entity.kind === "rectangle" || entity.kind === "circle"
      ? "sketch-entity"
      : "sketch-open",
  );
  target.appendChild(shape);
  if (target !== sketchEntities) return;
  const label = document.createElementNS(ns, "text");
  label.setAttribute("class", "sketch-dimension");
  label.setAttribute("x", entity.kind === "circle" ? entity.x1 : (entity.x1 + entity.x2) / 2);
  label.setAttribute("y", entity.kind === "circle" ? entity.y1 - entity.radius - 12 : Math.max(entity.y1, entity.y2) + 22);
  label.textContent =
    entity.kind === "circle"
      ? `R ${sketchRadius.value} mm`
      : entity.kind === "rectangle"
        ? `${sketchWidth.value} × ${sketchDepth.value} mm`
        : "Open profile";
  target.appendChild(label);
}
function resetSketch() {
  sketchStart = null;
  sketchAnchor = null;
  sketchEntity = null;
  sketchEntities.innerHTML = "";
  sketchPreview.innerHTML = "";
  sketchTool = "rectangle";
  sketchToolButtons.forEach((button) =>
    button.classList.toggle("active", button.dataset.sketchTool === sketchTool),
  );
  sketchHint.textContent = "Drag to draw a constrained rectangle";
}
startSketching = () => {
  resetSketch();
  sketchWorkspace.hidden = false;
  endGuide();
};
sketchToolButtons.forEach((button) =>
  button.addEventListener("click", () => {
    sketchTool = button.dataset.sketchTool;
    sketchToolButtons.forEach((item) => item.classList.toggle("active", item === button));
    sketchHint.textContent =
      sketchTool === "rectangle" || sketchTool === "circle"
        ? `Drag to draw a constrained ${sketchTool}`
        : `Drag to draw an ${sketchTool}. Open profiles cannot be extruded yet.`;
  }),
);
sketchSvg.addEventListener("pointerdown", (event) => {
  sketchStart = sketchAnchor || sketchPoint(event);
  sketchSvg.setPointerCapture(event.pointerId);
});
sketchSvg.addEventListener("pointermove", (event) => {
  if (!sketchStart) return;
  const point = sketchPoint(event);
  const entity = { kind: sketchTool, x1: sketchStart.x, y1: sketchStart.y, x2: point.x, y2: point.y };
  if (sketchTool === "circle") entity.radius = Math.hypot(point.x - sketchStart.x, point.y - sketchStart.y);
  renderSketchEntity(entity, sketchPreview);
});
sketchSvg.addEventListener("pointerup", (event) => {
  if (!sketchStart) return;
  const point = sketchPoint(event);
  const travel = Math.hypot(point.x - sketchStart.x, point.y - sketchStart.y);
  if (!sketchAnchor && travel < 3) {
    sketchAnchor = point;
    sketchStart = null;
    sketchPreview.innerHTML = "";
    sketchHint.textContent = "Choose the second point";
    return;
  }
  sketchEntity = { kind: sketchTool, x1: sketchStart.x, y1: sketchStart.y, x2: point.x, y2: point.y };
  if (sketchTool === "circle") {
    sketchEntity.radius = Math.max(2, Math.hypot(point.x - sketchStart.x, point.y - sketchStart.y));
    sketchRadius.value = Math.max(0.1, sketchEntity.radius / 5).toFixed(1);
  } else if (sketchTool === "rectangle") {
    sketchWidth.value = Math.max(0.1, Math.abs(point.x - sketchStart.x) / 5).toFixed(1);
    sketchDepth.value = Math.max(0.1, Math.abs(point.y - sketchStart.y) / 5).toFixed(1);
  }
  sketchPreview.innerHTML = "";
  renderSketchEntity(sketchEntity);
  sketchStart = null;
  sketchAnchor = null;
  sketchHint.textContent =
    sketchTool === "rectangle" || sketchTool === "circle"
      ? "Fully defined. Set dimensions or finish the sketch."
      : "Open profile created. Choose Rectangle or Circle to make a solid.";
});
[sketchWidth, sketchDepth, sketchRadius].forEach((input) =>
  input.addEventListener("change", () => renderSketchEntity(sketchEntity)),
);
document.querySelector("#new-sketch").addEventListener("click", () =>
  cadCommands.execute("sketch.start", {}, { source: "ui" }),
);
document.querySelector("#cancel-sketch").addEventListener("click", () => {
  sketchWorkspace.hidden = true;
});
document.querySelector("#finish-sketch").addEventListener("click", async () => {
  const kind = sketchEntity?.kind || sketchTool;
  if (!sketchEntity || !["rectangle", "circle"].includes(kind)) {
    sketchHint.textContent = "Draw one closed rectangle or circle before finishing.";
    return;
  }
  const button = document.querySelector("#finish-sketch");
  button.disabled = true;
  button.textContent = "Building…";
  try {
    await cadCommands.execute("sketch.finish", {
      kind,
      width: Number(sketchWidth.value),
      depth: Number(sketchDepth.value),
      radius: Number(sketchRadius.value),
      extrude: Number(sketchExtrude.value),
    }, { source: "ui" });
    sketchWorkspace.hidden = true;
    toast.textContent = "Exact solid built and saved";
  } catch (error) {
    sketchHint.textContent = error.message;
    return;
  } finally {
    button.disabled = false;
    button.textContent = "Finish sketch";
  }
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
});
document.querySelector("#undo-model").addEventListener("click", () =>
  cadCommands.execute("history.undo", {}, { source: "ui" }),
);
document.querySelector("#redo-model").addEventListener("click", () =>
  cadCommands.execute("history.redo", {}, { source: "ui" }),
);
document.querySelector("#export-step").addEventListener("click", async () => {
  try {
    await cadCommands.execute("export.step", {}, { source: "ui" });
    toast.textContent = "STEP exported";
  } catch (error) {
    toast.textContent = error.message;
  }
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
});
document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.target.matches("input,textarea")) return;
  if (event.key.toLowerCase() === "z" && event.shiftKey) {
    event.preventDefault();
    cadCommands.execute("history.redo", {}, { source: "keyboard" });
  } else if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    cadCommands.execute("history.undo", {}, { source: "keyboard" });
  }
});
const cadToolbar = document.querySelector(".cad-toolbar"),
  toolButtons = [...cadToolbar.querySelectorAll("button")];
toolButtons.forEach((button) =>
  button.addEventListener("click", () => {
    toolButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    toast.textContent = `${button.dataset.command} tool active`;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 900);
  }),
);
document.querySelectorAll("[data-model-action]").forEach((button) =>
  button.addEventListener("click", async () => {
    if (button.dataset.modelAction === "solidworks") {
      const originalText = button.textContent;
      const project = getActiveProjectData();
      if (!project) {
        toast.textContent = "Create a project first";
        toast.classList.add("show");
        return;
      }
      button.disabled = true;
      button.textContent = "Preparing SolidWorks...";
      try {
        const response = await fetch("/api/solidworks/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "SolidWorks export failed");
        if (!result.connected) {
          const blob = new Blob([JSON.stringify(result.plan, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}.solidworks-mcp.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        toast.textContent = result.connected
          ? "Built in SolidWorks"
          : "SolidWorks plan downloaded";
      } catch (error) {
        toast.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = originalText;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
      }
      return;
    }
    const action = button.dataset.modelAction;
    const command = ["box", "cylinder", "sphere"].includes(action)
      ? "model.add"
      : ["move", "rotate", "scale"].includes(action)
        ? "model.transform"
        : `model.${action}`;
    const input = command === "model.add"
      ? { type: action }
      : command === "model.transform"
        ? { mode: action }
        : {};
    await cadCommands.execute(command, input, { source: "ui" });
    document
      .querySelectorAll("[data-model-action]")
      .forEach((item) => item.classList.toggle("active", item === button));
    toast.textContent = `${button.textContent} ready`;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 900);
  }),
);
const draftingWorkspace = document.querySelector("#drafting-workspace"),
  drawingPaper = document.querySelector("#drawing-paper"),
  drawingName = document.querySelector("#drawing-name"),
  drawingFile = document.querySelector("#drawing-file"),
  drawingTemplate = document.querySelector("#drawing-template"),
  drawingUnits = document.querySelector("#drawing-units"),
  drawingTolerance = document.querySelector("#drawing-tolerance"),
  drawingNumber = document.querySelector("#drawing-number"),
  drawingRevision = document.querySelector("#drawing-revision");
let importedStepName = "", importedStepDimensions = null;
function drawingSource() {
  const project = getActiveProjectData();
  const feature = project?.features?.[0];
  const parameters = feature?.parameters || {};
  return {
    name: importedStepName || project?.name || "Robot arm assembly",
    type: feature?.type || "assembly",
    width: Number(importedStepDimensions?.width || parameters.width || parameters.radius * 2 || 120),
    depth: Number(importedStepDimensions?.depth || parameters.depth || parameters.radius * 2 || 80),
    height: Number(importedStepDimensions?.height || parameters.height || parameters.radius * 2 || 60),
  };
}
function safeDrawingText(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
function dimensionMarkup(x1, y1, x2, y2, label, vertical = false) {
  const textX = vertical ? x1 - 14 : (x1 + x2) / 2;
  const textY = vertical ? (y1 + y2) / 2 : y1 - 8;
  return `<g class="dim"><path d="M${x1} ${y1}L${x2} ${y2}"/><path d="M${x1-5} ${y1-5}l10 10M${x2-5} ${y2-5}l10 10"/><text x="${textX}" y="${textY}" ${vertical ? `transform="rotate(-90 ${textX} ${textY})"` : ""}>${safeDrawingText(label)}</text></g>`;
}
function generateEngineeringDrawing() {
  const source = drawingSource(), units = drawingUnits.value;
  const sizes = {"iso-a4":[1120,790,"A4"],"iso-a3":[1580,1120,"A3"],"ansi-b":[1360,880,"B"]};
  const [sheetWidth,sheetHeight,sheetLabel] = sizes[drawingTemplate.value];
  const enabled = new Set([...document.querySelectorAll("[data-drawing-view]:checked")].map(input=>input.dataset.drawingView));
  const gdt = [...document.querySelectorAll("[data-gdt]:checked")].map(input=>input.parentElement.textContent.trim());
  const w=Math.max(30,Math.min(230,source.width*1.4)),d=Math.max(24,Math.min(190,source.depth*1.4)),h=Math.max(28,Math.min(180,source.height*1.4));
  const view=(name,x,y,body)=>enabled.has(name)?`<g class="view"><text class="view-name" x="${x}" y="${y-22}">${name.toUpperCase()}</text>${body}</g>`:"";
  const front=view("front",160,200,`<rect x="160" y="200" width="${w}" height="${h}"/><path class="center" d="M${160+w/2} 184v${h+32}"/>${dimensionMarkup(160,200+h+30,160+w,200+h+30,`${source.width} ${units}`)}${dimensionMarkup(130,200,130,200+h,`${source.height} ${units}`,true)}`);
  const top=view("top",560,200,`<rect x="560" y="200" width="${w}" height="${d}"/><path class="center" d="M${560+w/2} 184v${d+32}M544 ${200+d/2}h${w+32}"/>${dimensionMarkup(560,200+d+30,560+w,200+d+30,`${source.width} ${units}`)}${dimensionMarkup(530,200,530,200+d,`${source.depth} ${units}`,true)}`);
  const right=view("right",160,520,`<rect x="160" y="520" width="${d}" height="${h}"/><path class="center" d="M${160+d/2} 504v${h+32}"/>${dimensionMarkup(160,520+h+30,160+d,520+h+30,`${source.depth} ${units}`)}`);
  const iso=view("iso",570,505,`<path d="M570 565l${w*.72} -42 ${d*.55} 30 -${w*.72} 42zM570 565v${h*.68}l${w*.72} 42v-${h*.68}M${570+w*.72} ${523+d*.55}v${h*.68}"/>`);
  const titleX=sheetWidth-420,titleY=sheetHeight-118;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetWidth} ${sheetHeight}" role="img" aria-label="Engineering drawing for ${safeDrawingText(source.name)}"><style>text{font-family:Arial,sans-serif;fill:#111}.view>*:not(text){fill:none;stroke:#111;stroke-width:1.5}.view-name{font-size:11px;letter-spacing:1.5px}.center{stroke:#777!important;stroke-dasharray:10 4 2 4}.dim path{fill:none;stroke:#333;stroke-width:1}.dim text{font-size:10px;text-anchor:middle}.note{font-size:11px}.tiny{font-size:9px}.title{font-size:18px;font-weight:600}</style><rect x="14" y="14" width="${sheetWidth-28}" height="${sheetHeight-28}" fill="none" stroke="#111" stroke-width="2"/><text class="tiny" x="30" y="38">AUTOMATIC ENGINEERING DRAWING · ${sheetLabel} · SCALE 1:1</text>${front}${top}${right}${iso}<g class="note"><text x="30" y="${sheetHeight-94}">UNLESS OTHERWISE SPECIFIED:</text><text x="30" y="${sheetHeight-76}">DIMENSIONS ARE IN ${units.toUpperCase()} · TOLERANCE ${safeDrawingText(drawingTolerance.value)}</text><text x="30" y="${sheetHeight-58}">${safeDrawingText(gdt.join("  ·  ") || "NO GD&T CALLOUTS")}</text></g><g><rect x="${titleX}" y="${titleY}" width="390" height="92" fill="none" stroke="#111"/><path d="M${titleX} ${titleY+48}h390M${titleX+260} ${titleY+48}v44M${titleX+330} ${titleY+48}v44" stroke="#111"/><text class="title" x="${titleX+12}" y="${titleY+30}">${safeDrawingText(source.name)}</text><text class="tiny" x="${titleX+12}" y="${titleY+65}">DRAWING NO.</text><text x="${titleX+12}" y="${titleY+84}">${safeDrawingText(drawingNumber.value)}</text><text class="tiny" x="${titleX+272}" y="${titleY+65}">REV</text><text x="${titleX+282}" y="${titleY+84}">${safeDrawingText(drawingRevision.value)}</text><text class="tiny" x="${titleX+340}" y="${titleY+65}">SHEET</text><text x="${titleX+350}" y="${titleY+84}">1 / 1</text></g></svg>`;
  drawingPaper.innerHTML=svg;
  drawingName.textContent=`${source.name} · ${drawingNumber.value}`;
}
function openEngineeringDrawing(){draftingWorkspace.hidden=false;endGuide();generateEngineeringDrawing()}
document.querySelector("#open-drafting").addEventListener("click",()=>cadCommands.execute("drawing.open",{}, {source:"ui"}));
document.querySelector("#top-drafting").addEventListener("click",()=>cadCommands.execute("drawing.open",{}, {source:"ui"}));
document.querySelector("#drawing-close").addEventListener("click",()=>draftingWorkspace.hidden=true);
document.querySelector("#drawing-import").addEventListener("click",()=>drawingFile.click());
drawingFile.addEventListener("change",async()=>{const file=drawingFile.files[0];if(!file)return;importedStepName=file.name.replace(/\.(step|stp)$/i,"");const text=await file.text(),points=[...text.matchAll(/CARTESIAN_POINT\s*\([^,]*,\s*\(\s*([-+\d.E]+)\s*,\s*([-+\d.E]+)\s*,\s*([-+\d.E]+)\s*\)\s*\)/gi)].map(match=>match.slice(1).map(Number)).filter(point=>point.every(Number.isFinite));if(points.length){const axes=[0,1,2].map(axis=>{const values=points.map(point=>point[axis]);return Math.max(...values)-Math.min(...values)});importedStepDimensions={width:Number(axes[0].toFixed(3)),depth:Number(axes[1].toFixed(3)),height:Number(axes[2].toFixed(3))};}else importedStepDimensions=null;generateEngineeringDrawing();toast.textContent=points.length?`STEP read · ${points.length} geometry points`:`STEP opened · using default extents`;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),1800)});
document.querySelector("#generate-drawing").addEventListener("click",()=>cadCommands.execute("drawing.regenerate",{}, {source:"ui"}));
[drawingTemplate,drawingUnits,drawingTolerance,drawingNumber,drawingRevision,...document.querySelectorAll("[data-drawing-view],[data-gdt]")].forEach(control=>control.addEventListener("change",generateEngineeringDrawing));
document.querySelector("#drawing-export").addEventListener("click",()=>{const svg=drawingPaper.querySelector("svg");if(!svg)return;const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:"image/svg+xml"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`${drawingSource().name.replace(/\s+/g,"-").toLowerCase()}-drawing.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
document.querySelector("#drawing-print").addEventListener("click",()=>window.print());
const featurePanel = document.querySelector(".feature-panel"),
  featureMarker = document.createElement("i");
document.querySelectorAll("[data-sidebar-tab]").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-sidebar-tab]")
      .forEach((item) => item.classList.toggle("active", item === button));
    featurePanel.classList.toggle(
      "show-settings",
      button.dataset.sidebarTab === "settings",
    );
  }),
);
featureMarker.className = "feature-marker";
featurePanel.append(featureMarker);
function moveFeatureMarker(button, animate = true) {
  if (!button) return;
  let parent = button.parentElement,
    visible = true;
  while (parent && parent !== featurePanel) {
    if (
      parent.classList.contains("cad-group") &&
      !parent.classList.contains("open")
    ) {
      visible = false;
      break;
    }
    parent = parent.parentElement;
  }
  featureMarker.style.opacity = visible ? "1" : "0";
  if (!visible) return;
  featureMarker.classList.toggle("animate", animate);
  featureMarker.style.transform = `translate(45px,${button.offsetTop + button.offsetHeight / 2 - 4}px)`;
}
moveFeatureMarker(featurePanel.querySelector(".cad-leaf.active"), false);
document
  .querySelectorAll(".cad-leaf")
  .forEach((button) =>
    button.addEventListener("click", () => moveFeatureMarker(button)),
  );
document
  .querySelectorAll(".group-row")
  .forEach((row) =>
    row.addEventListener("click", () =>
      setTimeout(
        () =>
          moveFeatureMarker(
            featurePanel.querySelector(".cad-leaf.active"),
            false,
          ),
        480,
      ),
    ),
  );
addEventListener("resize", () =>
  moveFeatureMarker(featurePanel.querySelector(".cad-leaf.active"), false),
);
