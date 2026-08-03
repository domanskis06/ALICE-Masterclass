/**
 * Stylised lead (Pb) nucleus for the Particle Propagation collision intro.
 *
 * Built procedurally in Three.js (no GLB): a translucent outer shell wrapping a
 * densely packed cluster of nucleon spheres (red protons / grey neutrons). Size
 * is normalised by the caller to {@link NUCLEUS_TARGET_DIAMETER_WORLD} so both
 * beams stay readable inside the beam pipe.
 *
 * Visualisation only — no physics. Deterministic layout (fixed seed) so unit
 * tests and session cache see identical geometry every time.
 */

import * as THREE from 'three';

/** Marker stamped on every nucleus root for tests / debugging. */
export const LEAD_NUCLEUS_KIND = 'pb-nucleus';

/** Local-space diameter of the authored nucleus before uniform rescale. */
export const LEAD_NUCLEUS_LOCAL_DIAMETER = 1;

/**
 * Stylised nucleon counts (~Pb-208 ratio Z:N ≈ 82:126).
 * Packed on concentric shells so the cloud reads as a filled sphere.
 */
export const LEAD_PROTON_COUNT = 64;
export const LEAD_NEUTRON_COUNT = 98;
export const LEAD_NUCLEON_COUNT = LEAD_PROTON_COUNT + LEAD_NEUTRON_COUNT;

/** Bright, high-contrast nucleon colours (readable through the glass shell). */
export const PROTON_COLOR = 0xff2a2a;
export const NEUTRON_COLOR = 0xd0d4da;

const SHELL_OPACITY = 0.18;
/**
 * Nucleon radius chosen so nearest neighbours on each shell slightly overlap
 * (chord ≈ 1.6–1.9× radius), reading as a solid packed ball at world d=0.1.
 */
const NUCLEON_RADIUS = 0.09;

/**
 * Concentric shells (local units). Counts must sum to {@link LEAD_NUCLEON_COUNT}.
 * Radii are compressed so shells nest inside each other with radial overlap;
 * outer centres stay within ~0.36 so nucleons remain under the glass (r=0.5).
 */
const PACK_SHELLS: ReadonlyArray<{ radius: number; count: number }> = [
  { radius: 0, count: 1 },
  { radius: 0.08, count: 12 },
  { radius: 0.15, count: 24 },
  { radius: 0.22, count: 32 },
  { radius: 0.28, count: 42 },
  { radius: 0.34, count: 51 },
];

const SHELL_COLOR = 0x9eb0c2;
const PROTON_EMISSIVE = 0xff2222;
const NEUTRON_EMISSIVE = 0x9aa0a8;

/** Tiny deterministic LCG — stable layout, no Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNucleonMaterial(
  color: number,
  emissive: number,
  emissiveIntensity: number,
  name: string
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.35,
    metalness: 0.05,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
  mat.name = name;
  return mat;
}

/** Evenly distribute `count` points on a sphere of given radius (Fibonacci lattice). */
function fibonacciShell(count: number, radius: number, phase: number): THREE.Vector3[] {
  if (count <= 0) return [];
  if (count === 1 || radius <= 1e-6) return [new THREE.Vector3(0, 0, 0)];

  const pts: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i + phase;
    pts.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }
  return pts;
}

function buildPackedPositions(): THREE.Vector3[] {
  const shellSum = PACK_SHELLS.reduce((s, sh) => s + sh.count, 0);
  if (shellSum !== LEAD_NUCLEON_COUNT) {
    throw new Error(
      `lead-nucleus pack shells sum to ${shellSum}, expected LEAD_NUCLEON_COUNT=${LEAD_NUCLEON_COUNT}`
    );
  }
  const positions: THREE.Vector3[] = [];
  PACK_SHELLS.forEach((shell, idx) => {
    positions.push(...fibonacciShell(shell.count, shell.radius, idx * 0.7));
  });
  return positions;
}

/**
 * Builds one Pb nucleus group centred at the origin, local diameter ≈ 1.
 * Materials/geometries are unique to the returned root (safe to dispose per clone).
 */
export function createLeadNucleusMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'lead-nucleus';
  root.userData['kind'] = LEAD_NUCLEUS_KIND;

  const shellRadius = LEAD_NUCLEUS_LOCAL_DIAMETER / 2;
  const shellGeom = new THREE.IcosahedronGeometry(shellRadius, 2);
  const shellMat = new THREE.MeshStandardMaterial({
    color: SHELL_COLOR,
    roughness: 0.35,
    metalness: 0.2,
    transparent: true,
    opacity: SHELL_OPACITY,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
  });
  shellMat.name = 'PbShell';
  const shell = new THREE.Mesh(shellGeom, shellMat);
  shell.name = 'lead-nucleus-shell';
  shell.renderOrder = 600_010;
  root.add(shell);

  const rand = mulberry32(0x5042_0004);
  const nucleonGeom = new THREE.SphereGeometry(NUCLEON_RADIUS, 12, 10);
  const protonMat = makeNucleonMaterial(PROTON_COLOR, PROTON_EMISSIVE, 0.55, 'PbProton');
  const neutronMat = makeNucleonMaterial(NEUTRON_COLOR, NEUTRON_EMISSIVE, 0.35, 'PbNeutron');

  const kinds: Array<'proton' | 'neutron'> = [
    ...Array(LEAD_PROTON_COUNT).fill('proton' as const),
    ...Array(LEAD_NEUTRON_COUNT).fill('neutron' as const),
  ];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = kinds[i];
    kinds[i] = kinds[j];
    kinds[j] = tmp;
  }

  const positions = buildPackedPositions();
  let protonIdx = 0;
  let neutronIdx = 0;
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const isProton = kind === 'proton';
    const mesh = new THREE.Mesh(nucleonGeom, isProton ? protonMat : neutronMat);
    if (isProton) {
      mesh.name = `lead-proton-${protonIdx++}`;
      mesh.userData['nucleon'] = 'proton';
    } else {
      mesh.name = `lead-neutron-${neutronIdx++}`;
      mesh.userData['nucleon'] = 'neutron';
    }
    mesh.position.copy(positions[i]);
    mesh.renderOrder = 600_000;
    root.add(mesh);
  }

  root.userData['sharedNucleonGeometry'] = nucleonGeom;
  root.userData['protonCount'] = protonIdx;
  root.userData['neutronCount'] = neutronIdx;
  return root;
}

/** Dispose geometries/materials owned by a nucleus built with {@link createLeadNucleusMesh}. */
export function disposeLeadNucleusMesh(root: THREE.Object3D): void {
  const shared = root.userData['sharedNucleonGeometry'] as THREE.BufferGeometry | undefined;
  const seenGeom = new Set<THREE.BufferGeometry>();
  const seenMat = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as THREE.Mesh & { isMesh?: boolean }).isMesh) return;
    const geom = mesh.geometry as THREE.BufferGeometry | undefined;
    if (geom && !seenGeom.has(geom)) {
      seenGeom.add(geom);
      geom.dispose();
    }
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      if (mat && !seenMat.has(mat)) {
        seenMat.add(mat);
        mat.dispose();
      }
    }
  });
  if (shared && !seenGeom.has(shared)) shared.dispose();
}
