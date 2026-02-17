/* ================================================================
   MERCURY — Landing Page Entry Point
   Orchestrates intro (full or fast) → hub reveal → background
   ================================================================ */

import { STORAGE_KEYS } from '../core/config.js';
import { runFullIntro, runFastIntro } from './intro.js';
import { initHubBackground } from './hub-bg.js';

document.addEventListener('DOMContentLoaded', () => {
  const hasVisited = localStorage.getItem(STORAGE_KEYS.visited);

  function revealHub() {
    // Mark as visited for next time
    localStorage.setItem(STORAGE_KEYS.visited, '1');

    // Reveal all hub elements
    const revealIds = [
      'hubLogo', 'hubLogoText', 'hubMotto', 'hubHeading', 'hubSub',
      'hubPanels', 'hubWatermark', 'hubElement',
      'hubSideWords', 'hubSideWordsR',
      'hubCoords', 'hubReadout', 'hubStatusBadges',
      'hubSchematicTL', 'hubSchematicTR', 'hubSchematicBL', 'hubSchematicBR',
    ];

    revealIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('visible');
    });

    // Terminal init sequence (animated line-by-line)
    const terminal = document.getElementById('hubTerminal');
    if (terminal) {
      terminal.classList.add('visible');
      terminal.querySelectorAll('.hub-term-line').forEach(line => {
        const delay = parseInt(line.dataset.delay) || 0;
        setTimeout(() => line.classList.add('visible'), delay);
      });
    }

    // Start background canvas
    initHubBackground();
  }

  // Route to full or fast intro
  if (hasVisited) {
    runFastIntro(revealHub);
  } else {
    runFullIntro(revealHub);
  }
});
