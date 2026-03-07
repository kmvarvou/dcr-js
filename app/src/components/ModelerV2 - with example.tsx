import React from 'react';
import ReactFlow, { 
  Node, 
  Edge, 
  Controls, 
  Background,
  MarkerType,
  BackgroundVariant,
  NodeTypes,
  EdgeTypes,
  Handle, 
  Position, 
  NodeProps,
  EdgeProps,
  getBezierPath,
  getStraightPath
} from 'reactflow';
import 'reactflow/dist/style.css';
import styled from 'styled-components';

/**
 * TAX CALCULATION DCR GRAPH - COMPLETE EXAMPLE
 * 
 * This single file contains everything needed to display the tax calculation
 * DCR graph from dcrjs_tax_calc_example.xml using React Flow.
 * 
 * Contains:
 * - Custom DCR node component (DCREventNode)
 * - Hardcoded nodes and edges from the XML
 * - Complete React Flow visualization with legend
 */

// ============================================================================
// PART 1: CUSTOM DCR NODE COMPONENT
// ============================================================================

interface DCRNodeData {
  label: string;
  role: string;
  included: boolean;
  executed: boolean;
  pending: boolean;
}

// ============================================================================
// CUSTOM EDGE COMPONENT WITH WAYPOINTS
// ============================================================================

interface CustomEdgeData {
  waypoints?: { x: number; y: number }[];
}

const CustomDCREdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  label,
  data,
}: EdgeProps<CustomEdgeData>) => {
  let edgePath: string;

  // Determine markers based on edge label (type)
  let markerStart = '';
  let markerEnd = '';
  
  if (label === 'condition') {
    markerStart = 'url(#condition-start)';
    markerEnd = 'url(#condition-end)';
  } else if (label === 'response') {
    markerStart = 'url(#response-start)';
    markerEnd = 'url(#response-end)';
  } else if (label === 'milestone') {
    markerStart = 'url(#milestone-start)';
    markerEnd = 'url(#milestone-end)';
  }

  // Create orthogonal path (only horizontal and vertical segments)
  if (data?.waypoints && data.waypoints.length > 0) {
    const points = [
      { x: sourceX, y: sourceY },
      ...data.waypoints,
      { x: targetX, y: targetY }
    ];
    
    // Create straight line path through waypoints (orthogonal)
    edgePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      edgePath += ` L ${points[i].x} ${points[i].y}`;
    }
  } else {
    // Default orthogonal path based on handle positions
    // Create a simple two-segment path: horizontal offset, then straight to target
    const offset = 50; // Horizontal offset from source
    
    if (sourcePosition === Position.Right || sourcePosition === Position.Left) {
      const offsetX = sourcePosition === Position.Right ? sourceX + offset : sourceX - offset;
      edgePath = `M ${sourceX} ${sourceY} L ${offsetX} ${sourceY} L ${offsetX} ${targetY} L ${targetX} ${targetY}`;
    } else {
      // Top or Bottom
      const offsetY = sourcePosition === Position.Bottom ? sourceY + offset : sourceY - offset;
      edgePath = `M ${sourceX} ${sourceY} L ${sourceX} ${offsetY} L ${targetX} ${offsetY} L ${targetX} ${targetY}`;
    }
  }

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerStart={markerStart}
        markerEnd={markerEnd}
        fill="none"
      />
    </>
  );
};

const EventNodeContainer = styled.div<{ 
  $included: boolean; 
  $executed: boolean; 
  $pending: boolean;
}>`
  border: ${props => props.$included ? '3px solid #000' : '3px dashed #999'};
  border-radius: 8px;
  background-color: ${props => props.$executed ? '#c3e6cb' : '#ffffff'};
  width: 180px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transition: all 0.2s ease;
  
  ${props => props.$pending && `
    border-color: #dc3545;
    border-width: 4px;
    box-shadow: 0 0 12px rgba(220, 53, 69, 0.4);
  `}
  
  &:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    transform: translateY(-2px);
  }
`;

