/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS loader for Node tests of TypeScript route handlers. */
// Run: node --test tests/motion-planners.cjs (model responses and Canvas are simulated).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Ajv = require('node:module').createRequire(require.resolve('eslint'))('ajv');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return originalResolve.call(this, id.startsWith('@/') ? path.join(root, id.slice(2)) : id, ...args);
};
require.extensions['.ts'] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
let authenticated = true;
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === '@/lib/auth') return { isAuthenticated: async () => authenticated };
  return originalLoad.call(this, id, ...args);
};
process.env.OPENAI_API_KEY = 'test-only-no-network';
const { packDemos } = require('../lib/motion/packDemos.ts');
const { isRenderableMotionRequest } = require('../lib/motion/plannerPack.ts');
const originals = [
  { type: 'STAT_CALLOUT', label: null, primary: '3 HORAS', secondary: null },
  { type: 'COMPARISON', label: null, leftTitle: 'Manual', leftDetail: null, rightTitle: 'Automático', rightDetail: null, emphasis: 'NEUTRAL' },
  { type: 'PROCESS_FLOW', label: null, steps: ['Grabar', 'Editar', 'Publicar'].map(title => ({ title, detail: null })) },
  { type: 'KEY_POINTS', label: null, points: ['Estructura', 'Integración'].map(title => ({ title, detail: null })) },
  { type: 'WEB_COMPARISON', label: null, leftTitle: 'Antes', leftHeadline: 'Servicios', leftIssues: ['Sin foco', 'Sin CTA'],
    rightTitle: 'Ahora', rightHeadline: 'Agendar', rightStrengths: ['Foco', 'CTA'], rightCta: 'Agendar' },
];
const demos = [...originals, ...packDemos];
const routes = [
  ['editorial', require('../app/api/auto-edit/editorial-plan/route.ts').POST],
  ['visual', require('../app/api/broll-engine/visual-plan/route.ts').POST],
  ['fallback', require('../app/api/broll-engine/motion-fallback/route.ts').POST],
];
const item = graphic => ({ id: 'clip', start: 0, end: 4, transcript: 'Contenido de prueba', action: 'MOTION_GRAPHIC',
  effect: 'NONE', textOverlay: null, broll: null, impactText: null, motionGraphic: graphic, reason: 'Test' });
const request = () => new Request('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ transcription: { text: 'Contenido de prueba', language: 'es', duration: 4,
    segments: [{ id: 0, start: 0, end: 4, text: 'Contenido de prueba' }] },
    items: [{ id: 'clip', start: 0, end: 4, transcript: 'Contenido de prueba', reason: 'No local match',
      broll: { subject: null, intent: null, concepts: [] } }] }) });
