// 3D lazy susan for the home page.
// Proportions eyeballed from a reference photo.
// Only the turntable rotates, lights stay put.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

const host = document.getElementById("susan");
const fallback = host.querySelector(".susan-fallback");
const picks = [...document.querySelectorAll(".pick")];
const link = document.getElementById("now-link");
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const cssValue = (name, fallback) => getComputedStyle(host).getPropertyValue(name).trim() || fallback;
const cardPaper = cssValue("--susan-paper", "#f3f5f1");

const pickCount = picks.length;
const anglePerPick = (2 * Math.PI) / pickCount;
host.ariaLabel = `Lazy Susan with ${pickCount} dishes. Drag it, or use the left and right arrow keys.`;
let selectedPick = picks.findIndex((pick) => pick.getAttribute("aria-pressed") === "true");
if (selectedPick < 0) selectedPick = 0;
let spinToPick = null; // set once the 3D scene is ready

// rotationIndex can go negative, this keeps it inside 0..pickCount-1
const wrapIndex = (n) => ((n % pickCount) + pickCount) % pickCount;

function showPick(index) {
  selectedPick = index;
  const data = picks[index].dataset;
  picks.forEach((button, buttonIndex) => button.setAttribute("aria-pressed", buttonIndex === index));
  const row = picks[index].parentElement; // phones: keep chosen dish in view
  if (row.scrollWidth > row.clientWidth) {
    row.scrollTo({
      left: picks[index].offsetLeft - (row.clientWidth - picks[index].offsetWidth) / 2,
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  }
  link.href = data.href;
  link.textContent = data.cta;
}
function select(index) {
  showPick(index);
  spinToPick?.(index);
}
picks.forEach((button, index) => button.addEventListener("click", () => select(index)));
host.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") select((selectedPick + 1) % pickCount);
  if (event.key === "ArrowLeft") select((selectedPick + pickCount - 1) % pickCount);
});

