/** Independently authored fictional CC0 examples. No external resources are fetched. */
const base = 'https://collections.example.org/field-notes';
const pageLabels = ['Cover', 'River observations', 'Species register', 'Index'];
const canvases = pageLabels.map((label, index) => ({
  '@id': `${base}/canvas/${index + 1}`,
  '@type': 'sc:Canvas',
  label,
  width: 1600,
  height: 2200,
  images: [
    {
      '@id': `${base}/painting/${index + 1}`,
      '@type': 'oa:Annotation',
      motivation: 'sc:painting',
      on: `${base}/canvas/${index + 1}`,
      resource: {
        '@id': `${base}/images/${index + 1}.jpg`,
        '@type': 'dctypes:Image',
        format: 'image/jpeg',
        width: 1600,
        height: 2200,
      },
    },
  ],
}));

const baseline = {
  '@context': 'http://iiif.io/api/presentation/2/context.json',
  '@id': `${base}/manifest`,
  '@type': 'sc:Manifest',
  label: 'Field notes from the Alder River, 1908',
  description: [
    'Notebook kept during a four-day survey of the Alder River.',
    { '@value': 'Includes a handwritten species register.', '@language': 'en' },
  ],
  attribution: 'Courtesy of the fictional Alder County Archive',
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  metadata: [
    { label: 'Creator', value: 'E. Rowan' },
    { label: 'Collection', value: 'Local natural history notebooks' },
  ],
  sequences: [{ '@id': `${base}/sequence/default`, '@type': 'sc:Sequence', canvases }],
};

const candidateCanvases = canvases.map((canvas, index) => ({
  id: canvas['@id'],
  type: 'Canvas',
  label: { none: [canvas.label] },
  width: canvas.width,
  height: canvas.height,
  items: [
    {
      id: `${base}/page/${index + 1}`,
      type: 'AnnotationPage',
      items: [
        {
          id: `${base}/painting/${index + 1}`,
          type: 'Annotation',
          motivation: 'painting',
          target: canvas['@id'],
          body: {
            id: `${base}/images/${index + 1}.jpg`,
            type: 'Image',
            format: 'image/jpeg',
            width: 1600,
            height: 2200,
          },
        },
      ],
    },
  ],
}));

const candidate = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${base}/manifest`,
  type: 'Manifest',
  label: { none: ['Field notes from the Alder River, 1908'] },
  summary: { en: ['Includes a handwritten species register.'] },
  rights: 'https://creativecommons.org/publicdomain/zero/1.0/',
  metadata: [
    { label: { none: ['Creator'] }, value: { none: ['E. Rowan'] } },
    { label: { none: ['Collection'] }, value: { none: ['Local natural history notebooks'] } },
  ],
  items: [candidateCanvases[0], candidateCanvases[2], candidateCanvases[1], candidateCanvases[3]],
};

export const demo = {
  baseline: { name: 'alder-notebook-before.json', text: JSON.stringify(baseline, null, 2) },
  candidate: { name: 'alder-notebook-after.json', text: JSON.stringify(candidate, null, 2) },
};
