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
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
}`;

const FS_SOURCE = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_alpha;
uniform float u_time;
uniform sampler2D u_video;
in vec2 v_texCoord;
in vec2 v_videoCoord;

#define CELL_W      6.0
#define CELL_H      4.0

float shapeResponse(float x) {
    x = clamp(x, 0.0, 1.0);
    return x * x;
}

void main() {
    vec2 fragCoord = v_videoCoord * u_resolution;
    
    vec2 cellSize = vec2(CELL_W, CELL_H);
    vec2 cell = floor(fragCoord / cellSize);
    vec2 cellOrigin = cell * cellSize;
    vec2 localFrac = (fragCoord - cellOrigin) / cellSize;

    int qx = int(localFrac.x * 3.0);
    int qy = int(localFrac.y * 2.0);

    vec2 cellCenter = cellOrigin + cellSize * 0.5;
    vec3 cellCol = texture(u_video, cellCenter / u_resolution).rgb;

    int ch0 = 0, ch1 = 1, ch2 = 2;
    if (cellCol[1] > cellCol[0]) { ch0 = 1; ch1 = 0; }
    if (cellCol[2] > cellCol[ch0]) { ch2 = ch0; ch0 = 2; }
    else if (cellCol[2] > cellCol[ch1]) { ch2 = ch1; ch1 = 2; }

    int role;
    if (qx == 1)      role = ch1;  
    else if (qy == 0) role = ch0;  
    else               role = ch2;  

    vec2 subSize = cellSize / vec2(3.0, 2.0);
    vec2 subOrigin = cellOrigin + vec2(float(qx), float(qy)) * subSize;
    vec2 sampleCoord = subOrigin + subSize * 0.5;
    vec3 subCol = texture(u_video, sampleCoord / u_resolution).rgb;
    float val = shapeResponse(subCol[role]);

    vec2 inSub = fragCoord - subOrigin;
    int idx = int(inSub.x) + int(inSub.y) * 2;

    float threshold;
    if      (idx == 0) threshold = 0.2;
    else if (idx == 3) threshold = 0.4;
    else if (idx == 2) threshold = 0.6;
    else               threshold = 0.8;

    float on = step(threshold, val);
    fragColor = vec4(vec3(on), u_alpha);
}
`;

export class DitherMod implements FilterPlugin {
  name = 'dither';
  private programInfo: twgl.ProgramInfo | null = null;
  private bufferInfo: twgl.BufferInfo | null = null;
  private textures: { [key: string]: WebGLTexture } | null = null;

  init(gl: WebGL2RenderingContext) {
    this.programInfo = twgl.createProgramInfo(gl, [VS_SOURCE, FS_SOURCE]);
    
    // Setup Grid Geometry
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

    // Mesh subdivision for perspective correction
    for (let y = 0; y <= GRID_SIZE; y++) {
      const v = y / GRID_SIZE;
      for (let x = 0; x <= GRID_SIZE; x++) {
        const u = x / GRID_SIZE;
        // Bilinear interpolation
        const leftX = p1.x + (p4.x - p1.x) * v;
        const leftY = p1.y + (p4.y - p1.y) * v;
        const rightX = p2.x + (p3.x - p2.x) * v;
        const rightY = p2.y + (p3.y - p2.y) * v;
        
        const px = leftX + (rightX - leftX) * u;
        const py = leftY + (rightY - leftY) * u;

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
        u_resolution: resolution,
        u_alpha: alpha,
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