const RoleLabel = styled.div`
  padding: 12px;
  background-color: #f8f9fa;
  border-bottom: 2px solid #dee2e6;
  font-size: 13px;
  font-weight: 600;
  color: #495057;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const EventLabel = styled.div`
  padding: 20px 15px;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  color: #212529;
  line-height: 1.5;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StatusIndicators = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #dee2e6;
  background-color: #f8f9fa;
  font-size: 16px;
`;

const StatusBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: ${props => props.$color};
  color: white;
  font-size: 12px;
  font-weight: bold;
`;

const DCREventNode = ({ data }: NodeProps<DCRNodeData>) => {
  return (
    <EventNodeContainer
      $included={data.included}
      $executed={data.executed}
      $pending={data.pending}
    >
      {/* Multiple LEFT handles for incoming edges */}
      <Handle 
        type="target" 
        position={Position.Left}
        id="target-top"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '30%',
          opacity: 0
        }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="target-middle-top"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '45%',
          opacity: 0
        }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="target-middle"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '55%',
          opacity: 0
        }}
      />
      <Handle 
        type="target" 
        position={Position.Left}
        id="target-bottom"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '70%',
          opacity: 0
        }}
      />
      
      {/* Multiple RIGHT handles for outgoing edges */}
      <Handle 
        type="source" 
        position={Position.Right}
        id="source-top"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '30%',
          opacity: 0
        }}
      />
      <Handle 
        type="source" 
        position={Position.Right}
        id="source-middle-top"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '45%',
          opacity: 0
        }}
      />
      <Handle 
        type="source" 
        position={Position.Right}
        id="source-middle"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '55%',
          opacity: 0
        }}
      />
      <Handle 
        type="source" 
        position={Position.Right}
        id="source-bottom"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          top: '70%',
          opacity: 0
        }}
      />
      
      {/* TOP handle for vertical connections from above (incoming from above) */}
      <Handle 
        type="target" 
        position={Position.Top}
        id="target-vertical-top"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          opacity: 0
        }}
      />
      
      {/* TOP handle for vertical connections going up (outgoing upward) */}
      <Handle 
        type="source" 
        position={Position.Top}
        id="source-vertical-top"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          opacity: 0
        }}
      />
      
      {/* BOTTOM handle for vertical connections going down (outgoing downward) */}
      <Handle 
        type="source" 
        position={Position.Bottom}
        id="source-vertical-bottom"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          opacity: 0
        }}
      />
      
      {/* BOTTOM handle for vertical connections from below (incoming from below) */}
      <Handle 
        type="target" 
        position={Position.Bottom}
        id="target-vertical-bottom"
        style={{ 
          background: '#555',
          width: 8,
          height: 8,
          border: '2px solid #fff',
          opacity: 0
        }}
      />
      
      <RoleLabel>{data.role}</RoleLabel>
      <EventLabel>{data.label}</EventLabel>
      
      <StatusIndicators>
        {data.pending && (
          <StatusBadge $color="#dc3545" title="Pending">!</StatusBadge>
        )}
        {data.executed && (
          <StatusBadge $color="#28a745" title="Executed">✓</StatusBadge>
        )}
        {!data.included && (
          <StatusBadge $color="#6c757d" title="Excluded">✕</StatusBadge>
        )}
      </StatusIndicators>
    </EventNodeContainer>
  );
};

// ============================================================================
// PART 2: MAIN COMPONENT WITH HARDCODED DATA
// ============================================================================

