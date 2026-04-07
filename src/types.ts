import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface Point2D {
  x: number;
  y: number;
}

export interface RectPoints {
  p1: Point2D; // Hand 0 Thumb (4) - Top Left
  p2: Point2D; // Hand 0 Index (8) - Top Right
  p3: Point2D; // Hand 1 Index (8) - Bottom Right
  p4: Point2D; // Hand 1 Thumb (4) - Bottom Left
}

export interface InteractionState {
  currentRect: RectPoints | null;
  fadeAlpha: number;
}

export interface FilterPlugin {
  name: string;
  init(gl: WebGL2RenderingContext): void;
  render(ctx: {
    gl: WebGL2RenderingContext;
    rect: RectPoints | null;
    video: HTMLVideoElement;
    time: number;
    alpha: number;
    resolution: [number, number];
  }): void;
  resize?(gl: WebGL2RenderingContext, width: number, height: number): void;
  onContextLost?(): void;
  dispose?(gl: WebGL2RenderingContext): void;
}

export type HandData = NormalizedLandmark[];
