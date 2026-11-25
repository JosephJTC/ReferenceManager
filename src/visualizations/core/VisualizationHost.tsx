// Motor de visualizaciones en la interfaz: formulario, reproductor, explicación, leyenda y errores.
// El algoritmo y el dibujo vienen del archivo `*.viz.js` de la referencia y se ejecutan en un iframe aislado.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Field, FieldValues, Step, VisualizationMeta, VisualizationSpec } from './types.js';
import { fieldValues, findOperation } from './engine.js';
import { PlayerControls, useStepPlayer } from './player.js';
import { VisualizationSandbox } from './sandbox-client.js';
import './visualization.css';

function FieldInput({ field, value, onChange }: { field: Field; value: FieldValues[string]; onChange: (value: FieldValues[string]) => void }) {
  const label = field.ariaLabel || field.label;
  return <label>{field.label}{field.kind === 'select'
    ? <select aria-label={label} value={String(value)} onChange={event => onChange(event.target.value)}>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    : field.kind === 'integer'
      ? <input aria-label={label} type="number" value={Number.isNaN(value) ? '' : value} onChange={event => onChange(event.target.value === '' ? NaN : Number(event.target.value))} />
      : <input aria-label={label} value={String(value)} onChange={event => onChange(event.target.value)} />}</label>;
}

function useTheme() {
  const read = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const [theme, setTheme] = useState<'dark' | 'light'>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const fileName = (path: string) => path.split('/').pop() || path;

type Props = { spec: VisualizationSpec; read: (path: string) => Promise<string>; onMeta?: (meta: VisualizationMeta) => void };

export function VisualizationHost({ spec, read }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const sandbox = useRef<VisualizationSandbox | undefined>(undefined);
  const [meta, setMeta] = useState<VisualizationMeta>();
  const [form, setForm] = useState<FieldValues>({});
  const [operationId, setOperationId] = useState<string>();
  const [params, setParams] = useState<Record<string, FieldValues>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(0);
  const [executed, setExecuted] = useState<string>();
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [drawError, setDrawError] = useState('');
  const [height, setHeight] = useState(160);
  const theme = useTheme();
  const player = useStepPlayer(steps.length, run);
  const keys = useRef<(key: string) => void>(() => undefined);

  async function execute(nextForm: FieldValues, operation: string, nextParams: FieldValues) {
    try {
      const result = await sandbox.current!.run(nextForm, operation, nextParams);
      setSteps(result); setExecuted(operation); setRun(value => value + 1); setError('');
    } catch (problem) { setError((problem as Error).message); }
  }

  useEffect(() => {
    let active = true;
    const instance = new VisualizationSandbox(holder.current!);
    sandbox.current = instance;
    instance.onSize = value => setHeight(Math.max(60, value));
    instance.onKey = key => keys.current(key);
    setMeta(undefined); setSteps([]); setError(''); setWarning('');
    void (async () => {
      try {
        const [code, css] = await Promise.all([read(spec.file), spec.css ? read(spec.css).catch(() => '') : Promise.resolve('')]);
        if (!active) return;
        const loaded = await instance.load(code, css, spec.options);
        if (!active) return;
        const first = loaded.meta.operations[0];
        const initialParams = Object.fromEntries(loaded.meta.operations.map(operation => [operation.id, fieldValues(operation.fields)]));
        setMeta(loaded.meta); setForm(loaded.form); setOperationId(first.id); setParams(initialParams); setWarning(loaded.warning || '');
        await execute(loaded.form, first.id, initialParams[first.id]);
      } catch (problem) { if (active) setError(`${fileName(spec.file)}: ${(problem as Error).message}`); }
    })();
    return () => { active = false; instance.destroy(); };
  }, [spec.file, spec.css, JSON.stringify(spec.options)]);

  const step = steps[player.index];
  useEffect(() => {
    if (!step) return;
    sandbox.current?.render(player.index, player.durationMs, theme).then(() => setDrawError(''), problem => setDrawError((problem as Error).message));
  }, [step, player.index, player.durationMs, theme]);

  const handleKey = (key: string) => {
    if (key === 'ArrowRight') player.next();
    if (key === 'ArrowLeft') player.prev();
    if (key === ' ') player.toggle();
    if (key === 'Home') player.reset();
  };
  keys.current = handleKey;

  const operation = meta && findOperation(meta, operationId);
  const executedOperation = meta && executed ? findOperation(meta, executed) : undefined;
  async function commit() {
    try {
      const { form: next } = await sandbox.current!.commit();
      const first = meta!.operations[0].id;
      setForm(next); setOperationId(first); await execute(next, first, params[first]);
    } catch (problem) { setError((problem as Error).message); }
  }

  return <div className="viz" data-visualization={fileName(spec.file)} data-step={player.index} tabIndex={0} style={{ '--viz-step-ms': `${player.durationMs}ms` } as CSSProperties} onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea')) return;
    if (['ArrowRight', 'ArrowLeft', ' ', 'Home'].includes(event.key)) { event.preventDefault(); handleKey(event.key); }
  }}>
    {meta?.description && <p className="muted viz-description">{meta.description}</p>}
    {meta && operation && <div className="viz-toolbar">
      {meta.inputs.map(field => <FieldInput key={field.name} field={field} value={form[field.name]} onChange={value => setForm({ ...form, [field.name]: value })} />)}
      {meta.operations.length > 1 && <label>Acción<select aria-label="Acción" value={operation.id} onChange={event => setOperationId(event.target.value)}>{meta.operations.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      {operation.fields.map(field => <FieldInput key={`${operation.id}-${field.name}`} field={field} value={params[operation.id]?.[field.name]} onChange={value => setParams({ ...params, [operation.id]: { ...params[operation.id], [field.name]: value } })} />)}
      <button className="primary" onClick={() => void execute(form, operation.id, params[operation.id])}>Ejecutar</button>
      {executedOperation?.commitLabel && meta.commit && player.index === steps.length - 1 && <button onClick={() => void commit()}>{executedOperation.commitLabel}</button>}
    </div>}
    {!meta && !error && <p className="muted">Cargando {fileName(spec.file)}…</p>}
    {warning && <p className="warning">{warning}</p>}
    {error && <p className="warning" role="alert">{error}</p>}
    {step && <PlayerControls player={player} />}
    <div className="viz-stage" hidden={!step}>
      <div ref={holder} className="viz-frame-holder" style={{ height }} />
      {drawError && <p className="warning" role="alert">No se pudo dibujar este paso: {drawError}</p>}
    </div>
    {step && <>
      <div className="viz-explain" aria-live="polite"><strong>Paso {player.index + 1}.</strong> {step.message}{step.result !== undefined && <span className="viz-result"> {step.result}</span>}</div>
      {meta?.legend && <div className="viz-legend">{meta.legend.map(item => <span key={item.state} className={`lg ${item.state}`}>{item.label}</span>)}</div>}
      <details className="viz-debug"><summary>Datos del paso (depuración)</summary><pre>{JSON.stringify({ event: step.event, state: step.state }, null, 2)}</pre></details>
    </>}
  </div>;
}