const ModelerV2 = () => {
  
  // Register custom node and edge types
  const nodeTypes: NodeTypes = {
    dcrEvent: DCREventNode,
  };
  
  const edgeTypes: EdgeTypes = {
    custom: CustomDCREdge,
  };
  
  // HARDCODED NODES from XML
  const nodes: Node[] = [
    {
      id: 'Event_1bvmrm9',
      type: 'dcrEvent',
      position: { x: 180, y: 180 },
      data: { 
        label: "Consult Employee's salary agreement",
        role: 'HHRR',
        included: true,
        executed: false,
        pending: false
      }
    },
    {
      id: 'Event_084mgdk',
      type: 'dcrEvent',
      position: { x: 180, y: 500 },
      data: { 
        label: 'Report Additional Income Sources',
        role: 'Employee',
        included: true,
        executed: false,
        pending: false
      }
    },
    {
      id: 'Event_0zaxxoa',
      type: 'dcrEvent',
      position: { x: 550, y: 500 },
      data: { 
        label: 'Perform tax calculation for employee',
        role: 'Economy Department',
        included: true,
        executed: false,
        pending: false
      }
    },
    {
      id: 'Event_0ea55hv',
      type: 'dcrEvent',
      position: { x: 550, y: 180 },
      data: { 
        label: 'Pay salary',
        role: 'Accounting',
        included: true,
        executed: false,
        pending: false
      }
    }
  ];

  // HARDCODED EDGES from XML with waypoints for proper multigraph display
  const edges: Edge[] = [
    // Condition relation: Event_1bvmrm9 -> Event_0zaxxoa (uses bottom source, lower path)
    {
      id: 'Relation_0cn7s17',
      source: 'Event_1bvmrm9',
      sourceHandle: 'source-bottom',
      target: 'Event_0zaxxoa',
      targetHandle: 'target-top',
      type: 'custom',
      label: 'condition',
      style: { stroke: '#FEA00F', strokeWidth: 2 }
    },
    
    // Condition relation: Event_1bvmrm9 -> Event_0ea55hv (uses top source)
    {
      id: 'Relation_04y1thg',
      source: 'Event_1bvmrm9',
      sourceHandle: 'source-top',
      target: 'Event_0ea55hv',
      targetHandle: 'target-top',
      type: 'custom',
      label: 'condition',
      style: { stroke: '#FEA00F', strokeWidth: 2 }
    },
    
    // Response relation: Event_084mgdk -> Event_0zaxxoa
    {
      id: 'Relation_1y7uzkr',
      source: 'Event_084mgdk',
      sourceHandle: 'source-middle',
      target: 'Event_0zaxxoa',
      targetHandle: 'target-bottom',
      type: 'custom',
      label: 'response',
      style: { stroke: '#2192FF', strokeWidth: 2 }
    },
    
    // Response relation: Event_1bvmrm9 -> Event_0ea55hv (uses middle source)
    {
      id: 'Relation_0e60zds',
      source: 'Event_1bvmrm9',
      sourceHandle: 'source-middle',
      target: 'Event_0ea55hv',
      targetHandle: 'target-middle',
      type: 'custom',
      label: 'response',
      style: { stroke: '#2192FF', strokeWidth: 2 }
    },
    
    // Response relation: Event_1bvmrm9 -> Event_0zaxxoa (uses middle-top source, higher path)
    {
      id: 'Relation_0h9u9vx',
      source: 'Event_1bvmrm9',
      sourceHandle: 'source-middle-top',
      target: 'Event_0zaxxoa',
      targetHandle: 'target-middle-top',
      type: 'custom',
      label: 'response',
      style: { stroke: '#2192FF', strokeWidth: 2 },
      data: {
        waypoints: [
          { x: 450, y: 270 },
          { x: 450, y: 520 }
        ]
      }
    },
    
    // Milestone relation: Event_0zaxxoa -> Event_0ea55hv (vertical connection going UP)
    {
      id: 'Relation_0knz8rr',
      source: 'Event_0zaxxoa',
      sourceHandle: 'source-vertical-top',
      target: 'Event_0ea55hv',
      targetHandle: 'target-vertical-bottom',
      type: 'custom',
      label: 'milestone',
      style: { stroke: '#A932D0', strokeWidth: 2 }
    }
  ];

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <svg>
          <defs>
            {/* Condition markers */}
            <marker
              id="condition-start"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#FEA00F" />
            </marker>

            <marker
              id="condition-end"
              viewBox="0 0 20 20"
              refX="19"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto"
            >
              <circle cx="10" cy="10" r="9" fill="white" stroke="#FEA00F" strokeWidth="2" />
              <g transform="translate(10, 10)">
                <line x1="-3" y1="0" x2="3" y2="0" stroke="#FEA00F" strokeWidth="1.5"/>
                <circle cx="-3" cy="0" r="2" fill="none" stroke="#FEA00F" strokeWidth="1.5"/>
                <line x1="3" y1="0" x2="3" y2="2" stroke="#FEA00F" strokeWidth="1.5"/>
                <line x1="1" y1="0" x2="1" y2="1.5" stroke="#FEA00F" strokeWidth="1.5"/>
              </g>
            </marker>

            {/* Response markers */}
            <marker
              id="response-start"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2192FF" />
            </marker>

            <marker
              id="response-end"
              viewBox="0 0 20 20"
              refX="19"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto"
            >
              <circle cx="10" cy="10" r="9" fill="white" stroke="#2192FF" strokeWidth="2" />
              {/* Vertical exclamation mark */}
              <line x1="10" y1="5" x2="10" y2="11" stroke="#2192FF" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="10" cy="13.5" r="0.8" fill="#2192FF" />
            </marker>

            {/* Milestone markers */}
            <marker
              id="milestone-start"
              viewBox="0 0 10 10"
              refX="0"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="none" stroke="#A932D0" strokeWidth="1.5" />
              {/* Vertical exclamation mark - centered in triangle */}
              <line x1="3.5" y1="3" x2="3.5" y2="6" stroke="#A932D0" strokeWidth="0.8" strokeLinecap="round" />
              <circle cx="3.5" cy="7.5" r="0.4" fill="#A932D0" />
            </marker>

            <marker
              id="milestone-end"
              viewBox="0 0 20 20"
              refX="10"
              refY="19"
              markerWidth="10"
              markerHeight="10"
              orient="auto"
            >
              <circle cx="10" cy="10" r="9" fill="white" stroke="#A932D0" strokeWidth="2" />
              {/* Key symbol - rotated +90° to stay horizontal when edge is vertical */}
              <g transform="translate(10, 10) rotate(90)">
                <line x1="-3" y1="0" x2="3" y2="0" stroke="#A932D0" strokeWidth="1.5"/>
                <circle cx="-3" cy="0" r="2" fill="none" stroke="#A932D0" strokeWidth="1.5"/>
                <line x1="3" y1="0" x2="3" y2="2" stroke="#A932D0" strokeWidth="1.5"/>
                <line x1="1" y1="0" x2="1" y2="1.5" stroke="#A932D0" strokeWidth="1.5"/>
              </g>
            </marker>
          </defs>
        </svg>
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
      
      {/* Legend */}
      <div style={{
        position: 'absolute',
        top: 120,
        right: 20,
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: '13px',
        minWidth: '200px',
        border: '1px solid #dee2e6'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '15px' }}>
          DCR Relations
        </div>
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '30px', height: '3px', backgroundColor: '#FEA00F' }}></div>
          <span style={{ color: '#FEA00F', fontWeight: 600 }}>Condition</span>
        </div>
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '30px', height: '3px', backgroundColor: '#2192FF' }}></div>
          <span style={{ color: '#2192FF', fontWeight: 600 }}>Response</span>
        </div>
        <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '30px', height: '3px', backgroundColor: '#A932D0' }}></div>
          <span style={{ color: '#A932D0', fontWeight: 600 }}>Milestone</span>
        </div>
      </div>
      
      {/* Title */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        backgroundColor: 'white',
        padding: '15px 20px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid #dee2e6'
      }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' }}>
          Tax Calculation Process
        </div>
        <div style={{ fontSize: '12px', color: '#6c757d' }}>
          DCR Graph Example
        </div>
      </div>
    </div>
  );
};

export default ModelerV2;
