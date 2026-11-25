// Se ejecuta dentro del iframe aislado (viz-sandbox.html, sandbox="allow-scripts" sin allow-same-origin):
// el código de la referencia no puede leer el almacenamiento de la aplicación, el token ni la red.
// Toda la comunicación con el motor pasa por el MessagePort que entrega el motor al conectarse.
import { definitionMeta, execute, fieldValues, inputFromSpec, loadDefinition, type Execution } from '../core/engine.js';
import type { FieldValues, VisualizationDefinition } from '../core/types.js';
import { sandboxCss } from './styles.js';

type Theme = 'dark' | 'light';
let port: MessagePort | undefined;
let definition: VisualizationDefinition | undefined;
let form: FieldValues = {};
let execution: Execution | undefined;
let referenceCss = '';
const stage = document.getElementById('stage')!;
const baseStyle = document.getElementById('base-style')!;
const ownStyle = document.getElementById('reference-style')!;

const required = () => { if (!definition) throw new Error('La visualización no está cargada.'); return definition; };
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'number' && !Number.isFinite(item) ? String(item) : item));

function setTheme(theme: Theme) {
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  baseStyle.textContent = sandboxCss(theme) + 'html,body{margin:0;background:transparent}#stage{display:flex;flex-direction:column;align-items:center;padding:4px}#stage svg{width:100%;height:auto}';
}

function context(index: number, durationMs: number, theme: Theme, print: boolean) {
  const steps = execution!.steps;
  return { previous: steps[index - 1], next: steps[index + 1], index, total: steps.length, input: execution!.input, operation: execution!.operation, durationMs, theme, print };
}

/** Convierte el dibujo en un SVG autónomo (con sus estilos) para incrustarlo como imagen en un documento. */
function standaloneSvg(markup: string) {
  const source = markup.trim().replace(/^<svg(?![^>]*\sxmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = document.documentElement;
  if (root.nodeName !== 'svg' || document.getElementsByTagName('parsererror').length) throw new Error('El dibujo no es un SVG válido, así que no se puede imprimir.');
  const box = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (!root.getAttribute('width') && box.length === 4) { root.setAttribute('width', String(box[2])); root.setAttribute('height', String(box[3])); }
  root.removeAttribute('style');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = sandboxCss('light', 'svg') + referenceCss;
  root.insertBefore(style, root.firstChild);
  return new XMLSerializer().serializeToString(document);
}

const actions: Record<string, (payload: any) => unknown> = {
  async load({ code, css, options }: { code: string; css?: string; options?: Record<string, unknown> }) {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try { definition = loadDefinition(await import(/* @vite-ignore */ url)); }
    finally { URL.revokeObjectURL(url); }
    referenceCss = css || '';
    ownStyle.textContent = referenceCss;
    const initial = inputFromSpec(definition, options || {});
    form = initial.values;
    return { meta: plain(definitionMeta(definition)), form, warning: initial.warning };
  },
  run({ form: values, operation, params }: { form: FieldValues; operation: string; params: FieldValues }) {
    execution = execute(required(), values, operation, params);
    form = fieldValues(required().inputs, values);
    return execution.steps.map(step => plain(step));
  },
  render({ index, durationMs, theme }: { index: number; durationMs: number; theme: Theme }) {
    if (!execution) throw new Error('Ejecuta una operación antes de dibujar.');
    setTheme(theme);
    document.documentElement.style.setProperty('--viz-step-ms', `${durationMs}ms`);
    const step = execution.steps[index];
    if (!step) throw new Error(`No existe el paso ${index + 1}.`);
    stage.innerHTML = String(required().render(step, context(index, durationMs, theme, false)) ?? '');
    return null;
  },
  commit() {
    const current = required();
    if (!current.commit || !execution) throw new Error('Esta operación no se puede conservar.');
    form = fieldValues(current.inputs, current.commit(execution.input, execution.operation, execution.params));
    return { form };
  },
  snapshot({ form: values }: { form?: FieldValues }) {
    const current = required();
    if (current.print === false) return { svg: null };
    execution = execute(current, values || form, current.print?.operation);
    const index = execution.steps.length - 1;
    return { svg: standaloneSvg(String(current.render(execution.steps[index], context(index, 0, 'light', true)) ?? '')) };
  }
};

new ResizeObserver(() => port?.postMessage({ type: 'size', height: Math.ceil(document.documentElement.getBoundingClientRect().height) })).observe(document.documentElement);
addEventListener('keydown', (event: KeyboardEvent) => {
  if (['ArrowLeft', 'ArrowRight', ' ', 'Home'].includes(event.key)) { event.preventDefault(); port?.postMessage({ type: 'key', key: event.key }); }
});
addEventListener('message', event => {
  if (port || event.data?.type !== 'connect' || !event.ports[0]) return;
  port = event.ports[0];
  port.onmessage = async ({ data }) => {
    const { id, type, payload } = data || {};
    try {
      if (!actions[type]) throw new Error(`Acción desconocida: ${type}`);
      port!.postMessage({ id, ok: true, value: await actions[type](payload) });
    } catch (error) {
      port!.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  port.postMessage({ type: 'ready' });
});
setTheme('dark');
