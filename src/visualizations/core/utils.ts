// Utilidades que el motor entrega a cada archivo `*.viz.js` como argumento `viz` (sin React ni DOM).
import type { FieldValues } from './types.js';

export const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Convierte «1, 2 3;4» en enteros. Lanza un error legible si algo no es un entero o hay demasiados. */
export function parseIntegers(text: string, { max = 16, maxAbs = 1e9 } = {}): number[] {
  const values = String(text).split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!values.length || values.some(value => !Number.isInteger(value) || Math.abs(value) > maxAbs)) throw new Error('Escribe enteros separados por comas o espacios.');
  if (values.length > max) throw new Error(`Usa como máximo ${max} valores.`);
  return values;
}

/** Lee un parámetro entero y comprueba su rango. */
export function integerParam(params: FieldValues, name: string, label: string, min: number, max: number): number {
  const value = Number(params[name]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} debe estar entre ${min} y ${max}.`);
  return value;
}

/** Texto de un intervalo cerrado: `[3]` o `[2, 5]`. */
export const interval = (lo: number, hi: number) => lo === hi ? `[${lo}]` : `[${lo}, ${hi}]`;

/** Números de una opción de `metadata.yaml` (`values: [1, 2, 3]`) como texto para un campo. */
export const numbersToText = (value: unknown) => Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)).join(', ') : typeof value === 'string' ? value : undefined;

export type Point = { x: number; y: number };

/**
 * Posiciones para dibujar un bosque dado como arreglo de padres (`parent[i] === i` en las raíces).
 * Las hojas ocupan columnas consecutivas y cada nodo interno se centra sobre sus hijos.
 */
export function layoutForest(parent: number[], { cell = 56, level = 64, margin = 28 } = {}) {
  const children = parent.map(() => [] as number[]);
  const roots: number[] = [];
  parent.forEach((up, node) => (up === node ? roots : children[up]).push(node));
  const positions: Point[] = parent.map(() => ({ x: 0, y: 0 }));
  let column = 0, depthMax = 0;
  const place = (node: number, depth: number): number => {
    depthMax = Math.max(depthMax, depth);
    const xs = children[node].map(child => place(child, depth + 1));
    const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : margin + column++ * cell;
    positions[node] = { x, y: margin + depth * level };
    return x;
  };
  roots.forEach(root => place(root, 0));
  return { positions, roots, children, width: Math.max(1, column - 1) * cell + margin * 2, height: depthMax * level + margin * 2 };
}

/** Texto que `h` inserta sin escapar. */
export class Markup {
  constructor(readonly html: string) {}
  toString() { return this.html; }
}

const piece = (value: unknown): string => value instanceof Markup ? value.html : Array.isArray(value) ? value.map(piece).join('') : value === null || value === undefined || value === false ? '' : escapeXml(String(value));

/** Plantilla segura para SVG/HTML: los valores interpolados se escapan; listas y resultados de `h` se insertan tal cual. */
export function h(strings: TemplateStringsArray, ...values: unknown[]): Markup {
  return new Markup(strings.reduce((out, text, index) => out + piece(values[index - 1]) + text));
}

type CellOptions = { x?: number; y?: number; cell?: number; height?: number; className?: (index: number) => string; label?: (index: number) => string };

/** Fila de celdas SVG para un arreglo: valor dentro y etiqueta (índice) debajo. Clases: `viz-cell` más `className(i)`. */
export function arrayCells(values: unknown[], { x = 0, y = 0, cell = 48, height = 32, className = () => '', label = index => String(index) }: CellOptions = {}): Markup {
  return h`<g class="viz-array">${values.map((value, index) => {
    const left = x + index * cell;
    return h`<g class="viz-cell ${className(index)}"><rect x="${left + 3}" y="${y}" width="${cell - 6}" height="${height}" rx="4"/><text x="${left + cell / 2}" y="${y + height / 2 + 4}" class="viz-value">${value}</text><text x="${left + cell / 2}" y="${y + height + 12}" class="viz-caption">${label(index)}</text></g>`;
  })}</g>`;
}

/** Herramientas que recibe la función exportada por un archivo `*.viz.js`. */
export const toolkit = { h, raw: (html: string) => new Markup(String(html)), escape: escapeXml, parseIntegers, integerParam, interval, numbersToText, layoutForest, arrayCells };
export type Toolkit = typeof toolkit;
