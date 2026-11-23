// Contrato común de las visualizaciones. Este archivo no depende de React ni del DOM:
// lo usan la interfaz, el generador de documentos (worker) y las pruebas.

/** Declaración de una visualización en `metadata.yaml` (`visualizations: [...]`). */
export type VisualizationSpec = { type: string; title?: string; options: Record<string, unknown> };

export type FieldValue = string | number;
export type FieldValues = Record<string, FieldValue>;

/** Campo de formulario que el contenedor dibuja por ti. */
export type Field = {
  name: string;
  label: string;
  /** Texto accesible; por defecto se usa `label`. */
  ariaLabel?: string;
  /** `text` entrega string, `integer` entrega number y `select` entrega el `value` elegido. */
  kind: 'text' | 'integer' | 'select';
  default: FieldValue;
  options?: { value: string; label: string }[];
};

/** Lo que emite el algoritmo. `type` es obligatorio; el resto de claves las define cada algoritmo. */
export type ExecutionEvent = { type: string; [key: string]: unknown };

/**
 * Un paso de la animación. `state` es el estado completo que necesita el dibujo en ese instante
 * (datos planos serializables a JSON); cada visualización define su forma.
 */
export type Step<State = unknown> = {
  state: State;
  /** Explicación del paso, en texto plano. */
  message: string;
  /** Evento del algoritmo que produjo el paso (opcional, útil para depurar). */
  event?: ExecutionEvent;
  /** Resultado parcial o final que se muestra junto a la explicación (opcional). */
  result?: string;
};

export type Operation = {
  id: string;
  label: string;
  /** Parámetros de la operación (por ejemplo `l` y `r` de una consulta). */
  fields: Field[];
  /** Si existe, al llegar al último paso aparece un botón con este texto que llama a `commit`. */
  commitLabel?: string;
};

/** Entrada de la leyenda. `state` es una clase CSS: active, visited, used, skipped, range o una propia. */
export type LegendItem = { state: string; label: string };

export type VisualizationDefinition<Input = any, State = any> = {
  /** Identificador único en kebab-case; es el `type` que se escribe en `metadata.yaml`. */
  id: string;
  title: string;
  description: string;
  /** Palabras que activan la visualización si aparecen en el título, la carpeta o las etiquetas de una referencia. */
  aliases?: string[];
  /** Datos de entrada (arreglo inicial, tamaño…). */
  inputs: Field[];
  /** Operaciones disponibles; la primera se ejecuta al abrir. Debe haber al menos una. */
  operations: Operation[];
  legend?: LegendItem[];
  /** Valida los campos de `inputs` y devuelve la entrada tipada. Lanza `Error` con un mensaje para el usuario. */
  parseInput(values: FieldValues): Input;
  /** Convierte las opciones de `metadata.yaml` en valores de `inputs`. Las claves que falten usan su `default`. */
  inputFromSpec?(options: Record<string, unknown>): Partial<FieldValues>;
  /** Ejecuta el algoritmo y devuelve los pasos (al menos uno). Lanza `Error` si los parámetros no son válidos. */
  run(input: Input, operation: string, params: FieldValues): Step<State>[];
  /** Devuelve los nuevos valores de `inputs` tras conservar el efecto de una operación con `commitLabel`. */
  commit?(input: Input, operation: string, params: FieldValues): FieldValues;
  /** Imagen estática para el generador de documentos. */
  staticSvg?(input: Input): { svg: string; caption?: string };
};

/** Propiedades que recibe el componente de dibujo (`renderer.tsx`). */
export type RendererProps<State = any, Input = any> = {
  step: Step<State>;
  previous?: Step<State>;
  next?: Step<State>;
  index: number;
  total: number;
  playing: boolean;
  /** Duración de un paso en milisegundos con la velocidad actual. */
  durationMs: number;
  input: Input;
  operation: string;
};
