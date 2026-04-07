import * as twgl from 'twgl.js';
import type { FilterPlugin, RectPoints } from '../types';

const GRID_SIZE = 20;

const VS_SOURCE = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
uniform vec2 u_resolution;
out vec2 v_texCoord;
out vec2 v_videoCoord;

void main() {
  v_texCoord = a_texCoord;
  v_videoCoord = a_position / u_resolution;
  vec2 clipSpace = (a_position / u_resolution * 2.0) - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
}`;

const FS_SOURCE = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform float u_time;
uniform float u_alpha;
uniform sampler2D u_video;
in vec2 v_texCoord;
in vec2 v_videoCoord;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main() {
    vec2 uv = v_videoCoord;
    
    // RGB Split / Chromatic Aberration
    float amount = 0.015 * sin(u_time * 5.0);
    float r = texture(u_video, uv + vec2(amount, 0)).r;
    float g = texture(u_video, uv).g;
    float b = texture(u_video, uv - vec2(amount, 0)).b;
    
    vec3 col = vec3(r, g, b);
    
    // Scanlines
    float scanline = sin(uv.y * 800.0) * 0.04;
    col -= scanline;
    
    // Digital Noise
    float noise = hash(uv + u_time) * 0.15;
    col += noise;
    
    fragColor = vec4(col, u_alpha);
}
`;

export class GlitchMod implements FilterPlugin {
  name = 'glitch';
  private programInfo: twgl.ProgramInfo | null = null;
  private bufferInfo: twgl.BufferInfo | null = null;
  private textures: { [key: string]: WebGLTexture } | null = null;

  init(gl: WebGL2RenderingContext) {
    this.programInfo = twgl.createProgramInfo(gl, [VS_SOURCE, FS_SOURCE]);
    
    const numVerts = (GRID_SIZE + 1) * (GRID_SIZE + 1);
    const texCoords = new Float32Array(numVerts * 2);
    const indices = new Uint16Array(GRID_SIZE * GRID_SIZE * 6);

    for (let y = 0; y <= GRID_SIZE; y++) {
      for (let x = 0; x <= GRID_SIZE; x++) {
        const i = (y * (GRID_SIZE + 1) + x) * 2;
        texCoords[i] = x / GRID_SIZE;
        texCoords[i + 1] = 1.0 - (y / GRID_SIZE);
      }
    }

    let idx = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const p1 = y * (GRID_SIZE + 1) + x;
        const p2 = p1 + 1;
        const p3 = (y + 1) * (GRID_SIZE + 1) + x;
        const p4 = p3 + 1;
        indices[idx++] = p1; indices[idx++] = p2; indices[idx++] = p4;
        indices[idx++] = p1; indices[idx++] = p4; indices[idx++] = p3;
      }
    }

    this.bufferInfo = twgl.createBufferInfoFromArrays(gl, {
      a_position: { numComponents: 2, data: new Float32Array(numVerts * 2), drawType: gl.DYNAMIC_DRAW },
      a_texCoord: { numComponents: 2, data: texCoords },
      indices: { numComponents: 3, data: indices },
    });

    this.textures = twgl.createTextures(gl, {
      u_video: { src: [0, 0, 0, 255], format: gl.RGBA, min: gl.LINEAR, mag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE }
    });
  }

  render(ctx: {
    gl: WebGL2RenderingContext;
    rect: RectPoints | null;
    video: HTMLVideoElement;
    time: number;
    alpha: number;
    resolution: [number, number];
  }) {
    const { gl, rect, video, time, alpha, resolution } = ctx;
    if (!this.programInfo || !this.bufferInfo || !this.textures || !rect) return;

    const { p1, p2, p3, p4 } = rect;
    const numVerts = (GRID_SIZE + 1) * (GRID_SIZE + 1);
    const positions = new Float32Array(numVerts * 2);

    for (let y = 0; y <= GRID_SIZE; y++) {
      const v = y / GRID_SIZE;
      for (let x = 0; x <= GRID_SIZE; x++) {
        const u = x / GRID_SIZE;
        const px = (p1.x + (p4.x-p1.x)*v) + ((p2.x + (p3.x-p2.x)*v) - (p1.x + (p4.x-p1.x)*v)) * u;
        const py = (p1.y + (p4.y-p1.y)*v) + ((p2.y + (p3.y-p2.y)*v) - (p1.y + (p4.y-p1.y)*v)) * u;
        const i = (y * (GRID_SIZE + 1) + x) * 2;
        positions[i] = px;
        positions[i + 1] = py;
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferInfo.attribs!.a_position.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);

    twgl.setTextureFromElement(gl, this.textures.u_video, video);
    gl.useProgram(this.programInfo.program);
    twgl.setBuffersAndAttributes(gl, this.programInfo, this.bufferInfo);
    twgl.setUniforms(this.programInfo, {
        u_time: time,
        u_alpha: alpha,
        u_resolution: resolution, // Fix coordinate scaling
        u_video: this.textures.u_video,
    });
    twgl.drawBufferInfo(gl, this.bufferInfo);
  }

  dispose(gl: WebGL2RenderingContext) {
    if (this.textures) {
      Object.values(this.textures).forEach(t => gl.deleteTexture(t));
    }
  }
}
