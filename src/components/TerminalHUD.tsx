interface TerminalHUDProps {
  isModelLoaded: boolean;
  fps: number;
  handCount: number;
  activeFilterName: string;
}

export function TerminalHUD({ isModelLoaded, fps, handCount, activeFilterName }: TerminalHUDProps) {
  return (
    <div className="terminal-hud">
      <div style={{ borderBottom: '1px solid #00ff00', marginBottom: '10px', paddingBottom: '5px' }}>
        <code style={{ fontSize: '1rem', fontWeight: 'bold' }}>[GESTURE_FILTER_ENGINE_v3.0]</code>
      </div>
      
      <code>STATUS: <span style={{ color: isModelLoaded ? '#00ff00' : '#ff0000' }}>{isModelLoaded ? "ENGINE_ACTIVE" : "LOADING_RESOURCES..."}</span></code>
      <code>FPS: {fps}</code>
      <code>HANDS_DETECTED: {handCount}</code>
      <code>ACTIVE_MOD: <span style={{ color: '#00ff00', textTransform: 'uppercase' }}>{activeFilterName}</span></code>
      
      <div style={{ height: '10px' }} />

      <code style={{ fontSize: '0.7rem', opacity: 0.6, lineHeight: '1.4' }}>
        {">"} PINCH_DUAL: CREATE_PORTAL<br/>
        {">"} KEYS [1-2]: SWITCH_MODS<br/>
        {">"} SYSTEM: IMPERATIVE_RAF_CORE
      </code>
    </div>
  );
}
