import type { VisualizationDefinition } from './types.js';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export type VisualizationRegistry = ReturnType<typeof createRegistry>;

export function createRegistry() {
  const definitions = new Map<string, VisualizationDefinition>();
  return {
    register(definition: VisualizationDefinition) {
      const id = definition.id?.toLowerCase();
      if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error(`Identificador de visualización no válido: «${definition.id}».`);
      if (definitions.has(id)) throw new Error(`La visualización «${id}» ya está registrada.`);
      if (!definition.operations?.length) throw new Error(`La visualización «${id}» debe declarar al menos una operación.`);
      definitions.set(id, definition);
      return definition;
    },
    unregister: (id: string) => definitions.delete(id.toLowerCase()),
    get: (id: string) => definitions.get(String(id).toLowerCase()),
    has: (id: string) => definitions.has(String(id).toLowerCase()),
    list: () => [...definitions.values()],
    /** Visualizaciones cuyo identificador o alias aparece como palabra completa en el texto. */
    match(text: string) {
      const haystack = ` ${normalize(text)} `;
      return [...definitions.values()].filter(definition => [definition.id, ...(definition.aliases || [])].some(alias => haystack.includes(` ${normalize(alias)} `)));
    }
  };
}
