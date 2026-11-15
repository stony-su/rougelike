// What lies under and around the floating chamber: a living picture made entirely by a fragment
// shader. Rippling water under the Outer Ring, a rolling cloud sea under the Inner Ring, standing
// rings in the Crater. Every bounce in the chamber sends a ring across it, and big moments make
// the whole of it swell.
//
// It is drawn at half resolution into a texture and stretched over the screen, so it costs
// little even on integrated graphics; it is soft by nature, so nothing is lost.
import { Geometry, Mesh, RenderTexture, Shader, Sprite, UniformGroup } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import type { ZoneId } from '../sim/defs';
import type { Camera } from './camera';
import type { ZoneTheme } from './palette';
import type { Stage } from './stage';

const VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform float uTime;
uniform vec2 uView;
uniform vec2 uCam;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uLit;
uniform float uStyle;
uniform float uPulse;
uniform vec4 uRipples[8];

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 asp = vec2(uView.x / uView.y, 1.0);
  vec2 p = (vUV - 0.5) * asp * 6.0 + uCam;
  float t = uTime;
  float v = 0.0;
  if (uStyle < 0.5) {
    // water: crossing wave fronts over slow swirls, with bright threads where they meet
    vec2 q = p + 0.35 * vec2(fbm(p * 0.6 + t * 0.05), fbm(p * 0.6 - t * 0.04 + 7.0));
    float w = sin(q.x * 2.1 + t * 0.6) * sin(q.y * 1.7 - t * 0.45) + 0.6 * sin((q.x + q.y) * 3.3 + t * 0.8);
    float c = fbm(q * 1.6 + vec2(t * 0.07, -t * 0.05));
    v = 0.45 * c + 0.2 * w + 0.25;
    v += 0.25 * pow(abs(sin(c * 9.0 + w * 2.0 + t * 0.5)), 12.0);
  } else if (uStyle < 1.5) {
    // a cloud sea: two layers of billows drifting apart
    float a = fbm(p * 0.55 + vec2(t * 0.035, t * 0.012));
    float b = fbm(p * 1.3 + vec2(-t * 0.05, t * 0.02) + a * 1.4);
    v = smoothstep(0.25, 0.85, a * 0.7 + b * 0.5);
    v += 0.18 * smoothstep(0.6, 0.7, b);
  } else {
    // the crater: standing rings round the bell
    float r = length(p * vec2(1.0, 1.9));
    float rings = sin(r * 5.0 - t * 0.9) * 0.5 + 0.5;
    float n = fbm(p * 1.2 + t * 0.03);
    v = 0.18 + 0.55 * pow(rings, 3.0) * (0.5 + 0.5 * n) / (1.0 + 0.12 * r * r);
  }
  // every bounce sends a ring across it
  for (int i = 0; i < 8; i++) {
    vec4 rp = uRipples[i];
    if (rp.w <= 0.0) continue;
    float d = length((vUV - rp.xy) * asp);
    float front = rp.z * 0.5;
    v += exp(-pow((d - front) * 24.0, 2.0)) * rp.w * exp(-rp.z * 1.7) * 0.7;
  }
  v += uPulse * 0.22;
  vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.6, v));
  col = mix(col, uLit, smoothstep(0.62, 1.15, v) * 0.5);
  // darker toward the edges of the screen, so the chamber stays the brightest thing
  float vig = smoothstep(1.25, 0.3, length((vUV - 0.5) * vec2(1.15, 1.35)));
  finalColor = vec4(col * (0.5 + 0.5 * vig), 1.0);
}`;

const STYLE: Record<ZoneId, number> = { outer: 0, inner: 1 };
const RIPPLES = 8;

interface Ripple {
  x: number;
  y: number;
  age: number;
  strength: number;
}

const rgb = (c: number): Float32Array => new Float32Array([((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255]);

export class Backdrop {
  private readonly uniforms: UniformGroup;
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly sprite = new Sprite();
  private target: RenderTexture | null = null;
  private readonly ripples: Ripple[] = [];
  private next = 0;
  private pulseK = 0;
  private time = 0;
  private readonly pt = { x: 0, y: 0 };

  constructor(
    private readonly renderer: Renderer,
    stage: Stage,
  ) {
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uView: { value: new Float32Array([1, 1]), type: 'vec2<f32>' },
      uCam: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uDeep: { value: new Float32Array(3), type: 'vec3<f32>' },
      uMid: { value: new Float32Array(3), type: 'vec3<f32>' },
      uLit: { value: new Float32Array(3), type: 'vec3<f32>' },
      uStyle: { value: 0, type: 'f32' },
      uPulse: { value: 0, type: 'f32' },
      uRipples: { value: new Float32Array(RIPPLES * 4), type: 'vec4<f32>', size: RIPPLES },
    });
    const geometry = new Geometry({
      attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1], aUV: [0, 0, 1, 0, 1, 1, 0, 1] },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    const shader = Shader.from({ gl: { vertex: VERTEX, fragment: FRAGMENT }, resources: { backdrop: this.uniforms } });
    this.mesh = new Mesh({ geometry, shader });
    for (let i = 0; i < RIPPLES; i++) this.ripples.push({ x: 0, y: 0, age: 99, strength: 0 });
    stage.backdrop.addChild(this.sprite);
  }

  /** The colours and the kind of picture, from the zone the chamber is in. */
  setTheme(theme: ZoneTheme): void {
    const u = this.uniforms.uniforms;
    u.uDeep = rgb(theme.voidColor);
    u.uMid = rgb(theme.sideLeft);
    u.uLit = rgb(theme.accent);
    u.uStyle = STYLE[theme.id] ?? 0;
  }

  resize(w: number, h: number): void {
    // half resolution: it is soft by nature, and this keeps it cheap
    const tw = Math.max(2, Math.ceil(w / 2));
    const th = Math.max(2, Math.ceil(h / 2));
    this.target?.destroy(true);
    this.target = RenderTexture.create({ width: tw, height: th, antialias: false });
    this.mesh.scale.set(tw, th);
    this.sprite.texture = this.target;
    this.sprite.width = w;
    this.sprite.height = h;
    const view = this.uniforms.uniforms.uView as Float32Array;
    view[0] = w;
    view[1] = h;
  }

  /** A ring across the backdrop from a point in the chamber (world coordinates). `strength` 0..1. */
  ripple(x: number, y: number, strength: number): void {
    const r = this.ripples[this.next];
    this.next = (this.next + 1) % RIPPLES;
    r.x = x;
    r.y = y;
    r.age = 0;
    r.strength = Math.max(0.15, Math.min(1, strength));
  }

  /** The whole of it swells for a moment. */
  pulse(k: number): void {
    this.pulseK = Math.max(this.pulseK, k);
  }

  update(dt: number, cam: Camera, viewW: number, viewH: number): void {
    if (!this.target) return;
    this.time += dt;
    this.pulseK = Math.max(0, this.pulseK - dt * 1.6);
    const u = this.uniforms.uniforms;
    u.uTime = this.time;
    u.uPulse = this.pulseK;
    // it lies far below: it slides a little as the camera moves
    const camU = u.uCam as Float32Array;
    camU[0] = (cam.x - cam.y) * 0.05;
    camU[1] = (cam.x + cam.y) * 0.03;
    const data = u.uRipples as Float32Array;
    for (let i = 0; i < RIPPLES; i++) {
      const r = this.ripples[i];
      r.age += dt;
      const live = r.age < 2.6 && r.strength > 0;
      if (live) cam.worldToScreen(r.x, r.y, 0, this.pt);
      data[i * 4] = live ? this.pt.x / viewW : 0;
      data[i * 4 + 1] = live ? this.pt.y / viewH : 0;
      data[i * 4 + 2] = r.age;
      data[i * 4 + 3] = live ? r.strength : 0;
    }
    this.uniforms.update();
    this.renderer.render({ container: this.mesh, target: this.target, clear: true });
  }

  destroy(): void {
    this.sprite.destroy();
    this.target?.destroy(true);
    this.mesh.destroy();
  }
}
