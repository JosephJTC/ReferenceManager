// Dibujo del DSU: un bosque donde cada elemento cuelga de su padre, y debajo el arreglo de padres.
import type { RendererProps } from '../../core/types.js';
import { layoutForest } from '../../core/utils.js';
import type { DsuInput, DsuState } from './visualization.js';
import './renderer.css';

export default function DsuRenderer({ step }: RendererProps<DsuState, DsuInput>) {
  const { parent, size, active, path, roots, changed } = step.state;
  const layout = layoutForest(parent);
  const nodeClass = (node: number) => active === node ? 'active' : roots.includes(node) ? 'used' : path.includes(node) ? 'visited' : '';
  return <>
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ maxWidth: layout.width * 1.4 }} role="img" aria-label="Bosque de conjuntos disjuntos">
      {parent.map((up, node) => {
        if (up === node) return null;
        const a = layout.positions[node], b = layout.positions[up];
        const isChanged = changed?.[0] === node, onPath = path.includes(node) && path.includes(up);
        return <line key={node} className={`viz-edge ${isChanged ? 'dsu-changed' : onPath ? 'visited' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}
      {parent.map((up, node) => {
        const { x, y } = layout.positions[node];
        return <g key={node} className={`viz-node dsu-node ${nodeClass(node)}`} data-node={node}>
          <circle cx={x} cy={y} r={17} />
          <text x={x} y={y + 4} className="viz-value">{node}</text>
          {up === node && <text x={x} y={y - 21} className="viz-caption">tam. {size[node]}</text>}
        </g>;
      })}
    </svg>
    <div className="viz-array" aria-label="Arreglo de padres">{parent.map((up, node) => <div key={node} className={changed?.[0] === node ? 'active' : path.includes(node) ? 'in-range' : ''}><small>padre[{node}]</small><span>{up}</span></div>)}</div>
  </>;
}
