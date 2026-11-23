// Galería: lista todas las visualizaciones registradas, sin depender de ninguna referencia.
import { useState } from 'react';
import { visualizations } from '../index.js';
import { VisualizationHost } from './VisualizationHost.js';

export function VisualizationGallery() {
  const list = visualizations.list();
  const [id, setId] = useState(list[0]?.id);
  const definition = id ? visualizations.get(id) : undefined;
  if (!definition) return <p className="muted">No hay visualizaciones registradas.</p>;
  return <>
    <select aria-label="Visualización" value={definition.id} onChange={event => setId(event.target.value)}>{list.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    <p className="muted">{definition.description}</p>
    <VisualizationHost key={definition.id} definition={definition} />
  </>;
}
