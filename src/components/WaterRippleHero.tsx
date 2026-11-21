import React, { useEffect, useRef } from 'react';
import { ArrowDownRight } from 'lucide-react';
import type { PublicUser } from '../types/domain';

const HERO_IMAGE_SRC = '/src/assets/images/hero_morning_water_dew_1795152909340.jpg';
const SIM_SIZE = 512;

interface WaterRippleHeroProps {
  currentUser: PublicUser | null;
  onNavigate: (view: 'storefront' | 'subscriptions' | 'delivery' | 'merchant' | 'admin' | 'auth' | 'register') => void;
  onLogout?: () => void;
}

const FULLSCREEN_VERT = `#version 300 es
precision highp float;
const vec2 POS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Ping-Pong 2D wave equation update shader
// Encodes height in R (bias 0.5 for RGBA8 safety) and velocity in G (bias 0.5)
const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPrevState;
uniform vec2 uTexelSize;
uniform vec2 uDropPos;
uniform float uDropRadius;
uniform float uDropStrength;
uniform float uUseFloat;
in vec2 vUv;
out vec4 fragColor;

vec2 decodeState(vec4 c) {
  return mix((c.rg - 0.5) * 2.0, c.rg, uUseFloat);
}

vec4 encodeState(vec2 hv) {
  vec2 outVal = mix(clamp(hv * 0.5 + 0.5, 0.0, 1.0), clamp(hv, -2.0, 2.0), uUseFloat);
  return vec4(outVal, 0.0, 1.0);
}

void main() {
  vec2 state = decodeState(texture(uPrevState, vUv));
  float h = state.x;
  float v = state.y;

  float hL = decodeState(texture(uPrevState, vUv + vec2(-uTexelSize.x, 0.0))).x;
  float hR = decodeState(texture(uPrevState, vUv + vec2( uTexelSize.x, 0.0))).x;
  float hU = decodeState(texture(uPrevState, vUv + vec2(0.0,  uTexelSize.y))).x;
  float hD = decodeState(texture(uPrevState, vUv + vec2(0.0, -uTexelSize.y))).x;

  float avg = (hL + hR + hU + hD) * 0.25;
  // Wave equation acceleration + gentle damping for silky ripples
  v += (avg - h) * 1.42;
  v *= 0.986;
  h += v;
  h *= 0.992;

  if (uDropStrength > 0.0001) {
    float dist = length(vUv - uDropPos);
    if (dist < uDropRadius) {
      float drop = cos((dist / uDropRadius) * 1.5707963);
      h -= drop * drop * uDropStrength;
    }
  }

  fragColor = encodeState(vec2(h, v));
}
`;

// Composite rendering shader: object-fit cover UV math + ambient drift & 16s zoom breath + refraction + specular caustics
const RENDER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uHeightMap;
uniform sampler2D uBgTex;
uniform vec2 uResolution;
uniform vec2 uImageSize;
uniform vec2 uSimTexel;
uniform float uTime;
uniform float uUseFloat;
in vec2 vUv;
out vec4 fragColor;

float sampleH(vec2 uv) {
  vec4 c = texture(uHeightMap, uv);
  return mix((c.r - 0.5) * 2.0, c.r, uUseFloat);
}

vec2 coverUv(vec2 uv, vec2 res, vec2 imgSize) {
  float screenAspect = res.x / max(res.y, 1.0);
  float imageAspect = imgSize.x / max(imgSize.y, 1.0);
  vec2 scale = vec2(1.0);
  if (screenAspect > imageAspect) {
    scale.y = imageAspect / screenAspect;
  } else {
    scale.x = screenAspect / imageAspect;
  }
  return (uv - 0.5) * scale + 0.5;
}

