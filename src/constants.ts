export const VIDEO_CONFIG = {
  WIDTH: 1280,
  HEIGHT: 720,
  FPS: 30,
};

export const GESTURE_CONFIG = {
  START_PINCH_THRESHOLD: 0.25, // Threshold to BEGIN a pinch
  STOP_PINCH_THRESHOLD: 0.50,  // Threshold to BREAK a pinch (Hysteresis)
  FADE_DURATION: 300,          // 300ms fade-out (was 500)
  LERP_FACTOR: 0.28,           // Smoother but faster tracking (was 0.12)
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
