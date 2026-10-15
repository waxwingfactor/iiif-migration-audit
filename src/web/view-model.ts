import type { JsonValue } from '../core/types';

export type Side = 'baseline' | 'candidate';
export type Section = 'findings' | 'pages' | 'coverage';
export type Failure = { code: string; message: string; pointer?: string };
export type Inspector = { side: Side; pointer: string | null };
export const categoryLabels: Record<string, string> = {
  identity: 'Identity',
  pages: 'Pages',
  description: 'Description',
  rights: 'Rights',
  navigation: 'Navigation',
  content: 'Content',
  coverage: 'Coverage',
};
export const statusLabels = {
  pass: 'No unresolved changes in assessed content',
  review: 'Changes need review',
  fail: 'Preservation changes need attention',
  incomplete: 'Assessment is incomplete',
};

export function valueText(value: JsonValue) {
  return value === null
    ? 'Not present'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);
}
