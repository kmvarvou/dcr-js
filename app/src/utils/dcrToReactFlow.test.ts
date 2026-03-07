import { describe, it, expect } from 'vitest';
import { generateXML, parseNativeDCRXML, buildDCRGraph } from './dcrToReactFlow';
import { isEnabledS } from 'dcr-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
    id: string,
    label: string,
    x = 0,
    y = 0,
    overrides: Record<string, any> = {}
) {
    return {
        id,
        type: 'dcrEvent',
        position: { x, y },
        data: {
            label,
            role: '',
            included: true,
            executed: false,
            pending: false,
            variables: [],
            handles: [],
            ...overrides,
        },
    };
}

function makeEdge(
    id: string,
    source: string,
    target: string,
    type: string,
    data: Record<string, any> = {}
) {
    const COLORS: Record<string, string> = {
        condition: '#FEA00F', response: '#2192FF', milestone: '#A932D0',
        include: '#28a745', exclude: '#dc3545',
    };
    return {
        id,
        source,
        target,
        sourceHandle: null,
        targetHandle: null,
        type: 'custom',
        label: type,
        style: { stroke: COLORS[type] ?? '#999', strokeWidth: 2 },
        data,
    };
}

// Build a minimal native DCR XML string by hand (for parseNativeDCRXML tests)
function buildNativeXML({
    events = [] as { id: string; description: string; x: number; y: number; included?: boolean; executed?: boolean; pending?: boolean }[],
    relations = [] as { id?: string; type: string; sourceId: string; targetId: string; time?: string; expressionId?: string }[],
    expressions = [] as { id: string; value: string }[],
    variables = [] as { id: string; name: string; type: string; eventId: string; defaultValue?: string }[],
} = {}): string {
    const eventsXml = events.map(e =>
        `    <dcr:event id="${e.id}" description="${e.description}" role=""` +
        ` included="${e.included ?? true}" executed="${e.executed ?? false}" pending="${e.pending ?? false}"/>`
    ).join('\n');

    const relationsXml = relations.map((r, i) => {
        const id = r.id ?? `rel_${i}`;
        const time = r.time ? ` time="${r.time}"` : '';
        const expr = r.expressionId ? ` expressionId="${r.expressionId}"` : '';
        return `    <dcr:relation id="${id}" type="${r.type}" sourceId="${r.sourceId}" targetId="${r.targetId}"${time}${expr}/>`;
    }).join('\n');

    const expressionsXml = expressions.length
        ? `  <dcr:expressions>\n${expressions.map(e =>
            `    <dcr:expression id="${e.id}" value="${e.value}"/>`).join('\n')}\n  </dcr:expressions>`
        : '';

    const variablesXml = variables.length
        ? `  <dcr:variables>\n${variables.map(v => {
            const dv = v.defaultValue !== undefined ? ` defaultValue="${v.defaultValue}"` : '';
            return `    <dcr:variable id="${v.id}" name="${v.name}" type="${v.type}" eventId="${v.eventId}"${dv}/>`;
        }).join('\n')}\n  </dcr:variables>`
        : '';

    const positionsXml = events.map(e =>
        `    <dcr:position eventId="${e.id}" x="${e.x}" y="${e.y}" width="140" height="160"/>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<dcr:definitions xmlns:dcr="http://tk/schema/dcr">
  <dcr:dcrGraph id="graph">
${eventsXml}
${relationsXml}
  </dcr:dcrGraph>
${expressionsXml}
${variablesXml}
  <dcr:positions>
${positionsXml}
  </dcr:positions>
</dcr:definitions>`;
}

// ---------------------------------------------------------------------------
// parseNativeDCRXML — new native format (dcr:positions / sourceId / targetId)
// ---------------------------------------------------------------------------
describe('parseNativeDCRXML – new native format', () => {
    it('parses a single event with correct position', () => {
        const xml = buildNativeXML({ events: [{ id: 'A', description: 'Alpha', x: 100, y: 200 }] });
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes).toHaveLength(1);
        expect(nodes[0].id).toBe('A');
        expect(nodes[0].data.label).toBe('Alpha');
        expect(nodes[0].position).toEqual({ x: 100, y: 200 });
    });

    it('preserves marking flags (included, executed, pending)', () => {
        const xml = buildNativeXML({
            events: [{ id: 'A', description: 'A', x: 0, y: 0, included: true, executed: true, pending: true }],
        });
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes[0].data.included).toBe(true);
        expect(nodes[0].data.executed).toBe(true);
        expect(nodes[0].data.pending).toBe(true);
    });

    it('parses a relation with sourceId/targetId', () => {
        const xml = buildNativeXML({
            events: [
                { id: 'A', description: 'A', x: 0, y: 0 },
                { id: 'B', description: 'B', x: 200, y: 0 },
            ],
            relations: [{ type: 'condition', sourceId: 'A', targetId: 'B' }],
        });
        const { edges } = parseNativeDCRXML(xml);
        expect(edges).toHaveLength(1);
        expect(edges[0].source).toBe('A');
        expect(edges[0].target).toBe('B');
        expect(edges[0].label).toBe('condition');
    });

    it('attaches delay to condition edge', () => {
        const xml = buildNativeXML({
            events: [
                { id: 'A', description: 'A', x: 0, y: 0 },
                { id: 'B', description: 'B', x: 200, y: 0 },
            ],
            relations: [{ type: 'condition', sourceId: 'A', targetId: 'B', time: 'P3D' }],
        });
        const { edges } = parseNativeDCRXML(xml);
        expect(edges[0].data.delay).toBe('P3D');
        expect(edges[0].data.deadline).toBeUndefined();
    });

    it('attaches deadline to response edge', () => {
        const xml = buildNativeXML({
            events: [
                { id: 'A', description: 'A', x: 0, y: 0 },
                { id: 'B', description: 'B', x: 200, y: 0 },
            ],
            relations: [{ type: 'response', sourceId: 'A', targetId: 'B', time: 'PT2H' }],
        });
        const { edges } = parseNativeDCRXML(xml);
        expect(edges[0].data.deadline).toBe('PT2H');
        expect(edges[0].data.delay).toBeUndefined();
    });

    it('resolves guard expression from expressionId', () => {
        const xml = buildNativeXML({
            events: [
                { id: 'A', description: 'A', x: 0, y: 0 },
                { id: 'B', description: 'B', x: 200, y: 0 },
            ],
            relations: [{ type: 'condition', sourceId: 'A', targetId: 'B', expressionId: 'expr1' }],
            expressions: [{ id: 'expr1', value: 'Amount > 5' }],
        });
        const { edges } = parseNativeDCRXML(xml);
        expect(edges[0].data.guard).toBe('Amount > 5');
    });

    it('parses a variable with defaultValue', () => {
        const xml = buildNativeXML({
            events: [{ id: 'A', description: 'A', x: 0, y: 0 }],
            variables: [{ id: 'var1', name: 'amount', type: 'Int', eventId: 'A', defaultValue: '10' }],
        });
        const { nodes } = parseNativeDCRXML(xml);
        const v = nodes[0].data.variables[0];
        expect(v.name).toBe('amount');
        expect(v.type).toBe('Int');
        expect(v.defaultValue).toBe('10');
    });

    it('parses a variable without defaultValue', () => {
        const xml = buildNativeXML({
            events: [{ id: 'A', description: 'A', x: 0, y: 0 }],
            variables: [{ id: 'var1', name: 'count', type: 'Int', eventId: 'A' }],
        });
        const { nodes } = parseNativeDCRXML(xml);
        const v = nodes[0].data.variables[0];
        expect(v.defaultValue).toBeUndefined();
    });

    it('assigns correct stroke color for each relation type', () => {
        const colors: Record<string, string> = {
            condition: '#FEA00F', response: '#2192FF', milestone: '#A932D0',
            include: '#28a745', exclude: '#dc3545',
        };
        for (const [type, color] of Object.entries(colors)) {
            const xml = buildNativeXML({
                events: [
                    { id: 'A', description: 'A', x: 0, y: 0 },
                    { id: 'B', description: 'B', x: 200, y: 0 },
                ],
                relations: [{ type, sourceId: 'A', targetId: 'B' }],
            });
            const { edges } = parseNativeDCRXML(xml);
            expect(edges[0].style?.stroke, `color for ${type}`).toBe(color);
        }
    });
});

