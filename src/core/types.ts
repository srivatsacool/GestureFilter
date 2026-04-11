import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface Point2D {
  x: number;
  y: number;
}

export interface RectPoints {
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  p4: Point2D;
}

export interface Hand {
  landmarks: NormalizedLandmark[];
  handedness: 'Left' | 'Right';
}

export interface FilterRenderContext {
  gl: WebGL2RenderingContext;
  rect: RectPoints;
  video: HTMLVideoElement;
  time: number;
  alpha: number;
  resolution: [number, number];
}

export interface InteractionState {
  currentRect: RectPoints | null;
  fadeAlpha: number;
  hands: Hand[];
  handCount: number;
  fps: number;
  detectedNumber?: number;
  confidence?: number;
}

export type ModeType = 'Normal' | 'NumberDetection';
export type FilterType = 'None' | 'Dither' | 'Glitch' | 'Ascii';

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export interface TrackingData {
  hands: Hand[];
  timestamp: number;
  fps: number;
}
