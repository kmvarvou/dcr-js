import React, { useEffect, useState, useRef, useCallback } from 'react';
import NodePropertiesPanel from './NodePropertiesPanel';
import { createPortal } from 'react-dom';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    Edge,
    EdgeProps,
    EdgeTypes,
    Node,
    NodeTypes,
    Position,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    useReactFlow,
    useStore,
    addEdge,
    getBezierPath,
} from 'reactflow';
import { getFloatingEdgeParams } from './floatingEdgeUtils';
import 'reactflow/dist/style.css';
import Button from "../utilComponents/Button.tsx";
import DCREventNode from "./DCREventNode.tsx";

interface CustomEdgeData {
    waypoints?: { x: number; y: number }[];
    delay?: number;
    deadline?: number;
    parallelIndex?: number;
    parallelTotal?: number;
}

// Popup rendered as an HTML overlay above the React Flow canvas
// This avoids SVG z-index issues where foreignObject sits behind nodes.
interface EdgePopupProps {
    edgeId: string;
    annotationType: 'delay' | 'deadline';
    currentValue: number | undefined;
    screenX: number;
    screenY: number;
    edgeColor: string;
    onClose: () => void;
}

const EdgeEditPopup = ({ edgeId, annotationType, currentValue, screenX, screenY, edgeColor, onClose }: EdgePopupProps) => {
    const { setEdges } = useReactFlow();
    const [annotationValue, setAnnotationValue] = useState<string>(currentValue?.toString() || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const finishEdit = () => {
        const numValue = annotationValue === '' ? undefined : parseInt(annotationValue, 10);
        // Fix bug 1: use setEdges for proper immutable React state update
        setEdges(edges => edges.map(edge =>
            edge.id === edgeId
                ? { ...edge, data: { ...edge.data, [annotationType]: numValue } }
                : edge
        ));
        onClose();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '' || /^\d+$/.test(value)) setAnnotationValue(value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); finishEdit(); }
        else if (e.key === 'Escape') onClose();
    };

    return (
        // Fix bug 2: rendered into a portal-like div OUTSIDE the SVG — always on top
        <div
            style={{
                position: 'fixed',
                left: screenX - 75,
                top: screenY - 60,
                zIndex: 9999,
                backgroundColor: 'white',
                border: `2px solid ${edgeColor}`,
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '150px',
                pointerEvents: 'auto',
            }}
            // Stop ALL pointer events from reaching React Flow's document listener
            // which would deselect the edge on any click outside the canvas
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div style={{ fontSize: '12px', fontWeight: 'bold', textAlign: 'center', color: edgeColor }}>
                {annotationType === 'delay' ? 'Delay' : 'Deadline'}
            </div>
            <input
                ref={inputRef}
                type="text"
                value={annotationValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter integer"
                style={{
                    width: '100%',
                    padding: '5px',
                    border: `1px solid ${edgeColor}`,
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
                <button
                    onMouseDown={(e) => { e.stopPropagation(); finishEdit(); }}
                    style={{
                        flex: 1, padding: '5px',
                        backgroundColor: '#28a745', color: 'white',
                        border: 'none', borderRadius: '4px',
                        fontSize: '11px', cursor: 'pointer', fontWeight: 'bold',
                    }}
                >Save</button>
                <button
                    onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
                    style={{
                        flex: 1, padding: '5px',
                        backgroundColor: '#dc3545', color: 'white',
                        border: 'none', borderRadius: '4px',
                        fontSize: '11px', cursor: 'pointer', fontWeight: 'bold',
                    }}
                >Cancel</button>
            </div>
        </div>
    );
};

const CustomDCREdge = ({
    id,
    source,
    target,
    style = {},
    label,
    data,
    selected,
}: EdgeProps<CustomEdgeData>) => {
    const [isEditing, setIsEditing] = useState(false);
    const transform = useStore(s => s.transform);

    // Fetch live node positions from the store for floating edge calculation
    const sourceNode = useStore(s => s.nodeInternals.get(source));
    const targetNode = useStore(s => s.nodeInternals.get(target));

    const annotationType = label === 'condition' ? 'delay' : label === 'response' ? 'deadline' : null;
    const currentValue = annotationType === 'delay' ? data?.delay : annotationType === 'deadline' ? data?.deadline : null;
    const edgeColor = label === 'condition' ? '#FEA00F' : '#2192FF';

    let markerStart = '';
    let markerEnd = '';
    if (label === 'condition') { markerStart = 'url(#condition-start)'; markerEnd = 'url(#condition-end)'; }
    else if (label === 'response')  { markerStart = 'url(#response-start)';  markerEnd = 'url(#response-end)'; }
    else if (label === 'milestone') { markerStart = 'url(#milestone-start)'; markerEnd = 'url(#milestone-end)'; }
    else if (label === 'include')   { markerStart = 'url(#include-start)';   markerEnd = 'url(#include-end)'; }
    else if (label === 'exclude')   { markerStart = 'url(#exclude-start)';   markerEnd = 'url(#exclude-end)'; }

    const parallelIndex = data?.parallelIndex ?? 0;
    const parallelTotal = data?.parallelTotal ?? 1;

    if (!sourceNode || !targetNode) return null;

    // Always use floating geometry for rendering — attaches to nearest node border
    const params = getFloatingEdgeParams(sourceNode, targetNode, parallelIndex, parallelTotal);
    const sourceX = params.sx;
    const sourceY = params.sy;
    const targetX = params.tx;
    const targetY = params.ty;

    const [edgePath] = getBezierPath({
        sourceX, sourceY, sourcePosition: params.sourcePos,
        targetX, targetY, targetPosition: params.targetPos,
    });

    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    const labelX = sourceX + (targetX - sourceX) * 0.75;
    const labelY = sourceY + (targetY - sourceY) * 0.75;

    const [tx, ty, tScale] = transform;
    const screenMidX = midX * tScale + tx;
    const screenMidY = midY * tScale + ty;

    return (
        <g>
            {/* Wide invisible hit area for easy clicking */}
            <path
                id={id}
                d={edgePath}
                fill="none"
                stroke="#000000"
                strokeOpacity={0}
                strokeWidth={30}
                className="react-flow__edge-path"
                style={{ cursor: 'pointer' }}
            />
            {/* Visible styled path - purely visual */}
            <path
                style={style}
                d={edgePath}
                markerStart={markerStart}
                markerEnd={markerEnd}
                fill="none"
            />

            {/* Annotation badge near arrowhead */}
            {annotationType && currentValue != null && !isEditing && (
                <foreignObject
                    x={labelX - 15}
                    y={labelY - 12}
                    width={30}
                    height={20}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        width: '30px', height: '20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: 'white',
                        color: edgeColor,
                        borderRadius: '3px', fontSize: '11px', fontWeight: 'bold',
                        border: `1px solid ${edgeColor}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}>
                        {currentValue}
                    </div>
                </foreignObject>
            )}

            {/* Wrench button - visible when edge is selected */}
            {annotationType && selected && !isEditing && (
                <foreignObject
                    x={midX - 15}
                    y={midY - 15}
                    width={30}
                    height={30}
                    style={{ overflow: 'visible' }}
                >
                    <div
                        style={{
                            width: '30px', height: '30px',
                            backgroundColor: edgeColor, color: 'white',
                            border: '2px solid white', borderRadius: '50%',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'all',
                            userSelect: 'none',
                        }}
                        title={`Edit ${annotationType}`}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            setIsEditing(true);
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                            <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
                        </svg>
                    </div>
                </foreignObject>
            )}

            {/* Popup rendered via portal into #edge-popup-root — always above nodes */}
            {isEditing && annotationType && (() => {
                const root = document.getElementById('edge-popup-root');
                if (!root) return null;
                return createPortal(
                    <EdgeEditPopup
                        edgeId={id}
                        annotationType={annotationType}
                        currentValue={currentValue ?? undefined}
                        screenX={screenMidX}
                        screenY={screenMidY}
                        edgeColor={edgeColor}
                        onClose={() => setIsEditing(false)}
                    />,
                    root
                );
            })()}
        </g>
    );
};

const nodeTypes: NodeTypes = {
    dcrEvent: DCREventNode,
};

const edgeTypes: EdgeTypes = {
    custom: CustomDCREdge,
};

interface ModelerV2Props {
    nodes?: Node[];
    edges?: Edge[];
    edgesRef?: React.MutableRefObject<Edge[]>;
}

const ModelerV2 = ({ nodes: propNodes, edges: propEdges, edgesRef }: ModelerV2Props = {}) => {
    const initialNodes: Node[] = [
        {
            id: 'Event_1bvmrm9',
            type: 'dcrEvent',
            position: {x: 180, y: 180},
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
            position: {x: 180, y: 500},
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
            position: {x: 550, y: 500},
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
            position: {x: 550, y: 180},
            data: {
                label: 'Pay salary',
                role: 'Accounting',
                included: true,
                executed: false,
                pending: false
            }
        }
    ];

    const initialEdges: Edge[] = [
        {
            id: 'Relation_0cn7s17',
            source: 'Event_1bvmrm9',
            sourceHandle: 'source-bottom',
            target: 'Event_0zaxxoa',
            targetHandle: 'target-top',
            type: 'custom',
            label: 'condition',
            style: {stroke: '#FEA00F', strokeWidth: 2}
        },
        {
            id: 'Relation_04y1thg',
            source: 'Event_1bvmrm9',
            sourceHandle: 'source-top',
            target: 'Event_0ea55hv',
            targetHandle: 'target-top',
            type: 'custom',
            label: 'condition',
            style: {stroke: '#FEA00F', strokeWidth: 2}
        },
        {
            id: 'Relation_1y7uzkr',
            source: 'Event_084mgdk',
            sourceHandle: 'source-middle',
            target: 'Event_0zaxxoa',
            targetHandle: 'target-bottom',
            type: 'custom',
            label: 'response',
            style: {stroke: '#2192FF', strokeWidth: 2}
        },
        {
            id: 'Relation_0e60zds',
            source: 'Event_1bvmrm9',
            sourceHandle: 'source-middle',
            target: 'Event_0ea55hv',
            targetHandle: 'target-middle',
            type: 'custom',
            label: 'response',
            style: {stroke: '#2192FF', strokeWidth: 2}
        },
        {
            id: 'Relation_0h9u9vx',
            source: 'Event_1bvmrm9',
            sourceHandle: 'source-middle-top',
            target: 'Event_0zaxxoa',
            targetHandle: 'target-middle-top',
            type: 'custom',
            label: 'response',
            style: {stroke: '#2192FF', strokeWidth: 2},
            data: {
                waypoints: [
                    {x: 450, y: 270},
                    {x: 450, y: 520}
                ]
            }
        },
        {
            id: 'Relation_0knz8rr',
            source: 'Event_0zaxxoa',
            sourceHandle: 'source-vertical-top',
            target: 'Event_0ea55hv',
            targetHandle: 'target-vertical-bottom',
            type: 'custom',
            label: 'milestone',
            style: {stroke: '#A932D0', strokeWidth: 2}
        }
    ];
    
    const [nodes, setNodes, onNodesChange] = useNodesState(propNodes !== undefined ? propNodes : initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(propEdges !== undefined ? propEdges : initialEdges);
    
    useEffect(() => {
        if (propNodes !== undefined) {
            setNodes(propNodes);
        }
    }, [propNodes, setNodes]);
    
    useEffect(() => {
        if (propEdges !== undefined) {
            setEdges(propEdges);
        }
    }, [propEdges, setEdges]);

    // Keep edgesRef in sync so parent can read current edges for serialization
    useEffect(() => {
        if (edgesRef) {
            edgesRef.current = edges;
        }
    }, [edges, edgesRef]);

    // ── Selected node & properties panel ──
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [pendingConnection, setPendingConnection] = useState<{source: string, target: string} | null>(null);

    const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

    const EDGE_STYLES: Record<string, { stroke: string }> = {
        condition: { stroke: '#FEA00F' },
        response:  { stroke: '#2192FF' },
        milestone: { stroke: '#A932D0' },
        include:   { stroke: '#28a745' },
        exclude:   { stroke: '#dc3545' },
    };

    // Called by React Flow when user drags from one handle to another
    const onConnect = useCallback((connection: any) => {
        // React Flow with loose connection mode swaps source/target, so we reverse them
        setPendingConnection({ source: connection.target, target: connection.source });
        setSelectedNodeId(connection.target);
    }, []);

    const createEdge = useCallback((relationType: string) => {
        if (!pendingConnection) return;
        // Always use a unique id — this is what allows multigraph (multiple edges per node pair)
        // addEdge() would deduplicate by source/target, so we push directly instead
        const newEdge = {
            id: `edge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            source: pendingConnection.source,
            target: pendingConnection.target,
            type: 'custom',
            label: relationType,
            style: { ...EDGE_STYLES[relationType], strokeWidth: 2 },
            data: {},
        };
        setEdges(eds => [...eds, newEdge]);
        setPendingConnection(null);
    }, [pendingConnection, setEdges]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        setSelectedNodeId(node.id);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setPendingConnection(null);
    }, []);

    const handleUpdateNode = useCallback((nodeId: string, dataChanges: Partial<any>) => {
        setNodes(nds => nds.map(n =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...dataChanges } } : n
        ));
    }, [setNodes]);

    const handleDeleteNode = useCallback((nodeId: string) => {
        setNodes(nds => nds.filter(n => n.id !== nodeId));
        setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        setSelectedNodeId(null);
    }, [setNodes, setEdges]);

    const addRandomNode = () => {
        const newNode = {
            id: 'Event_0ea789' + Math.random().toString(),
            type: 'dcrEvent',
            position: {x: Math.random() * 1000, y: Math.random() * 400},
            data: {
                label: 'Pay salary 2',
                role: 'Accounting',
                included: true,
                executed: false,
                pending: false
            }
        }
        setNodes([...nodes,newNode]);
    }

    // Compute parallel edge indices — group by unordered pair so A->B and B->A share the same slots
    const edgesWithParallel = React.useMemo(() => {
        const groups: Record<string, string[]> = {};
        edges.forEach(e => {
            const key = [e.source, e.target].sort().join('--');
            groups[key] = groups[key] || [];
            if (!groups[key].includes(e.id)) groups[key].push(e.id);
        });
        return edges.map(e => {
            const key = [e.source, e.target].sort().join('--');
            const group = groups[key];
            const idx = group.indexOf(e.id);
            return {
                ...e,
                data: { ...e.data, parallelIndex: idx, parallelTotal: group.length }
            };
        });
    }, [edges]);

    return (
        <div style={{width: '100vw', height: '100vh'}}>
            {/* Portal target for edge edit popups — rendered above all SVG/canvas layers */}
            <div id="edge-popup-root" style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none' }} />

            <div><Button onClick={addRandomNode}>New Node</Button></div>

            <ReactFlow
                nodes={nodes}
                edges={edgesWithParallel}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onConnect={onConnect}
                isValidConnection={() => true}
                connectionMode={"loose" as any}
                nodesDraggable={true}
                nodeDragThreshold={1}
                fitView
                attributionPosition="bottom-left"
                nodeOrigin={[0, 0]}
            >
                <svg>
                    <defs>
                        {/* Condition markers */}
                        <marker
                            id="condition-start"
                            viewBox="0 0 10 10"
                            refX="5"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#FEA00F"/>
                        </marker>

                        <marker
                            id="condition-end"
                            viewBox="0 0 20 20"
                            refX="20"
                            refY="10"
                            markerWidth="10"
                            markerHeight="10"
                            orient="auto"
                        >
                            <circle cx="10" cy="10" r="9" fill="white" stroke="#FEA00F" strokeWidth="2"/>
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
                            refX="5"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2192FF"/>
                        </marker>

                        <marker
                            id="response-end"
                            viewBox="0 0 20 20"
                            refX="20"
                            refY="10"
                            markerWidth="10"
                            markerHeight="10"
                            orient="auto"
                        >
                            <circle cx="10" cy="10" r="9" fill="white" stroke="#2192FF" strokeWidth="2"/>
                            <line x1="10" y1="5" x2="10" y2="11" stroke="#2192FF" strokeWidth="1.8"
                                  strokeLinecap="round"/>
                            <circle cx="10" cy="13.5" r="0.8" fill="#2192FF"/>
                        </marker>

                        {/* Milestone markers */}
                        <marker
                            id="milestone-start"
                            viewBox="0 0 10 10"
                            refX="5"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 Z" fill="none" stroke="#A932D0" strokeWidth="1.5"/>
                            <g transform="rotate(-90 5 5)">
                                <line x1="3.5" y1="3" x2="3.5" y2="6" stroke="#A932D0" strokeWidth="0.8"
                                      strokeLinecap="round"/>
                                <circle cx="3.5" cy="7.5" r="0.4" fill="#A932D0"/>
                            </g>
                        </marker>

                        <marker
                            id="milestone-end"
                            viewBox="0 0 20 20"
                            refX="20"
                            refY="10"
                            markerWidth="10"
                            markerHeight="10"
                            orient="auto"
                        >
                            <circle cx="10" cy="10" r="9" fill="white" stroke="#A932D0" strokeWidth="2"/>
                            <g transform="translate(10, 10)">
                                <line x1="-3" y1="0" x2="3" y2="0" stroke="#A932D0" strokeWidth="1.5"/>
                                <circle cx="-3" cy="0" r="2" fill="none" stroke="#A932D0" strokeWidth="1.5"/>
                                <line x1="3" y1="0" x2="3" y2="2" stroke="#A932D0" strokeWidth="1.5"/>
                                <line x1="1" y1="0" x2="1" y2="1.5" stroke="#A932D0" strokeWidth="1.5"/>
                            </g>
                        </marker>

                        {/* Include markers */}
                        <marker
                            id="include-start"
                            viewBox="0 0 10 10"
                            refX="5"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#28a745"/>
                        </marker>

                        <marker
                            id="include-end"
                            viewBox="0 0 20 20"
                            refX="20"
                            refY="10"
                            markerWidth="10"
                            markerHeight="10"
                            orient="auto"
                        >
                            <circle cx="10" cy="10" r="9" fill="white" stroke="#28a745" strokeWidth="2"/>
                            <line x1="10" y1="6" x2="10" y2="14" stroke="#28a745" strokeWidth="1.8"/>
                            <line x1="6" y1="10" x2="14" y2="10" stroke="#28a745" strokeWidth="1.8"/>
                        </marker>

                        {/* Exclude markers */}
                        <marker
                            id="exclude-start"
                            viewBox="0 0 10 10"
                            refX="5"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc3545"/>
                        </marker>

                        <marker
                            id="exclude-end"
                            viewBox="0 0 20 20"
                            refX="20"
                            refY="10"
                            markerWidth="10"
                            markerHeight="10"
                            orient="auto"
                        >
                            <circle cx="10" cy="10" r="9" fill="white" stroke="#dc3545" strokeWidth="2"/>
                            <line x1="6" y1="10" x2="14" y2="10" stroke="#dc3545" strokeWidth="1.8"/>
                        </marker>
                    </defs>
                </svg>
                <Controls/>
                <Background variant={BackgroundVariant.Dots} gap={16} size={1}/>
            </ReactFlow>

            {/* Relation type picker — appears after dragging a connection */}
            {pendingConnection && (
                <div style={{
                    position: 'fixed', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'white', border: '1px solid #e0e0e0',
                    borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    padding: '16px', zIndex: 9999, fontFamily: 'Segoe UI, system-ui, sans-serif',
                    minWidth: 220,
                }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>
                        Select Relation Type
                    </div>
                    {([
                        { type: 'condition', color: '#FEA00F', label: 'Condition' },
                        { type: 'response',  color: '#2192FF', label: 'Response' },
                        { type: 'milestone', color: '#A932D0', label: 'Milestone' },
                        { type: 'include',   color: '#28a745', label: 'Include' },
                        { type: 'exclude',   color: '#dc3545', label: 'Exclude' },
                    ] as const).map(({ type, color, label }) => (
                        <div key={type}
                            onClick={() => createEdge(type)}
                            onMouseDown={e => e.stopPropagation()}
                            style={{
                                padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
                                border: `1px solid ${color}20`, transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = `${color}15`)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
                            <span style={{ fontSize: 13, color: '#333' }}>{label}</span>
                        </div>
                    ))}
                    <div onClick={() => setPendingConnection(null)}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#aaa', cursor: 'pointer' }}>
                        Cancel
                    </div>
                </div>
            )}

            {/* Node Properties Panel */}
            <NodePropertiesPanel
                selectedNode={selectedNode}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                pendingEdge={null}
                onStartEdge={() => {}}
            />

            {/* Legend */}
            <div style={{
                position: 'absolute',
                top: 120,
                left: 20,
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                fontSize: '13px',
                minWidth: '200px',
                border: '1px solid #dee2e6'
            }}>
                <div style={{fontWeight: 'bold', marginBottom: '12px', fontSize: '15px'}}>
                    DCR Relations
                </div>
                <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div style={{width: '30px', height: '3px', backgroundColor: '#FEA00F'}}></div>
                    <span style={{color: '#FEA00F', fontWeight: 600}}>Condition</span>
                </div>
                <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div style={{width: '30px', height: '3px', backgroundColor: '#2192FF'}}></div>
                    <span style={{color: '#2192FF', fontWeight: 600}}>Response</span>
                </div>
                <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div style={{width: '30px', height: '3px', backgroundColor: '#A932D0'}}></div>
                    <span style={{color: '#A932D0', fontWeight: 600}}>Milestone</span>
                </div>
                <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div style={{width: '30px', height: '3px', backgroundColor: '#28a745'}}></div>
                    <span style={{color: '#28a745', fontWeight: 600}}>Include</span>
                </div>
                <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                    <div style={{width: '30px', height: '3px', backgroundColor: '#dc3545'}}></div>
                    <span style={{color: '#dc3545', fontWeight: 600}}>Exclude</span>
                </div>
            </div>
        </div>
    );
};

export default ModelerV2;