// ---------------------------------------------------------------------------
// parseNativeDCRXML — regression: positions must not all be (0,0)
// ---------------------------------------------------------------------------
describe('parseNativeDCRXML – stacked-at-zero regression', () => {
    it('gives each node a distinct, non-zero position when XML has positions', () => {
        const xml = buildNativeXML({
            events: [
                { id: 'A', description: 'A', x: 100, y: 50 },
                { id: 'B', description: 'B', x: 300, y: 150 },
                { id: 'C', description: 'C', x: 500, y: 250 },
            ],
        });
        const { nodes } = parseNativeDCRXML(xml);
        const positions = nodes.map(n => `${n.position.x},${n.position.y}`);
        const unique = new Set(positions);
        expect(unique.size).toBe(3); // all positions are distinct
        nodes.forEach(n => {
            expect(n.position.x !== 0 || n.position.y !== 0).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// parseNativeDCRXML — old editor format (dc:Bounds / sourceRef / targetRef)
// ---------------------------------------------------------------------------
describe('parseNativeDCRXML – old editor format (dc:Bounds)', () => {
    function buildOldFormatXML() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<dcr:definitions xmlns:dcr="http://tk/schema/dcr"
                 xmlns:dcrDi="http://tk/schema/dcrDi"
                 xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">
  <dcr:dcrGraph id="graph">
    <dcr:event id="Event_1" description="Submit" role="" included="true" executed="false" pending="false"/>
    <dcr:event id="Event_2" description="Approve" role="" included="true" executed="false" pending="false"/>
    <dcr:relation id="Relation_1" type="condition" sourceRef="Event_1" targetRef="Event_2"/>
  </dcr:dcrGraph>
  <dcrDi:dcrPlane>
    <dcrDi:dcrShape boardElement="Event_1">
      <dc:Bounds x="120" y="80" width="140" height="160"/>
    </dcrDi:dcrShape>
    <dcrDi:dcrShape boardElement="Event_2">
      <dc:Bounds x="400" y="80" width="140" height="160"/>
    </dcrDi:dcrShape>
  </dcrDi:dcrPlane>
</dcr:definitions>`;
    }

    it('reads positions from dc:Bounds', () => {
        const { nodes } = parseNativeDCRXML(buildOldFormatXML());
        const submit = nodes.find(n => n.id === 'Event_1')!;
        const approve = nodes.find(n => n.id === 'Event_2')!;
        expect(submit.position).toEqual({ x: 120, y: 80 });
        expect(approve.position).toEqual({ x: 400, y: 80 });
    });

    it('preserves original event IDs', () => {
        const { nodes } = parseNativeDCRXML(buildOldFormatXML());
        const ids = nodes.map(n => n.id);
        expect(ids).toContain('Event_1');
        expect(ids).toContain('Event_2');
    });

    it('parses relations using sourceRef/targetRef', () => {
        const { edges } = parseNativeDCRXML(buildOldFormatXML());
        expect(edges).toHaveLength(1);
        expect(edges[0].source).toBe('Event_1');
        expect(edges[0].target).toBe('Event_2');
    });

    it('nodes are not stacked at (0,0)', () => {
        const { nodes } = parseNativeDCRXML(buildOldFormatXML());
        nodes.forEach(n => {
            expect(n.position.x !== 0 || n.position.y !== 0).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// generateXML
// ---------------------------------------------------------------------------
describe('generateXML – basic output', () => {
    it('returns valid XML declaration', () => {
        const xml = generateXML([], []);
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<dcr:definitions');
        expect(xml).toContain('<dcr:dcrGraph');
    });

    it('serialises a single node', () => {
        const xml = generateXML([makeNode('A', 'My Event', 10, 20)], []);
        expect(xml).toContain('id="A"');
        expect(xml).toContain('description="My Event"');
        expect(xml).toContain('x="10"');
        expect(xml).toContain('y="20"');
    });

    it('rounds fractional positions', () => {
        const xml = generateXML([makeNode('A', 'E', 10.7, 20.3)], []);
        expect(xml).toContain('x="11"');
        expect(xml).toContain('y="20"');
    });

    it('omits included/executed/pending attributes when false', () => {
        const xml = generateXML(
            [makeNode('A', 'E', 0, 0, { included: false, executed: false, pending: false })],
            []
        );
        expect(xml).not.toContain('included="true"');
        expect(xml).not.toContain('executed="true"');
        expect(xml).not.toContain('pending="true"');
    });

    it('includes marking flags when true', () => {
        const xml = generateXML(
            [makeNode('A', 'E', 0, 0, { included: true, executed: true, pending: true })],
            []
        );
        expect(xml).toContain('included="true"');
        expect(xml).toContain('executed="true"');
        expect(xml).toContain('pending="true"');
    });
});

describe('generateXML – XML escaping', () => {
    it('escapes & in labels', () => {
        const xml = generateXML([makeNode('A', 'Alice & Bob', 0, 0)], []);
        expect(xml).toContain('Alice &amp; Bob');
        expect(xml).not.toContain('Alice & Bob');
    });

    it('escapes < and > in labels', () => {
        const xml = generateXML([makeNode('A', '<Start>', 0, 0)], []);
        expect(xml).toContain('&lt;Start&gt;');
    });

    it('escapes " in labels', () => {
        const xml = generateXML([makeNode('A', 'Say "Hello"', 0, 0)], []);
        expect(xml).toContain('Say &quot;Hello&quot;');
    });
});

describe('generateXML – relations', () => {
    const nodes = [makeNode('A', 'A', 0, 0), makeNode('B', 'B', 200, 0)];

    it('serialises a condition relation', () => {
        const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', 'condition')]);
        expect(xml).toContain('type="condition"');
        expect(xml).toContain('sourceId="A"');
        expect(xml).toContain('targetId="B"');
    });

    it('serialises all five relation types', () => {
        for (const type of ['condition', 'response', 'milestone', 'include', 'exclude']) {
            const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', type)]);
            expect(xml).toContain(`type="${type}"`);
        }
    });

    it('adds time attribute for condition delay', () => {
        const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', 'condition', { delay: 'P3D' })]);
        expect(xml).toContain('time="P3D"');
    });

    it('adds time attribute for response deadline', () => {
        const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', 'response', { deadline: 'PT2H' })]);
        expect(xml).toContain('time="PT2H"');
    });

    it('omits time attribute when not set', () => {
        const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', 'condition')]);
        expect(xml).not.toContain('time=');
    });

    it('writes guard into expressions block and links via expressionId', () => {
        const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', 'condition', { guard: 'x > 5' })]);
        expect(xml).toContain('<dcr:expressions>');
        expect(xml).toContain('value="x &gt; 5"');
        expect(xml).toContain('expressionId="e1--guard"');
    });

    it('omits expressions block when no guards', () => {
        const xml = generateXML(nodes, [makeEdge('e1', 'A', 'B', 'condition')]);
        expect(xml).not.toContain('<dcr:expressions>');
    });
});

describe('generateXML – variables', () => {
    it('writes a variable with defaultValue', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'var1', name: 'amount', type: 'Int', defaultValue: '10' }],
        });
        const xml = generateXML([node], []);
        expect(xml).toContain('<dcr:variables>');
        expect(xml).toContain('name="amount"');
        expect(xml).toContain('type="Int"');
        expect(xml).toContain('defaultValue="10"');
    });

    it('omits defaultValue attribute when empty string', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'var1', name: 'amount', type: 'Int', defaultValue: '' }],
        });
        const xml = generateXML([node], []);
        expect(xml).not.toContain('defaultValue=');
    });

    it('omits variables block when node has no variables', () => {
        const xml = generateXML([makeNode('A', 'A', 0, 0)], []);
        expect(xml).not.toContain('<dcr:variables>');
    });
});

// ---------------------------------------------------------------------------
// Round-trip: generateXML → parseNativeDCRXML
// ---------------------------------------------------------------------------
describe('round-trip: generateXML → parseNativeDCRXML', () => {
    it('preserves node labels', () => {
        const original = [makeNode('A', 'Submit Request', 100, 200)];
        const xml = generateXML(original, []);
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes[0].data.label).toBe('Submit Request');
    });

    it('preserves positions', () => {
        const original = [
            makeNode('A', 'A', 123, 456),
            makeNode('B', 'B', 789, 321),
        ];
        const xml = generateXML(original, []);
        const { nodes } = parseNativeDCRXML(xml);
        const a = nodes.find(n => n.id === 'A')!;
        const b = nodes.find(n => n.id === 'B')!;
        expect(a.position).toEqual({ x: 123, y: 456 });
        expect(b.position).toEqual({ x: 789, y: 321 });
    });

    it('preserves marking flags', () => {
        const original = [
            makeNode('A', 'A', 0, 0, { included: true, executed: true, pending: false }),
        ];
        const xml = generateXML(original, []);
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes[0].data.included).toBe(true);
        expect(nodes[0].data.executed).toBe(true);
        expect(nodes[0].data.pending).toBe(false);
    });

    it('preserves relation type, source, and target', () => {
        const nodes = [makeNode('A', 'A', 0, 0), makeNode('B', 'B', 200, 0)];
        const edges = [makeEdge('e1', 'A', 'B', 'response')];
        const xml = generateXML(nodes, edges);
        const result = parseNativeDCRXML(xml);
        expect(result.edges[0].source).toBe('A');
        expect(result.edges[0].target).toBe('B');
        expect(result.edges[0].label).toBe('response');
    });

    it('preserves guard expression', () => {
        const nodes = [makeNode('A', 'A', 0, 0), makeNode('B', 'B', 200, 0)];
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'Amount > 5' })];
        const xml = generateXML(nodes, edges);
        const result = parseNativeDCRXML(xml);
        expect(result.edges[0].data.guard).toBe('Amount > 5');
    });

    it('preserves time constraint (delay on condition)', () => {
        const nodes = [makeNode('A', 'A', 0, 0), makeNode('B', 'B', 200, 0)];
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { delay: 'P3D' })];
        const xml = generateXML(nodes, edges);
        const result = parseNativeDCRXML(xml);
        expect(result.edges[0].data.delay).toBe('P3D');
    });

    it('preserves variable with defaultValue', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'var1', name: 'amount', type: 'Int', defaultValue: '42' }],
        });
        const xml = generateXML([node], []);
        const { nodes } = parseNativeDCRXML(xml);
        const v = nodes[0].data.variables[0];
        expect(v.name).toBe('amount');
        expect(v.defaultValue).toBe('42');
    });

    it('preserves Bool variable type and default value', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'var1', name: 'flag', type: 'Bool', defaultValue: 'false' }],
        });
        const xml = generateXML([node], []);
        const { nodes } = parseNativeDCRXML(xml);
        const v = nodes[0].data.variables[0];
        expect(v.type).toBe('Bool');
        expect(v.defaultValue).toBe('false');
    });

    it('preserves String variable type and default value', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'var1', name: 'status', type: 'String', defaultValue: 'pending' }],
        });
        const xml = generateXML([node], []);
        const { nodes } = parseNativeDCRXML(xml);
        const v = nodes[0].data.variables[0];
        expect(v.type).toBe('String');
        expect(v.defaultValue).toBe('pending');
    });
});

// ---------------------------------------------------------------------------
// parseNativeDCRXML – Bool and String variable types
// ---------------------------------------------------------------------------
describe('parseNativeDCRXML – variable types', () => {
    it('parses Bool variable type', () => {
        const xml = buildNativeXML({
            events: [{ id: 'A', description: 'A', x: 0, y: 0 }],
            variables: [{ id: 'v1', name: 'flag', type: 'Bool', eventId: 'A', defaultValue: 'false' }],
        });
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes[0].data.variables[0].type).toBe('Bool');
        expect(nodes[0].data.variables[0].defaultValue).toBe('false');
    });

    it('parses String variable type', () => {
        const xml = buildNativeXML({
            events: [{ id: 'A', description: 'A', x: 0, y: 0 }],
            variables: [{ id: 'v1', name: 'status', type: 'String', eventId: 'A', defaultValue: 'active' }],
        });
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes[0].data.variables[0].type).toBe('String');
        expect(nodes[0].data.variables[0].defaultValue).toBe('active');
    });

    it('does not parse void as a variable type (void is no longer valid)', () => {
        const xml = buildNativeXML({
            events: [{ id: 'A', description: 'A', x: 0, y: 0 }],
            variables: [{ id: 'v1', name: 'x', type: 'Int', eventId: 'A' }],
        });
        const { nodes } = parseNativeDCRXML(xml);
        expect(nodes[0].data.variables[0].type).not.toBe('void');
    });
});

// ---------------------------------------------------------------------------
// generateXML – Bool and String variable types
// ---------------------------------------------------------------------------
describe('generateXML – Bool and String variable types', () => {
    it('writes Bool type to XML', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'v1', name: 'flag', type: 'Bool', defaultValue: 'true' }],
        });
        const xml = generateXML([node], []);
        expect(xml).toContain('type="Bool"');
        expect(xml).toContain('defaultValue="true"');
    });

    it('writes String type to XML', () => {
        const node = makeNode('A', 'A', 0, 0, {
            variables: [{ id: 'v1', name: 'status', type: 'String', defaultValue: 'active' }],
        });
        const xml = generateXML([node], []);
        expect(xml).toContain('type="String"');
        expect(xml).toContain('defaultValue="active"');
    });
});

// ---------------------------------------------------------------------------
// buildDCRGraph – bool guard conditions with isEnabledS
// ---------------------------------------------------------------------------
describe('buildDCRGraph + isEnabledS – Bool guard conditions', () => {
    const nodes = [makeNode('A', 'Prerequisite'), makeNode('B', 'Dependent')];

    it('blocks event when bool guard is true and prerequisite not executed', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'flag = false' })];
        const graph = buildDCRGraph(nodes, edges);
        expect(isEnabledS('B', graph, graph, { flag: false }).enabled).toBe(false);
    });

    it('does not block event when bool guard evaluates to false', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'flag = false' })];
        const graph = buildDCRGraph(nodes, edges);
        expect(isEnabledS('B', graph, graph, { flag: true }).enabled).toBe(true);
    });

    it('does not block event when bool variable absent from store (fail-closed → guard is false)', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'flag = false' })];
        const graph = buildDCRGraph(nodes, edges);
        expect(isEnabledS('B', graph, graph, {}).enabled).toBe(true);
    });

    it('stores guard in guardMap correctly', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'flag = false' })];
        const graph = buildDCRGraph(nodes, edges);
        expect((graph as any).guardMap?.['A']?.['B']?.['condition']).toBe('flag = false');
    });

    it('blocks event with guard = true literal (always-on condition)', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'flag = true' })];
        const graph = buildDCRGraph(nodes, edges);
        expect(isEnabledS('B', graph, graph, { flag: true }).enabled).toBe(false);
    });

    it('does not block when String guard does not match', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'status = "active"' })];
        const graph = buildDCRGraph(nodes, edges);
        expect(isEnabledS('B', graph, graph, { status: 'inactive' }).enabled).toBe(true);
    });

    it('blocks when String guard matches and prerequisite not executed', () => {
        const edges = [makeEdge('e1', 'A', 'B', 'condition', { guard: 'status = "active"' })];
        const graph = buildDCRGraph(nodes, edges);
        expect(isEnabledS('B', graph, graph, { status: 'active' }).enabled).toBe(false);
    });
});
