import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react';
import {
  SIGN_LEXICON,
  type HandPose,
  type SignStep,
} from '../lib/signLanguage';

type CameraPreset = 'front' | 'iso' | 'side' | 'palm';

interface HandStage3DProps {
  signSteps: SignStep[];
  sequenceTrigger: number;
  ledOn: boolean;
  armAngle: number;
  replyTitle?: string;
  hideTopTimeline?: boolean;
  externalJump?: { index: number; token: number } | null;
  onStepIndexChange?: (stepIndex: number, totalSteps: number) => void;
  onActiveStepChange?: (step: SignStep) => void;
}

interface FingerRig {
  basePivot: THREE.Group;
  mcpPivot: THREE.Group;
  pipPivot: THREE.Group;
  dipPivot: THREE.Group;
}

interface ThumbRig {
  cmcPivot: THREE.Group;
  mcpPivot: THREE.Group;
  ipPivot: THREE.Group;
}

interface HandRig {
  root: THREE.Group;
  forearmPivot: THREE.Group;
  wristPivot: THREE.Group;
  thumb: ThumbRig;
  index: FingerRig;
  middle: FingerRig;
  ring: FingerRig;
  pinky: FingerRig;
  ledStripMat: THREE.MeshStandardMaterial;
}

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number]; label: string }> = {
  front: { pos: [0, 2.35, 5.1], target: [0, 1.95, 0], label: 'أمامي' },
  iso: { pos: [3.2, 2.9, 4.3], target: [0, 1.95, 0], label: 'مائل' },
  side: { pos: [4.9, 2.25, 0.3], target: [0, 1.95, 0], label: 'جانبي' },
  palm: { pos: [-1.4, 2.5, 4.5], target: [0, 2.05, 0], label: 'الكف' },
};

function createCarbonBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#606060';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) {
      for (let x = 0; x < 64; x += 8) {
        const even = ((x + y) / 8) % 2 === 0;
        ctx.fillStyle = even ? '#8c8c8c' : '#424242';
        ctx.fillRect(x, y, 7, 7);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildFingerRig(
  palmGroup: THREE.Group,
  x: number,
  y: number,
  lengths: [number, number, number],
  radii: [number, number, number],
  shellMat: THREE.Material,
  jointMat: THREE.Material,
  padMat: THREE.Material
): FingerRig {
  const basePivot = new THREE.Group();
  basePivot.position.set(x, y, 0.01);
  palmGroup.add(basePivot);

  const mcpPivot = new THREE.Group();
  basePivot.add(mcpPivot);

  // Knuckle actuator cylinder
  const knucklePin = new THREE.Mesh(
    new THREE.CylinderGeometry(radii[0] * 1.06, radii[0] * 1.06, radii[0] * 2.25, 16),
    jointMat
  );
  knucklePin.rotation.z = Math.PI / 2;
  knucklePin.castShadow = true;
  mcpPivot.add(knucklePin);

  // Proximal phalanx
  const proxGeo = new THREE.CylinderGeometry(radii[1], radii[0], lengths[0], 16);
  const proxMesh = new THREE.Mesh(proxGeo, shellMat);
  proxMesh.position.y = lengths[0] * 0.5;
  proxMesh.castShadow = true;
  mcpPivot.add(proxMesh);

  // PIP joint
  const pipPivot = new THREE.Group();
  pipPivot.position.y = lengths[0];
  mcpPivot.add(pipPivot);

  const pipPin = new THREE.Mesh(
    new THREE.CylinderGeometry(radii[1] * 1.08, radii[1] * 1.08, radii[1] * 2.15, 16),
    jointMat
  );
  pipPin.rotation.z = Math.PI / 2;
  pipPivot.add(pipPin);

  // Middle phalanx
  const midGeo = new THREE.CylinderGeometry(radii[2], radii[1], lengths[1], 16);
  const midMesh = new THREE.Mesh(midGeo, shellMat);
  midMesh.position.y = lengths[1] * 0.5;
  midMesh.castShadow = true;
  pipPivot.add(midMesh);

  // DIP joint
  const dipPivot = new THREE.Group();
  dipPivot.position.y = lengths[1];
  pipPivot.add(dipPivot);

  const dipPin = new THREE.Mesh(
    new THREE.SphereGeometry(radii[2] * 1.05, 14, 14),
    jointMat
  );
  dipPivot.add(dipPin);

  // Distal phalanx + fingertip pad
  const distGeo = new THREE.CylinderGeometry(radii[2] * 0.78, radii[2], lengths[2], 16);
  const distMesh = new THREE.Mesh(distGeo, shellMat);
  distMesh.position.y = lengths[2] * 0.5;
  distMesh.castShadow = true;
  dipPivot.add(distMesh);

  const tipCap = new THREE.Mesh(
    new THREE.SphereGeometry(radii[2] * 0.82, 14, 14),
    padMat
  );
  tipCap.position.set(0, lengths[2], 0.012);
  dipPivot.add(tipCap);

  return { basePivot, mcpPivot, pipPivot, dipPivot };
}

function buildArticulatedHand(bumpTex: THREE.CanvasTexture): HandRig {
  const root = new THREE.Group();

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x1e2533,
    roughness: 0.65,
    metalness: 0.2,
    bumpMap: bumpTex,
    bumpScale: 0.015,
  });

  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.25,
    metalness: 0.85,
  });

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.28,
    metalness: 0.82,
  });

  const padMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.88,
    metalness: 0.05,
  });

  const ledStripMat = new THREE.MeshStandardMaterial({
    color: 0x14b8a6,
    emissive: 0x0f766e,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.1,
  });

  // 1. Grounded Studio Pedestal (bottom-center pivot at y=0)
  const baseDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.32, 0.14, 40),
    carbonMat
  );
  baseDisc.position.y = 0.07;
  baseDisc.receiveShadow = true;
  root.add(baseDisc);

  const collarRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.85, 0.12, 32),
    titaniumMat
  );
  collarRing.position.y = 0.2;
  collarRing.castShadow = true;
  root.add(collarRing);

  // 2. Forearm Pivot & Sculpted Robotic Forearm Housing
  const forearmPivot = new THREE.Group();
  forearmPivot.position.set(0, 0.26, 0);
  root.add(forearmPivot);

  const forearmShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.56, 1.15, 24),
    carbonMat
  );
  forearmShell.position.y = 0.58;
  forearmShell.castShadow = true;
  forearmPivot.add(forearmShell);

  const cuffTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.44, 0.09, 24),
    titaniumMat
  );
  cuffTrim.position.y = 1.12;
  forearmPivot.add(cuffTrim);

  // Dorsal Servo Actuator Struts on Forearm
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.92, 0.12),
      titaniumMat
    );
    strut.position.set(side * 0.41, 0.58, 0);
    strut.castShadow = true;
    forearmPivot.add(strut);
  }

  // 3. Wrist Gimbal Pivot
  const wristPivot = new THREE.Group();
  wristPivot.position.set(0, 1.24, 0);
  forearmPivot.add(wristPivot);

  const wristGimbal = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 20, 16),
    jointMat
  );
  wristGimbal.scale.set(1.15, 0.72, 0.82);
  wristPivot.add(wristGimbal);

  // 4. Sculpted Palm Chassis (ExtrudeGeometry with chamfered silhouette)
  const palmShape = new THREE.Shape();
  palmShape.moveTo(-0.42, 0.05);
  palmShape.lineTo(0.42, 0.05);
  palmShape.lineTo(0.5, 0.88);
  palmShape.quadraticCurveTo(0.48, 1.02, 0.34, 1.04);
  palmShape.lineTo(-0.34, 1.04);
  palmShape.quadraticCurveTo(-0.48, 1.0, -0.49, 0.84);
  palmShape.closePath();

  const palmGeo = new THREE.ExtrudeGeometry(palmShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  palmGeo.translate(0, 0, -0.12);
  const palmMesh = new THREE.Mesh(palmGeo, carbonMat);
  palmMesh.position.y = 0.08;
  palmMesh.castShadow = true;
  wristPivot.add(palmMesh);

  // Palmar tactile plate (+Z side)
  const palmPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.74, 0.06),
    padMat
  );
  palmPlate.position.set(0, 0.56, 0.16);
  wristPivot.add(palmPlate);

  // Dorsal Titanium Bridge + ESP32 Status LED Strip (-Z side & front trim)
  const dorsalPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.62, 0.05),
    titaniumMat
  );
  dorsalPlate.position.set(0, 0.58, -0.16);
  wristPivot.add(dorsalPlate);

  const ledStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.06, 0.07),
    ledStripMat
  );
  ledStrip.position.set(0, 0.28, -0.17);
  wristPivot.add(ledStrip);

  const ledFrontStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.045, 0.05),
    ledStripMat
  );
  ledFrontStrip.position.set(0, 0.22, 0.175);
  wristPivot.add(ledFrontStrip);

  // 5. Four Fingers (Index on +X side for right hand facing viewer palm-forward, Pinky on -X)
  // Wait: Right hand with palm facing +Z (viewer): Thumb is on +X (viewer's right), Pinky is on -X!
  const index = buildFingerRig(
    wristPivot,
    0.34,
    1.14,
    [0.44, 0.29, 0.22],
    [0.092, 0.082, 0.072],
    titaniumMat,
    jointMat,
    padMat
  );

  const middle = buildFingerRig(
    wristPivot,
    0.11,
    1.17,
    [0.49, 0.33, 0.24],
    [0.095, 0.084, 0.074],
    titaniumMat,
    jointMat,
    padMat
  );

  const ring = buildFingerRig(
    wristPivot,
    -0.12,
    1.14,
    [0.45, 0.3, 0.22],
    [0.088, 0.078, 0.068],
    titaniumMat,
    jointMat,
    padMat
  );

  const pinky = buildFingerRig(
    wristPivot,
    -0.34,
    1.07,
    [0.36, 0.23, 0.18],
    [0.078, 0.07, 0.06],
    titaniumMat,
    jointMat,
    padMat
  );

  // 6. Articulated Thumb (+X side)
  const cmcPivot = new THREE.Group();
  cmcPivot.position.set(0.46, 0.34, 0.08);
  wristPivot.add(cmcPivot);

  const cmcBall = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), jointMat);
  cmcPivot.add(cmcBall);

  const thumbMeta = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.105, 0.36, 16),
    carbonMat
  );
  thumbMeta.position.y = 0.18;
  thumbMeta.castShadow = true;
  cmcPivot.add(thumbMeta);

  const thumbMcpPivot = new THREE.Group();
  thumbMcpPivot.position.y = 0.36;
  cmcPivot.add(thumbMcpPivot);

  const thumbPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.088, 0.19, 14),
    jointMat
  );
  thumbPin.rotation.z = Math.PI / 2;
  thumbMcpPivot.add(thumbPin);

  const thumbProx = new THREE.Mesh(
    new THREE.CylinderGeometry(0.082, 0.09, 0.28, 16),
    titaniumMat
  );
  thumbProx.position.y = 0.14;
  thumbProx.castShadow = true;
  thumbMcpPivot.add(thumbProx);

  const thumbIpPivot = new THREE.Group();
  thumbIpPivot.position.y = 0.28;
  thumbMcpPivot.add(thumbIpPivot);

  const thumbDist = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.08, 0.24, 16),
    titaniumMat
  );
  thumbDist.position.y = 0.12;
  thumbDist.castShadow = true;
  thumbIpPivot.add(thumbDist);

  const thumbPad = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 14), padMat);
  thumbPad.position.set(0, 0.24, 0.01);
  thumbIpPivot.add(thumbPad);

  return {
    root,
    forearmPivot,
    wristPivot,
    thumb: { cmcPivot, mcpPivot: thumbMcpPivot, ipPivot: thumbIpPivot },
    index,
    middle,
    ring,
    pinky,
    ledStripMat,
  };
}

