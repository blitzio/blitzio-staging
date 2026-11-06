import { surfaceShader } from './planet-shaders';
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
export async function createCosmicScene(host: HTMLElement, signal: AbortSignal) {
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
  const center = new THREE.Vector3(0, -18, 0);
  let atlas: THREE.Texture;
  signal.addEventListener('abort', releaseRenderer, { once: true });
  try {
    atlas = await new THREE.TextureLoader().loadAsync(import.meta.env.BASE_URL + 'images/earth-cap.webp');
  } catch (error) {
    releaseRenderer();
    throw error;
  } finally {
    signal.removeEventListener('abort', releaseRenderer);
  }
  if (signal.aborted) {
    atlas.dispose();
    releaseRenderer();
    return () => {};
  }
  atlas.colorSpace=THREE.SRGBColorSpace;
  atlas.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  atlas.minFilter=THREE.LinearMipmapLinearFilter;
  const uniforms={atlas:{value:atlas},sun:{value:new THREE.Vector3(-.55,.3,.8).normalize()},center:{value:center}};
  const surface = new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex,
    fragmentShader: surfaceShader,
  });
  const geometry = new THREE.SphereGeometry(18, 192, 96);
  const planet = new THREE.Mesh(geometry, surface);
  planet.position.copy(center);
  scene.add(planet);
  const airGeometry = new THREE.SphereGeometry(18.11, 160, 80);
  const atmosphere = new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex, transparent: true, depthWrite: false,
    fragmentShader: `varying vec3 vWorld; uniform vec3 sun; uniform vec3 center;
    vec2 hit(vec3 o,vec3 d,float r){float b=dot(o,d),c=dot(o,o)-r*r,h=b*b-c;if(h<0.)return vec2(-1.);h=sqrt(h);return vec2(-b-h,-b+h);}
    void main(){
      vec3 o=cameraPosition-center,d=normalize(vWorld-cameraPosition);
      vec2 air=hit(o,d,18.11),ground=hit(o,d,18.);
      float start=max(0.,air.x),end=air.y;
      if(ground.x>0.)end=min(end,ground.x);
      float stepSize=(end-start)/12., optical=0.;vec3 light=vec3(0.);
      for(int i=0;i<12;i++){
        vec3 q=o+d*(start+(float(i)+.5)*stepSize);
        float altitude=max(0.,length(q)-18.);
        float density=exp(-altitude/.018);
        float daylight=smoothstep(-.30,.45,dot(normalize(q),sun));
        optical+=density*stepSize;
        vec3 tint=mix(vec3(.25,.105,.43),vec3(.065,.30,.58),daylight);
        light+=tint*density*stepSize*exp(-optical*.75)*(.15+daylight*1.8);
      }
      float opacity=clamp(length(light)*1.8,0.,.80);
      gl_FragColor=vec4(light*1.6,opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const shell = new THREE.Mesh(airGeometry, atmosphere);
  shell.position.copy(center);
  scene.add(shell);
  let frame = 0, lastTime = 0, disposed = false;
  const target = new THREE.Vector2();
  const current = new THREE.Vector2();
  let frames = 0;
  let needsDraw = true;
  function draw() {
    if (disposed || document.hidden) { needsDraw = true; return; }
    camera.position.set(current.x * 2.8, 6 + current.y * .9, 25);
    camera.lookAt(current.x * .65, 5 - current.y * .45, 0);
    uniforms.sun.value.set(-.55 + current.x * 1.05, .30 + current.y * .12, .8).normalize();
    renderer.render(scene, camera);
    host.dataset.frames = String(++frames);
    needsDraw = false;
  }
  function tick(time: number) {
    frame = 0;
    if (disposed || pause.checked || document.hidden) { lastTime = 0; return; }
    if(lastTime&&time-lastTime<1000/60){frame=requestAnimationFrame(tick);return;}
    const dt = lastTime ? Math.min(time-lastTime,64) : 16;
    lastTime = time;
    current.lerp(target,1-Math.exp(-dt/260));
    if(current.distanceTo(target)<.0004)current.copy(target);
    draw();
    if(!current.equals(target))frame=requestAnimationFrame(tick);
    else lastTime=0;
  }
  function schedule(){if(!frame&&!disposed&&!pause.checked&&!document.hidden)frame=requestAnimationFrame(tick);}
  function move(event: PointerEvent){if(event.pointerType!=='mouse'||pause.checked)return;target.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);schedule();}
  function leave(){target.set(0,0);schedule();}
  function toggle(){cancelAnimationFrame(frame);frame=0;lastTime=0;if(!document.hidden&&needsDraw)draw();if(!pause.checked)schedule();}
  let width=0,height=0,pixelRatio=0;
  function resize(){
    if(disposed||width===host.clientWidth&&height===host.clientHeight&&pixelRatio===Math.min(devicePixelRatio,2))return;
    width=host.clientWidth;height=host.clientHeight;
    const ratio=Math.min(devicePixelRatio,2);
    pixelRatio=ratio;
    const scale=Math.min(1,Math.sqrt(4000000/(width*height*ratio*ratio)));
    renderer.setSize(Math.floor(width*ratio*scale),Math.floor(height*ratio*scale),false);camera.aspect=width/height;camera.updateProjectionMatrix();draw();
  }
  function lost(event: Event){event.preventDefault();host.dataset.mode='static';dispose();}
  renderer.domElement.addEventListener('webglcontextlost',lost);
  host.append(renderer.domElement);
  resize();
  host.dataset.mode='webgl';
  const observer=new ResizeObserver(resize);observer.observe(host);
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('pointermove',move,{passive:true});
  document.documentElement.addEventListener('pointerleave',leave);
  window.addEventListener('blur',leave);
  document.addEventListener('visibilitychange',toggle);
  pause.addEventListener('change',toggle);
  function dispose() {
    if (disposed) return;
    disposed=true;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',resize);
    document.removeEventListener('pointermove',move);document.documentElement.removeEventListener('pointerleave',leave);
    window.removeEventListener('blur',leave);document.removeEventListener('visibilitychange',toggle);pause.removeEventListener('change',toggle);
    renderer.domElement.removeEventListener('webglcontextlost',lost);
    geometry.dispose();atlas.dispose();airGeometry.dispose();surface.dispose();atmosphere.dispose();releaseRenderer();renderer.domElement.remove();
  }
  return dispose;
}
