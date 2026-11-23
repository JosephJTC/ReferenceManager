// Registro de visualizaciones disponibles. Para añadir una: importa su definición y regístrala aquí,
// y añade su dibujo en renderers.ts. Guía completa: docs/VISUALIZATION_GUIDE.md.
import { createRegistry } from './core/registry.js';
import { segmentTree } from './data_structures/segment_tree/visualization.js';
import { fenwickTree } from './data_structures/fenwick_tree/visualization.js';
import { dsu } from './data_structures/dsu/visualization.js';

export const visualizations = createRegistry();
visualizations.register(segmentTree);
visualizations.register(fenwickTree);
visualizations.register(dsu);

export type { VisualizationSpec, VisualizationDefinition, Step, ExecutionEvent, RendererProps, Field, FieldValues, Operation } from './core/types.js';
