// Motor de pasos: lógica pura del reproductor y de la ejecución de una visualización.
import type { Field, FieldValue, FieldValues, Step, VisualizationDefinition, VisualizationSpec } from './types.js';

export const baseStepMs = 900;
export const speeds = [0.5, 1, 2, 4];
export const stepDuration = (speed: number) => baseStepMs / speed;

export type PlayerState = { index: number; total: number; playing: boolean; speed: number };
export type PlayerAction =
  | { type: 'next' } | { type: 'prev' } | { type: 'reset' } | { type: 'toggle' } | { type: 'tick' }
  | { type: 'seek'; index: number } | { type: 'speed'; speed: number } | { type: 'load'; total: number };

export const initialPlayer = (total: number): PlayerState => ({ index: 0, total: Math.max(0, total), playing: false, speed: 1 });

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  const last = Math.max(0, state.total - 1);
  const clamp = (index: number) => Math.max(0, Math.min(last, Math.trunc(index) || 0));
  switch (action.type) {
    case 'next': return { ...state, index: clamp(state.index + 1) };
    case 'prev': return { ...state, index: clamp(state.index - 1) };
    case 'seek': return { ...state, index: clamp(action.index) };
    case 'reset': return { ...state, index: 0, playing: false };
    case 'toggle': return state.playing ? { ...state, playing: false } : { ...state, playing: state.total > 1, index: state.index >= last ? 0 : state.index };
    // Avance automático: se detiene solo al llegar al último paso.
    case 'tick': return !state.playing ? state : state.index >= last ? { ...state, playing: false } : { ...state, index: state.index + 1, playing: state.index + 1 < last };
    case 'speed': return { ...state, speed: action.speed > 0 ? action.speed : state.speed };
    case 'load': return { ...state, index: 0, playing: false, total: Math.max(0, action.total) };
  }
}

/** Comprueba que `run` devolvió pasos utilizables. */
export function validateSteps(steps: unknown, id = 'visualización'): Step[] {
  if (!Array.isArray(steps) || !steps.length) throw new Error(`La visualización «${id}» no produjo ningún paso.`);
  steps.forEach((step, index) => {
    if (!step || typeof step !== 'object' || !('state' in step) || step.state === undefined || step.state === null || typeof step.message !== 'string')
      throw new Error(`La visualización «${id}» produjo un paso no válido (paso ${index + 1}): cada paso necesita «state» y «message».`);
  });
  return steps as Step[];
}

const coerce = (field: Field, value: unknown): FieldValue => {
  if (field.kind === 'integer') return typeof value === 'number' ? value : String(value ?? '').trim() === '' ? NaN : Number(value);
  const text = String(value ?? '');
  return field.kind === 'select' && !field.options?.some(option => option.value === text) ? field.default : text;
};

/** Valores de un formulario: los valores por defecto de cada campo más los que se indiquen. */
export function fieldValues(fields: Field[], overrides: Partial<FieldValues> = {}): FieldValues {
  return Object.fromEntries(fields.map(field => [field.name, overrides[field.name] === undefined ? field.default : coerce(field, overrides[field.name])]));
}

export const findOperation = (definition: VisualizationDefinition, id?: string) => definition.operations.find(operation => operation.id === id) || definition.operations[0];

export type Execution = { input: unknown; operation: string; params: FieldValues; steps: Step[] };

/** Valida la entrada, ejecuta la operación y valida los pasos. Lanza `Error` con un mensaje para el usuario. */
export function execute(definition: VisualizationDefinition, inputValues: Partial<FieldValues> = {}, operationId?: string, params: Partial<FieldValues> = {}): Execution {
  const operation = findOperation(definition, operationId);
  if (!operation) throw new Error(`La visualización «${definition.id}» no tiene operaciones.`);
  const input = definition.parseInput(fieldValues(definition.inputs, inputValues));
  const values = fieldValues(operation.fields, params);
  for (const field of operation.fields) if (field.kind === 'integer' && !Number.isInteger(values[field.name])) throw new Error(`«${field.label}» debe ser un número entero.`);
  return { input, operation: operation.id, params: values, steps: validateSteps(definition.run(input, operation.id, values), definition.id) };
}

/** Valores de entrada declarados en `metadata.yaml`; si no son válidos se usan los de ejemplo y se avisa. */
export function inputFromSpec(definition: VisualizationDefinition, spec?: VisualizationSpec): { values: FieldValues; warning?: string } {
  const defaults = fieldValues(definition.inputs);
  if (!spec || !Object.keys(spec.options || {}).length) return { values: defaults };
  try {
    const values = fieldValues(definition.inputs, definition.inputFromSpec ? definition.inputFromSpec(spec.options) : (spec.options as FieldValues));
    definition.parseInput(values);
    return { values };
  } catch (error) {
    return { values: defaults, warning: `Los datos declarados para «${definition.id}» no son válidos (${(error as Error).message}); se usan los valores de ejemplo.` };
  }
}