function mockOutput(kind, graphic, inspect = () => {}) {
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); inspect(body);
    const output = kind === 'fallback' ? { items: [{ id: 'clip', useMotion: true, motionGraphic: graphic, reason: 'Test' }] }
      : { summary: 'Test', duration: 4, items: [item(graphic)] };
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
  };
}
test('all 13 types pass all three planner schemas, responses and registry validation', async () => {
  const ajv = new Ajv({ allErrors: true });
  for (const [kind, post] of routes) for (const graphic of demos) {
    mockOutput(kind, graphic, body => {
      for (const demo of packDemos) assert.ok(body.instructions.includes(demo.type));
      assert.ok(body.instructions.includes('No quotas'));
      const schema = body.text.format.schema;
      const union = schema.properties.items.items.properties.motionGraphic;
      const variants = union.anyOf.filter(branch => branch.type === 'object');
      assert.equal(variants.length, 13);
      assert.equal(new Set(variants.map(branch => branch.properties.type.enum[0])).size, 13);
      const validateMotion = ajv.compile(union);
      assert.ok(!validateMotion({ ...graphic, css: 'arbitrary design' }), 'Model must not supply CSS');
      const validate = ajv.compile(schema);
      const output = kind === 'fallback' ? { items: [{ id: 'clip', useMotion: true, motionGraphic: graphic, reason: 'Test' }] }
        : { summary: 'Test', ...(kind === 'visual' ? { duration: 4 } : {}), items: [item(graphic)] };
      if (kind === 'editorial') delete output.items[0].impactText;
      else if (kind === 'visual') { delete output.items[0].effect; delete output.items[0].textOverlay; }
      assert.ok(validate(output), `${kind}/${graphic.type}: ${JSON.stringify(validate.errors)}`);
    });
    const response = await post(request());
    assert.equal(response.status, 200, `${kind}/${graphic.type}`);
    const output = await response.json();
    assert.equal(output.items[0].motionGraphic.type, graphic.type);
    assert.ok(isRenderableMotionRequest(output.items[0].motionGraphic));
    if (kind === 'visual') { assert.equal(output.items[0].broll, null); assert.equal(output.items[0].impactText, null); }
  }
});
test('invalid relational payloads are rejected safely by all planners', async t => {
  t.mock.method(console, 'error', () => {});
  const invalid = [
    { type: 'UI_HIGHLIGHT', surface: 'FORM', elements: [{ label: 'Nombre', role: 'INPUT' }, { label: 'Enviar', role: 'BUTTON' }], focus: [3] },
    { type: 'SYSTEM_DIAGRAM', nodes: [{ id: 'api', label: 'API', kind: 'API' }, { id: 'db', label: 'DB', kind: 'DATABASE' }], connections: [{ from: 'api', to: 'missing' }] },
    { type: 'METRIC_COUNTER', label: 'Minutos', from: 20, to: 20, unit: null },
    { type: 'BEFORE_AFTER', scene: 'DATA', before: { label: 'Antes', state: 'IDLE' }, after: { label: 'Después', state: 'IDLE' } },
    { type: 'UNKNOWN' }, null,
  ];
  for (const [kind, post] of routes) for (const graphic of invalid) {
    mockOutput(kind, graphic);
    const response = await post(request());
    if (kind === 'fallback') {
      assert.equal(response.status, 200);
      const result = await response.json(); assert.equal(result.items[0].useMotion, false); assert.equal(result.items[0].motionGraphic, null);
    } else assert.equal(response.status, kind === 'editorial' ? 502 : 422);
  }
});
test('all 13 templates execute their drawing and timeline builders with complete coverage', async () => {
  const { buildMotionTimeline } = require('../lib/motion/buildMotionTimeline.ts');
  const { buildBrollEngineRenderPlan } = require('../lib/broll-engine/buildRenderPlan.ts');
  const previousDocument = global.document;
  global.document = { createElement: tag => {
    assert.equal(tag, 'canvas');
    const commands = [];
    const canvas = { width: 0, height: 0 };
    const gradient = { addColorStop: (...args) => commands.push(['colorStop', ...args]) };
    const context = new Proxy({ canvas }, {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'measureText') return value => ({ width: String(value).length * 22 });
        if (String(key).startsWith('create') && String(key).endsWith('Gradient')) return () => gradient;
        return (...args) => {
          for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), 'Non-finite Canvas argument: ' + String(key));
          if (key === 'arc') assert.ok(args[2] >= 0, 'Negative arc radius');
          commands.push([key, ...args]);
        };
      },
      set(target, key, value) { commands.push(['set', key, value]); target[key] = value; return true; },
    });
    canvas.getContext = () => context;
    // Record draw commands, not pixels: this smoke test does not replace visual QA.
    canvas.toBlob = callback => callback(new Blob([JSON.stringify(commands)]));
    return canvas;
  } };
  try {
    for (const graphic of demos) {
      const timeline = await buildMotionTimeline({ width: 1080, height: 1920, duration: 4,
        segments: [{ start: 0, end: 4, graphic }] });
      assert.ok(timeline.frames.length > 1, graphic.type);
      assert.ok(Math.abs(timeline.frames.reduce((sum, frame) => sum + frame.duration, 0) - 4) < 0.01, graphic.type + ' duration');
      const keys = new Set(timeline.assets.map(asset => asset.key));
      assert.ok(timeline.frames.every(frame => keys.has(frame.assetKey) && frame.duration > 0));
      const variants = new Set(timeline.assets.filter(asset => asset.key !== 'blank').map(asset => Buffer.from(asset.data).toString()));
      assert.ok(variants.size > 1, graphic.type + ' must animate');
      const plan = buildBrollEngineRenderPlan({ visualPlan: { duration: 4, items: [item(graphic)] },
        selectedBrollByItem: {}, catalog: { assets: [] }, words: [{ word: 'Prueba', start: 0, end: 4 }] });
      assert.equal(plan.motionGraphicSegments[0].graphic.type, graphic.type);
      assert.equal(plan.brollSegments.length, 0);
      assert.equal(plan.ambientSegments.length, 0);
    }
  } finally { global.document = previousDocument; }
});

test('authentication stays required and does not call the model', async () => {
  authenticated = false;
  global.fetch = () => { throw new Error('Unexpected network call'); };
  for (const [, post] of routes) assert.equal((await post(request())).status, 401);
});
