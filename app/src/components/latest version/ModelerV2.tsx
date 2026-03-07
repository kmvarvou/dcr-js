import React, { useEffect, useState, useRef } from 'react';
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
    useEdgesState,
    useNodesState,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import Button from "../utilComponents/Button.tsx";
import DCREventNode from "./DCREventNode.tsx";

interface CustomEdgeData {
    waypoints?: { x: number; y: number }[];
    delay?: number;      // For condition edges
    deadline?: number;   // For response edges
    guard?: string;      // FEEL expression guard (all edge types)
}

// Extract identifiers from a FEEL expression (bare words that aren't keywords/operators)
const extractFEELIdentifiers = (expr: string): string[] => {
    const keywords = new Set(['and', 'or', 'not', 'true', 'false', 'null', 'if', 'then', 'else',
        'for', 'in', 'return', 'some', 'every', 'satisfies', 'instance', 'of', 'between', 'function']);
    const matches = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    return matches.filter(m => !keywords.has(m.toLowerCase()));
};

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
                           selected,
                       }: EdgeProps<CustomEdgeData>) => {
    const { getNodes, setEdges } = useReactFlow();
    const [isEditing, setIsEditing] = useState(false);
    const [isEditingGuard, setIsEditingGuard] = useState(false);
    const [annotationValue, setAnnotationValue] = useState<string>('');
    const [guardValue, setGuardValue] = useState<string>('');
    const [guardError, setGuardError] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);
    const guardInputRef = useRef<HTMLInputElement>(null);
    
    // Determine which annotation type this edge uses
    const annotationType = label === 'condition' ? 'delay' : label === 'response' ? 'deadline' : null;
    const currentValue = annotationType === 'delay' ? data?.delay : annotationType === 'deadline' ? data?.deadline : null;
    const edgeColor = label === 'condition' ? '#FEA00F'
        : label === 'response' ? '#2192FF'
        : label === 'milestone' ? '#A932D0'
        : label === 'include' ? '#28a745'
        : '#dc3545';
    
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    useEffect(() => {
        if (isEditingGuard && guardInputRef.current) {
            guardInputRef.current.focus();
            guardInputRef.current.select();
        }
    }, [isEditingGuard]);
    
    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setAnnotationValue(currentValue?.toString() || '');
        setIsEditing(true);
    };

    const handleGuardClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setGuardValue(data?.guard || '');
        setGuardError('');
        setIsEditingGuard(true);
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Only allow integers
        if (value === '' || /^\d+$/.test(value)) {
            setAnnotationValue(value);
        }
    };

    const handleGuardChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setGuardValue(e.target.value);
        setGuardError('');
    };
    
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEdit();
        } else if (e.key === 'Escape') {
            setAnnotationValue(currentValue?.toString() || '');
            setIsEditing(false);
        }
    };

    const handleGuardKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishGuardEdit();
        } else if (e.key === 'Escape') {
            setIsEditingGuard(false);
        }
    };
    
    const handleCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setAnnotationValue(currentValue?.toString() || '');
        setIsEditing(false);
    };

    const handleGuardCancel = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditingGuard(false);
        setGuardError('');
    };
    
    const handleSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        finishEdit();
    };

    const handleGuardSave = (e: React.MouseEvent) => {
        e.stopPropagation();
        finishGuardEdit();
    };
    
    const finishEdit = () => {
        const numValue = annotationValue === '' ? undefined : parseInt(annotationValue, 10);
        setEdges(eds => eds.map(edge =>
            edge.id === id ? { ...edge, data: { ...edge.data, [annotationType === 'delay' ? 'delay' : 'deadline']: numValue } } : edge
        ));
        setIsEditing(false);
    };

    const finishGuardEdit = () => {
        const trimmed = guardValue.trim();
        if (trimmed !== '') {
            // Validate identifiers against node ids
            const nodeIds = new Set(getNodes().map(n => n.id));
            const identifiers = extractFEELIdentifiers(trimmed);
            const unknown = identifiers.filter(id => !nodeIds.has(id));
            if (unknown.length > 0) {
                setGuardError(`Unknown variables: ${unknown.join(', ')}`);
                return;
            }
        }
        setEdges(eds => eds.map(edge =>
            edge.id === id ? { ...edge, data: { ...edge.data, guard: trimmed === '' ? undefined : trimmed } } : edge
        ));
        setIsEditingGuard(false);
        setGuardError('');
    };
    
    let edgePath: string;
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
    } else if (label === 'include') {
        markerStart = 'url(#include-start)';
        markerEnd = 'url(#include-end)';
    } else if (label === 'exclude') {
        markerStart = 'url(#exclude-start)';
        markerEnd = 'url(#exclude-end)';
    }

    const perpOffset = 15;

    if (data?.waypoints && data.waypoints.length > 0) {
        const points = [
            {x: sourceX, y: sourceY},
            ...data.waypoints,
            {x: targetX, y: targetY}
        ];

        edgePath = `M ${points[0].x} ${points[0].y}`;
        
        for (let i = 1; i < points.length - 1; i++) {
            edgePath += ` L ${points[i].x} ${points[i].y}`;
        }
        
        const lastWaypoint = points[points.length - 2];
        const finalPoint = points[points.length - 1];
        
        if (targetPosition === Position.Left || targetPosition === Position.Right) {
            edgePath += ` L ${lastWaypoint.x} ${finalPoint.y}`;
            const perpX = targetPosition === Position.Left 
                ? finalPoint.x - perpOffset 
                : finalPoint.x + perpOffset;
            edgePath += ` L ${perpX} ${finalPoint.y}`;
            edgePath += ` L ${finalPoint.x} ${finalPoint.y}`;
        } else {
            edgePath += ` L ${finalPoint.x} ${finalPoint.y}`;
        }
    } else {
        const offset = 50;

        if (sourcePosition === Position.Right || sourcePosition === Position.Left) {
            const offsetX = sourcePosition === Position.Right ? sourceX + offset : sourceX - offset;
            
            if (targetPosition === Position.Left || targetPosition === Position.Right) {
                const perpX = targetPosition === Position.Left 
                    ? targetX - perpOffset 
                    : targetX + perpOffset;
                edgePath = `M ${sourceX} ${sourceY} L ${offsetX} ${sourceY} L ${offsetX} ${targetY} L ${perpX} ${targetY} L ${targetX} ${targetY}`;
            } else {
                edgePath = `M ${sourceX} ${sourceY} L ${offsetX} ${sourceY} L ${offsetX} ${targetY} L ${targetX} ${targetY}`;
            }
        } else {
            const offsetY = sourcePosition === Position.Bottom ? sourceY + offset : sourceY - offset;
            
            if (targetPosition === Position.Left || targetPosition === Position.Right) {
                const perpX = targetPosition === Position.Left 
                    ? targetX - perpOffset 
                    : targetX + perpOffset;
                edgePath = `M ${sourceX} ${sourceY} L ${sourceX} ${offsetY} L ${perpX} ${offsetY} L ${perpX} ${targetY} L ${targetX} ${targetY}`;
            } else {
                edgePath = `M ${sourceX} ${sourceY} L ${sourceX} ${offsetY} L ${targetX} ${offsetY} L ${targetX} ${targetY}`;
            }
        }
    }

    // Calculate position near the arrowhead (75% along the edge towards target)
    const labelX = sourceX + (targetX - sourceX) * 0.75;
    const labelY = sourceY + (targetY - sourceY) * 0.75;
    
    // Calculate midpoint for edit button
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;

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
            
            {/* Guard label near middle of edge */}
            {data?.guard && !isEditingGuard && (
                <foreignObject
                    x={midX - 40}
                    y={midY - 36}
                    width={80}
                    height={20}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        backgroundColor: 'white',
                        color: edgeColor,
                        border: `1px solid ${edgeColor}`,
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '1px 4px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        textAlign: 'center'
                    }}>
                        [{data.guard}]
                    </div>
                </foreignObject>
            )}

            {/* Show annotation label (delay/deadline) near arrowhead */}
            {annotationType && currentValue !== undefined && !isEditing && (
                <foreignObject
                    x={labelX - 15}
                    y={labelY - 22}
                    width={30}
                    height={20}
                    style={{ overflow: 'visible', pointerEvents: 'none' }}
                >
                    <div style={{
                        width: '30px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'white',
                        color: edgeColor,
                        borderRadius: '3px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        border: `1px solid ${edgeColor}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }}>
                        {currentValue}
                    </div>
                </foreignObject>
            )}
            
            {/* Action buttons when selected */}
            {selected && !isEditing && !isEditingGuard && (() => {
                const buttons = [];
                if (annotationType) buttons.push('time');
                buttons.push('guard');
                buttons.push('delete');
                const btnW = 28;
                const gap = 4;
                const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
                return (
                    <foreignObject
                        x={midX - totalW / 2}
                        y={midY - 14}
                        width={totalW}
                        height={28}
                        style={{ overflow: 'visible' }}
                    >
                        <div style={{ display: 'flex', gap: `${gap}px` }}>
                            {annotationType && (
                                <button
                                    onMouseDown={(e) => { e.stopPropagation(); handleEditClick(e as any); }}
                                    style={{ width: btnW, height: 28, backgroundColor: edgeColor, color: 'white', border: '2px solid white', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', pointerEvents: 'auto' }}
                                    title={`Edit ${annotationType}`}
                                >✏️</button>
                            )}
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); handleGuardClick(e as any); }}
                                style={{ width: btnW, height: 28, backgroundColor: edgeColor, color: 'white', border: '2px solid white', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', pointerEvents: 'auto' }}
                                title="Edit guard"
                            >⚙️</button>
                            <button
                                onMouseDown={(e) => { e.stopPropagation(); setEdges(eds => eds.filter(edge => edge.id !== id)); }}
                                style={{ width: btnW, height: 28, backgroundColor: '#dc3545', color: 'white', border: '2px solid white', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', pointerEvents: 'auto' }}
                                title="Delete edge"
                            >🗑️</button>
                        </div>
                    </foreignObject>
                );
            })()}
            
            {/* Time edit popup */}
            {isEditing && (
                <foreignObject x={midX - 60} y={midY - 40} width={120} height={80} style={{ overflow: 'visible' }}>
                    <div style={{ backgroundColor: 'white', border: `2px solid ${edgeColor}`, borderRadius: '6px', padding: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'auto' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textAlign: 'center', color: edgeColor }}>
                            {annotationType === 'delay' ? 'Delay' : 'Deadline'}
                        </div>
                        <input ref={inputRef} type="text" value={annotationValue} onChange={handleInputChange} onKeyDown={handleInputKeyDown} placeholder="Integer"
                            style={{ width: '100%', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center', fontSize: '12px', outline: 'none' }} />
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleSave} style={{ flex: 1, padding: '4px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleCancel} style={{ flex: 1, padding: '4px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                    </div>
                </foreignObject>
            )}

            {/* Guard edit popup */}
            {isEditingGuard && (
                <foreignObject x={midX - 90} y={midY - 55} width={180} height={guardError ? 110 : 90} style={{ overflow: 'visible' }}>
                    <div style={{ backgroundColor: 'white', border: `2px solid ${edgeColor}`, borderRadius: '6px', padding: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '6px', pointerEvents: 'auto' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', textAlign: 'center', color: edgeColor }}>Guard (FEEL)</div>
                        <input
                            ref={guardInputRef}
                            type="text"
                            value={guardValue}
                            onChange={handleGuardChange}
                            onKeyDown={handleGuardKeyDown}
                            placeholder="e.g. Amount > 5"
                            style={{ width: '100%', padding: '4px', border: `1px solid ${guardError ? '#dc3545' : '#ccc'}`, borderRadius: '3px', fontSize: '11px', outline: 'none' }}
                        />
                        {guardError && (
                            <div style={{ fontSize: '10px', color: '#dc3545', textAlign: 'center' }}>{guardError}</div>
                        )}
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleGuardSave} style={{ flex: 1, padding: '4px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                            <button onMouseDown={(e) => e.stopPropagation()} onClick={handleGuardCancel} style={{ flex: 1, padding: '4px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '3px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                    </div>
                </foreignObject>
            )}
        </>
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
}

const ModelerV2 = ({ nodes: propNodes, edges: propEdges }: ModelerV2Props = {}) => {
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

    return (
        <div style={{width: '100vw', height: '100vh'}}>
            <div><Button onClick={addRandomNode}>New Node</Button></div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
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
