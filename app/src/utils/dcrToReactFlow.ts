import { Node, Edge } from 'reactflow';
import { DCRGraph, DCRGraphS } from 'dcr-engine';

/**
 * Transforms a DCRGraph object (from dcr-engine) into React Flow format
 * 
 * @param dcrGraph - The parsed DCR graph from dcr-engine
 * @param elementRegistry - The diagram-js element registry containing layout information
 * @returns Object containing nodes and edges arrays for React Flow
 */
export function dcrGraphToReactFlow(
  dcrGraph: DCRGraph,
  elementRegistry: any
): { 
  nodes: Node[], 
  edges: Edge[] 
} {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Transform DCR events to React Flow nodes
  for (const eventId of dcrGraph.events) {
    const element = elementRegistry._elements[eventId];
    if (!element) continue;

    const businessObject = element.element.businessObject;
    
    nodes.push({
      id: eventId,
      type: 'dcrEvent',
      position: {
        x: element.element.x || 0,
        y: element.element.y || 0
      },
      data: {
        label: (dcrGraph as any).labelMap?.[eventId] || businessObject.description || eventId,
        role: businessObject.role || '',
        included: dcrGraph.marking.included.has(eventId),
        executed: dcrGraph.marking.executed.has(eventId),
        pending: dcrGraph.marking.pending.has(eventId)
      }
    });
  }

  // Get all relation elements
  const relationElements = Object.values(elementRegistry._elements)
    .filter((element: any) => element.element.id.includes('Relation'));

  // Create a map of node positions and dimensions
  const nodeInfo: { [nodeId: string]: { x: number, y: number, width: number, height: number } } = {};
  for (const node of nodes) {
    const element = elementRegistry._elements[node.id];
    nodeInfo[node.id] = {
      x: element.element.x,
      y: element.element.y,
      width: element.element.width || 140,  // Default DCR node width
      height: element.element.height || 160  // Default DCR node height
    };
  }

  // Helper function to determine handle position from waypoint
  const determineHandleFromWaypoint = (
    waypoint: { x: number, y: number },
    nodeInfo: { x: number, y: number, width: number, height: number },
    isSource: boolean
  ): { side: 'left' | 'right' | 'top' | 'bottom', position: number } => {
    const nodeCenterX = nodeInfo.x + nodeInfo.width / 2;
    const nodeCenterY = nodeInfo.y + nodeInfo.height / 2;
    
    // Determine which side based on waypoint position relative to node
    const dx = waypoint.x - nodeCenterX;
    const dy = waypoint.y - nodeCenterY;
    
    let side: 'left' | 'right' | 'top' | 'bottom';
    let position: number;
    
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal side
      side = dx > 0 ? 'right' : 'left';
      // Calculate position along the vertical axis (0 to 1, where 0 is top)
      position = (waypoint.y - nodeInfo.y) / nodeInfo.height;
    } else {
      // Vertical side
      side = dy > 0 ? 'bottom' : 'top';
      // Calculate position along the horizontal axis (0 to 1, where 0 is left)
      position = (waypoint.x - nodeInfo.x) / nodeInfo.width;
    }
    
    // Clamp position to 0-1 range
    position = Math.max(0, Math.min(1, position));
    
    return { side, position };
  };

  // Track handles created for each node
  const nodeHandles: { 
    [nodeId: string]: Array<{ 
      side: string, 
      position: number, 
      handleId: string, 
      type: 'source' | 'target' 
    }> 
  } = {};

  // Second pass: create edges using waypoint data for handle positions
  for (const relElement of relationElements as any[]) {
    const rel = relElement.element;
    const businessObject = rel.businessObject;
    
    const sourceId = businessObject.sourceRef.id || businessObject.sourceRef;
    const targetId = businessObject.targetRef.id || businessObject.targetRef;
    
    // Get waypoints from the relation
    const waypoints = rel.waypoints || [];
    
    if (waypoints.length < 2) {
      console.warn(`Relation ${rel.id} has no waypoints, skipping`);
      continue;
    }
    
    const firstWaypoint = waypoints[0];
    const lastWaypoint = waypoints[waypoints.length - 1];
    
    // Determine handle positions from waypoints
    const sourceHandle = determineHandleFromWaypoint(firstWaypoint, nodeInfo[sourceId], true);
    const targetHandle = determineHandleFromWaypoint(lastWaypoint, nodeInfo[targetId], false);
    
    // Create unique handle IDs
    if (!nodeHandles[sourceId]) nodeHandles[sourceId] = [];
    if (!nodeHandles[targetId]) nodeHandles[targetId] = [];
    
    const sourceHandleId = `source-${sourceHandle.side}-${nodeHandles[sourceId].filter(h => h.type === 'source' && h.side === sourceHandle.side).length}`;
    const targetHandleId = `target-${targetHandle.side}-${nodeHandles[targetId].filter(h => h.type === 'target' && h.side === targetHandle.side).length}`;
    
    // Store handle info for DCREventNode to create
    nodeHandles[sourceId].push({ 
      side: sourceHandle.side, 
      position: sourceHandle.position, 
      handleId: sourceHandleId,
      type: 'source'
    });
    nodeHandles[targetId].push({ 
      side: targetHandle.side, 
      position: targetHandle.position, 
      handleId: targetHandleId,
      type: 'target'
    });
    
    // Determine edge styling based on relation type
    let style = {};
    let label = '';
    
    if (businessObject.type === 'condition') {
      style = { stroke: '#FEA00F', strokeWidth: 2 };
      label = 'condition';
    } else if (businessObject.type === 'response') {
      style = { stroke: '#2192FF', strokeWidth: 2 };
      label = 'response';
    } else if (businessObject.type === 'milestone') {
      style = { stroke: '#A932D0', strokeWidth: 2 };
      label = 'milestone';
    } else if (businessObject.type === 'include') {
      style = { stroke: '#28a745', strokeWidth: 2 };
      label = 'include';
    } else if (businessObject.type === 'exclude') {
      style = { stroke: '#dc3545', strokeWidth: 2 };
      label = 'exclude';
    }

    edges.push({
      id: rel.id,
      source: sourceId,
      target: targetId,
      sourceHandle: sourceHandleId,
      targetHandle: targetHandleId,
      type: 'custom',
      label,
      style,
      animated: false
    });
  }

  // Now update nodes to include handle information
  for (const node of nodes) {
    if (nodeHandles[node.id]) {
      node.data.handles = nodeHandles[node.id];
    }
  }

  return { nodes, edges };
}

