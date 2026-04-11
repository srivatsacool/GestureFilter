export const VIDEO_CONFIG = {
  WIDTH: 1280,
  HEIGHT: 720,
  FPS: 30,
};

export const GESTURE_CONFIG = {
  PINCH_START: 0.045,          // Threshold to BEGIN a pinch
  PINCH_END: 0.065,            // Threshold to BREAK a pinch (Hysteresis)
  TRIGGER_HOLD_TIME: 120,      // ms to hold before activation
  RELEASE_HOLD_TIME: 180,      // ms to hold before deactivation
  FADE_DURATION: 300,          // ms for visual fade-out
  LERP_FACTOR: 0.28,           // Smoothing factor
};

export const COLORS = {
  // Skeleton / Joints
  hand_bone_start: '#ff00ff',      // Magenta
  hand_bone_mid: '#00f3ff',        // Cyan
  hand_bone_end: '#00ff88',        // Neon green
  wrist: '#ff00ff',                // Magenta
  fingertips: '#00ff00',           // Green
  middle_joints: '#00f3ff',        // Cyan
  accent_2: '#ff6600',             // Orange

  // UI / Interaction
  rectActive: '#ffff00',           // Yellow while forming
  rectSaved: '#00ff00',            // Green once saved/locked
  hudText: '#00ff00',
};

export const DEBUG = false; // Toggle for visual debugging (BBox, FPS, etc.)
