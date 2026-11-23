import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { VisualizationSpec } from '../../shared/reading.js';

export type VisualizationProps = { spec: VisualizationSpec };
export type VisualizationEntry = { type: string; title: string; description: string; component: LazyExoticComponent<ComponentType<VisualizationProps>> };

// Para añadir una visualización (Fenwick, DSU, BFS…): crea un componente que reciba VisualizationProps
// y regístralo aquí con su identificador; las referencias lo activan con `visualizations: [tipo]` en metadata.yaml.
export const visualizationRegistry: Record<string, VisualizationEntry> = {
  'segment-tree': {
    type: 'segment-tree', title: 'Segment Tree', description: 'Construcción, consulta de intervalos y actualización puntual paso a paso.',
    component: lazy(() => import('./SegmentTreeView.js'))
  }
};
export const findVisualization = (type: string) => visualizationRegistry[type.toLowerCase()];
