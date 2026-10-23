// 3D Lazy Susan. Proportions come from 3d/analysis.md (glass disc : gold plate : hub = 1 : 0.31 : 0.11, about 40 degrees elevation).
// Light and environment are fixed in the scene and only the turntable rotates, so reflections stay put like real glass.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

const host = document.getElementById("susan");
const picks = [...document.querySelectorAll(".pick")];
const title = document.getElementById("now-title");
const link = document.getElementById("now-link");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
// a page can restyle the table and cards with these CSS variables on #susan; the fallbacks are this site's look
const css = (k, d) => getComputedStyle(host).getPropertyValue(k).trim() || d;
const PAPER = css("--susan-paper", "#f3f5f1");

const N = picks.length, STEP = (2 * Math.PI) / N;
host.ariaLabel = `Lazy Susan with ${N} dishes. Drag it, or use the left and right arrow keys.`;
let idx = 0;
let spinTo = null; // set once the 3D scene is ready

function panel(i) {
  const changed = i !== idx;
  idx = i;
  const p = picks[i].dataset;
  picks.forEach((b, j) => b.setAttribute("aria-pressed", j === i));
  title.textContent = p.title;
  link.href = p.href;
  link.textContent = p.cta;
  // the new dish's name settles in instead of swapping, so the change reads as a change
  if (changed && !reduce) title.animate([{ opacity: 0, filter: "blur(4px)", translate: "0 4px" }, { opacity: 1, filter: "none", translate: "0 0" }], { duration: 220, easing: "cubic-bezier(.23, 1, .32, 1)" });
}
function select(i) {
  panel(i);
  spinTo?.(i);
}
picks.forEach((b, i) => b.addEventListener("click", () => select(i)));
host.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") select((idx + 1) % N);
  if (e.key === "ArrowLeft") select((idx + N - 1) % N);
});

const shadowed = (g) => (g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }), g);