function build() {
  const glassRadius = 4;
  const glassHeight = 0.22; // thick enough to read as glass

  const small = matchMedia("(max-width: 768px)").matches; // phones: lighter render settings
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 2 : 3));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%";

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;

  const camera = new THREE.PerspectiveCamera(12, 4 / 3, 0.1, 100); // narrow lens so near and far halves match
  const tilt = THREE.MathUtils.degToRad(40);
  camera.position.set(0, Math.sin(tilt) * 38, Math.cos(tilt) * 38);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
  key.position.set(-6, 12, 7);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(small ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 40 });
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x2a2a2a, 0.5));

  // plain dark table for the glass to refract
  const table = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.2, 96), new THREE.MeshStandardMaterial({ color: cssValue("--susan-table", "#101c3f"), roughness: 0.7 }));
  table.position.y = -0.22;
  table.receiveShadow = true;
  scene.add(table);

  const turn = new THREE.Group();
  turn.visible = false; // wait for the intro's starting positions before rendering
  scene.add(turn);
  const props = new THREE.Group(); // hidden until the Blender models load
  props.visible = false;
  turn.add(props);

  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: 1.5, thickness: 0.08, roughness: 0.05, specularIntensity: 1, envMapIntensity: 1.5, attenuationColor: 0xa8dcc8, attenuationDistance: 0.4 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(glassRadius, glassRadius, glassHeight, 128), glassMat);
  glass.position.y = glassHeight / 2;
  glass.receiveShadow = true;
  // bright rim line
  const edge = new THREE.Mesh(new THREE.TorusGeometry(glassRadius, 0.05, 16, 160), new THREE.MeshPhysicalMaterial({ color: 0xf2fffb, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0x9fe0cc, emissiveIntensity: 0.25 }));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = glassHeight / 2;
  props.add(glass, edge);

  const cardWidth = 2.2, cardHeight = 1.65;
  const cardRingRadius = 2.9, restingScale = 0.85, selectedScale = 1.5;
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.6 });
  const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const labelHeight = 84, cardInk = cssValue("--text", "#262d40"), cardFont = '700 40px Comfortaa, system-ui, sans-serif';
  const makeCardTexture = (pick) => {
    const canvasWidth = 800;
    const canvasHeight = Math.round((canvasWidth * cardHeight) / cardWidth);
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const drawCard = (image) => {
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      roundRect(context, 0, 0, canvasWidth, canvasHeight, 36);
      context.fillStyle = cardPaper;
      context.fill();
      const photoHeight = canvasHeight - 40 - labelHeight;
      if (image) {
        context.save();
        roundRect(context, 20, 20, canvasWidth - 40, photoHeight, 26);
        context.clip();
        const scale = Math.max((canvasWidth - 40) / image.width, photoHeight / image.height);
        const focus = Number(pick.dataset.focus ?? 0.5); // keeps the subject in the cropped photo
        context.drawImage(image, canvasWidth / 2 - (image.width * scale) / 2, 20 - (image.height * scale - photoHeight) * focus, image.width * scale, image.height * scale);
        context.restore();
      }

      context.strokeStyle = cardInk;
      context.globalAlpha = 0.35;
      context.lineWidth = 3;
      context.setLineDash([12, 9]);
      context.beginPath();
      context.moveTo(32, 20 + photoHeight + 12);
      context.lineTo(canvasWidth - 32, 20 + photoHeight + 12);
      context.stroke();
      context.setLineDash([]);
      context.globalAlpha = 1;
      const labelY = 20 + photoHeight + labelHeight / 2 + 4;
      context.fillStyle = cardInk;
      context.font = cardFont;
      context.textBaseline = "middle";
      context.textAlign = "left";
      context.fillText((pick.dataset.order ?? "").toUpperCase(), 32, labelY);
      context.textAlign = "right";
      context.fillText(pick.textContent.trim().toUpperCase(), canvasWidth - 32, labelY);
      texture.needsUpdate = true;
      if (image) kick(); // the first draw runs before the motion loop is ready
    };
    drawCard(null);
    const image = new Image();
    image.onload = () => document.fonts.load(cardFont).finally(() => drawCard(image)); // canvas text does not wait for fonts
    image.src = pick.dataset.img;
    return texture;
  };
  const cards = picks.map((pick, index) => {
    const angle = index * anglePerPick;
    const card = new THREE.Group();
    card.position.set(cardRingRadius * Math.sin(angle), glassHeight, cardRingRadius * Math.cos(angle));
    card.scale.setScalar(restingScale);
    card.userData.i = index;
    const bill = new THREE.Group(); // counter-rotated so the card faces the camera
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.4), standMat);
    stand.position.set(0, 0.035, -0.05);
    const lean = new THREE.Group(); // lean back so the photo isn't squashed
    lean.position.set(0, 0.07, 0); lean.rotation.x = -0.38;
    // unlit, tone mapping washed the photos out
    const front = new THREE.Mesh(new THREE.PlaneGeometry(cardWidth, cardHeight), new THREE.MeshBasicMaterial({ map: makeCardTexture(pick), alphaTest: 0.5, toneMapped: false }));
    front.position.y = cardHeight / 2;
    for (const part of [stand, front]) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
    lean.add(front);
    bill.add(stand, lean);
    card.add(bill);
    turn.add(card);
    return card;
  });

  const propRadius = 1.75, propScale = 1.2, backPick = Math.floor(pickCount / 2);
  const placeProp = (object, degrees, radius, yaw = 0, scale = propScale) => {
    const angle = (degrees * Math.PI) / 180;
    object.position.set(radius * Math.sin(angle), glassHeight, radius * Math.cos(angle));
    object.rotation.y = yaw;
    object.scale.multiplyScalar(scale);
    props.add(object);
  };
  const loader = new GLTFLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const load = (name) => loader.loadAsync(new URL(`models/${name}.glb`, import.meta.url).href).then(({ scene: model }) => {
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // max anisotropy so textures stay sharp at an angle
      for (const texture of Object.values(object.material)) {
        if (texture?.isTexture) texture.anisotropy = aniso;
      }
    });
    return model;
  });
  const gapAngle = (k) => ((k + 0.5) * 360) / pickCount; // gap after card k, props avoid cards
  const loaded = [
    // teapot and chopsticks in the back gaps only
    load("teapot").then((model) => placeProp(model.clone(), gapAngle(backPick), propRadius, Math.PI + 0.3)),
    // cards sit on the chopsticks plate
    load("chopsticks").then((model) => {
      placeProp(model.clone(), gapAngle(backPick - 1), propRadius, Math.PI - 0.5); // whole set, before the plate is borrowed
      const plate = model.getObjectByName("ChopPlate");
      plate.position.set(0, 0, 0);
      plate.scale.multiplyScalar(1.5 / new THREE.Box3().setFromObject(plate).getSize(new THREE.Vector3()).x);
      const box = new THREE.Box3().setFromObject(plate);
      const center = box.getCenter(new THREE.Vector3());
      plate.position.set(-center.x, -box.min.y, -center.z + 0.25); // forward enough to remain visible behind the card
      cards.forEach((card) => {
        const [stand, lean] = card.children[0].children;
        stand.visible = false;
        lean.position.y = box.max.y - box.min.y;
        card.children[0].add(plate.clone());
      });
    }),
    load("susan").then((model) => {
      // Blender glass, gold plate and hub
      const pane = model.getObjectByName("Glass");
      pane.material = glassMat;
      pane.castShadow = false;
      pane.receiveShadow = true;
      pane.scale.y = glassHeight / 0.14; // the model is 0.14 thick
      props.remove(glass);
      props.add(pane, model.getObjectByName("GoldPlate"), model.getObjectByName("Hub"));
    }),
  ];
  // show once all models settle, even failures
  Promise.allSettled(loaded).then(() => {
    props.visible = true;
    const cardGroups = cards.map((card) => card.children[0]);
    // only ring props drop in, hub stays
    const ringProps = props.children.filter((object) => Math.hypot(object.position.x, object.position.z) > 1);
    const droppers = [...cardGroups, ...ringProps];
    intro = {
      startTime: performance.now(),
      dishes: droppers.map((object) => ({ object, restY: object.position.y }))
    };
    turn.position.y = 6;
    intro.dishes.forEach(({ object }) => {
      object.visible = false;
    });
    turn.visible = true;
    if (prefersReducedMotion) introEnd();
    kick();
  });

  // motion
  let angle = -selectedPick * anglePerPick, target = angle, rotationIndex = selectedPick;
  let dragging = false, raf = 0, last = 0, intro = null;
  // damped bounce, goes 0 -> 1
  const bounce = (t) => {
    const decay = (1 - t) ** 2;
    return 1 - Math.abs(Math.cos(t * 9)) * decay;
  };
  // also skips the intro, resets positions
  const introEnd = () => {
    turn.position.y = 0;
    intro.dishes.forEach(({ object, restY }) => {
      object.visible = true;
      object.position.y = restY;
    });
    intro = null;
  };
  const introStep = (now) => {
    const seconds = (now - intro.startTime) / 1000;
    const turnProgress = Math.min(seconds / 0.8, 1);
    turn.position.y = 6 * (1 - turnProgress) ** 3; // ease out cubic, no bounce on the turntable itself
    const dishCount = intro.dishes.length;
    intro.dishes.forEach(({ object, restY }, index) => {
      // staggered: each dish falls 4 units and bounces
      const progress = (seconds - 0.55 - index * 0.07) / 0.55;
      object.visible = progress >= 0;
      const clamped = Math.min(Math.max(progress, 0), 1);
      object.position.y = restY + 4 * (1 - bounce(clamped));
    });
    if (seconds > 0.55 + dishCount * 0.07 + 0.55) introEnd();
  };
  const frame = (now) => {
    raf = 0;
    // rAF can lag performance.now(), keep dt positive
    let dt = (now - last) / 1000 || 0.016;
    dt = Math.min(Math.max(dt, 0.001), 0.05);
    last = now;
    let moving = dragging;
    if (intro) {
      introStep(now);
      moving = true;
    }
    if (!dragging) {
      const remainingAngle = target - angle;
      if (Math.abs(remainingAngle) > 0.0005) {
        angle += prefersReducedMotion ? remainingAngle : remainingAngle * (1 - Math.exp(-dt * 7));
        moving = true;
      } else {
        angle = target;
      }
    }
    turn.rotation.y = angle;
    cards.forEach((card) => {
      card.children[0].rotation.y = -angle;
    });
    cards.forEach((card, index) => {
      // chosen dish lifts and grows
      let targetY = glassHeight;
      let targetScale = restingScale;
      if (index === selectedPick) {
        targetY += 0.15;
        targetScale = selectedScale;
      }
      const remainingY = targetY - card.position.y;
      const remainingScale = targetScale - card.scale.x;
      if (Math.abs(remainingY) > 0.0005) {
        card.position.y += prefersReducedMotion ? remainingY : remainingY * (1 - Math.exp(-dt * 9));
        moving = true;
      } else {
        card.position.y = targetY;
      }
      if (Math.abs(remainingScale) > 0.0005) {
        card.scale.setScalar(card.scale.x + (prefersReducedMotion ? remainingScale : remainingScale * (1 - Math.exp(-dt * 9))));
        moving = true;
      } else {
        card.scale.setScalar(targetScale);
      }
    });
    renderer.render(scene, camera);
    fallback.hidden = true;
    if (moving) raf = requestAnimationFrame(frame);
  };
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    kick();
  };
  new ResizeObserver(resize).observe(host);
  resize();

  // drag to spin, snap to nearest, click picks
  const raycaster = new THREE.Raycaster();
  let lastX = 0, velocity = 0, dragDistance = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); fallback.hidden = false; fallback.style.visibility = "visible"; });
  canvas.addEventListener("webglcontextrestored", kick);
  canvas.addEventListener("pointerdown", (event) => {
    if (intro) introEnd(); // touching it skips the intro
    dragging = true;
    lastX = event.clientX;
    velocity = 0;
    dragDistance = 0;
    canvas.setPointerCapture(event.pointerId);
    host.style.cursor = "grabbing";
    kick();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    dragDistance += Math.abs(dx);
    velocity = dx * 0.008;
    angle += velocity;
    kick();
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    host.style.cursor = "";
    if (dragDistance < 5) {
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(cards, true)[0];
      if (hit) {
        let object = hit.object;
        while (object.userData.i === undefined) object = object.parent;
        spinToPick(object.userData.i);
        showPick(object.userData.i);
        return;
      }
    }
    rotationIndex = Math.round(-(angle + velocity * 12) / anglePerPick);
    target = -rotationIndex * anglePerPick;
    showPick(wrapIndex(rotationIndex));
    kick();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  return (index) => {
    const currentPick = wrapIndex(rotationIndex);
    // go the short way round
    const halfTurn = Math.floor(pickCount / 2);
    const shortestStep = ((index - currentPick + pickCount + halfTurn) % pickCount) - halfTurn;
    rotationIndex += shortestStep;
    target = -rotationIndex * anglePerPick;
    kick();
  };
}

// keep at bottom, build() needs the consts above
try {
  spinToPick = build();
} catch {
  fallback.style.visibility = "visible";
}