/**
 * Loads a DCR XML file and converts it to React Flow format
 * 
 * @param xmlString - The XML content as a string
 * @returns Promise resolving to nodes and edges for React Flow
 */

/**
 * Parse our native dcr:definitions XML format directly, without the modeler.
 */
export function parseNativeDCRXML(xmlString: string): { nodes: Node[], edges: Edge[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const NS     = 'http://tk/schema/dcr';
  const NS_DI  = 'http://tk/schema/dcrDi';
  const NS_DC  = 'http://www.omg.org/spec/DD/20100524/DC';
  const els    = (tag: string): Element[] => Array.from(doc.getElementsByTagNameNS(NS, tag));

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Parse positions — new format: <dcr:position eventId="..." x="..." y="..."/>
  const posMap: Record<string, { x: number, y: number }> = {};
  els('position').forEach(el => {
    const id = el.getAttribute('eventId') || '';
    posMap[id] = {
      x: parseFloat(el.getAttribute('x') || '0'),
      y: parseFloat(el.getAttribute('y') || '0'),
    };
  });

  // Old editor format: <dcrDi:dcrShape boardElement="Event_..."><dc:Bounds x="..." y="..."/></dcrDi:dcrShape>
  Array.from(doc.getElementsByTagNameNS(NS_DI, 'dcrShape')).forEach(shape => {
    const eventId = shape.getAttribute('boardElement') || '';
    if (!eventId) return;
    const bounds = shape.getElementsByTagNameNS(NS_DC, 'Bounds')[0];
    if (!bounds) return;
    posMap[eventId] = {
      x: parseFloat(bounds.getAttribute('x') || '0'),
      y: parseFloat(bounds.getAttribute('y') || '0'),
    };
  });

  // Parse expressions (guards)
  const exprMap: Record<string, string> = {};
  els('expression').forEach(el => {
    const id = el.getAttribute('id') || '';
    const val = el.getAttribute('value') || '';
    exprMap[id] = val;
  });

  // Parse variables
  const varMap: Record<string, { id: string, name: string, type: string, defaultValue?: string }> = {};
  els('variable').forEach(el => {
    const eventId = el.getAttribute('eventId') || '';
    const defVal = el.getAttribute('defaultValue');
    varMap[eventId] = {
      id: el.getAttribute('id') || '',
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || 'Int',
      ...(defVal !== null ? { defaultValue: defVal } : {}),
    };
  });

  // Parse events → nodes
  els('event').forEach(el => {
    const id = el.getAttribute('id') || '';
    const pos = posMap[id] || { x: 0, y: 0 };
    const variable = varMap[id];
    nodes.push({
      id,
      type: 'dcrEvent',
      position: pos,
      data: {
        label: el.getAttribute('description') || id,
        role: el.getAttribute('role') || '',
        included: el.getAttribute('included') === 'true',
        executed: el.getAttribute('executed') === 'true',
        pending: el.getAttribute('pending') === 'true',
        variables: variable ? [variable] : [],
        handles: [],
      },
    });
  });

  // Parse relations → edges
  const EDGE_COLORS: Record<string, string> = {
    condition: '#FEA00F', response: '#2192FF', milestone: '#A932D0',
    include: '#28a745', exclude: '#dc3545',
  };

  const edgeCounters: Record<string, number> = {};
  els('relation').forEach(el => {
    const type = el.getAttribute('type') || '';
    // Old editor format uses sourceRef/targetRef; new native format uses sourceId/targetId
    const source = el.getAttribute('sourceRef') || el.getAttribute('sourceId') || '';
    const target = el.getAttribute('targetRef') || el.getAttribute('targetId') || '';
    const timeStr = el.getAttribute('time');
    const expressionId = el.getAttribute('expressionId') || '';

    const pairKey = source + '->' + target + '->' + type;
    edgeCounters[pairKey] = (edgeCounters[pairKey] || 0) + 1;
    const id = el.getAttribute('id') || `edge_${type}_${source}_${target}_${edgeCounters[pairKey]}`;

    const data: Record<string, any> = {};
    if (timeStr) {
      if (type === 'condition') data.delay = timeStr;
      else if (type === 'response') data.deadline = timeStr;
    }
    if (expressionId && exprMap[expressionId]) {
      data.guard = exprMap[expressionId];
    }
    const side = el.getAttribute('side');
    if (side) data.side = side;
    const sideIndex = el.getAttribute('sideIndex');
    if (sideIndex !== null) data.sideIndex = parseInt(sideIndex, 10);

    edges.push({
      id,
      source,
      target,
      sourceHandle: null,
      targetHandle: null,
      type: 'custom',
      label: type,
      style: { stroke: EDGE_COLORS[type] || '#999', strokeWidth: 2 },
      data,
    });
  });

  return { nodes, edges };
}
export async function loadDCRFromXML(xmlString: string): Promise<{
  nodes: Node[],
  edges: Edge[]
}> {
  // Detect our native format (dcr:definitions with dcr:dcrGraph)
  if (xmlString.includes('<dcr:definitions') && xmlString.includes('<dcr:dcrGraph')) {
    return parseNativeDCRXML(xmlString);
  }

  // Import modeler dynamically to avoid SSR issues if needed
  const DCRModeler = (await import('modeler')).default;
  const { moddleToDCR } = await import('dcr-engine');

  // Create a temporary container for the modeler
  const container = document.createElement('div');
  container.style.display = 'none';
  document.body.appendChild(container);

  try {
    // Initialize modeler and import XML
    const modeler = new DCRModeler({ container });
    
    // Try to detect XML format and use appropriate import method
    if (xmlString.includes('<dcrgraph>') || xmlString.includes('<definitions')) {
      // DCR Portal format - use importDCRPortalXML
      await modeler.importDCRPortalXML(xmlString);
    } else {
      // Editor format - use importXML
      await modeler.importXML(xmlString);
    }
    
    // Get element registry for layout information
    const elementRegistry = modeler.getElementRegistry();
    
    // Convert to DCRGraph
    const dcrGraph = moddleToDCR(elementRegistry);
    
    // Transform to React Flow format
    const reactFlowData = dcrGraphToReactFlow(dcrGraph, elementRegistry);
    
    // Cleanup
    document.body.removeChild(container);
    
    return reactFlowData;
  } catch (error) {
    // Cleanup on error
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
    throw error;
  }
}

// ── Generate XML from React Flow nodes and edges ─────────────────────────────
export function generateXML(nodes: any[], edges: any[]): string {
    const esc = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const nl = '\n';

    const eventsXml = nodes.map((n: any) => {
        const d = n.data;
        const included = d.included ? ' included="true"' : '';
        const executed = d.executed ? ' executed="true"' : '';
        const pending = d.pending ? ' pending="true"' : '';
        return `    <dcr:event id="${n.id}" description="${esc(d.label || '')}" role="${esc(d.role || '')}"${included}${executed}${pending}/>`;
    }).join(nl);

    const relationsXml = edges.map((e: any) => {
        const isoTime = e.data?.delay || e.data?.deadline || null;
        const timeAttr = isoTime ? ` time="${isoTime}"` : '';
        const guardAttr = e.data?.guard ? ` expressionId="${e.id}--guard"` : '';
        const sideAttr = e.data?.side ? ` side="${e.data.side}"` : '';
        const sideIndexAttr = e.data?.sideIndex !== undefined ? ` sideIndex="${e.data.sideIndex}"` : '';
        return `    <dcr:relation type="${e.label}" sourceId="${e.source}" targetId="${e.target}"${timeAttr}${guardAttr}${sideAttr}${sideIndexAttr}/>`;
    }).join(nl);

    const varNodes = nodes.filter((n: any) => n.data.variables && n.data.variables.length > 0);
    const variablesXml = varNodes.length > 0
        ? nl + '  <dcr:variables>' + nl + varNodes.map((n: any) => {
            const v = n.data.variables[0];
            const defVal = v.defaultValue !== undefined && v.defaultValue !== '' ? ` defaultValue="${esc(v.defaultValue)}"` : '';
            return `    <dcr:variable id="${v.id}" name="${esc(v.name)}" type="${v.type}" eventId="${n.id}"${defVal}/>`;
        }).join(nl) + nl + '  </dcr:variables>'
        : '';

    const guardEdges = edges.filter((e: any) => e.data?.guard);
    const expressionsXml = guardEdges.length > 0
        ? nl + '  <dcr:expressions>' + nl + guardEdges.map((e: any) =>
            `    <dcr:expression id="${e.id}--guard" value="${esc(e.data.guard)}"/>`
        ).join(nl) + nl + '  </dcr:expressions>'
        : '';

    const positionsXml = nodes.map((n: any) =>
        `    <dcr:position eventId="${n.id}" x="${Math.round(n.position.x)}" y="${Math.round(n.position.y)}" width="140" height="160"/>`
    ).join(nl);

    return `<?xml version="1.0" encoding="UTF-8"?>${nl}<dcr:definitions xmlns:dcr="http://tk/schema/dcr">${nl}  <dcr:dcrGraph id="graph">${nl}${eventsXml}${nl}${relationsXml}${nl}  </dcr:dcrGraph>${expressionsXml}${variablesXml}${nl}  <dcr:positions>${nl}${positionsXml}${nl}  </dcr:positions>${nl}</dcr:definitions>`;
}

// ── Generate XML in old editor format (dcrDi / dc namespaces, sourceRef/targetRef) ──
export function generateOldEditorXML(nodes: any[], edges: any[]): string {
    const esc = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const nl = '\n';
    const W = 130, H = 150;

    // Sanitize IDs to valid XML NCNames (no periods, spaces, etc.)
    const sid = (id: string) => id.replace(/[^a-zA-Z0-9_\-]/g, '_');

    const eventsXml = nodes.map((n: any) => {
        const d = n.data;
        return `    <dcr:event id="${sid(n.id)}" role="${esc(d.role || '')}" description="${esc(d.label || '')}" included="${!!d.included}" executed="${!!d.executed}" pending="${!!d.pending}" />`;
    }).join(nl);

    const relationsXml = edges.map((e: any) => {
        const isoTime = e.data?.delay || e.data?.deadline || null;
        const timeAttr = isoTime ? ` time="${isoTime}"` : '';
        const guardAttr = e.data?.guard ? ` expressionId="${sid(e.id)}--guard"` : '';
        return `    <dcr:relation id="${sid(e.id)}" type="${e.label}" sourceRef="${sid(e.source)}" targetRef="${sid(e.target)}"${timeAttr}${guardAttr} />`;
    }).join(nl);

    const guardEdges = edges.filter((e: any) => e.data?.guard);
    const expressionsXml = guardEdges.length > 0
        ? nl + '    <dcr:expressions>' + nl + guardEdges.map((e: any) =>
            `        <dcr:expression id="${sid(e.id)}--guard" value="${esc(e.data.guard)}"/>`
        ).join(nl) + nl + '    </dcr:expressions>'
        : '';

    const varNodes = nodes.filter((n: any) => n.data.variables && n.data.variables.length > 0);
    const variablesXml = varNodes.length > 0
        ? nl + '    <dcr:variables>' + nl + varNodes.map((n: any) => {
            const v = n.data.variables[0];
            const defVal = v.defaultValue !== undefined && v.defaultValue !== '' ? ` defaultValue="${esc(v.defaultValue)}"` : '';
            return `        <dcr:variable id="${sid(v.id)}" name="${esc(v.name)}" type="${v.type}" eventId="${sid(n.id)}"${defVal}/>`;
        }).join(nl) + nl + '    </dcr:variables>'
        : '';

    const posById: Record<string, { x: number, y: number }> = {};
    nodes.forEach((n: any) => { posById[n.id] = n.position; });

    const edgeRelationsXml = edges.map((e: any) => {
        const sp = posById[e.source];
        const tp = posById[e.target];
        if (!sp || !tp) return '';
        const isSelfLoop = e.source === e.target;
        let waypoints: string;
        if (isSelfLoop) {
            // Self-loop on the right side of the node
            const rx = Math.round(sp.x + W);
            const ry1 = Math.round(sp.y + H * 0.33);
            const ry2 = Math.round(sp.y + H * 0.67);
            const lx = Math.round(sp.x + W + 40);
            waypoints = [
                `        <dcrDi:waypoint x="${rx}" y="${ry1}" />`,
                `        <dcrDi:waypoint x="${lx}" y="${ry1}" />`,
                `        <dcrDi:waypoint x="${lx}" y="${ry2}" />`,
                `        <dcrDi:waypoint x="${rx}" y="${ry2}" />`,
            ].join(nl);
        } else {
            const sx = Math.round(sp.x + W / 2);
            const sy = Math.round(sp.y + H / 2);
            const tx = Math.round(tp.x + W / 2);
            const ty = Math.round(tp.y + H / 2);
            waypoints = `        <dcrDi:waypoint x="${sx}" y="${sy}" />${nl}        <dcrDi:waypoint x="${tx}" y="${ty}" />`;
        }
        return `      <dcrDi:relation id="${sid(e.id)}_di" boardElement="${sid(e.id)}">${nl}${waypoints}${nl}      </dcrDi:relation>`;
    }).filter(Boolean).join(nl);

    const shapesXml = nodes.map((n: any) =>
        `      <dcrDi:dcrShape id="${sid(n.id)}_di" boardElement="${sid(n.id)}">${nl}        <dc:Bounds x="${Math.round(n.position.x)}" y="${Math.round(n.position.y)}" width="${W}" height="${H}" />${nl}      </dcrDi:dcrShape>`
    ).join(nl);

    return `<?xml version="1.0" encoding="UTF-8"?>${nl}<dcr:definitions xmlns:dcr="http://tk/schema/dcr" xmlns:dcrDi="http://tk/schema/dcrDi" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">${nl}  <dcr:dcrGraph id="dcrGraph">${nl}${eventsXml}${nl}${relationsXml}${expressionsXml}${variablesXml}${nl}  </dcr:dcrGraph>${nl}  <dcrDi:dcrRootBoard id="dcrRootBoard">${nl}    <dcrDi:dcrPlane id="dcrPlane" boardElement="dcrGraph">${nl}${edgeRelationsXml}${nl}${shapesXml}${nl}    </dcrDi:dcrPlane>${nl}  </dcrDi:dcrRootBoard>${nl}</dcr:definitions>`;
}

// ── Shared utilities ──────────────────────────────────────────────────────────

/** Parse an ISO 8601 duration string (subset: P#D, PT#H, PT#M, PT#S) to milliseconds. */
export function parseDurationMs(iso: string): number {
    const days    = iso.match(/P(\d+)D/);
    const hours   = iso.match(/PT(\d+)H/);
    const minutes = iso.match(/PT(\d+)M/);
    const seconds = iso.match(/PT(\d+)S/);
    let ms = 0;
    if (days)    ms += parseInt(days[1])    * 86400000;
    if (hours)   ms += parseInt(hours[1])   * 3600000;
    if (minutes) ms += parseInt(minutes[1]) * 60000;
    if (seconds) ms += parseInt(seconds[1]) * 1000;
    return ms;
}

/** Convert React Flow nodes + edges into a DCRGraphS with guardMap. */
export function buildDCRGraph(nodes: Node[], edges: Edge[]): DCRGraphS {
    const events: Set<string> = new Set(nodes.map(n => n.id));
    const labelMap: Record<string, string> = {};
    const labelMapInv: Record<string, Set<string>> = {};
    const roleMap: Record<string, string> = {};
    const labels: Set<string> = new Set();
    const roles: Set<string> = new Set();
    const marking = {
        included: new Set<string>(),
        executed: new Set<string>(),
        pending: new Set<string>(),
    };

    for (const n of nodes) {
        const label = n.data.label || n.id;
        const role = n.data.role || '';
        labelMap[n.id] = label;
        roleMap[n.id] = role;
        labels.add(label);
        roles.add(role);
        if (!labelMapInv[label]) labelMapInv[label] = new Set();
        labelMapInv[label].add(n.id);
        if (n.data.included) marking.included.add(n.id);
        if (n.data.executed) marking.executed.add(n.id);
        if (n.data.pending) marking.pending.add(n.id);
    }

    const conditionsFor: Record<string, Set<string>> = {};
    const responseTo: Record<string, Set<string>> = {};
    const excludesTo: Record<string, Set<string>> = {};
    const includesTo: Record<string, Set<string>> = {};
    const milestonesFor: Record<string, Set<string>> = {};

    for (const id of events) {
        conditionsFor[id] = new Set();
        responseTo[id] = new Set();
        excludesTo[id] = new Set();
        includesTo[id] = new Set();
        milestonesFor[id] = new Set();
    }

    const guardMap: Record<string, Record<string, Record<string, string>>> = {};
    const addGuard = (source: string, target: string, relType: string, expr: string) => {
        if (!guardMap[source]) guardMap[source] = {};
        if (!guardMap[source][target]) guardMap[source][target] = {};
        guardMap[source][target][relType] = expr;
    };

    for (const e of edges) {
        const { source, target, label } = e;
        if (!events.has(source) || !events.has(target)) continue;
        if (label === 'condition') conditionsFor[target].add(source);
        else if (label === 'response') responseTo[source].add(target);
        else if (label === 'exclude') excludesTo[source].add(target);
        else if (label === 'include') includesTo[source].add(target);
        else if (label === 'milestone') milestonesFor[target].add(source);

        if (e.data?.guard && label) {
            addGuard(source, target, label as string, e.data.guard);
        }
    }

    return {
        events,
        labels,
        labelMap,
        labelMapInv,
        roles,
        roleMap,
        marking,
        conditionsFor,
        responseTo,
        excludesTo,
        includesTo,
        milestonesFor,
        subProcesses: {},
        subProcessMap: {},
        guardMap,
    } as DCRGraphS;
}
