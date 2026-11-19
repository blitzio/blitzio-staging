import { surfaceShader, atmosphereShader } from './planet-shaders';
import * as THREE from 'three';

const vertex = `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

// Sunrise geometry. The sun is always placed so that the day/night line is a
// plane through the Earth's centre and the camera. Seen from the camera, that
// plane is edge on, so the line is drawn straight on screen. Day is on its
// left, night on its right.
const radius = 18;
const center = new THREE.Vector3(0, -radius, 0);
// The visible cap faces almost straight up. Poses that must look the same on
// every screen (the resting pose and the stills) are given as degrees right
// of this axis.
const capAxis = new THREE.Vector3(0, .996, .087).normalize();
const rightward = new THREE.Vector3(1, 0, 0);
const restAim = 9;
const toRadians = Math.PI / 180;
// The value of dot(normal, sun) that the shader treats as the day/night line.
const edge = 0;
// Screen positions are in the -1..1 range, x to the right and y up.
// The Earth is widest on this row near the bottom of the view.
const floorRow = -.86;
// Soft edges. Across the middle of the Earth the line sits exactly under the
// pointer. Near either edge it slows smoothly instead of stopping dead, and
// settles short of the edge, so the far left always keeps a band of dawn and
// the far right a band of night with its city lights. Both are shares of the
// Earth's half-width on screen, so the effect is the same on every screen
// shape: edgeBand is how far inside the Earth's edge the line settles,
// edgeKnee how far before that it starts to slow.
const edgeBand = .24, edgeKnee = .19;
// Follows x exactly between low + knee and high - knee, then eases towards
// low or high without reaching them. Slope stays 1 at the joins, so the
// motion never jerks.
function softLimit(x: number, low: number, high: number, knee: number) {
  if (high - low <= 2 * knee) return (low + high) / 2;
  if (x < low + knee) return low + knee * Math.exp((x - low - knee) / knee);
  if (x > high - knee) return high - knee * Math.exp((high - knee - x) / knee);
  return x;
}
// Cool lavender white for the night lights, in linear RGB.
const lamp: [number, number, number] = [.74, .74, 1.0];
// Half-lives in seconds. While the pointer moves, the line is held to it:
// the smoothing is only long enough to hide jitter, so the line does not
// trail. After a jump (arrival hand-off, pointer entering or leaving) the
// line eases instead, then tightens back to holding.
const viewHalfLife = .13, holdHalfLife = .018, easeHalfLife = .18, easeFade = .35;

// Critically damped spring, exact for any frame time. No overshoot.
type Spring = { value: number; velocity: number };
const spring = (value = 0): Spring => ({ value, velocity: 0 });
function step(item: Spring, target: number, halfLife: number, dt: number) {
  const damping = 2 * Math.LN2 / halfLife;
  const offset = item.value - target;
  const drive = item.velocity + offset * damping;
  const decay = Math.exp(-damping * dt);
  item.value = decay * (offset + drive * dt) + target;
  item.velocity = decay * (item.velocity - drive * damping * dt);
}
function settle(item: Spring, target: number) {
  if (Math.abs(item.value - target) > .0006 || Math.abs(item.velocity) > .0006) return false;
  item.value = target; item.velocity = 0;
  return true;
}
function snap(item: Spring, value: number) { item.value = value; item.velocity = 0; }
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export async function createCosmicScene(host: HTMLElement, signal: AbortSignal, mouseAtStart?: () => { x: number; y: number } | undefined) {
  if (signal.aborted) return () => {};
  const pause = document.querySelector<HTMLInputElement>('#pause-motion')!;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true });
  let rendererReleased = false;
  function releaseRenderer() {
    if (rendererReleased) return;
    rendererReleased = true;
    renderer.dispose();
    renderer.forceContextLoss();
  }
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x101115, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (renderer.capabilities.maxTextureSize < 3072) {
    releaseRenderer();
    throw new Error('Static presentation selected for texture capability.');
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 160);
  let textures: THREE.Texture[] = [];
  // The Earth images are decoded in the background as bitmaps. Decoding them
  // on the page's own thread, as plain images, froze the arrival sunrise
  // for a third of a second. Bitmaps are uploaded as they are, top row
  // first, so the shader reads them the other way up (see planet-shaders).
  const decode = async (source: string) => {
    const response = await fetch(import.meta.env.BASE_URL + source, { signal });
    if (!response.ok) throw new Error(`Texture ${source} failed with ${response.status}.`);
    return createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' });
  };
  let bitmaps: ImageBitmap[] = [];
  const closeBitmaps = () => bitmaps.forEach(bitmap => bitmap.close());
  signal.addEventListener('abort', releaseRenderer, { once: true });
  try {
    const loaded = await Promise.allSettled(['images/earth-cap.webp', 'images/earth-night.webp'].map(decode));
    bitmaps = loaded.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const failed = loaded.find(result => result.status === 'rejected');
    if (failed) throw (failed as PromiseRejectedResult).reason;
  } catch (error) {
    closeBitmaps();
    releaseRenderer();
    throw error;
  } finally {
    signal.removeEventListener('abort', releaseRenderer);
  }
  if (signal.aborted) {
    closeBitmaps();
    releaseRenderer();
    return () => {};
  }
  textures = bitmaps.map(bitmap => new THREE.Texture(bitmap));
  for (const texture of textures) {
    texture.flipY=false;
    texture.needsUpdate=true;
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    texture.minFilter=THREE.LinearMipmapLinearFilter;
  }
  const [atlas, night] = textures;
  const uniforms={atlas:{value:atlas},night:{value:night},lamp:{value:new THREE.Vector3(...lamp)},edge:{value:edge},finish:{value:1},sun:{value:new THREE.Vector3()},center:{value:center}};
  const surface = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: surfaceShader });
  const geometry = new THREE.SphereGeometry(radius, 192, 96);
  const planet = new THREE.Mesh(geometry, surface);
  planet.position.copy(center);
  scene.add(planet);
  const airGeometry = new THREE.SphereGeometry(18.11, 160, 80);
  const atmosphere = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, transparent: true, depthWrite: false, fragmentShader: atmosphereShader });
  const shell = new THREE.Mesh(airGeometry, atmosphere);
  shell.position.copy(center);
  scene.add(shell);
  // Get the GPU ready a piece at a time while the arrival plays: one texture
  // per frame, then the shaders, compiled without blocking where the browser
  // allows. Done all at once on the first draw, this froze the sunrise.
  const release = () => { geometry.dispose(); airGeometry.dispose(); surface.dispose(); atmosphere.dispose(); textures.forEach(texture => texture.dispose()); closeBitmaps(); releaseRenderer(); };
  const nextFrame = () => new Promise<void>(resolve => {
    const done = () => { signal.removeEventListener('abort', done); cancelAnimationFrame(id); resolve(); };
    const id = requestAnimationFrame(done);
    signal.addEventListener('abort', done, { once: true });
  });
  try {
    for (const texture of textures) {
      await nextFrame();
      if (signal.aborted) break;
      renderer.initTexture(texture);
    }
    if (!signal.aborted) {
      place(camera, 0, 0);
      await renderer.compileAsync(scene, camera);
    }
  } catch (error) {
    release();
    throw error;
  }
  if (signal.aborted) {
    release();
    return () => {};
  }

  // The view shifts only slightly with the pointer, so the Earth stays put
  // and the light is what moves.
  function place(view: THREE.PerspectiveCamera, x: number, y: number) {
    view.position.set(x * 1.1, 6 + y * .35, 25);
    view.lookAt(x * .26, 5 - y * .18, 0);
    view.updateMatrixWorld();
  }
  // The sun direction whose day/night line passes through a point of the
  // Earth (given by its surface normal) and looks straight from the camera.
  const axis = new THREE.Vector3();
  function sunThrough(normal: THREE.Vector3, eye: THREE.Vector3, out: THREE.Vector3) {
    axis.copy(eye).sub(center).normalize();
    out.crossVectors(normal, axis).normalize();
    if (out.x > 0) out.negate();
    return out;
  }
  const aimed = new THREE.Vector3();
  function sunAt(degrees: number, eye: THREE.Vector3, out: THREE.Vector3) {
    aimed.copy(capAxis).multiplyScalar(Math.cos(degrees * toRadians)).addScaledVector(rightward, Math.sin(degrees * toRadians));
    return sunThrough(aimed, eye, out);
  }
  // A second camera mirrors the view, so screen positions can be traced to
  // points of the Earth without disturbing the one being drawn.
  const probe = camera.clone();
  const ray = new THREE.Vector3(), origin = new THREE.Vector3(), normal = new THREE.Vector3();
  function hit(x: number, y: number) {
    ray.set(x, y, .5).unproject(probe).sub(probe.position).normalize();
    origin.copy(probe.position).sub(center);
    const b = origin.dot(ray), h = b * b - (origin.lengthSq() - radius * radius);
    if (h < 0) return false;
    const distance = -b - Math.sqrt(h);
    if (distance < 0) return false;
    normal.copy(origin).addScaledVector(ray, distance).normalize();
    return true;
  }
  // Edge of the Earth along a line from a point off it to a point on it.
  function boundary(offX: number, offY: number, onX: number, onY: number) {
    for (let i = 0; i < 14; i++) {
      const x = (offX + onX) / 2, y = (offY + onY) / 2;
      if (hit(x, y)) { onX = x; onY = y; } else { offX = x; offY = y; }
    }
    return [onX, onY] as const;
  }
  const restSun = new THREE.Vector3(), fixedSun = new THREE.Vector3(), shownSun = new THREE.Vector3();
  place(probe, 0, 0);
  sunAt(restAim, probe.position, restSun);
  fixedSun.copy(restSun); shownSun.copy(restSun);
  let aimRow = floorRow;
  // The point on screen the day/night line should pass through for a pointer
  // position, for the view the probe currently mirrors. On the Earth it is the
  // pointer itself. Above the Earth it is the horizon directly below. Left of
  // the Earth it stops with a sliver of dawn; right of it, at the far edge.
  const aim: [number, number] = [0, floorRow];
  function aimPoint(x: number, y: number) {
    if (!hit(0, floorRow)) return false;
    const leftEdge = hit(-1, floorRow) ? -1 : boundary(-1, floorRow, 0, floorRow)[0];
    const rightEdge = hit(1, floorRow) ? 1 : boundary(1, floorRow, 0, floorRow)[0];
    const half = (rightEdge - leftEdge) / 2;
    const column = softLimit(x, leftEdge + edgeBand * half, rightEdge - edgeBand * half, edgeKnee * half);
    if (hit(column, y)) { aim[0] = column; aim[1] = y; return true; }
    const [, horizon] = boundary(column, Math.max(y, floorRow), column, floorRow);
    aim[0] = column; aim[1] = Math.max(floorRow, horizon - .01);
    return hit(aim[0], aim[1]);
  }
  // The sun whose line passes through a point on screen, looking straight.
  function sunThroughPoint(x: number, y: number, out: THREE.Vector3) {
    if (!hit(x, y)) return false;
    aimRow = y;
    sunThrough(normal, probe.position, out);
    return true;
  }
  function sunUnder(x: number, y: number, out: THREE.Vector3) {
    if (!aimPoint(x, y) || !sunThroughPoint(aim[0], aim[1], out)) out.copy(restSun);
    return out;
  }
  // Development only: where the line being drawn crosses the row it was
  // aimed on, as a share of the width, so a test can compare it with the
  // pointer while the pointer is moving.
  function lineColumn() {
    const facing = (x: number) => hit(x, aimRow) ? normal.dot(shownSun) : undefined;
    let lit = -1, dark = 1;
    if (facing(lit) === undefined) lit = boundary(-1, aimRow, 0, aimRow)[0];
    if (facing(dark) === undefined) dark = boundary(1, aimRow, 0, aimRow)[0];
    if ((facing(lit) ?? 1) < 0) return (lit + 1) / 2;
    if ((facing(dark) ?? -1) > 0) return (dark + 1) / 2;
    for (let i = 0; i < 16; i++) { const middle = (lit + dark) / 2; if ((facing(middle) ?? 0) > 0) lit = middle; else dark = middle; }
    return (lit + dark + 2) / 4;
  }

  let frame = 0, lastTime = 0, disposed = false, live = false;
  // The view stays at rest until the canvas has faded in over the matching
  // still, so the two never show a doubled Earth. Only the line moves before then.
  const fadeIn = 450;
  let viewFrom = Infinity;
  const viewX = spring(), viewY = spring();
  // What is smoothed is where the line sits on screen, because that is what
  // the visitor sees. The sun is worked out from it on every frame for the
  // view as drawn, so camera movement can never make the line lurch. Until
  // the pointer first takes over, the sun is a fixed pose instead.
  const lineX = spring(), lineY = spring(floorRow);
  let driven = false;
  // The pointer in screen terms, and how tightly the line is following it.
  let client: [number, number] | undefined, pointer: [number, number] | undefined;
  let pace = easeHalfLife;
  let frames = 0;
  let needsDraw = true;
  function draw() {
    if (disposed || document.hidden) { needsDraw = true; return; }
    place(camera, viewX.value, viewY.value);
    place(probe, viewX.value, viewY.value);
    // If the point has slipped off the Earth this frame, keep the last sun.
    if (driven) sunThroughPoint(lineX.value, lineY.value, shownSun);
    else { shownSun.copy(fixedSun); aimRow = floorRow; }
    uniforms.sun.value.copy(shownSun);
    renderer.render(scene, camera);
    host.dataset.frames = String(++frames);
    if (import.meta.env.DEV) {
      host.dataset.pointer = pointer ? ((pointer[0] + 1) / 2).toFixed(4) : '';
      host.dataset.line = lineColumn().toFixed(4);
    }
    needsDraw = false;
  }
  // Hand the line over to the pointer, starting exactly where it is drawn now.
  function drive() {
    if (driven) return;
    place(probe, viewX.value, viewY.value);
    shownSun.copy(fixedSun); aimRow = floorRow;
    snap(lineX, lineColumn() * 2 - 1); snap(lineY, floorRow);
    driven = true;
    pace = Math.max(pace, easeHalfLife);
  }
  function tick(time: number) {
    frame = 0;
    if (disposed || pause.checked || document.hidden) { lastTime = 0; return; }
    // Draw on every display frame while anything moves, so on fast displays
    // (120Hz and up) the line keeps pace with the cursor. Capping this at
    // 60 a second made the light visibly trail the pointer. Drawing still
    // stops entirely once the scene rests.
    const dt = (lastTime ? Math.min(time-lastTime,64) : 16) / 1000;
    lastTime = time;
    const steady = time >= viewFrom;
    const aimX = pointer && steady ? pointer[0] : 0, aimY = pointer && steady ? pointer[1] : 0;
    step(viewX, aimX, viewHalfLife, dt); step(viewY, aimY, viewHalfLife, dt);
    let lineRested = true;
    if (pointer) drive();
    if (driven) {
      place(probe, viewX.value, viewY.value);
      // With the pointer away, the line holds where it is.
      const goalX = pointer && aimPoint(pointer[0], pointer[1]) ? aim[0] : lineX.value;
      const goalY = pointer && goalX === aim[0] ? aim[1] : lineY.value;
      pace = Math.max(holdHalfLife, pace * Math.exp(-dt / easeFade));
      step(lineX, goalX, pace, dt); step(lineY, goalY, pace, dt);
      lineRested = settle(lineX, goalX) && settle(lineY, goalY);
    }
    const rested = settle(viewX, aimX) && settle(viewY, aimY) && lineRested;
    draw();
    // Keep ticking until the view is allowed to follow, if a pointer is waiting.
    if (rested && (steady || !pointer)) lastTime = 0;
    else frame = requestAnimationFrame(tick);
  }
  function schedule(){if(!frame&&!disposed&&!pause.checked&&!document.hidden)frame=requestAnimationFrame(tick);}
  // Pointer position within the canvas itself, which can differ from the
  // window when the page scrolls or shows a scrollbar.
  function locate() {
    // With the pointer outside the window, keep the last position.
    if (!client) return;
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) { pointer = undefined; return; }
    pointer = [clamp((client[0] - box.left) / box.width * 2 - 1, -1, 1), clamp(1 - (client[1] - box.top) / box.height * 2, -1, 1)];
  }
  // Where the arrival's wipe has reached, as a screen x, read from its mask.
  // The mask is measured against the still, which is sized by height and
  // centred, so the still's width is the height times its 2400:1599 shape.
  function wipeColumn() {
    const style = getComputedStyle(host, '::before');
    const share = parseFloat(style.getPropertyValue('mask-position') || style.getPropertyValue('-webkit-mask-position'));
    const box = host.getBoundingClientRect();
    if (!Number.isFinite(share) || !box.width) return undefined;
    const still = box.height * 2400 / 1599;
    return clamp(still / box.width * (2 * (1.5 - share / 50) - 1), -1, 1);
  }
  // The live canvas takes over from the arrival. If the pointer cut the
  // arrival short, the line starts where the wipe had reached.
  // The arrival's dawn sweep animations, and those this scene froze.
  const sweeps = () => host.getAnimations({ subtree: true }).filter(animation => (animation as CSSAnimation).animationName?.startsWith('horizon-sweep'));
  const frozen: Animation[] = [];
  function reveal(early: boolean) {
    if (live || disposed) return;
    const reached = early ? wipeColumn() : undefined;
    // Freeze the sweep where it is, so the still underneath does not keep
    // sweeping while the live canvas fades in over it. Only the sweep: the
    // background's opacity fade must still finish, or it would stay dim.
    if (early) sweeps().forEach(animation => { animation.pause(); frozen.push(animation); });
    if (reached !== undefined) {
      place(probe, 0, 0);
      sunUnder(reached, 1, fixedSun);
      draw();
    }
    // Let the browser register the hidden canvas first, so the crossfade runs.
    void renderer.domElement.offsetWidth;
    host.dataset.mode='webgl';
    live = true;
    viewFrom = performance.now() + fadeIn;
    pace = easeHalfLife;
    driven = false;
    if (!client) { const waiting = mouseAtStart?.(); if (waiting) client = [waiting.x, waiting.y]; }
    locate();
    schedule();
  }
  function move(event: PointerEvent){
    if(event.pointerType!=='mouse')return;
    const entering=!client;
    client=[event.clientX,event.clientY];
    if(!live){reveal(true);return;}
    if(pause.checked)return;
    // A pointer that reappears somewhere else (back from the tabs or another
    // window) jumps further between two updates than a hand can move. The
    // line glides there instead of snapping, then tightens back to holding.
    const before=pointer?pointer[0]:undefined;
    locate();
    if(entering||before===undefined||!pointer||Math.abs(pointer[0]-before)>.3)pace=Math.max(pace,easeHalfLife);
    schedule();
  }
  // When the pointer leaves the window, or the window loses focus, the light
  // stays where the visitor left it. Springing back to rest here read as a
  // snap, because people leave the window at an edge on purpose. When the
  // pointer comes back the line eases from where it is to the pointer.
  function leave(){client=undefined;}
  function scroll(){if(live&&client&&!pause.checked){locate();schedule();}}
  function toggle(){cancelAnimationFrame(frame);frame=0;lastTime=0;if(!document.hidden&&needsDraw)draw();if(!pause.checked)schedule();}
  let width=0,height=0,pixelRatio=0;
  function resize(){
    if(disposed||width===host.clientWidth&&height===host.clientHeight&&pixelRatio===Math.min(devicePixelRatio,2))return;
    width=host.clientWidth;height=host.clientHeight;
    const ratio=Math.min(devicePixelRatio,2);
    pixelRatio=ratio;
    const scale=Math.min(1,Math.sqrt(4000000/(width*height*ratio*ratio)));
    renderer.setSize(Math.floor(width*ratio*scale),Math.floor(height*ratio*scale),false);camera.aspect=probe.aspect=width/height;camera.updateProjectionMatrix();probe.updateProjectionMatrix();
    draw();
    if(live){locate();schedule();}
  }
  function lost(event: Event){event.preventDefault();host.dataset.mode='static';dispose();}
  // Development only: jump straight to a pose, for the stills and the tests.
  // x and y place the pointer; aim instead sets the line in degrees right of
  // the cap axis; neither gives the resting pose. Plain drops the night
  // lights, twilight glow and ocean glint, leaving only the day/night shading.
  function pose(event: Event) {
    const detail = (event as CustomEvent<{ x?: number; y?: number; aim?: number; plain?: boolean }>).detail ?? {};
    uniforms.lamp.value.fromArray(detail.plain ? [0, 0, 0] : lamp);
    uniforms.finish.value = detail.plain ? 0 : 1;
    const pointed = detail.x !== undefined || detail.y !== undefined;
    const x = detail.x ?? 0, y = detail.y ?? 0;
    client = undefined; pointer = pointed ? [x, y] : undefined;
    place(probe, x, y);
    viewFrom = 0; snap(viewX, x); snap(viewY, y);
    driven = false;
    if (detail.aim !== undefined) sunAt(detail.aim, probe.position, fixedSun);
    else if (pointed && aimPoint(x, y)) { snap(lineX, aim[0]); snap(lineY, aim[1]); driven = true; pace = holdHalfLife; }
    else fixedSun.copy(restSun);
    cancelAnimationFrame(frame); frame = 0; lastTime = 0;
    draw();
  }
  renderer.domElement.addEventListener('webglcontextlost',lost);
  host.append(renderer.domElement);
  resize();
  const observer=new ResizeObserver(resize);observer.observe(host);
  window.addEventListener('resize',resize,{passive:true});
  window.addEventListener('scroll',scroll,{passive:true});
  document.addEventListener('pointermove',move,{passive:true});
  document.documentElement.addEventListener('pointerleave',leave);
  window.addEventListener('blur',leave);
  document.addEventListener('visibilitychange',toggle);
  pause.addEventListener('change',toggle);
  if (import.meta.env.DEV) host.addEventListener('scene:pose', pose);
  // The arrival sunrise is a CSS animation over two stills, so it plays the
  // same on every device. The live canvas shows the same resting pose and
  // takes over when that animation has finished, so the swap is unseen. A
  // pointer that moves before then takes over at once.
  // Browsers do not all report animations on pseudo-elements, so the sweep's
  // own end event is also awaited, with a timeout in case it never comes.
  // A sweep left frozen by an earlier scene (for example one shut down when
  // the window became too narrow) can never finish, so finish it now rather
  // than wait on it forever.
  sweeps().forEach(animation => { if (animation.playState === 'paused') animation.finish(); });
  const running = host.getAnimations({ subtree: true });
  const reported = running.some(animation => (animation as CSSAnimation).animationName?.startsWith('horizon-sweep'));
  const masked = CSS.supports('mask-image', 'linear-gradient(#000, #000)') || CSS.supports('-webkit-mask-image', 'linear-gradient(#000, #000)');
  const sweepEnded = reported || !masked || matchMedia('(prefers-reduced-motion: reduce)').matches ? Promise.resolve() : new Promise<void>(resolve => {
    const ended = (event: AnimationEvent) => { if (event.animationName.startsWith('horizon-sweep')) { host.removeEventListener('animationend', ended); resolve(); } };
    host.addEventListener('animationend', ended);
    setTimeout(() => { host.removeEventListener('animationend', ended); resolve(); }, 5000);
  });
  Promise.all([...running.map(animation => animation.finished.catch(() => undefined)), sweepEnded]).then(() => reveal(false));
  function dispose() {
    if (disposed) return;
    // Let any sweep this scene froze finish, so the still left behind shows
    // the resting pose rather than a half-swept dawn.
    frozen.forEach(animation => { if (animation.playState === 'paused') animation.finish(); });
    disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);window.removeEventListener('scroll',scroll);
    document.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',leave);
    window.removeEventListener('blur',leave);document.removeEventListener('visibilitychange',toggle);pause.removeEventListener('change',toggle);
    renderer.domElement.removeEventListener('webglcontextlost',lost);if(import.meta.env.DEV)host.removeEventListener('scene:pose',pose);
    geometry.dispose();textures.forEach(texture => texture.dispose());closeBitmaps();airGeometry.dispose();surface.dispose();atmosphere.dispose();releaseRenderer();renderer.domElement.remove();
  }
  return dispose;
}