void main() {
  // Compute surface normal from heightmap gradients
  float hL = sampleH(vUv - vec2(uSimTexel.x * 2.0, 0.0));
  float hR = sampleH(vUv + vec2(uSimTexel.x * 2.0, 0.0));
  float hD = sampleH(vUv - vec2(0.0, uSimTexel.y * 2.0));
  float hU = sampleH(vUv + vec2(0.0, uSimTexel.y * 2.0));

  vec3 normal = normalize(vec3((hL - hR) * 2.8, (hD - hU) * 2.8, 0.32));

  // Ambient 16-second zoom breath (1.02 to 1.05) + slow sinusoidal micro-drift
  float breath = 1.035 + 0.015 * sin((uTime / 16.0) * 6.2831853);
  vec2 drift = vec2(sin(uTime * 0.35) * 0.0045, cos(uTime * 0.27) * 0.0035);

  vec2 baseUv = coverUv(vec2(vUv.x, 1.0 - vUv.y), uResolution, uImageSize);
  baseUv = (baseUv - 0.5) / breath + 0.5 + drift;

  // UV Displacement from water heightmap normals
  float refractionStrength = 0.048;
  vec2 refractedUv = clamp(baseUv + normal.xy * refractionStrength, 0.002, 0.998);

  // Subtle chromatic dispersion along steepest wave slopes
  float slope = length(normal.xy);
  float r = texture(uBgTex, clamp(refractedUv + normal.xy * 0.004, 0.002, 0.998)).r;
  float g = texture(uBgTex, refractedUv).g;
  float b = texture(uBgTex, clamp(refractedUv - normal.xy * 0.004, 0.002, 0.998)).b;
  vec3 color = vec3(r, g, b);

  // Directional Specular Surface Caustics catching warm dawn sunlight
  vec3 lightDir = normalize(vec3(0.45, 0.55, 0.70));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfVec), 0.0), 42.0);
  float caustic = smoothstep(0.05, 0.45, slope) * 0.16;

  color += vec3(1.0, 0.95, 0.86) * (spec * 0.62 + caustic);

  // Measured atmospheric bottom-left scrim so Playfair Display white headline has crisp contrast
  float leftScrim = smoothstep(0.75, 0.0, vUv.x) * smoothstep(0.65, 0.0, vUv.y);
  color *= (1.0 - leftScrim * 0.38);

  fragColor = vec4(color, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('WebGL2 shader compile error:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('WebGL2 program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

export const WaterRippleHero: React.FC<WaterRippleHeroProps> = ({ currentUser, onNavigate, onLogout }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'default' });
    if (!gl) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const simProg = createProgram(gl, FULLSCREEN_VERT, SIM_FRAG);
    const renderProg = createProgram(gl, FULLSCREEN_VERT, RENDER_FRAG);
    if (!simProg || !renderProg) return;

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Detect float FBO support; gracefully fallback to RGBA8 with 0.5 bias
    const hasFloatFbo = Boolean(gl.getExtension('EXT_color_buffer_float'));
    const hasFloatLinear = Boolean(gl.getExtension('OES_texture_float_linear'));
    const useFloat = hasFloatFbo && hasFloatLinear;

    const makeSimTarget = () => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (useFloat) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, SIM_SIZE, SIM_SIZE, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        const initData = new Uint8Array(SIM_SIZE * SIM_SIZE * 4);
        initData.fill(128);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM_SIZE, SIM_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, initData);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    };

    const targets = [makeSimTarget(), makeSimTarget()];
    let readIdx = 0;

    // Background atmospheric texture loaded with crossOrigin = "anonymous"
    const bgTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([8, 22, 34, 255])
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const imageSize = { w: 1920, h: 1080 };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageSize.w = img.naturalWidth || 1920;
      imageSize.h = img.naturalHeight || 1080;
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
    img.src = HERO_IMAGE_SRC;

    // Clamp window.devicePixelRatio to 1.5 for locked 60 FPS on integrated laptop GPUs
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    // Pending ripple queue
    let pendingDrop: { x: number; y: number; radiusPx: number; strength: number } | null = null;
    let lastAmbientDrop = performance.now();

    const enqueueDrop = (clientX: number, clientY: number, radiusPx: number, strength: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1.0 - (clientY - rect.top) / Math.max(rect.height, 1);
      pendingDrop = { x, y, radiusPx, strength };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      // Hover wake: radius 18px, strength 0.035
      enqueueDrop(e.clientX, e.clientY, 18, 0.035);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      // Click/Tap splash: radius 36px, strength 0.09
      enqueueDrop(e.clientX, e.clientY, 36, 0.09);
    };

    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });

    // Uniform locations
    const simLoc = {
      prevState: gl.getUniformLocation(simProg, 'uPrevState'),
      texelSize: gl.getUniformLocation(simProg, 'uTexelSize'),
      dropPos: gl.getUniformLocation(simProg, 'uDropPos'),
      dropRadius: gl.getUniformLocation(simProg, 'uDropRadius'),
      dropStrength: gl.getUniformLocation(simProg, 'uDropStrength'),
      useFloat: gl.getUniformLocation(simProg, 'uUseFloat'),
    };
    const renLoc = {
      heightMap: gl.getUniformLocation(renderProg, 'uHeightMap'),
      bgTex: gl.getUniformLocation(renderProg, 'uBgTex'),
      resolution: gl.getUniformLocation(renderProg, 'uResolution'),
      imageSize: gl.getUniformLocation(renderProg, 'uImageSize'),
      simTexel: gl.getUniformLocation(renderProg, 'uSimTexel'),
      time: gl.getUniformLocation(renderProg, 'uTime'),
      useFloat: gl.getUniformLocation(renderProg, 'uUseFloat'),
    };

    let rafId = 0;
    const startTime = performance.now();

    const frame = (now: number) => {
      const elapsedSec = prefersReducedMotion ? 0 : (now - startTime) * 0.001;

      // Occasional soft ambient dew drop when untouched
      if (!prefersReducedMotion && !pendingDrop && now - lastAmbientDrop > 3800) {
        lastAmbientDrop = now;
        pendingDrop = {
          x: 0.45 + Math.random() * 0.45,
          y: 0.35 + Math.random() * 0.45,
          radiusPx: 22,
          strength: 0.045,
        };
      }

      // Pass 1: Ping-pong heightmap wave simulation (512x512)
      const writeIdx = 1 - readIdx;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIdx].fbo);
      gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
      gl.useProgram(simProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[readIdx].tex);
      gl.uniform1i(simLoc.prevState, 0);
      gl.uniform2f(simLoc.texelSize, 1 / SIM_SIZE, 1 / SIM_SIZE);
      gl.uniform1f(simLoc.useFloat, useFloat ? 1.0 : 0.0);

      if (pendingDrop) {
        const minDim = Math.max(window.innerWidth, window.innerHeight, 1);
        const normRadius = Math.max(0.014, pendingDrop.radiusPx / minDim);
        gl.uniform2f(simLoc.dropPos, pendingDrop.x, pendingDrop.y);
        gl.uniform1f(simLoc.dropRadius, normRadius);
        gl.uniform1f(simLoc.dropStrength, pendingDrop.strength);
        pendingDrop = null;
      } else {
        gl.uniform2f(simLoc.dropPos, -10.0, -10.0);
        gl.uniform1f(simLoc.dropRadius, 0.0);
        gl.uniform1f(simLoc.dropStrength, 0.0);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      readIdx = writeIdx;

      // Pass 2: Full-viewport refracted & sunlit caustic render
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(renderProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, targets[readIdx].tex);
      gl.uniform1i(renLoc.heightMap, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.uniform1i(renLoc.bgTex, 1);

      gl.uniform2f(renLoc.resolution, canvas.width, canvas.height);
      gl.uniform2f(renLoc.imageSize, imageSize.w, imageSize.h);
      gl.uniform2f(renLoc.simTexel, 1 / SIM_SIZE, 1 / SIM_SIZE);
      gl.uniform1f(renLoc.time, elapsedSec);
      gl.uniform1f(renLoc.useFloat, useFloat ? 1.0 : 0.0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      targets.forEach((t) => {
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
      });
      gl.deleteTexture(bgTex);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(simProg);
      gl.deleteProgram(renderProg);
    };
  }, []);

  return (
    <section
      aria-label="PureRoute Interactive Morning Dairy Hero"
      className="relative w-screen h-screen overflow-hidden select-none bg-[#07111a]"
    >
      {/* Full-bleed WebGL2 Water Ripple Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block cursor-crosshair"
        style={{ touchAction: 'manipulation' }}
      />

      {/* Subtle top-left editorial wordmark (single clean line) */}
      <div className="absolute top-8 left-8 md:left-14 z-20 pointer-events-none">
        <span className="font-editorial text-xl md:text-2xl tracking-wide text-white/95 drop-shadow-[0_2px_12px_rgba(0,15,35,0.45)] whitespace-nowrap">
          PureRoute
        </span>
      </div>

      {/* Top-Right Frosted-Glass Navigation (top: 32px; right: 48px) */}
      <nav
        aria-label="Primary Navigation"
        className="absolute top-8 right-6 md:right-12 z-20 flex items-center gap-5 md:gap-7 flex-wrap justify-end"
      >
        <button type="button" onClick={() => onNavigate('storefront')} className="hero-nav-link cursor-pointer">
          Products
        </button>
        <button type="button" onClick={() => onNavigate('subscriptions')} className="hero-nav-link cursor-pointer">
          Subscriptions
        </button>
        <button type="button" onClick={() => onNavigate('delivery')} className="hero-nav-link cursor-pointer">
          Delivery Portal
        </button>
        {currentUser?.role === 'merchant' && (
          <button type="button" onClick={() => onNavigate('merchant')} className="hero-nav-link cursor-pointer">
            Merchant
          </button>
        )}
        {currentUser?.role === 'admin' && (
          <button type="button" onClick={() => onNavigate('admin')} className="hero-nav-link cursor-pointer">
            Admin
          </button>
        )}
        {currentUser ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('auth')}
              className="hero-nav-link cursor-pointer font-medium text-[#f8f5ef]"
            >
              {currentUser.name.split(' ')[0]}
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-200 text-xs uppercase tracking-wider font-medium cursor-pointer transition-all"
              >
                Sign Out
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onNavigate('auth')} className="hero-nav-link cursor-pointer">
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white text-xs uppercase tracking-wider font-medium cursor-pointer transition-all"
            >
              Register
            </button>
          </div>
        )}
      </nav>

      {/* Bottom-Left Editorial Hero Typography (bottom: 64px; left: 56px, pointer-events: none) */}
      <div className="absolute bottom-14 md:bottom-16 left-7 md:left-14 right-7 md:right-auto z-20 max-w-3xl pointer-events-none">
        <h1
          className="font-editorial text-white font-medium tracking-tight"
          style={{
            fontSize: 'clamp(3.1rem, 5.8vw, 5.5rem)',
            lineHeight: 1.05,
            textShadow: '0 4px 24px rgba(0, 15, 35, 0.35)',
            textWrap: 'balance',
          }}
        >
          Pure Morning Milk, Direct From Local Farms.
        </h1>

        <p
          className="mt-5 max-w-xl font-light"
          style={{
            fontSize: 'clamp(1.05rem, 1.7vw, 1.45rem)',
            color: 'rgba(255, 255, 255, 0.88)',
            textShadow: '0 2px 14px rgba(0, 15, 35, 0.38)',
          }}
        >
          Chilled single-origin Buffalo &amp; A2 Desi Cow dairy dispatched daily from our Hitech City, Hyderabad hub to your doorstep.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4 pointer-events-auto">
          <button
            type="button"
            onClick={() => onNavigate('storefront')}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-lg text-sm font-medium text-white bg-white/16 hover:bg-white/24 backdrop-blur-md border border-white/25 transition-all duration-200 cursor-pointer whitespace-nowrap"
          >
            <span>Explore Morning Storefront</span>
            <ArrowDownRight className="w-4 h-4" />
          </button>

          <a
            href="/api-docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center px-5 py-3.5 rounded-lg text-sm font-normal text-white/85 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            OpenAPI 3.0 Docs
          </a>
        </div>
      </div>
    </section>
  );
};
