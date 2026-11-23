// Contenedor común: formulario, reproductor, explicación, leyenda y carga del dibujo.
// Las visualizaciones no necesitan tocar este archivo.
import { Component, Suspense, lazy, useMemo, useState, type ComponentType, type CSSProperties, type LazyExoticComponent, type ReactNode } from 'react';
import type { Field, FieldValues, RendererProps, VisualizationDefinition, VisualizationSpec } from './types.js';
import { execute, fieldValues, findOperation, inputFromSpec, type Execution } from './engine.js';
import { PlayerControls, useStepPlayer } from './player.js';
import { renderers } from '../renderers.js';
import './visualization.css';

const lazyRenderers = new Map<string, LazyExoticComponent<ComponentType<RendererProps>>>();
function rendererFor(id: string) {
  if (!renderers[id]) return undefined;
  if (!lazyRenderers.has(id)) lazyRenderers.set(id, lazy(renderers[id]));
  return lazyRenderers.get(id);
}

class RendererBoundary extends Component<{ resetKey: unknown; children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidUpdate(previous: { resetKey: unknown }) { if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined }); }
  render() { return this.state.error ? <p className="warning" role="alert">No se pudo dibujar este paso: {this.state.error.message}</p> : this.props.children; }
}

function FieldInput({ field, value, onChange }: { field: Field; value: FieldValues[string]; onChange: (value: FieldValues[string]) => void }) {
  const label = field.ariaLabel || field.label;
  return <label>{field.label}{field.kind === 'select'
    ? <select aria-label={label} value={String(value)} onChange={event => onChange(event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    : field.kind === 'integer'
      ? <input aria-label={label} type="number" value={Number.isNaN(value) ? '' : value} onChange={event => onChange(event.target.value === '' ? NaN : Number(event.target.value))} />
      : <input aria-label={label} value={String(value)} onChange={event => onChange(event.target.value)} />}</label>;
}

function start(definition: VisualizationDefinition, spec?: VisualizationSpec): { form: FieldValues; warning?: string; execution?: Execution; error?: string } {
  const { values, warning } = inputFromSpec(definition, spec);
  try { return { form: values, warning, execution: execute(definition, values) }; }
  catch (error) { return { form: values, warning, error: (error as Error).message }; }
}

export function VisualizationHost({ definition, spec }: { definition: VisualizationDefinition; spec?: VisualizationSpec }) {
  const initial = useMemo(() => start(definition, spec), [definition, spec]);
  const [form, setForm] = useState(initial.form);
  const [operationId, setOperationId] = useState(definition.operations[0]?.id);
  const [params, setParams] = useState<Record<string, FieldValues>>(() => Object.fromEntries(definition.operations.map(operation => [operation.id, fieldValues(operation.fields)])));
  const [execution, setExecution] = useState(initial.execution);
  const [error, setError] = useState(initial.error || initial.warning || '');
  const operation = findOperation(definition, operationId);
  const steps = execution?.steps || [];
  const player = useStepPlayer(steps.length, execution);
  const Renderer = rendererFor(definition.id);

  function run(nextForm = form, nextOperation = operationId) {
    try { setExecution(execute(definition, nextForm, nextOperation, params[nextOperation])); setError(''); }
    catch (problem) { setError((problem as Error).message); }
  }
  function commit() {
    if (!execution || !definition.commit) return;
    const nextForm = fieldValues(definition.inputs, definition.commit(execution.input, execution.operation, execution.params));
    const first = definition.operations[0].id;
    setForm(nextForm); setOperationId(first); run(nextForm, first);
  }

  const step = steps[player.index];
  const executed = execution && findOperation(definition, execution.operation);
  return <div className={`viz viz-${definition.id}`} data-visualization={definition.id} data-step={player.index} tabIndex={0} style={{ '--viz-step-ms': `${player.durationMs}ms` } as CSSProperties} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); player.next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); player.prev(); }
    if (event.key === ' ') { event.preventDefault(); player.toggle(); }
    if (event.key === 'Home') { event.preventDefault(); player.reset(); }
  }}>
    <div className="viz-toolbar">
      {definition.inputs.map(field => <FieldInput key={field.name} field={field} value={form[field.name]} onChange={value => setForm({ ...form, [field.name]: value })} />)}
      {definition.operations.length > 1 && <label>Acción<select aria-label="Acción" value={operation.id} onChange={event => setOperationId(event.target.value)}>{definition.operations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      {operation.fields.map(field => <FieldInput key={`${operation.id}-${field.name}`} field={field} value={params[operation.id][field.name]} onChange={value => setParams({ ...params, [operation.id]: { ...params[operation.id], [field.name]: value } })} />)}
      <button className="primary" onClick={() => run()}>Ejecutar</button>
      {executed?.commitLabel && definition.commit && player.index === steps.length - 1 && <button onClick={commit}>{executed.commitLabel}</button>}
    </div>
    {error && <p className="warning" role="alert">{error}</p>}
    {step && execution && <>
      <PlayerControls player={player} />
      <div className="viz-stage">
        {Renderer
          ? <RendererBoundary resetKey={step}><Suspense fallback={<p className="muted">Cargando visualización…</p>}>
            <Renderer step={step} previous={steps[player.index - 1]} next={steps[player.index + 1]} index={player.index} total={steps.length} playing={player.playing} durationMs={player.durationMs} input={execution.input} operation={execution.operation} />
          </Suspense></RendererBoundary>
          : <p className="warning">La visualización «{definition.id}» no tiene un dibujo registrado en renderers.ts.</p>}
      </div>
      <div className="viz-explain" aria-live="polite"><strong>Paso {player.index + 1}.</strong> {step.message}{step.result !== undefined && <span className="viz-result"> {step.result}</span>}</div>
      {definition.legend && <div className="viz-legend">{definition.legend.map(item => <span key={item.state} className={`lg ${item.state}`}>{item.label}</span>)}</div>}
      <details className="viz-debug"><summary>Datos del paso (depuración)</summary><pre>{JSON.stringify({ event: step.event, state: step.state }, null, 2)}</pre></details>
    </>}
  </div>;
}