const FALLBACK_STEP: SignStep = {
  key: 'fallback_REST',
  signId: 'REST',
  sourceWord: 'استعداد',
  glossAr: SIGN_LEXICON.REST.glossAr,
  glossEn: SIGN_LEXICON.REST.glossEn,
  descriptionAr: SIGN_LEXICON.REST.descriptionAr,
  oscillation: SIGN_LEXICON.REST.oscillation,
  pose: SIGN_LEXICON.REST.pose,
  durationMs: 1100,
};

export const HandStage3D: React.FC<HandStage3DProps> = ({
  signSteps,
  sequenceTrigger,
  ledOn,
  armAngle,
  replyTitle,
  hideTopTimeline = false,
  externalJump = null,
  onStepIndexChange,
  onActiveStepChange,
}) => {
  const effectiveSteps = signSteps.length > 0 ? signSteps : [FALLBACK_STEP];
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dockOpen, setDockOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('front');
  const [stepIndex, setStepIndex] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  const stateRef = useRef({
    signSteps: effectiveSteps,
    isPlaying: true,
    speed: 1,
    ledOn,
    armAngle,
    seqIndex: 0,
    stepElapsed: 0,
    cameraTransition: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null,
    onActiveStepChange,
  });

  stateRef.current.signSteps = effectiveSteps;
  stateRef.current.isPlaying = isPlaying;
  stateRef.current.speed = speed;
  stateRef.current.ledOn = ledOn;
  stateRef.current.armAngle = armAngle;
  stateRef.current.onActiveStepChange = onActiveStepChange;

  const activeStep = effectiveSteps[Math.min(stepIndex, effectiveSteps.length - 1)] ?? FALLBACK_STEP;

  const triggerCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    const p = CAMERA_PRESETS[preset];
    stateRef.current.cameraTransition = {
      pos: new THREE.Vector3(...p.pos),
      target: new THREE.Vector3(...p.target),
    };
  };

  const jumpToStep = (idx: number) => {
    const safeIdx = Math.max(0, Math.min(idx, stateRef.current.signSteps.length - 1));
    stateRef.current.seqIndex = safeIdx;
    stateRef.current.stepElapsed = 0;
    setStepIndex(safeIdx);
    const step = stateRef.current.signSteps[safeIdx] ?? FALLBACK_STEP;
    stateRef.current.onActiveStepChange?.(step);
  };

  const replaySequence = () => {
    jumpToStep(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (externalJump && typeof externalJump.index === 'number') {
      jumpToStep(externalJump.index);
    }
  }, [externalJump]);

  useEffect(() => {
    onStepIndexChange?.(stepIndex, effectiveSteps.length);
  }, [stepIndex, effectiveSteps.length, onStepIndexChange]);

  useEffect(() => {
    stateRef.current.seqIndex = 0;
    stateRef.current.stepElapsed = 0;
    setStepIndex(0);
    setIsPlaying(true);
    const first = stateRef.current.signSteps[0] ?? FALLBACK_STEP;
    stateRef.current.onActiveStepChange?.(first);
  }, [sequenceTrigger, signSteps]);

  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('[data-active-chip="true"]');
    if (!activeBtn) return;
    const targetLeft = activeBtn.offsetLeft - container.clientWidth / 2 + activeBtn.clientWidth / 2;
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [stepIndex]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    // Software WebGL detection
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('تعذر تهيئة العرض ثلاثي الأبعاد WebGL على هذا المتصفح.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth || 800, mount.clientHeight || 600);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('توقف سياق WebGL مؤقتاً.');
    };
    const onContextRestored = () => setWebglError(null);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x131416);
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(0x131416, 0.042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const initialW = mount.clientWidth || 800;
    const initialH = mount.clientHeight || 600;
    const initialAspect = initialW / initialH;
    const camera = new THREE.PerspectiveCamera(
      initialW < 520 || initialAspect < 0.95 ? 50 : 40,
      initialAspect,
      0.1,
      100
    );
    camera.position.set(...CAMERA_PRESETS.front.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.front.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.6;
    controls.maxDistance = 9.0;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.minPolarAngle = 0.25;
    controls.addEventListener('start', () => {
      stateRef.current.cameraTransition = null;
    });

    // Three-point warm/cool lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.3);
    keyLight.position.set(4.5, 6.5, 5.0);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -3.5;
      keyLight.shadow.camera.right = 3.5;
      keyLight.shadow.camera.top = 4.5;
      keyLight.shadow.camera.bottom = -1.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 1.35);
    rimLight.position.set(-4.2, 4.0, -4.5);
    scene.add(rimLight);

    // Studio floor + subtle radial grid + contact shadow
    const floorGeo = new THREE.CircleGeometry(14, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f141e,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const gridHelper = new THREE.GridHelper(18, 24, 0x263248, 0x171e2c);
    gridHelper.position.y = 0.008;
    scene.add(gridHelper);

    const contactShadowTex = createContactShadowTexture();
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.75, 48),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.015;
    scene.add(contactShadow);

    const bumpTex = createCarbonBumpTexture();
    const handRig = buildArticulatedHand(bumpTex);
    scene.add(handRig.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Current smooth pose state (mutated in-place, zero GC)
    const currentPose: HandPose = JSON.parse(JSON.stringify(SIGN_LEXICON.REST.pose));

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let totalElapsed = 0;

    function dampPose(cur: HandPose, target: HandPose, lambda: number, dt: number) {
      cur.wristPitch = THREE.MathUtils.damp(cur.wristPitch, target.wristPitch, lambda, dt);
      cur.wristYaw = THREE.MathUtils.damp(cur.wristYaw, target.wristYaw, lambda, dt);
      cur.wristRoll = THREE.MathUtils.damp(cur.wristRoll, target.wristRoll, lambda, dt);
      cur.armElevation = THREE.MathUtils.damp(cur.armElevation, target.armElevation, lambda, dt);
      cur.splay = THREE.MathUtils.damp(cur.splay, target.splay, lambda, dt);
      cur.thumbAbduct = THREE.MathUtils.damp(cur.thumbAbduct, target.thumbAbduct, lambda, dt);

      cur.thumbCurl[0] = THREE.MathUtils.damp(cur.thumbCurl[0], target.thumbCurl[0], lambda, dt);
      cur.thumbCurl[1] = THREE.MathUtils.damp(cur.thumbCurl[1], target.thumbCurl[1], lambda, dt);

      for (let i = 0; i < 3; i++) {
        cur.index[i] = THREE.MathUtils.damp(cur.index[i], target.index[i], lambda, dt);
        cur.middle[i] = THREE.MathUtils.damp(cur.middle[i], target.middle[i], lambda, dt);
        cur.ring[i] = THREE.MathUtils.damp(cur.ring[i], target.ring[i], lambda, dt);
        cur.pinky[i] = THREE.MathUtils.damp(cur.pinky[i], target.pinky[i], lambda, dt);
      }
    }

    function applyPoseToRig(rig: HandRig, pose: HandPose, oscType: string, t: number) {
      let extraYaw = 0;
      let extraPitch = 0;
      let extraRoll = 0;
      let extraElev = 0;

      if (oscType === 'wave') {
        extraRoll = Math.sin(t * 4.5) * 0.24;
        extraYaw = Math.sin(t * 4.5) * 0.1;
      } else if (oscType === 'nod') {
        extraPitch = Math.sin(t * 4.2) * 0.16;
      } else if (oscType === 'shake') {
        extraYaw = Math.sin(t * 5.0) * 0.22;
      } else if (oscType === 'pulse') {
        extraElev = Math.sin(t * 3.0) * 0.04;
      }

      const armBias = ((stateRef.current.armAngle - 90) / 90) * 0.28;
      rig.forearmPivot.rotation.x = -(pose.armElevation + armBias + extraElev) * 0.45;
      rig.wristPivot.rotation.set(
        pose.wristPitch + extraPitch,
        pose.wristYaw + extraYaw,
        pose.wristRoll + extraRoll
      );

      // Splay around Z
      rig.index.basePivot.rotation.z = -pose.splay * 1.1;
      rig.middle.basePivot.rotation.z = -pose.splay * 0.2;
      rig.ring.basePivot.rotation.z = pose.splay * 0.5;
      rig.pinky.basePivot.rotation.z = pose.splay * 1.25;

      // Finger flexion around +X (curls toward +Z palm)
      rig.index.mcpPivot.rotation.x = pose.index[0];
      rig.index.pipPivot.rotation.x = pose.index[1];
      rig.index.dipPivot.rotation.x = pose.index[2];

      rig.middle.mcpPivot.rotation.x = pose.middle[0];
      rig.middle.pipPivot.rotation.x = pose.middle[1];
      rig.middle.dipPivot.rotation.x = pose.middle[2];

      rig.ring.mcpPivot.rotation.x = pose.ring[0];
      rig.ring.pipPivot.rotation.x = pose.ring[1];
      rig.ring.dipPivot.rotation.x = pose.ring[2];

      rig.pinky.mcpPivot.rotation.x = pose.pinky[0];
      rig.pinky.pipPivot.rotation.x = pose.pinky[1];
      rig.pinky.dipPivot.rotation.x = pose.pinky[2];

      // Thumb abduction & curl (positioned on +X, rotates inward toward -X / +Z)
      rig.thumb.cmcPivot.rotation.set(0.22, -0.45, -pose.thumbAbduct);
      rig.thumb.mcpPivot.rotation.set(pose.thumbCurl[0] * 0.55, 0, pose.thumbCurl[0] * 0.72);
      rig.thumb.ipPivot.rotation.set(pose.thumbCurl[1] * 0.65, 0, pose.thumbCurl[1] * 0.45);

      // Live ESP32 LED indicator color on hand chassis
      if (stateRef.current.ledOn) {
        rig.ledStripMat.color.setHex(0xfbbf24);
        rig.ledStripMat.emissive.setHex(0xf59e0b);
        rig.ledStripMat.emissiveIntensity = 1.8;
      } else {
        rig.ledStripMat.color.setHex(0x14b8a6);
        rig.ledStripMat.emissive.setHex(0x0f766e);
        rig.ledStripMat.emissiveIntensity = 0.35;
      }
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      totalElapsed += dt;

      const steps = stateRef.current.signSteps;
      const safeIdx = Math.min(stateRef.current.seqIndex, steps.length - 1);
      const currentStep = steps[safeIdx] ?? FALLBACK_STEP;

      if (stateRef.current.isPlaying && steps.length > 1) {
        const stepDurationSec = (currentStep.durationMs / 1000) / stateRef.current.speed;
        stateRef.current.stepElapsed += dt;
        if (stateRef.current.stepElapsed >= stepDurationSec) {
          stateRef.current.stepElapsed = 0;
          stateRef.current.seqIndex = (safeIdx + 1) % steps.length;
          const nextStep = steps[stateRef.current.seqIndex] ?? FALLBACK_STEP;
          setStepIndex(stateRef.current.seqIndex);
          stateRef.current.onActiveStepChange?.(nextStep);
        }
      }

      const targetStep = steps[Math.min(stateRef.current.seqIndex, steps.length - 1)] ?? FALLBACK_STEP;
      dampPose(currentPose, targetStep.pose, 8.2 * stateRef.current.speed, dt);
      applyPoseToRig(handRig, currentPose, targetStep.oscillation, totalElapsed);

      // Smooth camera preset transition
      if (stateRef.current.cameraTransition) {
        const alpha = 1 - Math.exp(-8 * dt);
        camera.position.lerp(stateRef.current.cameraTransition.pos, alpha);
        controls.target.lerp(stateRef.current.cameraTransition.target, alpha);
        if (camera.position.distanceTo(stateRef.current.cameraTransition.pos) < 0.02) {
          camera.position.copy(stateRef.current.cameraTransition.pos);
          controls.target.copy(stateRef.current.cameraTransition.target);
          stateRef.current.cameraTransition = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const handleResize = () => {
      if (!mount || disposed) return;
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 600;
      const aspect = w / h;
      camera.fov = w < 520 || aspect < 0.95 ? 50 : 40;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      bumpTex.dispose();
      contactShadowTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const totalSteps = effectiveSteps.length;

  // Group consecutive fingerspelling steps belonging to the same word into a single clean timeline chip
  const wordChips: Array<{ word: string; firstStepIdx: number; lastStepIdx: number }> = [];
  for (let i = 0; i < effectiveSteps.length; i++) {
    const st = effectiveSteps[i];
    const wordKey = st.key.split('_ch_')[0];
    const prev = wordChips[wordChips.length - 1];
    if (prev && effectiveSteps[prev.firstStepIdx].key.split('_ch_')[0] === wordKey) {
      prev.lastStepIdx = i;
    } else {
      wordChips.push({ word: st.sourceWord, firstStepIdx: i, lastStepIdx: i });
    }
  }

  return (
    <section
      aria-label="منصة اليد ثلاثية الأبعاد للغة الإشارة"
      data-testid="hand-3d-stage"
      data-active-sign={activeStep.signId}
      data-active-word={activeStep.sourceWord}
      className="flex flex-col w-full min-w-0 h-[370px] sm:h-[440px] lg:h-auto lg:flex-1 bg-[#131416] overflow-hidden select-none shrink-0"
    >
      {/* Internal Top Timeline (hidden when SignCameraStudio renders full-width bar at very top) */}
      {!hideTopTimeline && (
        <div
          data-testid="sign-sentence-timeline"
          className="w-full min-w-0 shrink-0 bg-[#191B1F] border-b border-white/10 px-3 py-2 flex items-center gap-2.5"
        >
          <div className="flex items-center gap-1.5 shrink-0 text-[11px] sm:text-xs font-bold text-stone-300">
            <span className="text-amber-400 font-mono-tech">
              {stepIndex + 1}/{totalSteps}
            </span>
            <span className="hidden sm:inline text-stone-400">|</span>
            <span className="hidden sm:inline text-stone-300">كلمات المجسم:</span>
          </div>

          <div
            ref={timelineRef}
            className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-0.5"
          >
            {wordChips.map((chip) => {
              const isCurrent = stepIndex >= chip.firstStepIdx && stepIndex <= chip.lastStepIdx;
              const isDone = stepIndex > chip.lastStepIdx;
              return (
                <button
                  key={`${chip.firstStepIdx}_${chip.word}`}
                  type="button"
                  data-active-chip={isCurrent ? 'true' : undefined}
                  onClick={() => jumpToStep(chip.firstStepIdx)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'bg-amber-500 text-stone-950 shadow-sm'
                      : isDone
                      ? 'bg-white/10 text-stone-200 hover:bg-white/15'
                      : 'bg-[#22252B] text-stone-400 hover:text-stone-100 hover:bg-[#2B2F37]'
                  }`}
                >
                  {chip.word}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile Slim Active Sign Strip (outside WebGL canvas so fingertips stay 100% unobstructed) */}
      <div className="sm:hidden shrink-0 px-3 py-1.5 bg-[#131416] border-b border-white/5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-stone-100 truncate">{activeStep.sourceWord}</span>
          <span className="text-amber-400 font-semibold shrink-0">← {activeStep.glossAr}</span>
        </div>
        <span className="text-[10px] text-stone-400 shrink-0 truncate max-w-[130px]">
          {activeStep.glossEn}
        </span>
      </div>

      {/* 3D WebGL Stage Area */}
      <div className="relative flex-1 min-h-0 min-w-0">
        {/* Dedicated WebGL Mount Container */}
        <div ref={canvasMountRef} className="w-full h-full" />

        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#131416] p-6 text-center">
            <div className="max-w-md border border-white/10 bg-[#191B1F] rounded-xl p-6">
              <p className="text-base font-semibold text-stone-100">{webglError}</p>
              <p className="mt-2 text-sm text-stone-400">
                الإشارة النشطة حالياً: {activeStep.glossAr} ({activeStep.glossEn})
              </p>
            </div>
          </div>
        )}

        {/* Desktop Compact Active Sign Details Badge (tucked cleanly in corner without blocking fingers) */}
        <div className="hidden sm:block absolute top-3 right-3 z-10 max-w-xs pointer-events-none">
          <div className="bg-[#191B1F]/90 border border-white/10 rounded-xl px-3 py-2">
            <div className="text-[11px] text-stone-400">
              {replyTitle || 'ترجمة رد الذكاء الاصطناعي'}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
              <p
                data-testid="active-sign-gloss"
                className="text-sm sm:text-base font-bold text-stone-100 leading-snug"
              >
                {activeStep.sourceWord}
              </p>
              <span className="text-xs font-semibold text-amber-400">
                ← {activeStep.glossAr}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">
              {activeStep.descriptionAr}
            </p>
          </div>
        </div>

        {/* Collapsible Bottom Control Dock */}
        <div className="absolute bottom-2.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94vw]">
          <button
            type="button"
            onClick={() => setDockOpen((prev) => !prev)}
            aria-expanded={dockOpen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-300 bg-[#191B1F]/95 border border-white/10 rounded-t-lg hover:text-white transition-colors whitespace-nowrap"
          >
            {dockOpen ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إخفاء شريط التحكم</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>إظهار التحكم</span>
              </>
            )}
          </button>

          {dockOpen && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-2 bg-[#191B1F]/95 border border-white/10 rounded-xl shadow-lg">
              {/* Camera Presets */}
              <div className="flex items-center gap-1 bg-[#131416] p-1 rounded-lg border border-white/10">
                {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => triggerCameraPreset(preset)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      cameraPreset === preset
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-400 hover:text-stone-100'
                    }`}
                  >
                    {CAMERA_PRESETS[preset].label}
                  </button>
                ))}
              </div>

              <div className="h-5 w-px bg-white/10 hidden sm:block" aria-hidden="true" />

              {/* Playback Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPlaying((p) => !p)}
                  aria-label={isPlaying ? 'إيقاف حركة اليد مؤقتاً' : 'تشغيل حركة اليد'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-100 hover:bg-[#2B2F37] transition-colors whitespace-nowrap shrink-0"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                      <span>إيقاف</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                      <span>تشغيل</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={replaySequence}
                  aria-label="إعادة عرض تسلسل الإشارات"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-100 hover:bg-[#2B2F37] transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>إعادة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))}
                  aria-label="تبديل سرعة حركة الإشارة"
                  className="px-2.5 py-1.5 text-xs font-mono-tech font-semibold rounded-lg bg-[#22252B] text-amber-400 hover:bg-[#2B2F37] transition-colors whitespace-nowrap shrink-0"
                >
                  {speed}x
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
