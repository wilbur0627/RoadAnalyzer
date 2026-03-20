import { RoadRegion } from '../shared/constants';
import { saveRegion } from '../shared/storage';

/**
 * Region Selector — lets user draw a bounding box on the page
 * to define the road area for screenshot-based detection.
 */
export function selectRegion(): Promise<RoadRegion | null> {
  return new Promise((resolve) => {
    // Full-screen overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      cursor: 'crosshair',
      background: 'rgba(0,0,0,0.3)',
    });

    // Instruction banner
    const banner = document.createElement('div');
    Object.assign(banner.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '8px',
      fontSize: '14px',
      fontFamily: 'system-ui, sans-serif',
      zIndex: '2147483647',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    });
    banner.textContent = '拖曳選取路子區域 (Drag to select road area) — ESC 取消';
    overlay.appendChild(banner);

    // Selection box
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      border: '2px dashed #6366f1',
      background: 'rgba(99,102,241,0.15)',
      borderRadius: '4px',
      display: 'none',
      pointerEvents: 'none',
    });
    overlay.appendChild(box);

    let startX = 0;
    let startY = 0;
    let dragging = false;

    function cleanup() {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }

    overlay.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      dragging = true;
      box.style.display = 'block';
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = '0';
      box.style.height = '0';
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
    });

    overlay.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;

      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      cleanup();

      // Minimum 20×20 selection
      if (w < 20 || h < 20) {
        resolve(null);
        return;
      }

      // Account for devicePixelRatio so the crop matches the screenshot
      const dpr = window.devicePixelRatio || 1;
      const region: RoadRegion = {
        x: Math.round(x * dpr),
        y: Math.round(y * dpr),
        w: Math.round(w * dpr),
        h: Math.round(h * dpr),
      };

      saveRegion(region);
      resolve(region);
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
  });
}
