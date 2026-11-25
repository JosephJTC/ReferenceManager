// Lado del motor: crea el iframe aislado que ejecuta un archivo `*.viz.js` y habla con él por un MessagePort.
import type { FieldValues, Step, VisualizationMeta } from './types.js';

export const sandboxUrl = () => new URL('viz-sandbox.html', document.baseURI).href;

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class VisualizationSandbox {
  readonly frame: HTMLIFrameElement;
  onSize?: (height: number) => void;
  onKey?: (key: string) => void;
  private port?: MessagePort;
  private readonly ready: Promise<void>;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;

  constructor(container: HTMLElement, { timeoutMs = 10000 } = {}) {
    const frame = this.frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.className = 'viz-frame';
    frame.title = 'Dibujo de la visualización';
    this.timeoutMs = timeoutMs;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No se pudo iniciar el entorno aislado de la visualización.')), 15000);
      frame.addEventListener('load', () => {
        const channel = new MessageChannel();
        this.port = channel.port1;
        this.port.onmessage = ({ data }) => {
          if (data?.type === 'ready') { clearTimeout(timer); resolve(); }
          else if (data?.type === 'size') this.onSize?.(Number(data.height) || 0);
          else if (data?.type === 'key') this.onKey?.(String(data.key));
          else this.settle(data);
        };
        frame.contentWindow?.postMessage({ type: 'connect' }, '*', [channel.port2]);
      }, { once: true });
    });
    frame.src = sandboxUrl();
    container.append(frame);
  }
  private readonly timeoutMs: number;

  private settle(data: { id?: number; ok?: boolean; value?: unknown; error?: string }) {
    const entry = data?.id !== undefined ? this.pending.get(data.id) : undefined;
    if (!entry) return;
    this.pending.delete(data.id!);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.value); else entry.reject(new Error(data.error || 'Error desconocido en la visualización.'));
  }

  async request<T>(type: string, payload?: unknown): Promise<T> {
    await this.ready;
    if (this.closed || !this.port) throw new Error('La visualización se cerró.');
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('La visualización tardó demasiado en responder (¿un bucle infinito en el archivo .viz.js?).'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.port!.postMessage({ id, type, payload });
    });
  }

  load(code: string, css: string | undefined, options: Record<string, unknown>) {
    return this.request<{ meta: VisualizationMeta; form: FieldValues; warning?: string }>('load', { code, css, options });
  }
  run(form: FieldValues, operation: string, params: FieldValues) { return this.request<Step[]>('run', { form, operation, params }); }
  render(index: number, durationMs: number, theme: 'dark' | 'light') { return this.request<null>('render', { index, durationMs, theme }); }
  commit() { return this.request<{ form: FieldValues }>('commit'); }
  snapshot(form?: FieldValues) { return this.request<{ svg: string | null }>('snapshot', { form }); }

  destroy() {
    this.closed = true;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('La visualización se cerró.')); }
    this.pending.clear();
    this.port?.close();
    this.frame.remove();
  }
}

/** Genera la imagen SVG para imprimir una visualización (último paso de su operación de impresión). */
export async function visualizationSnapshot(code: string, css: string | undefined, options: Record<string, unknown>) {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:900px;height:600px;visibility:hidden';
  document.body.append(holder);
  const sandbox = new VisualizationSandbox(holder);
  try {
    const { meta } = await sandbox.load(code, css, options);
    return { title: meta.title, svg: (await sandbox.snapshot()).svg };
  } finally { sandbox.destroy(); holder.remove(); }
}
