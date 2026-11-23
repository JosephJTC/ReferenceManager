// Dibujo del Segment Tree. Recibe el paso actual y no ejecuta ningún algoritmo.
import type { RendererProps } from '../../core/types.js';
import { segmentLayout, type SegmentInput, type SegmentState } from './visualization.js';
import './renderer.css';

export default function SegmentTreeRenderer({ step }: RendererProps<SegmentState, SegmentInput>) {
  const state = step.state;
  const layout = segmentLayout(state.array.length);
  const nodeClass = (id: number) => state.active === id ? 'active' : state.partial.includes(id) ? 'used' : state.skipped.includes(id) ? 'skipped' : state.visited.includes(id) ? 'visited' : '';
  return <>
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ maxWidth: layout.width * 1.25 }} role="img" aria-label="Árbol de segmentos">
      {layout.nodes.flatMap(node => [node.id * 2, node.id * 2 + 1].filter(child => layout.byId.has(child)).map(child => {
        const target = layout.byId.get(child)!;
        return <line key={`${node.id}-${child}`} className={state.visited.includes(child) ? 'viz-edge visited' : 'viz-edge'} x1={node.x} y1={node.y} x2={target.x} y2={target.y} />;
      }))}
      {layout.nodes.map(node => {
        const value = state.values[node.id];
        return <g key={node.id} className={`viz-node seg-node ${nodeClass(node.id)}`} data-node={node.id}>
          <rect x={node.x - 27} y={node.y - 18} width={54} height={36} rx={6} />
          <text x={node.x} y={node.y - 2} className="viz-value">{value === null || value === undefined ? '·' : value}</text>
          <text x={node.x} y={node.y + 12} className="viz-caption">{node.lo === node.hi ? `[${node.lo}]` : `[${node.lo},${node.hi}]`}</text>
        </g>;
      })}
    </svg>
    <div className="viz-array" aria-label="Arreglo">{state.array.map((item, position) => <div key={position} className={state.highlight && position >= state.highlight[0] && position <= state.highlight[1] ? 'in-range' : ''}><small>{position}</small><span>{item}</span></div>)}</div>
  </>;
}
