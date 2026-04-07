# Anti-Gravity UI: Complete Revamp Prompt

## Overview
Transform Anti-Gravity UI from monolithic sync pipeline to modular, performant system with gesture-based number detection (1-10) and clean GUI menu. Target: 60 FPS stable.

---

## Phase 1: Core Architecture Changes

### 1.1 Decouple MediaPipe Inference (Web Worker)

Create `src/workers/trackingWorker.ts`:
```
- Move MediaPipe HandLandmarker to separate thread
- Track at 360p input (instead of 720p) to reduce inference time
- Send hand landmark data via SharedArrayBuffer or MessagePort
- Run at ~30 FPS independently (don't block main RAF loop)
- Only update state when landmarks actually change
```

### 1.2 Main Thread Rendering Loop

Rewrite RAF loop to:
```
- Render at 60 FPS regardless of tracking status
- Interpolate (LERP) previous hand positions if new data unavailable
- Apply current filter + mode
- Update GUI only when data changes (throttled)
- No React state updates on every frame
```

### 1.3 Filter & Mode System (Modular)

Create base classes:

**FilterBase.ts**
```typescript
abstract class FilterBase {
  name: string;
  isActive: boolean;
  
  abstract process(
    imageData: ImageData,
    hands: Hand[],
    deltaTime: number
  ): ImageData;
  
  abstract cleanup(): void;
}
```

**ModeBase.ts**
```typescript
abstract class ModeBase {
  name: string;
  filter: FilterBase | null;
  
  abstract update(hands: Hand[], deltaTime: number): void;
  abstract render(ctx: CanvasRenderingContext2D | WebGLRenderingContext): void;
}
```

Existing filters become:
- `DitherFilter extends FilterBase`
- `GlitchFilter extends FilterBase`
- `AsciiFilter extends FilterBase`

---

## Phase 2: Gesture-Based Number Detection

### 2.1 NumberDetectionMode

Create `src/modes/NumberDetectionMode.ts`:

**State Flow:**
```
IDLE → SELECT_MODE → SELECT_FILTER → DETECT_NUMBERS → Display (1-10)
```

**Number Recognition Logic** (using MediaPipe hand landmarks):
```
Use finger positions to detect poses:

1 = Index finger up, others down
2 = Index + Middle up, others down
3 = Index + Middle + Ring up
4 = Index + Middle + Ring + Pinky up
5 = All fingers up (open palm)
6-10 = Use hand count + finger count combination
  - 6 = Both hands, index only up each
  - 7 = Both hands, index+middle up each
  - 8 = Both hands, index+middle+ring up each
  - 9 = Both hands, all fingers up (one hand) + index only (other hand)
  - 10 = Both hands, all fingers up on each

Detection confidence: Hold pose for 0.5 seconds to register
```

**Gesture Recognition Algorithm:**
```typescript
detectNumberGesture(hands: Hand[]): number | null {
  if (hands.length === 0) return null;
  
  // Get finger states (up/down) based on landmark positions
  const fingerStates = hands.map(hand => {
    return {
      index: isFingerUp(hand, FINGER.INDEX),
      middle: isFingerUp(hand, FINGER.MIDDLE),
      ring: isFingerUp(hand, FINGER.RING),
      pinky: isFingerUp(hand, FINGER.PINKY),
      thumb: isFingerUp(hand, FINGER.THUMB)
    };
  });
  
  // Match against number poses
  return matchNumberPose(fingerStates);
}
```

### 2.2 Mode Selection Flow

**Step 1: Select Mode**
```
[Normal Mode] [Number Detection Mode]
User picks one via hand gesture or click
```

**Step 2: Select Filter** (if Normal Mode)
```
[Dither] [Glitch] [ASCII] [None]
User picks filter
```

**Step 3: Start Detection** (if Number Detection Mode)
```
Ready to detect numbers 1-10
Show real-time feedback on GUI
```

---

## Phase 3: Clean GUI Control Panel (Top-Left)

### 3.1 Minimal Status Display

Design principles:
- **No waste**: Only essential info
- **Single column**: Stack vertically
- **Real-time updates**: Shows current state + detected numbers
- **Manual override**: Click buttons to change mode/filter

**Layout:**
```
┌─────────────────────┐
│ MODE: Normal        │  ← Click to change
│ FILTER: Dither      │  ← Click to change
│                     │
│ FPS: 58             │  ← Performance metric
│ Hands: 2            │  ← Detection count
│                     │
│ Number: 5           │  ← Only shown in NumberDetectionMode
│ Confidence: 92%     │  ← Only shown in NumberDetectionMode
└─────────────────────┘
```

### 3.2 ControlPanel Component

```typescript
interface ControlPanelProps {
  mode: ModeType;
  filter: FilterType;
  fps: number;
  handCount: number;
  detectedNumber?: number;
  confidence?: number;
  onModeChange: (mode: ModeType) => void;
  onFilterChange: (filter: FilterType) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ ... }) => {
  // Render minimal info + clickable buttons
}
```

### 3.3 Visual Style

