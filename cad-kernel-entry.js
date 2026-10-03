import initOpenCascade from "replicad-opencascadejs";
import {
  drawCircle,
  drawRectangle,
  makeBox,
  makeCylinder,
  makeSphere,
  setOC,
} from "replicad";

let kernelPromise;

export function initCadKernel() {
  if (!kernelPromise) {
    kernelPromise = initOpenCascade({
      locateFile: () => new URL("./replicad_single.wasm", import.meta.url).href,
    }).then((oc) => {
      setOC(oc);
      return oc;
    });
  }
  return kernelPromise;
}

export async function buildRobotBase(parameters = {}) {
  await initCadKernel();
  const radius = Number(parameters.radius ?? 1.48);
  const pedestalRadius = Number(parameters.pedestalRadius ?? 0.68);
  const pedestalHeight = Number(parameters.pedestalHeight ?? 1.45);
  const axis = [0, 1, 0];

  const foot = makeCylinder(radius, 0.24, [0, 0, 0], axis);
  const collar = makeCylinder(1.15, 0.32, [0, 0.24, 0], axis);
  const pedestal = makeCylinder(
    pedestalRadius,
    pedestalHeight,
    [0, 0.56, 0],
    axis,
  );
  const shape = foot.fuse(collar).fuse(pedestal);
  return {
    shape,
    mesh: shape.mesh({ tolerance: 0.015, angularTolerance: 0.12 }),
  };
}

export async function buildStarterModel(description = "") {
  await initCadKernel();
  const text = description.toLowerCase();
  const values = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  let shape;
  let feature;
  if (/sphere|ball/.test(text)) {
    const radius = values[0] || 1.25;
    shape = makeSphere(radius).translateY(radius);
    feature = `Sphere R${radius}`;
  } else if (/cylinder|tube|round|disc|disk/.test(text)) {
    const radius = values[0] || 1.25;
    const height = values[1] || 2.4;
    shape = makeCylinder(radius, height, [0, 0, 0], [0, 1, 0]);
    feature = `Cylinder R${radius} H${height}`;
  } else {
    const width = values[0] || 3;
    const depth = values[1] || 2;
    const height = values[2] || 1.4;
    shape = makeBox(
      [-width / 2, 0, -depth / 2],
      [width / 2, height, depth / 2],
    );
    feature = `Box ${width} × ${depth} × ${height}`;
  }
  return {
    shape,
    feature,
    mesh: shape.mesh({ tolerance: 0.015, angularTolerance: 0.12 }),
  };
}

export function downloadSTEP(shape, filename = "cady-robot-base.step") {
  const url = URL.createObjectURL(shape.blobSTEP());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function buildSketchExtrusion(profile) {
  await initCadKernel();
  const depth = Math.max(0.1, Number(profile.extrude) || 10);
  let drawing;
  if (profile.kind === "circle") {
    drawing = drawCircle(Math.max(0.1, Number(profile.radius) || 20));
  } else {
    drawing = drawRectangle(
      Math.max(0.1, Number(profile.width) || 60),
      Math.max(0.1, Number(profile.depth) || 40),
    );
  }
  const shape = drawing.sketchOnPlane("XZ").extrude(depth);
  return {
    shape,
    mesh: shape.mesh({ tolerance: 0.05, angularTolerance: 0.14 }),
  };
}
