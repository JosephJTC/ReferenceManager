// Dibujo de cada visualización, cargado solo cuando se abre. La clave es el `id` de su definición.
// Va en un archivo aparte de index.ts porque el generador de documentos (worker) usa las
// definiciones pero no debe cargar React.
import type { ComponentType } from 'react';
import type { RendererProps } from './core/types.js';

export const renderers: Record<string, () => Promise<{ default: ComponentType<RendererProps> }>> = {
  'segment-tree': () => import('./data_structures/segment_tree/renderer.js'),
  'fenwick-tree': () => import('./data_structures/fenwick_tree/renderer.js'),
  dsu: () => import('./data_structures/dsu/renderer.js')
};
