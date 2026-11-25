// Contrato entre el motor de visualizaciones (esta aplicación) y los archivos `*.viz.js` de cada referencia.
// No depende de React ni del DOM: lo usan la interfaz, el entorno aislado, el generador de documentos y las pruebas.

/** Visualización de una referencia: el archivo `*.viz.js` y las opciones declaradas en `metadata.yaml`. */
export type VisualizationSpec = {
  /** Ruta completa del archivo `*.viz.js` dentro de la biblioteca. */
  file: string;
  /** Hoja de estilos opcional junto al archivo (`<nombre>.viz.css`). */
  css?: string;
  title?: string;
  /** Todo lo declarado en `metadata.yaml` salvo `file` y `title` (por ejemplo `values`, `operation`). */
  options: Record<string, unknown>;
};

export type FieldValue = string | number;
export type FieldValues = Record<string, FieldValue>;

/** Campo de formulario que el motor dibuja. */
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

/** Lo que emite el algoritmo. `type` es obligatorio; el resto de claves las define cada visualización. */
export type ExecutionEvent = { type: string; [key: string]: unknown };

/** Un paso de la animación. `state` es el estado completo que necesita el dibujo (datos planos, serializables). */
export type Step<State = unknown> = {
  state: State;
  /** Explicación del paso, en texto plano. */
  message: string;
  /** Evento del algoritmo que produjo el paso (opcional, se ve en «Datos del paso»). */
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

/** Datos del dibujo de un paso. */
export type RenderContext<State = any, Input = any> = {
  previous?: Step<State>;
  next?: Step<State>;
  index: number;
  total: number;
  input: Input;
  operation: string;
  /** Duración de un paso en milisegundos con la velocidad actual. */
  durationMs: number;
  theme: 'dark' | 'light';
  /** `true` al generar la imagen estática para un documento impreso. */
  print: boolean;
};

/** Lo que devuelve la función exportada por un archivo `*.viz.js`. */
export type VisualizationDefinition<Input = any, State = any> = {
  title: string;
  description?: string;
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
  commit?(input: Input, operation: string, params: FieldValues): Partial<FieldValues>;
  /** Dibuja un paso. Devuelve SVG o HTML como texto (o el resultado de `viz.h`). */
  render(step: Step<State>, context: RenderContext<State, Input>): unknown;
  /** Operación cuyo último paso se imprime en los documentos; por defecto, la primera. `false` no la imprime. */
  print?: { operation?: string } | false;
};

/** Datos de la definición que el entorno aislado envía al motor (sin funciones). */
export type VisualizationMeta = Pick<VisualizationDefinition, 'title' | 'description' | 'inputs' | 'operations' | 'legend'> & { commit: boolean };
