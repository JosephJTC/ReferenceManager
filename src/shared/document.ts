import { z } from 'zod';

export const documentSettingsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().max(500),
  author: z.string().max(200),
  paper: z.enum(['A4', 'Letter', 'A5']),
  margin: z.number().min(8).max(35),
  fontSize: z.number().min(8).max(16),
  codeFontSize: z.number().min(6).max(14),
  lineHeight: z.number().min(1).max(1.8),
  columns: z.union([z.literal(1), z.literal(2)]),
  toc: z.boolean(),
  descriptions: z.boolean(),
  notes: z.boolean(),
  code: z.boolean(),
  subtitles: z.boolean(),
  lineNumbers: z.boolean(),
  highlighting: z.boolean(),
  pageBreaks: z.boolean(),
  pageNumbers: z.boolean(),
  header: z.string().max(200),
  footer: z.string().max(200),
  metadataKeys: z.array(z.string().max(100)).max(100)
}).strict();
export type DocumentSettings = z.infer<typeof documentSettingsSchema>;
export const defaultDocumentSettings: DocumentSettings = {
  title: 'Referencia de programación competitiva', subtitle: '', author: '', paper: 'A4',
  margin: 16, fontSize: 10, codeFontSize: 8, lineHeight: 1.3, columns: 1,
  toc: true, descriptions: true, notes: true, code: true, subtitles: true,
  lineNumbers: true, highlighting: true, pageBreaks: false, pageNumbers: true,
  header: 'Referencia de programación competitiva', footer: '',
  metadataKeys: ['complexity', 'constraints', 'tags', 'language', 'source', 'url', 'author', 'difficulty']
};
export const compactDocumentSettings: DocumentSettings = {
  ...defaultDocumentSettings, margin: 10, fontSize: 8, codeFontSize: 6.5, lineHeight: 1.1, columns: 2
};
export type DocumentRequest = { selected: string[]; settings: DocumentSettings };
export type TocEntry = { id: string; title: string; depth: number; page: number };
export type DocumentPreview = { id: string; html: string; pages: number; toc: TocEntry[]; warnings: string[]; filename: string };
export { metadataLabels } from './metadata-labels.js';
export const canonicalPath = (path: string) => path.replaceAll('\\', '/');
export const isWithin = (reference: string, folder: string) => !folder || canonicalPath(reference) === canonicalPath(folder) || canonicalPath(reference).startsWith(canonicalPath(folder) + '/');