function build() {
  const D = 4; // glass radius
  const GLASS_H = 0.22; // thick enough that the glass top reads as the lazy susan
  const R = 2.7; // plate ring radius

  const small = matchMedia("(max-width: 768px)").matches; // phones: fewer pixels and a smaller shadow map keep the GPU from stalling
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

  const camera = new THREE.PerspectiveCamera(12, 4 / 3, 0.1, 100); // narrow lens, far away: keeps the disc's near and far halves the same visual size
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

  // plain dark table under the glass: glass needs something to refract, but no pattern to distract from it
  const table = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.2, 96), new THREE.MeshStandardMaterial({ color: css("--susan-table", "#101c3f"), roughness: 0.7 }));
  table.position.y = -0.22; // just under the glass, like a real banquet table
  table.receiveShadow = true;
  scene.add(table);

  const turn = new THREE.Group();
  scene.add(turn);
  const props = new THREE.Group(); // the table setting: hidden until the Blender models load, so the code-drawn stand-ins never flash
  props.visible = false;
  turn.add(props);

  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: 1.5, thickness: 0.08, roughness: 0.05, specularIntensity: 1, envMapIntensity: 1.5, attenuationColor: 0xa8dcc8, attenuationDistance: 0.4 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(D, D, GLASS_H, 128), glassMat);
  glass.position.y = GLASS_H / 2;
  glass.receiveShadow = true;
  // polished edge: the bright line along the rim in the reference photo
  const edge = new THREE.Mesh(new THREE.TorusGeometry(D, 0.05, 16, 160), new THREE.MeshPhysicalMaterial({ color: 0xf2fffb, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0x9fe0cc, emissiveIntensity: 0.25 }));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = GLASS_H / 2;
  props.add(glass, edge);

  // one card per pick, standing on small stands and spaced evenly round the table. The face is drawn on a canvas like the cards on the page.
  const CW = 2.2, CH = 1.65;
  const standMat = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.6 });
  const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  const faceTex = (b) => {
    const W = 800, H = Math.round((W * CH) / CW);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const draw = (img) => { // photo only: the panel beside the table carries the title
      g.clearRect(0, 0, W, H);
      roundRect(g, 0, 0, W, H, 36); g.fillStyle = PAPER; g.fill();
      if (img) {
        g.save(); roundRect(g, 20, 20, W - 40, H - 40, 26); g.clip();
        const k = Math.max((W - 40) / img.width, (H - 40) / img.height);
        const focus = Number(b.dataset.focus ?? 0.5); // how far down the photo the food sits, so the crop doesn't cut it
        g.drawImage(img, W / 2 - (img.width * k) / 2, 20 - (img.height * k - (H - 40)) * focus, img.width * k, img.height * k);
        g.restore();
      }
      t.needsUpdate = true;
      if (img) kick(); // not before the motion loop below exists
    };
    draw(null);
    const img = new Image();
    img.onload = () => draw(img);
    img.src = b.dataset.img;
    return t;
  };
  const cards = picks.map((b, i) => {
    const th = i * STEP;
    const g = new THREE.Group();
    g.position.set(3.5 * Math.sin(th), GLASS_H, 3.5 * Math.cos(th));
    g.scale.setScalar(0.8); // smaller cards hide less of the table behind them
    g.userData.i = i;
    const bill = new THREE.Group(); // counter-rotated every frame so the card always faces the viewer, never edge-on or from behind
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.4), standMat);
    stand.position.set(0, 0.035, -0.05);
    const lean = new THREE.Group(); // card leans back a little against its stand
    lean.position.set(0, 0.07, 0); lean.rotation.x = -0.12;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshStandardMaterial({ map: faceTex(b), roughness: 0.6, alphaTest: 0.5 }));
    front.position.y = CH / 2;
    for (const m of [stand, front]) m.castShadow = m.receiveShadow = true;
    lean.add(front);
    bill.add(stand, lean);
    g.add(bill);
    turn.add(g);
    return g;
  });

  // table setting: Blender models placed in the diagonal slots between the cards
  const place = (obj, deg, r, yaw = 0) => {
    const th = (deg * Math.PI) / 180;
    obj.position.set(r * Math.sin(th), GLASS_H, r * Math.cos(th));
    obj.rotation.y = yaw;
    props.add(obj);
  };
  const loader = new GLTFLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const load = (name) => loader.loadAsync(new URL(`models/${name}.glb`, import.meta.url).href).then((g) => {
    g.scene.traverse((o) => { if (o.isMesh) for (const t of Object.values(o.material)) if (t?.isTexture) t.anisotropy = aniso; }); // sharp patterns at a grazing angle
    return shadowed(g.scene);
  });
  const dish = (name, slots) => load(name).then((model) => slots.forEach((s) => place(model.clone(), ...s)));
  const loaded = [
    dish("teapot", [[36, 2.4, -0.3], [324, 2.4, Math.PI + 0.3]]),
    dish("chopsticks", [[180, 2.0, 0.3]]),
    dish("teacup", [[108, 3.2], [252, 3.2]]),
    load("susan").then((model) => {
      // Blender glass with its rounded edge, plus the gold plate and hub baked under it
      const pane = model.getObjectByName("Glass");
      pane.material = glassMat; pane.castShadow = false; pane.receiveShadow = true;
      pane.scale.y = GLASS_H / 0.14; // the model is 0.14 thick
      props.remove(glass); props.add(pane, model.getObjectByName("GoldPlate"), model.getObjectByName("Hub"));
    }),
  ];
  Promise.allSettled(loaded).then(() => { // reveal all at once; a model that failed to load is just left out
    props.visible = true;
    { // intro: the table lowers in, then the dishes drop onto it one by one. Plays even with reduced motion (a one-time 2s drop, tap to skip) since many PCs have OS animations off by default.
      const objs = [...cards.map((g) => g.children[0]), ...props.children.filter((o) => Math.hypot(o.position.x, o.position.z) > 1)];
      intro = { t0: performance.now(), dishes: objs.map((o) => ({ o, y: o.position.y })) };
      turn.position.y = 6;
      intro.dishes.forEach(({ o }) => (o.visible = false));
    }
    kick();
  });

  // motion
  let angle = 0, target = 0, k = 0, dragging = false, raf = 0, last = 0, intro = null;
  const bounce = (t) => 1 - Math.abs(Math.cos(t * 9)) * (1 - t) ** 2; // damped bounce, 0 to 1
  const introEnd = () => { // also the skip: put everything back where it belongs
    turn.position.y = 0;
    intro.dishes.forEach(({ o, y }) => { o.visible = true; o.position.y = y; });
    intro = null;
  };
  const introStep = (now) => {
    const s = (now - intro.t0) / 1000, u = Math.min(s / 0.8, 1);
    turn.position.y = 6 * (1 - u) ** 3; // easeOutCubic: settles with no bounce
    const n = intro.dishes.length;
    intro.dishes.forEach(({ o, y }, i) => {
      const v = (s - 0.55 - i * 0.07) / 0.55; // staggered; each falls 4 units and bounces
      o.visible = v >= 0;
      o.position.y = y + 4 * (1 - bounce(Math.min(Math.max(v, 0), 1)));
    });
    if (s > 0.55 + n * 0.07 + 0.55) introEnd();
  };
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(Math.max((now - last) / 1000 || 0.016, 0.001), 0.05); // rAF time can read earlier than performance.now(), so never let dt go negative
    last = now;
    let moving = dragging;
    if (intro) { introStep(now); moving = true; }
    if (!dragging) {
      const d = target - angle;
      if (Math.abs(d) > 0.0005) { angle += reduce ? d : d * (1 - Math.exp(-dt * 7)); moving = true; } else angle = target;
    }
    turn.rotation.y = angle;
    cards.forEach((g) => (g.children[0].rotation.y = -angle));
    cards.forEach((g, i) => {
      const ty = GLASS_H + (i === idx ? 0.1 : 0); // the chosen dish lifts a little
      const d = ty - g.position.y;
      if (Math.abs(d) > 0.0005) { g.position.y += reduce ? d : d * (1 - Math.exp(-dt * 9)); moving = true; } else g.position.y = ty;
    });
    renderer.render(scene, camera);
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

  // drag to spin, release to snap to the nearest dish. A click without movement picks the dish under the pointer.
  const ray = new THREE.Raycaster();
  let startX = 0, lastX = 0, vel = 0, moved = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    if (intro) introEnd(); // a touch skips the intro
    dragging = true; startX = lastX = e.clientX; vel = 0; moved = 0;
    el.setPointerCapture(e.pointerId);
    host.style.cursor = "grabbing";
    kick();
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    moved += Math.abs(dx);
    vel = dx * 0.008;
    angle += vel;
    kick();
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    host.style.cursor = "";
    if (moved < 5) {
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(cards, true)[0];
      if (hit) { let o = hit.object; while (o.userData.i === undefined) o = o.parent; spinTo(o.userData.i); panel(o.userData.i); return; }
    }
    k = Math.round(-(angle + vel * 12) / STEP);
    target = -k * STEP;
    panel(((k % N) + N) % N);
    kick();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  return (i) => {
    const cur = ((k % N) + N) % N;
    k += ((((i - cur + Math.floor(N / 2)) % N) + N) % N) - Math.floor(N / 2); // shortest way round
    target = -k * STEP;
    kick();
  };
}

// last on purpose: build() uses the helper consts above, which must exist before it runs
try {
  spinTo = build();
} catch {
  host.hidden = true; // no WebGL: the buttons under it still work
}
