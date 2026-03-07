import { Handle, NodeProps, Position } from "reactflow";
import styled from "styled-components";

interface DCRNodeData {
    label: string;
    role: string;
    included: boolean;
    executed: boolean;
    pending: boolean;
    handles?: Array<{
        side: string;
        position: number;
        handleId: string;
        type: 'source' | 'target';
    }>;
    variables?: Array<any>;
}

const EventNodeContainer = styled.div<{ $included: boolean; $pending: boolean }>`
    border: ${p => p.$included ? '3px solid #000' : '3px dashed #999'};
    border-radius: 8px;
    background-color: #ffffff;
    width: 140px;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    position: relative;
    ${p => p.$pending && `
        border-color: #dc3545;
        border-width: 4px;
        box-shadow: 0 0 12px rgba(220,53,69,0.4);
    `}
    &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
`;

// The drag handle — covers the whole node so user can drag from anywhere
// that isn't a react-flow handle
const DragArea = styled.div`
    position: absolute;
    inset: 0;
    z-index: 0;
    cursor: grab;
    &:active { cursor: grabbing; }
    border-radius: 8px;
`;

const RoleLabel = styled.div`
    padding: 12px;
    background-color: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    font-size: 13px;
    font-weight: 600;
    color: #495057;
    text-align: center;
    letter-spacing: 0.5px;
    position: relative;
    z-index: 1;
    border-radius: 5px 5px 0 0;
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
    position: relative;
    z-index: 1;
`;

const StatusIcon = styled.div<{ $position: 'top-left' | 'top-right'; $color: string }>`
    position: absolute;
    ${p => p.$position === 'top-left' ? 'left: 8px;' : 'right: 8px;'}
    top: 8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: ${p => p.$color};
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: bold;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
`;

const DataIcon = styled.div`
    position: absolute;
    top: 0; right: 0;
    width: 18px; height: 18px;
    overflow: hidden;
    pointer-events: none;
    z-index: 10;
    &::before {
        content: '';
        position: absolute;
        top: 0; right: 0;
        border-style: solid;
        border-width: 0 18px 18px 0;
        border-color: transparent #aaa transparent transparent;
    }
    &::after {
        content: '';
        position: absolute;
        top: 0; right: 0;
        border-style: solid;
        border-width: 0 16px 16px 0;
        border-color: transparent white transparent transparent;
    }
`;

// Single handle covering the entire node — easy connect pattern
const nodeHandleStyle = {
    width: '100%',
    height: '100%',
    position: 'absolute' as const,
    top: 0,
    left: 0,
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    opacity: 0,
    zIndex: 5,
    cursor: 'crosshair',
};

const DCREventNode = ({ data }: NodeProps<DCRNodeData>) => {
    const getPositionStyle = (position: number, side: string) => {
        const percent = `${position * 100}%`;
        return (side === 'left' || side === 'right') ? { top: percent } : { left: percent };
    };

    const getPosition = (side: string): Position => {
        switch (side) {
            case 'left':   return Position.Left;
            case 'right':  return Position.Right;
            case 'top':    return Position.Top;
            case 'bottom': return Position.Bottom;
            default:       return Position.Right;
        }
    };

    return (
        <EventNodeContainer $included={data.included} $pending={data.pending}>

            {/* Drag area — use className so ReactFlow knows this is the drag handle */}
            <DragArea className="drag-handle" />

            {/* Single source+target handle covering whole node (easy connect) */}
            <Handle
                type="source"
                position={Position.Top}
                id="node-handle"
                style={nodeHandleStyle}
            />
            <Handle
                type="target"
                position={Position.Top}
                id="node-handle-target"
                style={nodeHandleStyle}
            />

            {/* XML waypoint handles — kept invisible for loaded graph routing */}
            {data.handles && data.handles.map(h => (
                <Handle
                    key={h.handleId}
                    type={h.type}
                    position={getPosition(h.side)}
                    id={h.handleId}
                    style={{ opacity: 0, width: 8, height: 8, ...getPositionStyle(h.position, h.side) }}
                />
            ))}

            <RoleLabel>{data.role}</RoleLabel>

            <EventLabel>
                {data.variables && data.variables.length > 0 && <DataIcon />}
                {data.executed && <StatusIcon $position="top-left"  $color="#28a745">✓</StatusIcon>}
                {data.pending  && <StatusIcon $position="top-right" $color="#2192FF">!</StatusIcon>}
                {data.label}
            </EventLabel>

        </EventNodeContainer>
    );
};

export default DCREventNode;
