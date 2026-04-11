import React from 'react';
import './ControlPanel.css';
import { getFilterById } from '../filters';
import { NormalMode, NumberDetectionMode, ModeBase } from '../modes';

interface ControlPanelProps {
  isModelLoaded: boolean;
  fps: number;
  handCount: number;
  activeFilterId: string;
  activeModeName: string;
  onFilterChange: (id: string) => void;
  onModeChange: (mode: ModeBase) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isModelLoaded,
  fps,
  handCount,
  activeFilterId,
  activeModeName,
  onFilterChange,
  onModeChange
}) => {
  return (
    <div className="control-panel">
      <div className="cp-header">
        <div className="cp-title">GESTURE_FILTER_v2</div>
        <div className={`cp-status-dot ${isModelLoaded ? 'active' : 'loading'}`} />
      </div>

      <div className="cp-section">
        <div className="cp-label">SYSTEM_STATS</div>
        <div className="cp-stat-row">
          <span>FPS</span>
          <span className="cp-value">{fps}</span>
        </div>
        <div className="cp-stat-row">
          <span>HANDS</span>
          <span className="cp-value">{handCount}</span>
        </div>
        <div className="cp-stat-row">
          <span>MODE</span>
          <span className="cp-value highlight">{activeModeName.toUpperCase()}</span>
        </div>
      </div>

      <div className="cp-section">
        <div className="cp-label">ACTIVE_MODES</div>
        <div className="cp-button-grid">
          <button 
            className={`cp-btn ${activeModeName === 'Normal' ? 'active' : ''}`}
            onClick={() => onModeChange(new NormalMode(getFilterById(activeFilterId)))}
          >
            NORMAL
          </button>
          <button 
            className={`cp-btn ${activeModeName === 'Number Detection' ? 'active' : ''}`}
            onClick={() => onModeChange(new NumberDetectionMode())}
          >
            DETECT_1-10
          </button>
        </div>
      </div>

      <div className="cp-section">
        <div className="cp-label">VISUAL_FILTERS</div>
        <div className="cp-button-grid">
          {['none', 'dither', 'glitch', 'drunk'].map(id => (
            <button 
              key={id}
              className={`cp-btn ${activeFilterId === id ? 'active' : ''}`}
              onClick={() => {
                onFilterChange(id);
                onModeChange(new NormalMode(getFilterById(id)));
              }}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="cp-footer">
        PRESS [M] FOR QUICK MODE TOGGLE
      </div>
    </div>
  );
};
