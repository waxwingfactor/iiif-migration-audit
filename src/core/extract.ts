import { AuditError, escapePointer, isObject, MAX_CANVASES, stableStringify } from './parser';
import type {
  Category,
  CoverageNotice,
  JsonObject,
  JsonValue,
  PresentationVersion,
  UriScope,
} from './types';

export interface Fact {
  value: JsonValue;
  pointer: string;
  category: Category;
  scope?: UriScope;
}
export interface Entity {
  id: string;
  idPointer: string;
  pointer: string;
  label: string;
  facts: Map<string, Fact>;
}
export interface Snapshot {
  version: PresentationVersion | 'unsupported';
  id: string | null;
  label: string;
  facts: Map<string, Fact>;
  canvases: Entity[];
  ranges: Entity[];
  coverage: CoverageNotice[];
}
const list = (value: JsonValue | undefined): JsonValue[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const identifier = (value: JsonValue | undefined): string | null =>
  typeof value === 'string'
    ? value
    : isObject(value) && typeof (value.id ?? value['@id']) === 'string'
      ? String(value.id ?? value['@id'])
      : null;
const itemPath = (value: JsonValue | undefined, path: string, index: number): string =>
  Array.isArray(value) ? `${path}/${index}` : path;
const localType = (value: JsonValue | undefined): string =>
  typeof value === 'string' ? value.replace(/^(sc:|oa:|dctypes:)/, '') : '';
const commonKeys = [
  '@context',
  '@id',
  'id',
  '@type',
  'type',
  'label',
  'description',
  'summary',
  'metadata',
  'attribution',
  'requiredStatement',
  'license',
  'rights',
  'related',
  'homepage',
  'within',
  'partOf',
  'seeAlso',
  'rendering',
  'thumbnail',
  'logo',
  'service',
  'services',
  'viewingDirection',
  'viewingHint',
  'behavior',
  'startCanvas',
  'start',
  'navDate',
  'provider',
];
const refKeys = [
  'id',
  '@id',
  'type',
  '@type',
  'label',
  'format',
  'profile',
  'service',
  'height',
  'width',
  'duration',
  'protocol',
  '@context',
  'logo',
  'homepage',
  'seeAlso',
];

export function extract(document: JsonObject, side: 'baseline' | 'candidate'): Snapshot {
  const snapshot: Snapshot = {
    version: 'unsupported',
    id: identifier(document),
    label: '',
    facts: new Map(),
    canvases: [],
    ranges: [],
    coverage: [],
  };
  const seenCoverage = new Set<string>();
  const notice = (pointer: string, code: string, message: string): void => {
    const key = `${pointer}:${code}`;
    if (!seenCoverage.has(key)) {
      if (snapshot.coverage.length >= 10_000)
        throw new AuditError(
          'COVERAGE_BUDGET',
          'This manifest exceeds the 10,000-notice coverage budget. Reduce the input or review its unsupported profile separately.',
          pointer,
        );
      snapshot.coverage.push({ side, pointer, code, message });
      seenCoverage.add(key);
    }
  };
  const keys = (node: JsonObject, allowed: string[], path: string): void => {
    for (const key of Object.keys(node))
      if (!allowed.includes(key))
        notice(
          `${path}/${escapePointer(key)}`,
          'UNASSESSED_PROPERTY',
          `Property ${key} is outside the assessed profile; its meaning was not assumed preserved.`,
        );
    if (node.id !== undefined && node['@id'] !== undefined)
      notice(path, 'AMBIGUOUS_IDENTIFIER', 'Both id and @id occur on the same object.');
    if (node.type !== undefined && node['@type'] !== undefined)
      notice(path, 'AMBIGUOUS_TYPE', 'Both type and @type occur on the same object.');
  };
  const language = (value: JsonValue | undefined, path: string): JsonValue => {
    const languages: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
    const add = (lang: string, text: JsonValue, pointer: string): void => {
      lang = lang.toLowerCase();
      if (typeof text !== 'string') {
        notice(pointer, 'UNSUPPORTED_TEXT', 'Expected a string in this language value.');
        return;
      }
      const current = languages[lang];
      if (Array.isArray(current)) current.push(text);
      else languages[lang] = [text];
    };
    const visit = (part: JsonValue | undefined, pointer: string): void => {
      if (typeof part === 'string') add('none', part, pointer);
      else if (Array.isArray(part))
        part.forEach((entry, index) => visit(entry, `${pointer}/${index}`));
      else if (isObject(part)) {
        if (part['@value'] !== undefined) {
          keys(part, ['@value', '@language'], pointer);
          if (part['@language'] !== undefined && typeof part['@language'] !== 'string')
            notice(pointer, 'UNSUPPORTED_LANGUAGE_TAG', 'Language tag must be a string.');
          add(
            typeof part['@language'] === 'string' ? part['@language'] : 'none',
            part['@value'],
            pointer,
          );
        } else
          for (const [lang, values] of Object.entries(part)) {
            if (!Array.isArray(values))
              notice(
                `${pointer}/${escapePointer(lang)}`,
                'UNSUPPORTED_LANGUAGE_MAP',
                'Language-map entries must contain arrays.',
              );
            for (const [index, text] of list(values).entries())
              add(lang, text, `${pointer}/${escapePointer(lang)}/${index}`);
          }
      } else if (part !== undefined)
        notice(pointer, 'UNSUPPORTED_TEXT', 'Expected language-map or Presentation 2 text.');
    };
    visit(value, path);
    return languages;
  };
  const readable = (value: JsonValue): string =>
    isObject(value)
      ? Object.values(value)
          .flatMap((item) => (Array.isArray(item) ? item : []))
          .filter((item) => typeof item === 'string')
          .join(' / ')
      : '';
  const reference = (value: JsonValue, path: string, scope: UriScope): JsonValue => {
    if (typeof value === 'string') return { id: value };
    if (!isObject(value)) {
      notice(path, 'UNSUPPORTED_REFERENCE', 'Expected a URI or reference object.');
      return value;
    }
    keys(value, refKeys, path);
    if (value.duration !== undefined)
      notice(
        `${path}/duration`,
        'TIME_BASED_RESOURCE',
        'Time-based content descriptors require review.',
      );
    if (isObject(value.profile) || (Array.isArray(value.profile) && value.profile.some(isObject)))
      notice(
        `${path}/profile`,
        'COMPLEX_SERVICE_PROFILE',
        'Embedded service profile objects are outside the assessed profile.',
      );
    if (
      value['@context'] !== undefined &&
      list(value['@context']).some(
        (entry) =>
          typeof entry !== 'string' ||
          !/^https?:\/\/iiif\.io\/api\/(image|presentation)\/[123]\/context\.json$/.test(entry),
      )
    )
      notice(
        `${path}/@context`,
        'EXTENSION_CONTEXT',
        'Reference context semantics are not assessed.',
      );
    const id = identifier(value);
    if (!id) notice(path, 'MISSING_REFERENCE_ID', 'Reference has no unambiguous identifier.');
    const result: JsonObject = {};
    if (id) result.id = id;
    const type = localType(value.type ?? value['@type']);
    if (type) result.type = type === 'AnnotationList' ? 'AnnotationPage' : type;
    if (value.label !== undefined) result.label = language(value.label, `${path}/label`);
    for (const key of ['format', 'height', 'width', 'duration', 'protocol'])
      if (value[key] !== undefined) result[key] = value[key]!;
    if (value.profile !== undefined)
      result.profile = list(value.profile).map((entry) =>
        typeof entry === 'string'
          ? entry.replace(/^https?:\/\/iiif\.io\/api\/image\/[123]\/(level[012])\.json$/, '$1')
          : entry,
      );
    if (value.service !== undefined)
      result.services = list(value.service).map((entry, index) =>
        reference(entry, itemPath(value.service, `${path}/service`, index), 'image-service'),
      );
    for (const key of ['logo', 'homepage', 'seeAlso'])
      if (value[key] !== undefined)
        result[key] = list(value[key]).map((entry, index) =>
          reference(
            entry,
            itemPath(value[key], `${path}/${key}`, index),
            key === 'logo' ? 'image' : 'link',
          ),
        );
    if (scope === 'image-service') {
      // Normalize declaration syntax while retaining the Image API major version.
      const versions = new Set<string>();
      const declared = /^ImageService([123])$/.exec(type)?.[1];
      if (declared) versions.add(declared);
      for (const hint of [...list(value['@context']), ...list(value.profile)]) {
        if (typeof hint === 'string') {
          const version = /^https?:\/\/iiif\.io\/api\/image\/([123])\//.exec(hint)?.[1];
          if (version) versions.add(version);
        }
      }
      if (versions.size !== 1)
        notice(
          path,
          'AMBIGUOUS_IMAGE_API_VERSION',
          'Image service version is missing or conflicting; protocol equivalence was not assumed.',
        );
      else result.imageApiVersion = [...versions][0]!;
      if (type && !['ImageService1', 'ImageService2', 'ImageService3', 'Service'].includes(type))
        notice(path, 'UNSUPPORTED_IMAGE_SERVICE', `Unrecognized image service type ${type}.`);
      delete result.type;
    }
    return result;
  };
  const refs = (value: JsonValue | undefined, path: string, scope: UriScope): JsonValue =>
    list(value).map((entry, index) => reference(entry, itemPath(value, path, index), scope));
  const fact = (
    facts: Map<string, Fact>,
    key: string,
    value: JsonValue | undefined,
    pointer: string,
    category: Category,
    scope?: UriScope,
  ): void => {
    if (value !== undefined)
      facts.set(key, { value, pointer, category, ...(scope ? { scope } : {}) });
  };
  const common = (node: JsonObject, path: string): Map<string, Fact> => {
    const facts = new Map<string, Fact>();
    if (path && node['@context'] !== undefined) {
      const expected = `http://iiif.io/api/presentation/${snapshot.version === '2.1' ? '2' : '3'}/context.json`;
      if (
        list(node['@context']).some(
          (entry) => entry !== expected && entry !== expected.replace('http:', 'https:'),
        )
      )
        notice(
          `${path}/@context`,
          'LOCAL_CONTEXT',
          'Local JSON-LD context semantics are outside this extraction profile.',
        );
    }
    const wrongVersionKeys =
      snapshot.version === '2.1'
        ? ['summary', 'rights', 'homepage', 'partOf', 'requiredStatement', 'behavior', 'start']
        : [
            'description',
            'license',
            'related',
            'within',
            'attribution',
            'viewingHint',
            'startCanvas',
          ];
    for (const key of wrongVersionKeys)
      if (node[key] !== undefined)
        notice(
          `${path}/${key}`,
          'CROSS_VERSION_PROPERTY',
          `Property ${key} is not part of this version's assessed profile.`,
        );
    for (const [normalized, actual] of [
      ['label', 'label'],
      ['summary', snapshot.version === '2.1' ? 'description' : 'summary'],
    ] as const) {
      if (node[actual] !== undefined)
        fact(
          facts,
          normalized,
          language(node[actual], `${path}/${actual}`),
          `${path}/${actual}`,
          'description',
        );
    }
    if (node.metadata !== undefined) {
      if (!Array.isArray(node.metadata))
        notice(`${path}/metadata`, 'UNSUPPORTED_METADATA', 'Metadata must be an ordered array.');
      const rows = list(node.metadata).map((entry, index): JsonValue => {
        const pointer = `${path}/metadata/${index}`;
        if (!isObject(entry)) {
          notice(pointer, 'UNSUPPORTED_METADATA', 'Expected a metadata label/value object.');
          return entry;
        }
        keys(entry, ['label', 'value'], pointer);
        if (entry.label === undefined || entry.value === undefined)
          notice(pointer, 'INCOMPLETE_METADATA', 'Metadata row is missing its label or value.');
        return {
          label: language(entry.label, `${pointer}/label`),
          value: language(entry.value, `${pointer}/value`),
        };
      });
      fact(facts, 'metadata', rows, `${path}/metadata`, 'description');
    }
    const rightsKey = snapshot.version === '2.1' ? 'license' : 'rights';
    if (node[rightsKey] !== undefined)
      fact(facts, 'rights', list(node[rightsKey]), `${path}/${rightsKey}`, 'rights');
    if (node.attribution !== undefined)
      fact(
        facts,
        'attribution',
        language(node.attribution, `${path}/attribution`),
        `${path}/attribution`,
        'rights',
      );
    if (node.requiredStatement !== undefined) {
      if (isObject(node.requiredStatement)) {
        keys(node.requiredStatement, ['label', 'value'], `${path}/requiredStatement`);
        if (
          node.requiredStatement.label === undefined ||
          node.requiredStatement.value === undefined
        )
          notice(
            `${path}/requiredStatement`,
            'INCOMPLETE_STATEMENT',
            'requiredStatement needs both label and value.',
          );
        fact(
          facts,
          'attribution',
          language(node.requiredStatement.value, `${path}/requiredStatement/value`),
          `${path}/requiredStatement/value`,
          'rights',
        );
        fact(
          facts,
          'attributionLabel',
          language(node.requiredStatement.label, `${path}/requiredStatement/label`),
          `${path}/requiredStatement/label`,
          'description',
        );
      } else
        notice(
          `${path}/requiredStatement`,
          'UNSUPPORTED_STATEMENT',
          'Expected a label/value requiredStatement.',
        );
    }
    for (const [normalized, actual] of [
      ['homepage', snapshot.version === '2.1' ? 'related' : 'homepage'],
      ['partOf', snapshot.version === '2.1' ? 'within' : 'partOf'],
      ['seeAlso', 'seeAlso'],
      ['rendering', 'rendering'],
      ['thumbnail', 'thumbnail'],
      ['logo', 'logo'],
      ['service', 'service'],
      ['services', 'services'],
      ['provider', 'provider'],
    ] as const) {
      if (node[actual] !== undefined) {
        const scope = ['thumbnail', 'logo'].includes(normalized) ? 'image' : 'link';
        fact(
          facts,
          normalized,
          refs(node[actual], `${path}/${actual}`, scope),
          `${path}/${actual}`,
          'content',
          scope,
        );
      }
    }
    for (const key of ['viewingDirection', 'navDate'])
      fact(facts, key, node[key], `${path}/${key}`, 'navigation');
    const behavior = node.behavior ?? node.viewingHint;
    if (behavior !== undefined)
      fact(
        facts,
        'behavior',
        list(behavior),
        `${path}/${node.behavior !== undefined ? 'behavior' : 'viewingHint'}`,
        'navigation',
      );
    const start = node.start ?? node.startCanvas;
    if (start !== undefined) {
      const id = identifier(start);
      if (
        isObject(start) &&
        Object.keys(start).some((key) => !['id', '@id', 'type', '@type'].includes(key))
      )
        notice(
          `${path}/start`,
          'UNSUPPORTED_START',
          'Additional start properties or selectors require review.',
        );
      if (id)
        fact(
          facts,
          'start',
          { id },
          `${path}/${node.start !== undefined ? 'start' : 'startCanvas'}`,
          'navigation',
          'canvas',
        );
      else
        notice(
          `${path}/start`,
          'UNSUPPORTED_START',
          'Complex start selectors are outside the assessed profile.',
        );
    }
    return facts;
  };
  const contexts = list(document['@context']);
  const context2 =
    contexts.includes('http://iiif.io/api/presentation/2/context.json') ||
    contexts.includes('https://iiif.io/api/presentation/2/context.json');
  const context3 =
    contexts.includes('http://iiif.io/api/presentation/3/context.json') ||
    contexts.includes('https://iiif.io/api/presentation/3/context.json');
  if (context2 && !context3) snapshot.version = '2.1';
  if (context3 && !context2) snapshot.version = '3.0';
  if (
    snapshot.version === 'unsupported' ||
    localType(document.type ?? document['@type']) !== 'Manifest'
  ) {
    notice(
      '',
      'UNSUPPORTED_DOCUMENT',
      'Only Presentation 2.1 or 3.0 Manifest documents are assessed. Collections and Presentation 4 require a different profile.',
    );
    return snapshot;
  }
  for (const [index, context] of contexts.entries()) {
    if (
      typeof context !== 'string' ||
      !/^https?:\/\/iiif\.io\/api\/presentation\/[23]\/context\.json$/.test(context)
    )
      notice(
        itemPath(document['@context'], '/@context', index),
        'EXTENSION_CONTEXT',
        'Additional JSON-LD context semantics are not assessed.',
      );
  }
  if (!snapshot.id) notice('', 'MISSING_MANIFEST_ID', 'Manifest identifier is missing.');
  keys(
    document,
    [
      ...commonKeys,
      'sequences',
      'items',
      'structures',
      'posterCanvas',
      'placeholderCanvas',
      'accompanyingCanvas',
    ],
    '',
  );
  for (const key of ['posterCanvas', 'placeholderCanvas', 'accompanyingCanvas'])
    if (document[key] !== undefined)
      notice(
        `/${key}`,
        'UNSUPPORTED_CANVAS_ROLE',
        `${key} content is outside the primary still-image profile.`,
      );
  if (snapshot.version === '2.1' && document.items !== undefined)
    notice(
      '/items',
      'CROSS_VERSION_STRUCTURE',
      'Presentation 3 items on a Presentation 2 manifest were not assessed.',
    );
  if (snapshot.version === '3.0' && document.sequences !== undefined)
    notice(
      '/sequences',
      'CROSS_VERSION_STRUCTURE',
      'Presentation 2 sequences on a Presentation 3 manifest were not assessed.',
    );
  snapshot.facts = common(document, '');
  snapshot.label = readable(snapshot.facts.get('label')?.value ?? null);
  let rawCanvases: JsonValue[] = [];
  let canvasesPath = '/items';
  if (snapshot.version === '2.1') {
    if (!Array.isArray(document.sequences) || !document.sequences.length)
      notice(
        '/sequences',
        'MISSING_SEQUENCES',
        'Presentation 2 manifest has no embedded sequence.',
      );
    const sequences = list(document.sequences);
    if (sequences.length > 1)
      notice(
        '/sequences',
        'MULTIPLE_SEQUENCES',
        'Additional Presentation 2 sequences require manual preservation review.',
      );
    const sequence = sequences[0];
    if (isObject(sequence)) {
      keys(
        sequence,
        [
          '@id',
          '@type',
          'id',
          'type',
          'label',
          'canvases',
          'viewingHint',
          'viewingDirection',
          'startCanvas',
        ],
        '/sequences/0',
      );
      if (sequence.label !== undefined)
        fact(
          snapshot.facts,
          'legacySequenceLabel',
          language(sequence.label, '/sequences/0/label'),
          '/sequences/0/label',
          'navigation',
        );
      for (const key of ['viewingHint', 'viewingDirection', 'startCanvas'])
        if (sequence[key] !== undefined) {
          const extracted = common({ [key]: sequence[key]! }, '/sequences/0');
          for (const [name, value] of extracted) {
            if (snapshot.facts.has(name))
              notice(
                `/sequences/0/${key}`,
                'CONFLICTING_SEQUENCE_PROPERTY',
                'Sequence and manifest both define this navigation property.',
              );
            else snapshot.facts.set(name, value);
          }
        }
      if (!Array.isArray(sequence.canvases))
        notice('/sequences/0/canvases', 'MISSING_CANVASES', 'Expected an embedded canvas array.');
      rawCanvases = list(sequence.canvases);
      canvasesPath = '/sequences/0/canvases';
    } else notice('/sequences/0', 'UNSUPPORTED_SEQUENCE', 'Expected an embedded sequence object.');
  } else {
    if (!Array.isArray(document.items))
      notice('/items', 'MISSING_CANVASES', 'Expected an embedded canvas array.');
    rawCanvases = list(document.items);
  }
  if (rawCanvases.length > MAX_CANVASES)
    throw new AuditError('INPUT_CANVASES', `Manifest exceeds the ${MAX_CANVASES}-canvas limit.`);
  const canvasIds = new Set<string>();
  rawCanvases.forEach((raw, index) => {
    const path = `${canvasesPath}/${index}`;
    if (!isObject(raw) || localType(raw.type ?? raw['@type']) !== 'Canvas') {
      notice(path, 'UNSUPPORTED_CANVAS', 'Expected an embedded Canvas object.');
      return;
    }
    keys(
      raw,
      [
        ...commonKeys,
        'height',
        'width',
        'duration',
        'images',
        'items',
        'otherContent',
        'annotations',
        'placeholderCanvas',
        'accompanyingCanvas',
      ],
      path,
    );
    const id = identifier(raw) ?? `missing-id:${index}`;
    if (!identifier(raw)) notice(path, 'MISSING_CANVAS_ID', 'Canvas identifier is missing.');
    if (canvasIds.has(id))
      notice(
        path,
        'DUPLICATE_CANVAS_ID',
        'Duplicate Canvas identity prevents unambiguous matching.',
      );
    canvasIds.add(id);
    const facts = common(raw, path);
    if (snapshot.version === '2.1' && raw.items !== undefined)
      notice(
        `${path}/items`,
        'CROSS_VERSION_STRUCTURE',
        'Presentation 3 painting pages on a Presentation 2 canvas were not assessed.',
      );
    if (snapshot.version === '3.0' && raw.images !== undefined)
      notice(
        `${path}/images`,
        'CROSS_VERSION_STRUCTURE',
        'Presentation 2 images on a Presentation 3 canvas were not assessed.',
      );
    if (raw.duration !== undefined)
      notice(
        `${path}/duration`,
        'TIME_BASED_CANVAS',
        'Time-based canvases are outside the still-image profile.',
      );
    for (const key of ['placeholderCanvas', 'accompanyingCanvas'])
      if (raw[key] !== undefined)
        notice(`${path}/${key}`, 'UNSUPPORTED_CANVAS_ROLE', `${key} is not assessed.`);
    for (const key of ['height', 'width']) {
      if (typeof raw[key] !== 'number' || raw[key]! <= 0)
        notice(
          `${path}/${key}`,
          'INVALID_DIMENSIONS',
          'Static-image canvas dimensions must be positive numbers.',
        );
      fact(facts, key, raw[key], `${path}/${key}`, 'content');
    }
    const paintings: JsonValue[] = [];
    const annotation = (entry: JsonValue, pointer: string): void => {
      if (!isObject(entry)) {
        notice(pointer, 'UNSUPPORTED_ANNOTATION', 'Expected embedded painting annotation.');
        return;
      }
      keys(
        entry,
        ['@id', 'id', '@type', 'type', 'motivation', 'resource', 'body', 'on', 'target', 'label'],
        pointer,
      );
      if (localType(entry.type ?? entry['@type']) !== 'Annotation')
        notice(pointer, 'UNSUPPORTED_ANNOTATION_TYPE', 'Expected an Annotation resource.');
      const motivation = list(entry.motivation).map(localType);
      if (motivation.length !== 1 || motivation[0] !== 'painting')
        notice(
          `${pointer}/motivation`,
          'NON_PAINTING_CONTENT',
          'Non-painting annotation content is outside the painting profile.',
        );
      for (const key of snapshot.version === '2.1' ? ['body', 'target'] : ['resource', 'on'])
        if (entry[key] !== undefined)
          notice(
            `${pointer}/${key}`,
            'CROSS_VERSION_ANNOTATION',
            'Annotation has content or targets from another Presentation version.',
          );
      if (entry['@context'] !== undefined)
        notice(`${pointer}/@context`, 'LOCAL_CONTEXT', 'Local annotation context is not assessed.');
      const body = entry.body ?? entry.resource;
      const target = entry.target ?? entry.on;
      const bodies = list(body).map((part, bodyIndex): JsonValue => {
        const bp = itemPath(
          body,
          `${pointer}/${entry.body !== undefined ? 'body' : 'resource'}`,
          bodyIndex,
        );
        if (!isObject(part) || localType(part.type ?? part['@type']) !== 'Image') {
          notice(
            bp,
            'UNSUPPORTED_BODY',
            'Only embedded Image painting bodies are assessed; Choice, SpecificResource, text and AV require review.',
          );
          return part;
        }
        return reference(part, bp, 'image');
      });
      if (!bodies.length)
        notice(pointer, 'MISSING_PAINTING_BODY', 'Painting annotation has no body.');
      const targets = list(target).map((part): JsonValue => {
        const targetId = identifier(part);
        if (
          !targetId ||
          (isObject(part) &&
            Object.keys(part).some((key) => !['id', '@id', 'type', '@type'].includes(key)))
        ) {
          notice(
            `${pointer}/target`,
            'UNSUPPORTED_TARGET',
            'Complex or missing annotation target requires review.',
          );
          return part;
        }
        if (targetId.split('#')[0] !== id)
          notice(
            `${pointer}/target`,
            'FOREIGN_PAINTING_TARGET',
            'Painting target does not identify its containing canvas.',
          );
        return { id: targetId, type: 'Canvas' };
      });
      if (!targets.length)
        notice(pointer, 'MISSING_PAINTING_TARGET', 'Painting annotation has no target.');
      const value: JsonObject = { bodies, targets };
      if (identifier(entry)) value.id = identifier(entry)!;
      if (entry.label !== undefined) value.label = language(entry.label, `${pointer}/label`);
      paintings.push(value);
    };
    if (snapshot.version === '2.1') {
      if (!Array.isArray(raw.images) || !raw.images.length)
        notice(`${path}/images`, 'MISSING_PAINTINGS', 'Canvas has no embedded image painting.');
      list(raw.images).forEach((entry, index) => annotation(entry, `${path}/images/${index}`));
    } else {
      if (!Array.isArray(raw.items) || !raw.items.length)
        notice(`${path}/items`, 'MISSING_PAINTINGS', 'Canvas has no embedded painting pages.');
      list(raw.items).forEach((page, pageIndex) => {
        const pointer = `${path}/items/${pageIndex}`;
        if (!isObject(page) || !Array.isArray(page.items)) {
          notice(
            pointer,
            'UNRESOLVED_PAINTING_PAGE',
            'Painting page is referenced or malformed; payload was not inspected.',
          );
          return;
        }
        keys(page, ['id', 'type', 'items'], pointer);
        if (page.type !== 'AnnotationPage')
          notice(pointer, 'UNSUPPORTED_PAINTING_PAGE', 'Expected AnnotationPage.');
        if (!page.items.length)
          notice(pointer, 'EMPTY_PAINTING_PAGE', 'Painting page has no annotations.');
        page.items.forEach((entry, index) => annotation(entry, `${pointer}/items/${index}`));
      });
    }
    fact(
      facts,
      'paintings',
      paintings,
      `${path}/${snapshot.version === '2.1' ? 'images' : 'items'}`,
      'content',
      'image',
    );
    const annotationKey = snapshot.version === '2.1' ? 'otherContent' : 'annotations';
    const otherAnnotationKey = snapshot.version === '2.1' ? 'annotations' : 'otherContent';
    if (raw[otherAnnotationKey] !== undefined)
      notice(
        `${path}/${otherAnnotationKey}`,
        'CROSS_VERSION_ANNOTATIONS',
        'Annotation content from the other Presentation version was not assessed.',
      );
    if (raw[annotationKey] !== undefined) {
      fact(
        facts,
        'annotations',
        refs(raw[annotationKey], `${path}/${annotationKey}`, 'link'),
        `${path}/${annotationKey}`,
        'content',
        'link',
      );
      notice(
        `${path}/${annotationKey}`,
        'UNRESOLVED_ANNOTATIONS',
        'Annotation-page links are compared, but their external or non-painting payloads are not assessed.',
      );
    }
    snapshot.canvases.push({
      id,
      idPointer: `${path}/${raw.id !== undefined ? 'id' : '@id'}`,
      pointer: path,
      label: readable(facts.get('label')?.value ?? null),
      facts,
    });
  });
  const rangeNodes = new Map<string, { node: JsonObject; path: string }>();
  const collectRange = (value: JsonValue, path: string): void => {
    if (!isObject(value)) {
      notice(
        path,
        'UNRESOLVED_RANGE',
        'Range is a reference without an embedded local definition.',
      );
      return;
    }
    const id = identifier(value);
    if (localType(value.type ?? value['@type']) !== 'Range')
      notice(path, 'UNSUPPORTED_RANGE_TYPE', 'Expected a Range resource.');
    if (!id) {
      notice(path, 'MISSING_RANGE_ID', 'Range has no identifier.');
      return;
    }
    const hasMembers =
      value.items !== undefined || value.canvases !== undefined || value.ranges !== undefined;
    if (!hasMembers) return;
    const existing = rangeNodes.get(id);
    if (existing && stableStringify(existing.node) !== stableStringify(value))
      notice(
        path,
        'DUPLICATE_RANGE_ID',
        'Conflicting embedded Range definitions share an identifier.',
      );
    else rangeNodes.set(id, { node: value, path });
    for (const [index, item] of list(value.items ?? value.ranges).entries())
      if (isObject(item) && localType(item.type ?? item['@type']) === 'Range')
        collectRange(item, `${path}/${value.items !== undefined ? 'items' : 'ranges'}/${index}`);
  };
  list(document.structures).forEach((value, index) => collectRange(value, `/structures/${index}`));
  for (const [rangeId, { node, path }] of rangeNodes) {
    keys(node, [...commonKeys, 'canvases', 'ranges', 'items', 'members'], path);
    if (node.members !== undefined)
      notice(
        `${path}/members`,
        'UNSUPPORTED_RANGE_MEMBERS',
        'Legacy mixed members structure requires manual review.',
      );
    const facts = common(node, path);
    for (const key of snapshot.version === '2.1' ? ['items'] : ['canvases', 'ranges'])
      if (node[key] !== undefined)
        notice(
          `${path}/${key}`,
          'CROSS_VERSION_RANGE',
          'Range has member fields from another Presentation version.',
        );
    if (
      node.canvases !== undefined &&
      node.ranges !== undefined &&
      list(node.canvases).length &&
      list(node.ranges).length
    )
      notice(
        path,
        'AMBIGUOUS_RANGE_ORDER',
        'Presentation 2 separate canvas/range arrays do not specify a shared interleaving.',
      );
    const values =
      node.items !== undefined ? list(node.items) : [...list(node.canvases), ...list(node.ranges)];
    const members = values.map((value, index): JsonValue => {
      const id = identifier(value);
      const type = isObject(value) ? localType(value.type ?? value['@type']) : '';
      const baseId = id?.split('#')[0] ?? '';
      const inferredType =
        type || (canvasIds.has(baseId) ? 'Canvas' : rangeNodes.has(baseId) ? 'Range' : '');
      if (
        !id ||
        !['Canvas', 'Range'].includes(inferredType) ||
        (inferredType === 'Canvas' && !canvasIds.has(baseId)) ||
        (inferredType === 'Range' && !rangeNodes.has(baseId))
      )
        notice(
          `${path}/items/${index}`,
          'UNRESOLVED_RANGE_MEMBER',
          'Range member cannot be resolved to a local Canvas or Range.',
        );
      const member: JsonObject = { id: id ?? '', type: inferredType };
      if (isObject(value) && inferredType === 'Canvas') {
        keys(value, ['id', '@id', 'type', '@type', 'label'], `${path}/items/${index}`);
        if (value.label !== undefined)
          member.label = language(value.label, `${path}/items/${index}/label`);
      }
      return member;
    });
    fact(
      facts,
      'members',
      members,
      `${path}/${node.items !== undefined ? 'items' : node.canvases !== undefined ? 'canvases' : 'ranges'}`,
      'navigation',
      'range',
    );
    snapshot.ranges.push({
      id: rangeId,
      idPointer: `${path}/${node.id !== undefined ? 'id' : '@id'}`,
      pointer: path,
      label: readable(facts.get('label')?.value ?? null),
      facts,
    });
  }
  const roots = list(document.structures)
    .map(identifier)
    .filter((id): id is string => id !== null);
  const referenced = new Set(
    snapshot.ranges.flatMap((range) => {
      const members = range.facts.get('members')?.value;
      return Array.isArray(members)
        ? members
            .filter(isObject)
            .filter((entry) => entry.type === 'Range')
            .map((entry) => String(entry.id))
        : [];
    }),
  );
  const rootIds = roots.filter((id) => !referenced.has(id));
  if (document.structures !== undefined)
    fact(
      snapshot.facts,
      'rangeRoots',
      rootIds.map((id) => ({ id, type: 'Range' })),
      '/structures',
      'navigation',
      'range',
    );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const rangeEntities = new Map(snapshot.ranges.map((range) => [range.id, range]));
  const walk = (id: string, depth = 0): void => {
    if (depth > 64) {
      notice(
        rangeNodes.get(id)?.path ?? '/structures',
        'RANGE_GRAPH_DEPTH',
        'Range-reference graph exceeds the assessed depth limit.',
      );
      return;
    }
    if (visiting.has(id)) {
      notice(
        rangeNodes.get(id)?.path ?? '/structures',
        'CYCLIC_RANGE',
        'Range membership contains a cycle.',
      );
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const members = rangeEntities.get(id)?.facts.get('members')?.value;
    if (Array.isArray(members))
      for (const member of members)
        if (isObject(member) && member.type === 'Range' && typeof member.id === 'string')
          walk(member.id, depth + 1);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of rangeNodes.keys()) walk(id);
  for (const id of roots)
    if (!rangeNodes.has(id))
      notice(
        '/structures',
        'UNRESOLVED_RANGE',
        'Top-level range has no embedded member definition.',
      );
  return snapshot;
}
