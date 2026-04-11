export const VIDEO_CONFIG = {
  WIDTH: 1280,
  HEIGHT: 720,
  ASPECT_RATIO: 16 / 9,
};

export const INFERENCE_CONFIG = {
  INPUT_WIDTH: 360,
  INPUT_HEIGHT: 270, // 4:3 for MediaPipe recommended
  UPDATE_FPS: 30,
};

export const GESTURE_CONFIG = {
  PINCH_START: 0.045,
  PINCH_END: 0.065,
  TRIGGER_HOLD_TIME: 120,      // ms
  RELEASE_HOLD_TIME: 180,      // ms
  LOCKED_TIMEOUT: 500,         // ms (continuity window)
  STABILITY_THRESHOLD: 0.02,   // velocity filtering
  FADE_DURATION: 300,          // ms
  LERP_FACTOR: 0.28,           // Smoothing factor
  CONFIDENCE_THRESHOLD: 0.7,
  HOLD_DURATION: 500,          // ms (for Number detection)
};

export const FINGER_INDICES = {
  THUMB: [0, 1, 2, 3, 4],
  INDEX: [5, 6, 7, 8],
  MIDDLE: [9, 10, 11, 12],
  RING: [13, 14, 15, 16],
  PINKY: [17, 18, 19, 20],
};

export const COLORS = {
  rectActive: '#ffff00', // Yellow while arming
  rectSaved: '#00ff00',  // Green once locked
  rectInactive: '#333333',
  skeletonPrimary: '#00f2ff',
  skeletonPinch: '#ff00ee',
};
