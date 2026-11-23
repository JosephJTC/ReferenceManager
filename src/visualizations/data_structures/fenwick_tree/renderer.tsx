// Dibujo del Fenwick Tree: cada nodo es una barra que abarca las posiciones del arreglo que cubre.
// Los nodos con lowbit mayor quedan más arriba.
import type { RendererProps } from '../../core/types.js';
import { coverage, type FenwickInput, type FenwickState } from './visualization.js';
import './renderer.css';

const cell = 56, row = 46, pad = 8;

export default function FenwickRenderer({ step }: RendererProps<FenwickState, FenwickInput>) {
  const { array, tree, active, used, highlight } = step.state;
  const n = array.length;
  const level = (node: number) => Math.log2(node & -node);
  const levels = Math.floor(Math.log2(Math.max(1, n))) + 1;
  const width = n * cell + pad * 2, height = levels * row + pad * 2;
  const nodes = Array.from({ length: n }, (_, index) => index + 1);
  return <>
    <svg viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width * 1.25 }} role="img" aria-label="Fenwick Tree">
      {nodes.map(node => {
        const [lo, hi] = coverage(node);
        const x = pad + lo * cell + 3, y = pad + (levels - 1 - level(node)) * row + 4, w = (hi - lo + 1) * cell - 6;
        const value = tree[node];
        return <g key={node} className={`viz-node fenwick-node ${active === node ? 'active' : used.includes(node) ? 'used' : ''}`} data-node={node}>
          <rect x={x} y={y} width={w} height={row - 10} rx={6} />
          <text x={x + w - cell / 2 + 3} y={y + 15} className="viz-value">{value === null || value === undefined ? '·' : value}</text>
          <text x={x + w - cell / 2 + 3} y={y + 29} className="viz-caption">t[{node}]</text>
        </g>;
      })}
    </svg>
    <div className="viz-array fenwick-array" aria-label="Arreglo">{array.map((item, position) => <div key={position} className={highlight && position >= highlight[0] && position <= highlight[1] ? 'in-range' : ''}><small>{position}</small><span>{item}</span></div>)}</div>
  </>;
}
