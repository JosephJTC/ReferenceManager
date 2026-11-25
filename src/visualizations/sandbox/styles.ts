// Estilos del dibujo dentro del entorno aislado y de las imágenes impresas. Clases de estado comunes
// que puede usar cualquier `*.viz.js`: viz-node, viz-edge, viz-cell, viz-value, viz-caption y
// active, visited, used, skipped, range, changed.
const palettes = {
  dark: { node: '#19212d', stroke: '#3a4a60', text: '#dfe6f0', muted: '#8f9db0', accent: '#4c9ffe', accentSoft: '#1d3a5c', active: '#b7791f', activeStroke: '#f6ad55', used: '#1f6f3a', usedStroke: '#3fb950', range: 'rgba(243,196,107,.18)', rangeStroke: '#f3c46b' },
  light: { node: '#f1f3f6', stroke: '#c3cad4', text: '#1f2630', muted: '#5d6878', accent: '#1f6feb', accentSoft: '#dbe9ff', active: '#fbd38d', activeStroke: '#dd8a1e', used: '#c8f0d2', usedStroke: '#1a7f37', range: 'rgba(154,103,0,.14)', rangeStroke: '#9a6700' }
};

export function sandboxCss(theme: 'dark' | 'light', root = ':root') {
  const p = palettes[theme];
  return `${root}{color-scheme:${theme};--viz-node:${p.node};--viz-stroke:${p.stroke};--viz-text:${p.text};--viz-muted:${p.muted};--viz-accent:${p.accent};--viz-visited:${p.accentSoft};--viz-visited-stroke:${p.accent};--viz-active:${p.active};--viz-active-stroke:${p.activeStroke};--viz-used:${p.used};--viz-used-stroke:${p.usedStroke};--viz-range:${p.range};--viz-range-stroke:${p.rangeStroke};--viz-font:"JetBrains Mono","Cascadia Code",Consolas,"Liberation Mono",monospace}
text{text-anchor:middle;fill:var(--viz-text);font-family:var(--viz-font)}
.viz-node rect,.viz-node circle,.viz-cell rect{fill:var(--viz-node);stroke:var(--viz-stroke);stroke-width:1.2;transition:fill calc(var(--viz-step-ms,900ms)*.25),stroke calc(var(--viz-step-ms,900ms)*.25),opacity calc(var(--viz-step-ms,900ms)*.25)}
.visited rect,.visited circle{fill:var(--viz-visited);stroke:var(--viz-visited-stroke)}
.used rect,.used circle{fill:var(--viz-used);stroke:var(--viz-used-stroke)}
.skipped rect,.skipped circle{opacity:.35}
.range rect{fill:var(--viz-range);stroke:var(--viz-range-stroke)}
.active rect,.active circle{fill:var(--viz-active);stroke:var(--viz-active-stroke);stroke-width:2.5}
.viz-edge{stroke:var(--viz-stroke);stroke-width:1.4;transition:stroke calc(var(--viz-step-ms,900ms)*.25)}
.viz-edge.visited{stroke:var(--viz-accent)}
.viz-edge.changed{stroke:var(--viz-active-stroke);stroke-width:2.6;stroke-dasharray:5 3}
.viz-value{font-weight:700;font-size:13px}
.viz-caption{font-size:9px;fill:var(--viz-muted)}`;
}
