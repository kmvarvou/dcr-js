import { Node, Edge } from 'reactflow';
import { DCRGraph } from 'dcr-engine';

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
        label: dcrGraph.labelMap[eventId] || businessObject.description || eventId,
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
function parseNativeDCRXML(xmlString: string): { nodes: Node[], edges: Edge[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const NS = 'http://tk/schema/dcr';
  const els = (tag: string): Element[] => Array.from(doc.getElementsByTagNameNS(NS, tag));

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Parse positions
  const posMap: Record<string, { x: number, y: number }> = {};
  els('position').forEach(el => {
    const id = el.getAttribute('eventId') || '';
    posMap[id] = {
      x: parseFloat(el.getAttribute('x') || '0'),
      y: parseFloat(el.getAttribute('y') || '0'),
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
  const varMap: Record<string, { id: string, name: string, type: string }> = {};
  els('variable').forEach(el => {
    const eventId = el.getAttribute('eventId') || '';
    varMap[eventId] = {
      id: el.getAttribute('id') || '',
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || 'Int',
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
    const source = el.getAttribute('sourceId') || '';
    const target = el.getAttribute('targetId') || '';
    const timeStr = el.getAttribute('time');
    const expressionId = el.getAttribute('expressionId') || '';

    const pairKey = source + '->' + target + '->' + type;
    edgeCounters[pairKey] = (edgeCounters[pairKey] || 0) + 1;
    const id = `edge_${type}_${source}_${target}_${edgeCounters[pairKey]}`;

    const data: Record<string, any> = {};
    if (timeStr != null) {
      const t = parseInt(timeStr, 10);
      if (!isNaN(t)) {
        if (type === 'condition') data.delay = t;
        else if (type === 'response') data.deadline = t;
      }
    }
    if (expressionId && exprMap[expressionId]) {
      data.guard = exprMap[expressionId];
    }

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
