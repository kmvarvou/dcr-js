import React, { useEffect, useState, useRef, useCallback } from 'react';
import NodePropertiesPanel from './NodePropertiesPanel';
import { createPortal } from 'react-dom';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    Edge,
    EdgeLabelRenderer,
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
    getSmoothStepPath,
} from 'reactflow';
import { getFloatingEdgeParams } from './floatingEdgeUtils';
import 'reactflow/dist/style.css';
import Button from "../utilComponents/Button.tsx";
import DCREventNode from "./DCREventNode.tsx";

export type TimeConstraint = string; // ISO 8601 duration e.g. P3D, PT2H, PT30M, PT45S

interface CustomEdgeData {
    waypoints?: { x: number; y: number }[];
    delay?: TimeConstraint;
    deadline?: TimeConstraint;
    parallelIndex?: number;
    parallelTotal?: number;
    guard?: string;
}

const extractFEELIdentifiers = (expr: string): string[] => {
    const keywords = new Set(['and','or','not','true','false','null','if','then','else',
        'for','in','return','some','every','satisfies','instance','of','between','function']);
    const matches = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
    return matches.filter(m => !keywords.has(m.toLowerCase()));
};

// Popup rendered as an HTML overlay above the React Flow canvas
// This avoids SVG z-index issues where foreignObject sits behind nodes.
interface EdgePopupProps {
    edgeId: string;
    annotationType: 'delay' | 'deadline';
    currentValue: string | undefined;
    screenX: number;
    screenY: number;
    edgeColor: string;
    onClose: () => void;
}