```css
/* Minimal, modern aesthetic */
- Background: Transparent with subtle border
- Font: Monospace (SF Mono / Roboto Mono)
- Text color: Bright white on dark semi-transparent bg
- Button: Simple text, hover underline
- Size: Fit in ~200px width
- Position: Fixed top-left, 16px padding
- No animation: Direct, instant feedback
```

---

## Phase 4: Implementation Checklist

### Performance Optimizations
- [ ] Move MediaPipe to Web Worker
- [ ] Reduce inference input to 360p
- [ ] Pre-allocate Float32Array in filters (not per-frame)
- [ ] Remove `shadowBlur` from Canvas 2D (move to WebGL glow if needed)
- [ ] Throttle React state updates (only on change)
- [ ] Use RAF loop independent of worker updates

### Modular Architecture
- [ ] Create FilterBase abstract class
- [ ] Create ModeBase abstract class
- [ ] Convert existing filters to extend FilterBase
- [ ] Create NumberDetectionMode
- [ ] Create filter/mode registry for easy extensibility

### Gesture Detection
- [ ] Implement finger-up detection logic
- [ ] Build number pose matching algorithm
- [ ] Add 0.5s confirmation threshold
- [ ] Handle 1-10 number recognition

### UI & UX
- [ ] Build minimal ControlPanel component
- [ ] Show mode/filter selection
- [ ] Display FPS, hand count, detected number
- [ ] Add click handlers for manual mode/filter change
- [ ] Update GUI only when state changes

### Testing
- [ ] Verify 60 FPS on standard laptop
- [ ] Test all number poses (1-10)
- [ ] Test mode/filter switching
- [ ] Test with different lighting conditions

---

## Phase 5: File Structure

```
src/
├── core/
│   ├── types.ts                          # Shared types (Hand, Filter, Mode)
│   ├── constants.ts                      # Magic numbers, finger indices
│   └── utils.ts                          # Helper functions
├── workers/
│   └── trackingWorker.ts                 # MediaPipe Web Worker
├── filters/
│   ├── FilterBase.ts
│   ├── DitherFilter.ts                   # Refactored
│   ├── GlitchFilter.ts                   # Refactored
│   ├── AsciiFilter.ts                    # Refactored
│   └── index.ts                          # Export all filters
├── modes/
│   ├── ModeBase.ts
│   ├── NormalMode.ts                     # Standard rendering
│   ├── NumberDetectionMode.ts            # Gesture → numbers
│   └── index.ts                          # Export all modes
├── ui/
│   ├── ControlPanel.tsx                  # Top-left menu
│   └── styles.css                        # Minimal styling
├── App.tsx                               # Main entry
└── worker.ts                             # Worker entry point
```

---

## Phase 6: Key Code Sections to Implement

### 6.1 Worker Initialization
```typescript
// In App.tsx or main.ts
const trackingWorker = new Worker('/worker.ts');
const sharedBuffer = new SharedArrayBuffer(HandLandmarks.BUFFER_SIZE);

trackingWorker.postMessage({
  type: 'INIT',
  canvas: offscreenCanvas,
  sharedBuffer
});
```

### 6.2 Main RAF Loop
```typescript
let lastHandData = null;

function animate() {
  const now = performance.now();
  const deltaTime = (now - lastFrameTime) / 1000;
  
  // Check if worker has new data (non-blocking)
  const hands = trackingWorker.getLatestLandmarks() || lastHandData;
  if (hands) lastHandData = hands;
  
  // Apply current mode
  currentMode.update(hands, deltaTime);
  currentMode.render(canvas);
  
  // Update GUI (throttled)
  if (shouldUpdateGUI) {
    updateControlPanel({
      mode: currentMode.name,
      filter: currentFilter.name,
      fps: calculateFPS(),
      handCount: hands?.length || 0
    });
  }
  
  requestAnimationFrame(animate);
}
```

### 6.3 Number Detection
```typescript
class NumberDetectionMode extends ModeBase {
  private gestureHistory: number[] = [];
  private confidenceThreshold = 0.7;
  private holdDuration = 500; // ms
  
  update(hands: Hand[], deltaTime: number) {
    const detected = detectNumberGesture(hands);
    
    if (detected !== null) {
      this.gestureHistory.push(detected);
      
      // Confirm if same number held for 0.5s
      if (this.isConsistent(this.gestureHistory)) {
        this.detectedNumber = detected;
        this.confidence = this.calculateConfidence();
        this.gestureHistory = [];
      }
    } else {
      this.gestureHistory = [];
    }
  }
}
```

---

## Summary

✅ **Performance**: Worker thread decouples inference from rendering  
✅ **Modularity**: Filters and modes extend base classes  
✅ **New Feature**: Gesture-based number detection (1-10)  
✅ **UI**: Minimal, real-time control panel (top-left)  
✅ **Clean**: No waste, intentional design  

You now have a foundation to:
- Add new filters (extend FilterBase)
- Add new modes (extend ModeBase)
- Extend gesture recognition
- Scale the system without refactoring core loop
