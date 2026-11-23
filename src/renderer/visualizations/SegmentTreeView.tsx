import { useEffect, useMemo, useState } from 'react';
import { buildSteps, querySteps, updateSteps, parseSegmentValues, segmentLayout, operationLabels, maxSegmentValues, type SegmentOperation, type SegmentStep } from '../../shared/visualizations/segment-tree.js';
import type { VisualizationProps } from './registry.js';
import { PlayerControls, useStepPlayer } from './player.js';

type Action = 'build' | 'query' | 'update';
const defaults = [5, 8, 6, 3, 2, 7, 2, 6];

export default function SegmentTreeView({ spec }: VisualizationProps) {
  const initial = spec.values?.length ? spec.values.slice(0, maxSegmentValues) : defaults;
  const [text, setText] = useState(initial.join(', '));
  const [values, setValues] = useState(initial);
  const [operation, setOperation] = useState<SegmentOperation>(['sum', 'min', 'max'].includes(spec.operation || '') ? spec.operation as SegmentOperation : 'sum');
  const [action, setAction] = useState<Action>('build');
  const [left, setLeft] = useState(2), [right, setRight] = useState(5);
  const [index, setIndex] = useState(3), [value, setValue] = useState(10);
  const [error, setError] = useState('');
  const [run, setRun] = useState({ action: 'build' as Action, left: 2, right: 5, index: 3, value: 10 });
  const steps: SegmentStep[] = useMemo(() => run.action === 'query' ? querySteps(values, operation, run.left, run.right) : run.action === 'update' ? updateSteps(values, operation, run.index, run.value) : buildSteps(values, operation), [values, operation, run]);
  const player = useStepPlayer(steps.length);
  const step = steps[Math.min(player.index, steps.length - 1)];
  const layout = useMemo(() => segmentLayout(values.length), [values.length]);
  useEffect(() => { setLeft(value => Math.min(value, values.length - 1)); setRight(value => Math.min(value, values.length - 1)); setIndex(value => Math.min(value, values.length - 1)); }, [values.length]);
  function apply() {
    try {
      const parsed = parseSegmentValues(text);
      const n = parsed.length;
      if (action === 'query' && !(Number.isInteger(left) && Number.isInteger(right) && 0 <= left && left <= right && right < n)) throw new Error(`El intervalo debe cumplir 0 ≤ l ≤ r < ${n}.`);
      if (action === 'update' && !(Number.isInteger(index) && index >= 0 && index < n && Number.isInteger(value) && Math.abs(value) <= 1e9)) throw new Error(`La posición debe estar entre 0 y ${n - 1}.`);
      setError(''); setValues(parsed); setRun({ action, left, right, index, value });
    } catch (problem) { setError((problem as Error).message); }
  }
  function commitUpdate() { if (run.action === 'update') { const next = steps[steps.length - 1].array; setValues(next); setText(next.join(', ')); setRun({ ...run, action: 'build' }); setAction('build'); } }
  const nodeClass = (id: number) => step.active === id ? 'active' : step.partial.includes(id) ? 'used' : step.skipped.includes(id) ? 'skipped' : step.visited.includes(id) ? 'visited' : '';
  return <div className="viz segment-viz" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); player.next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); player.prev(); }
    if (event.key === ' ') { event.preventDefault(); player.toggle(); }
    if (event.key === 'Home') { event.preventDefault(); player.reset(); }
  }} tabIndex={0}>
    <div className="viz-toolbar">
      <label>Valores iniciales<input aria-label="Valores iniciales" value={text} onChange={event => setText(event.target.value)} /></label>
      <label>Operación<select aria-label="Operación del árbol" value={operation} onChange={event => setOperation(event.target.value as SegmentOperation)}>{Object.entries(operationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Acción<select aria-label="Acción" value={action} onChange={event => setAction(event.target.value as Action)}><option value="build">Construcción</option><option value="query">Consulta de intervalo</option><option value="update">Actualización puntual</option></select></label>
      {action === 'query' && <><label>l<input aria-label="Inicio del intervalo" type="number" value={left} onChange={event => setLeft(Number(event.target.value))} /></label><label>r<input aria-label="Fin del intervalo" type="number" value={right} onChange={event => setRight(Number(event.target.value))} /></label></>}
      {action === 'update' && <><label>Posición<input aria-label="Posición a actualizar" type="number" value={index} onChange={event => setIndex(Number(event.target.value))} /></label><label>Nuevo valor<input aria-label="Nuevo valor" type="number" value={value} onChange={event => setValue(Number(event.target.value))} /></label></>}
      <button className="primary" onClick={apply}>Ejecutar</button>
      {run.action === 'update' && player.index === steps.length - 1 && <button onClick={commitUpdate}>Conservar actualización</button>}
    </div>
    {error && <p className="warning" role="alert">{error}</p>}
    <PlayerControls player={player} />
    <div className="viz-stage">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ maxWidth: layout.width * 1.25 }} role="img" aria-label="Árbol de segmentos">
        {layout.nodes.flatMap(node => [node.id * 2, node.id * 2 + 1].filter(child => layout.positions.has(child)).map(child => { const a = layout.positions.get(node.id)!, b = layout.positions.get(child)!; return <line key={`${node.id}-${child}`} className={step.visited.includes(child) ? 'edge visited' : 'edge'} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; }))}
        {layout.nodes.map(node => { const position = layout.positions.get(node.id)!; const current = step.values[node.id]; return <g key={node.id} className={`seg-node ${nodeClass(node.id)}`} data-node={node.id}>
          <rect x={position.x - 27} y={position.y - 18} width={54} height={36} rx={6} />
          <text x={position.x} y={position.y - 2} className="seg-value">{current === null || current === undefined ? '·' : current}</text>
          <text x={position.x} y={position.y + 12} className="seg-range">{node.lo === node.hi ? `[${node.lo}]` : `[${node.lo},${node.hi}]`}</text>
        </g>; })}
      </svg>
      <div className="viz-array" aria-label="Arreglo">{step.array.map((item, position) => <div key={position} className={step.highlight && position >= step.highlight[0] && position <= step.highlight[1] ? 'in-range' : ''}><small>{position}</small><span>{item}</span></div>)}</div>
    </div>
    <div className="viz-explain" aria-live="polite"><strong>Paso {player.index + 1}.</strong> {step.message}{step.result !== undefined && Number.isFinite(step.result) && run.action === 'query' && <span className="viz-result"> Acumulado: {step.result}</span>}</div>
    <div className="viz-legend"><span className="lg active">Nodo actual</span><span className="lg visited">Visitado</span><span className="lg used">Usado / recalculado</span><span className="lg skipped">Descartado</span><span className="lg range">Intervalo</span></div>
  </div>;
}