const EdgeEditPopup = ({ edgeId, annotationType, currentValue, screenX, screenY, edgeColor, onClose }: EdgePopupProps) => {
    const { setEdges } = useReactFlow();
    const [inputValue, setInputValue] = useState<string>(currentValue || '');
    const [error, setError] = useState<string>('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const isValidDuration = (s: string): boolean => {
        return /^P(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/.test(s) && s !== 'P' && s !== 'PT';
    };

    const finishEdit = () => {
        const val = inputValue.trim();
        if (val !== '' && !isValidDuration(val)) {
            setError('Use ISO 8601: P3D, PT2H, PT30M, PT45S');
            return;
        }
        setEdges(edges => edges.map(edge =>
            edge.id === edgeId
                ? { ...edge, data: { ...edge.data, [annotationType]: val || undefined } }
                : edge
        ));
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); finishEdit(); }
        else if (e.key === 'Escape') onClose();
    };

    return (
        <div
            style={{
                position: 'fixed',
                left: screenX - 90,
                top: screenY - 70,
                zIndex: 9999,
                backgroundColor: 'white',
                border: `2px solid ${edgeColor}`,
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: '180px',
                pointerEvents: 'auto',
            }}
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
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="e.g. P3D, PT2H"
                style={{
                    width: '100%', padding: '5px',
                    border: `1px solid ${error ? '#dc3545' : edgeColor}`,
                    borderRadius: '4px', textAlign: 'center',
                    fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                }}
            />
            {error && <div style={{ fontSize: '10px', color: '#dc3545', textAlign: 'center' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '6px' }}>
                <button
                    onMouseDown={(e) => { e.stopPropagation(); finishEdit(); }}
                    style={{ flex: 1, padding: '5px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
                >Save</button>
                <button
                    onMouseDown={(e) => { e.stopPropagation(); onClose(); }}
                    style={{ flex: 1, padding: '5px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}
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
    const { setEdges, getNodes } = useReactFlow();
    const [isEditing, setIsEditing] = useState(false);
    const [isEditingGuard, setIsEditingGuard] = useState(false);
    const [guardValue, setGuardValue] = useState<string>('');
    const [guardError, setGuardError] = useState<string>('');
    const guardInputRef = useRef<HTMLInputElement>(null);
    const transform = useStore(s => s.transform);

    // Fetch live node positions from the store for floating edge calculation
    const sourceNode = useStore(s => s.nodeInternals.get(source));
    const targetNode = useStore(s => s.nodeInternals.get(target));

    const annotationType = label === 'condition' ? 'delay' : label === 'response' ? 'deadline' : null;
    const currentValue: string | null = annotationType === 'delay' ? (data?.delay ?? null) : annotationType === 'deadline' ? (data?.deadline ?? null) : null;
    const baseColor = label === 'condition' ? '#FEA00F'
        : label === 'response' ? '#2192FF'
        : label === 'milestone' ? '#A932D0'
        : label === 'include' ? '#28a745'
        : '#dc3545';
    const edgeColor = (data as any)?.heatmapColor ?? baseColor;


    const markerStart = label ? `url(#${id}-start)` : '';
    const markerEnd   = label ? `url(#${id}-end)`   : '';

    const parallelIndex = data?.parallelIndex ?? 0;
    const parallelTotal = data?.parallelTotal ?? 1;

    if (!sourceNode || !targetNode) {
        console.warn('[CustomDCREdge] missing node in store:', { id, source, target, hasSource: !!sourceNode, hasTarget: !!targetNode });
        return null;
    }

    let edgePath: string;
    let midX: number;
    let midY: number;
    let labelAnnotX: number, labelAnnotY: number;
    let labelGuardX: number, labelGuardY: number;

    if (source === target) {
        const nx = sourceNode.positionAbsolute?.x ?? sourceNode.position.x;
        const ny = sourceNode.positionAbsolute?.y ?? sourceNode.position.y;
        const nw = sourceNode.width ?? 140;
        const nh = sourceNode.height ?? 160;
        const side: LoopSide = (data as any)?.side ?? 'right';
        const sideIndex: number = (data as any)?.sideIndex ?? 0;
        // Each successive loop on the same side extends further out
        const L = 55 + sideIndex * 30;
        // Attachment points shift along the side per index
        const slots: [number, number][] = [[0.25, 0.65], [0.05, 0.42], [0.58, 0.95]];
        const [lo, hi] = slots[sideIndex % slots.length];
        if (side === 'right') {
            const ey = ny + nh * lo, ey2 = ny + nh * hi, ax = nx + nw;
            edgePath = `M ${ax} ${ey} C ${ax+L} ${ey} ${ax+L} ${ey2} ${ax} ${ey2}`;
            midX = ax + L; midY = (ey + ey2) / 2;
        } else if (side === 'left') {
            const ey = ny + nh * lo, ey2 = ny + nh * hi, ax = nx;
            edgePath = `M ${ax} ${ey} C ${ax-L} ${ey} ${ax-L} ${ey2} ${ax} ${ey2}`;
            midX = ax - L; midY = (ey + ey2) / 2;
        } else if (side === 'top') {
            const ex = nx + nw * lo, ex2 = nx + nw * hi, ay = ny;
            edgePath = `M ${ex} ${ay} C ${ex} ${ay-L} ${ex2} ${ay-L} ${ex2} ${ay}`;
            midX = (ex + ex2) / 2; midY = ay - L;
        } else {
            const ex = nx + nw * lo, ex2 = nx + nw * hi, ay = ny + nh;
            edgePath = `M ${ex} ${ay} C ${ex} ${ay+L} ${ex2} ${ay+L} ${ex2} ${ay}`;
            midX = (ex + ex2) / 2; midY = ay + L;
        }
        labelAnnotX = midX; labelAnnotY = midY - 8;
        labelGuardX = midX; labelGuardY = midY + 16;
    } else {
        // Always use floating geometry for rendering — attaches to nearest node border
        const params = getFloatingEdgeParams(sourceNode, targetNode, parallelIndex, parallelTotal);
        const sourceX = params.sx;
        const sourceY = params.sy;
        const targetX = params.tx;
        const targetY = params.ty;

        if (parallelTotal > 1) {
            // Arc the path perpendicularly so parallel edges don't overlap in the middle.
            // Use a canonical perpendicular (based on sorted node ID) so that A→B and B→A
            // agree on which side is positive — otherwise both arcs bend the same way.
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const canonSign = sourceNode.id < targetNode.id ? 1 : -1;
            const perpX = canonSign * (-dy / len);
            const perpY = canonSign * (dx / len);
            const arcOffset = (parallelIndex - (parallelTotal - 1) / 2) * 50;
            const cpX = (sourceX + targetX) / 2 + perpX * arcOffset;
            const cpY = (sourceY + targetY) / 2 + perpY * arcOffset;
            edgePath = `M ${sourceX} ${sourceY} Q ${cpX} ${cpY} ${targetX} ${targetY}`;
            // Actual bezier midpoint at t=0.5: 0.25*P0 + 0.5*CP + 0.25*P2
            midX = (sourceX + targetX) / 2 + perpX * arcOffset / 2;
            midY = (sourceY + targetY) / 2 + perpY * arcOffset / 2;
            // Labels offset outward from arc (convex side), stacked
            const sign = Math.sign(arcOffset) || 1;
            labelAnnotX = midX + perpX * sign * 14;
            labelAnnotY = midY + perpY * sign * 14;
            labelGuardX = midX + perpX * sign * 26;
            labelGuardY = midY + perpY * sign * 26;
        } else {
            let pathLabelX: number, pathLabelY: number;
            [edgePath, pathLabelX, pathLabelY] = getSmoothStepPath({
                sourceX, sourceY, sourcePosition: params.sourcePos,
                targetX, targetY, targetPosition: params.targetPos,
                borderRadius: 10,
            });
            midX = pathLabelX;
            midY = pathLabelY;
            labelAnnotX = midX; labelAnnotY = midY - 8;
            labelGuardX = midX; labelGuardY = midY + 16;
        }
    }

    const labelX = midX;
    const labelY = midY;

    const [tx, ty, tScale] = transform;
    const screenMidX = midX * tScale + tx;
    const screenMidY = midY * tScale + ty;

    return (
        <>
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
                onClick={(e) => {
                    e.stopPropagation();
                    setEdges(eds => eds.map(edge => ({ ...edge, selected: edge.id === id })));
                }}
            />
            {/* Per-edge colored marker defs */}
            <defs>
                {label === 'condition' && <>
                    <marker id={`${id}-start`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor}/>
                    </marker>
                    <marker id={`${id}-end`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="10" markerHeight="10" orient="auto">
                        <circle cx="10" cy="10" r="9" fill="white" stroke={edgeColor} strokeWidth="2"/>
                        <g transform="translate(10, 10)">
                            <line x1="-3" y1="0" x2="3" y2="0" stroke={edgeColor} strokeWidth="1.5"/>
                            <circle cx="-3" cy="0" r="2" fill="none" stroke={edgeColor} strokeWidth="1.5"/>
                            <line x1="3" y1="0" x2="3" y2="2" stroke={edgeColor} strokeWidth="1.5"/>
                            <line x1="1" y1="0" x2="1" y2="1.5" stroke={edgeColor} strokeWidth="1.5"/>
                        </g>
                    </marker>
                </>}
                {label === 'response' && <>
                    <marker id={`${id}-start`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor}/>
                    </marker>
                    <marker id={`${id}-end`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="10" markerHeight="10" orient="auto">
                        <circle cx="10" cy="10" r="9" fill="white" stroke={edgeColor} strokeWidth="2"/>
                        <line x1="10" y1="5" x2="10" y2="11" stroke={edgeColor} strokeWidth="1.8" strokeLinecap="round"/>
                        <circle cx="10" cy="13.5" r="0.8" fill={edgeColor}/>
                    </marker>
                </>}
                {label === 'milestone' && <>
                    <marker id={`${id}-start`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 Z" fill="none" stroke={edgeColor} strokeWidth="1.5"/>
                        <g transform="rotate(-90 5 5)">
                            <line x1="3.5" y1="3" x2="3.5" y2="6" stroke={edgeColor} strokeWidth="0.8" strokeLinecap="round"/>
                            <circle cx="3.5" cy="7.5" r="0.4" fill={edgeColor}/>
                        </g>
                    </marker>
                    <marker id={`${id}-end`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="10" markerHeight="10" orient="auto">
                        <circle cx="10" cy="10" r="9" fill="white" stroke={edgeColor} strokeWidth="2"/>
                        <g transform="translate(10, 10)">
                            <line x1="-3" y1="0" x2="3" y2="0" stroke={edgeColor} strokeWidth="1.5"/>
                            <circle cx="-3" cy="0" r="2" fill="none" stroke={edgeColor} strokeWidth="1.5"/>
                            <line x1="3" y1="0" x2="3" y2="2" stroke={edgeColor} strokeWidth="1.5"/>
                            <line x1="1" y1="0" x2="1" y2="1.5" stroke={edgeColor} strokeWidth="1.5"/>
                        </g>
                    </marker>
                </>}
                {label === 'include' && <>
                    <marker id={`${id}-start`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor}/>
                    </marker>
                    <marker id={`${id}-end`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="10" markerHeight="10" orient="auto">
                        <circle cx="10" cy="10" r="9" fill="white" stroke={edgeColor} strokeWidth="2"/>
                        <line x1="10" y1="6" x2="10" y2="14" stroke={edgeColor} strokeWidth="1.8"/>
                        <line x1="6" y1="10" x2="14" y2="10" stroke={edgeColor} strokeWidth="1.8"/>
                    </marker>
                </>}
                {label === 'exclude' && <>
                    <marker id={`${id}-start`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={edgeColor}/>
                    </marker>
                    <marker id={`${id}-end`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="10" markerHeight="10" orient="auto">
                        <circle cx="10" cy="10" r="9" fill="white" stroke={edgeColor} strokeWidth="2"/>
                        <line x1="6" y1="10" x2="14" y2="10" stroke={edgeColor} strokeWidth="1.8"/>
                    </marker>
                </>}
            </defs>

            {/* Visible styled path - purely visual */}
            <path
                style={{ ...style, stroke: edgeColor }}
                d={edgePath}
                markerStart={markerStart}
                markerEnd={markerEnd}
                fill="none"
            />


            {/* Action buttons when selected — rendered via portal outside SVG to avoid React Flow interaction layer blocking clicks */}
            {selected && !isEditing && !isEditingGuard && (() => {
                const root = document.getElementById('edge-popup-root');
                if (!root) return null;
                const btnSize = Math.round(28 * tScale);
                const iconSize = Math.round(14 * tScale);
                const gap = Math.round(6 * tScale);
                const count = (annotationType ? 1 : 0) + 1 + 1;
                const totalW = count * btnSize + (count - 1) * gap;
                const btn = (color: string): React.CSSProperties => ({
                    width: btnSize, height: btnSize, backgroundColor: color, color: 'white',
                    border: `${Math.max(1, Math.round(2 * tScale))}px solid white`, borderRadius: '50%', cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    userSelect: 'none', flexShrink: 0,
                });
                return createPortal(
                    <div style={{
                        position: 'fixed',
                        left: screenMidX - totalW / 2,
                        top: screenMidY - btnSize / 2,
                        display: 'flex',
                        gap,
                        pointerEvents: 'all',
                        zIndex: 1000,
                    }}>
                        {annotationType && (
                            <div style={btn(edgeColor)} title={"Edit " + annotationType}
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => { e.stopPropagation(); setIsEditing(true); }}>
                                <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
                            </div>
                        )}
                        <div style={btn(edgeColor)} title="Edit guard"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); setGuardValue(data?.guard || ''); setGuardError(''); setIsEditingGuard(true); }}>
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                        </div>
                        <div style={btn('#dc3545')} title="Delete relation"
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); setEdges(eds => eds.filter(edge => edge.id !== id)); }}>
                            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </div>
                    </div>,
                    root
                );
            })()}

            {/* Time edit popup via portal */}
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

            {/* Guard edit popup via portal */}
            {isEditingGuard && (() => {
                const root = document.getElementById('edge-popup-root');
                if (!root) return null;
                const saveGuard = () => {
                    const trimmed = guardValue.trim();
                    if (trimmed) {
                        const allVars: Map<string, string> = new Map(
                            getNodes().flatMap(n => (n.data.variables || []).map((v: any) => [v.name, v.type]).filter(([name]: [string, string]) => !!name))
                        );
                        const unknown = extractFEELIdentifiers(trimmed).filter(i => !allVars.has(i));
                        if (unknown.length > 0) { setGuardError('Unknown variables: ' + unknown.join(', ')); return; }

                        // Type-check literals: parse each clause and verify literal matches variable type
                        const clauses = trimmed.split(/\band\b|\bor\b/i);
                        for (const clause of clauses) {
                            const m = clause.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|!=|>|<|=)\s*(.+)$/);
                            if (!m) continue;
                            const [, varName, , literalRaw] = m;
                            const lit = literalRaw.trim();
                            const type = allVars.get(varName);
                            if (!type) continue;
                            if (type === 'Bool' && lit !== 'true' && lit !== 'false') {
                                setGuardError(`'${varName}' is Bool — value must be true or false`); return;
                            }
                            if (type === 'Int' && isNaN(Number(lit))) {
                                setGuardError(`'${varName}' is Int — value must be a number`); return;
                            }
                            if (type === 'String' && !/^["'].*["']$/.test(lit)) {
                                setGuardError(`'${varName}' is String — value must be quoted, e.g. "${varName} = \\"text\\""`); return;
                            }
                        }
                    }
                    setEdges(eds => eds.map(edge => edge.id === id ? { ...edge, data: { ...edge.data, guard: trimmed || undefined } } : edge));
                    setIsEditingGuard(false);
                    setGuardError('');
                };
                return createPortal(
                    <div
                        style={{
                            position: 'fixed', left: screenMidX - 100, top: screenMidY - 70,
                            zIndex: 9999, backgroundColor: 'white',
                            border: `2px solid ${edgeColor}`, borderRadius: '8px',
                            padding: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                            display: 'flex', flexDirection: 'column', gap: '8px',
                            width: '200px', pointerEvents: 'auto',
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        onPointerDown={e => e.stopPropagation()}
                    >
                        <div style={{ fontSize: '12px', fontWeight: 'bold', textAlign: 'center', color: edgeColor }}>Guard (FEEL)</div>
                        <input
                            ref={guardInputRef}
                            type="text"
                            value={guardValue}
                            onChange={e => { setGuardValue(e.target.value); setGuardError(''); }}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveGuard(); } else if (e.key === 'Escape') { setIsEditingGuard(false); } }}
                            placeholder="e.g. Amount > 5"
                            autoFocus
                            style={{ width: '100%', padding: '5px', border: `1px solid ${guardError ? '#dc3545' : edgeColor}`, borderRadius: '4px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                        />
                        {guardError && <div style={{ fontSize: '11px', color: '#dc3545', textAlign: 'center' }}>{guardError}</div>}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button onMouseDown={e => { e.stopPropagation(); saveGuard(); }}
                                style={{ flex: 1, padding: '5px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>Save</button>
                            <button onMouseDown={e => { e.stopPropagation(); setIsEditingGuard(false); setGuardError(''); }}
                                style={{ flex: 1, padding: '5px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                    </div>,
                    root
                );
            })()}
        </g>
        <EdgeLabelRenderer>
            {/* Annotation value — rendered in HTML layer above nodes */}
            {annotationType && currentValue != null && !isEditing && (
                <div style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelAnnotX}px,${labelAnnotY}px)`,
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: edgeColor,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}>
                    {currentValue as string}
                </div>
            )}
            {/* Guard label — rendered in HTML layer above nodes */}
            {data?.guard && !isEditingGuard && (
                <div style={{
                    position: 'absolute',
                    transform: `translate(-50%, -50%) translate(${labelGuardX}px,${labelGuardY}px)`,
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: edgeColor,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                }}>
                    [{data.guard}]
                </div>
            )}
        </EdgeLabelRenderer>
        </>
    );
};

type LoopSide = 'top' | 'right' | 'bottom' | 'left';

const chooseSelfLoopSide = (nodeId: string, edges: Edge[], nodes: Node[]): { side: LoopSide, sideIndex: number } => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { side: 'right', sideIndex: 0 };
    const nx = node.position.x + (node.width ?? 140) / 2;
    const ny = node.position.y + (node.height ?? 160) / 2;
    const edgeCount = { top: 0, right: 0, bottom: 0, left: 0 };
    const loopCount = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const edge of edges) {
        if (edge.source !== nodeId && edge.target !== nodeId) continue;
        if (edge.source === nodeId && edge.target === nodeId) {
            const s = ((edge.data as any)?.side ?? 'right') as LoopSide;
            if (s in edgeCount) { edgeCount[s]++; loopCount[s]++; }
            continue;
        }
        const otherId = edge.source === nodeId ? edge.target : edge.source;
        const other = nodes.find(n => n.id === otherId);
        if (!other) continue;
        const ox = other.position.x + (other.width ?? 140) / 2;
        const oy = other.position.y + (other.height ?? 160) / 2;
        const dx = ox - nx, dy = oy - ny;
        if (Math.abs(dx) >= Math.abs(dy)) { if (dx >= 0) edgeCount.right++; else edgeCount.left++; }
        else { if (dy >= 0) edgeCount.bottom++; else edgeCount.top++; }
    }
    const sides: LoopSide[] = ['top', 'right', 'bottom', 'left'];
    const best = sides.reduce((b, s) => edgeCount[s] < edgeCount[b] ? s : b, 'right' as LoopSide);
    return { side: best, sideIndex: loopCount[best] };
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
    nodesRef?: React.MutableRefObject<Node[]>;
    simulationMode?: boolean;
    onSimulationNodeClick?: (nodeId: string) => void;
    onNodeFocus?: () => void;
}

const ModelerV2 = ({ nodes: propNodes, edges: propEdges, edgesRef, nodesRef, simulationMode, onSimulationNodeClick, onNodeFocus }: ModelerV2Props = {}) => {
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
    
    // Set nodes immediately; defer edges until after React Flow has had
    // two animation frames to register nodes in its internal store.
    useEffect(() => {
        if (propNodes !== undefined) {
            setNodes(propNodes);
        }
        if (propEdges !== undefined) {
            // Double rAF: first frame commits the node render, second frame
            // gives React Flow time to populate nodeInternals before edges render.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setEdges(propEdges);
                });
            });
        }
    }, [propNodes, propEdges, setNodes, setEdges]);

    // Keep edgesRef and nodesRef in sync so parent can read current state for serialization
    // Use both useEffect (for async updates) and direct assignment (for immediate reads)
    useEffect(() => {
        if (edgesRef) edgesRef.current = edges;
    }, [edges, edgesRef]);

    useEffect(() => {
        if (nodesRef) nodesRef.current = nodes;
    }, [nodes, nodesRef]);

    // Also sync immediately when props arrive so refs are populated before any save
    if (nodesRef && propNodes !== undefined && nodesRef.current.length === 0) {
        nodesRef.current = propNodes;
    }
    if (edgesRef && propEdges !== undefined && edgesRef.current.length === 0) {
        edgesRef.current = propEdges;
    }

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

    const connectStartNodeId = useRef<string | null>(null);

    const onConnectStart = useCallback((_: any, { nodeId }: any) => {
        connectStartNodeId.current = nodeId;
    }, []);

    const onConnectEnd = useCallback((event: any) => {
        const startId = connectStartNodeId.current;
        connectStartNodeId.current = null;
        if (!startId) return;
        const nodeEl = (event.target as Element).closest?.('.react-flow__node');
        if (!nodeEl) return;
        const targetId = nodeEl.getAttribute('data-id');
        if (targetId === startId) {
            setPendingConnection({ source: startId, target: startId });
        }
    }, []);

    // Called by React Flow when user drags from one handle to another
    const onConnect = useCallback((connection: any) => {
        // React Flow with loose connection mode swaps source/target, so we reverse them
        setPendingConnection({ source: connection.target, target: connection.source });
        setSelectedNodeId(connection.target);
    }, []);

    const createEdge = useCallback((relationType: string) => {
        if (!pendingConnection) return;
        const isSelfLoop = pendingConnection.source === pendingConnection.target;
        setEdges(eds => {
            const loopPlacement = isSelfLoop ? chooseSelfLoopSide(pendingConnection.source, eds, nodes) : undefined;
            const newEdge = {
                id: `edge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                source: pendingConnection.source,
                target: pendingConnection.target,
                type: 'custom',
                label: relationType,
                style: { ...EDGE_STYLES[relationType], strokeWidth: 2 },
                data: loopPlacement !== undefined ? { side: loopPlacement.side, sideIndex: loopPlacement.sideIndex } : {},
            };
            return [...eds, newEdge];
        });
        setPendingConnection(null);
    }, [pendingConnection, setEdges, nodes]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: any) => {
        onNodeFocus?.();
        if (simulationMode && onSimulationNodeClick) {
            onSimulationNodeClick(node.id);
            return;
        }
        setSelectedNodeId(node.id);
    }, [onNodeFocus]);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setPendingConnection(null);
        setEdges(eds => eds.map(e => ({ ...e, selected: false })));
    }, [setEdges]);

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
                label: '',
                role: '',
                included: true,
                executed: false,
                pending: false,
                variables: [],
                handles: [],
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

            <ReactFlow
                nodes={nodes}
                edges={edgesWithParallel}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodeClick={onNodeClick}
                nodesDraggable={!simulationMode}
                nodesConnectable={!simulationMode}
                elementsSelectable={!simulationMode}
                onPaneClick={onPaneClick}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                isValidConnection={() => true}
                connectionMode={"loose" as any}
                nodeDragThreshold={1}
                fitView
                fitViewOptions={{ padding: 0.4, maxZoom: 0.75 }}
                attributionPosition="bottom-left"
                nodeOrigin={[0, 0]}
            >
                <svg>
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
            {!simulationMode && <NodePropertiesPanel
                selectedNode={selectedNode}
                allNodes={nodes}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                pendingEdge={null}
                onStartEdge={() => {}}
            />}

            {/* New Node button + Legend — share the same absolute left column */}
            <div style={{
                position: 'absolute',
                top: 70,
                left: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                zIndex: 10,
            }}>
                {!simulationMode && <Button onClick={addRandomNode}>New Node</Button>}

                {/* Legend — hidden in simulation mode */}
                {!simulationMode && <div style={{
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
                        <div style={{width: '30px', height: '3px', backgroundColor: '#28a745'}}></div>
                        <span style={{color: '#28a745', fontWeight: 600}}>Include</span>
                    </div>
                    <div style={{marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <div style={{width: '30px', height: '3px', backgroundColor: '#dc3545'}}></div>
                        <span style={{color: '#dc3545', fontWeight: 600}}>Exclude</span>
                    </div>
                </div>}
            </div>
        </div>
    );
};

export default ModelerV2;
