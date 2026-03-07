import { Handle, NodeProps, Position } from "reactflow";
import styled from "styled-components";

interface DCRNodeData {
    label: string;
    role: string;
    included: boolean;
    executed: boolean;
    pending: boolean;
    enabled?: boolean;       // computed during simulation
    simulationMode?: boolean;
    handles?: Array<{
        side: string;
        position: number;
        handleId: string;
        type: 'source' | 'target';
    }>;
    variables?: Array<any>;
    delayUntil?: string;    // ISO datetime string — when delay expires
    deadline?: string;      // ISO datetime string — when deadline expires

}

const EventNodeContainer = styled.div<{ $included: boolean; $pending: boolean; $enabled?: boolean; $simulationMode?: boolean }>`
    border: ${p => p.$included ? '3px solid #000' : '3px dashed #999'};
    border-radius: 8px;
    background-color: #ffffff;
    width: 140px;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    position: relative;
    ${p => p.$pending && !p.$simulationMode && `
        border-color: #dc3545;
        border-width: 4px;
        box-shadow: 0 0 12px rgba(220,53,69,0.4);
    `}
    ${p => p.$simulationMode && p.$enabled && `
        border-color: #28a745;
        border-width: 3px;
        box-shadow: 0 0 14px rgba(40,167,69,0.45);
        cursor: pointer;
    `}
    ${p => p.$simulationMode && !p.$enabled && `
        cursor: not-allowed;
        opacity: 0.75;
    `}
    &:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.25); }
    ${p => p.$simulationMode && p.$enabled && `&:hover { box-shadow: 0 0 18px rgba(40,167,69,0.6); }`}
`;

// The drag handle — covers the whole node so user can drag from anywhere
// that isn't a react-flow handle
const DragArea = styled.div<{ $simulationMode?: boolean }>`
    position: absolute;
    inset: 0;
    z-index: 0;
    cursor: ${p => p.$simulationMode ? 'default' : 'grab'};
    &:active { cursor: ${p => p.$simulationMode ? 'default' : 'grabbing'}; }
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

const TimeInfo = styled.div<{ $color: string }>`
    font-size: 9px;
    color: ${p => p.$color};
    text-align: center;
    padding: 2px 6px 4px;
    line-height: 1.3;
    position: relative;
    z-index: 1;
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

    const simMode = !!data.simulationMode;
    const handleStyle = simMode
        ? { ...nodeHandleStyle, cursor: 'default', pointerEvents: 'none' as const }
        : nodeHandleStyle;

    return (
        <EventNodeContainer
            $included={data.included}
            $pending={data.pending}
            $enabled={data.enabled}
            $simulationMode={simMode}
        >
            {/* Drag area — disabled in simulation mode */}
            <DragArea className={simMode ? undefined : 'drag-handle'} $simulationMode={simMode} />

            {/* Default center handles — always present so edges can connect.
                In simulation mode they are fully invisible and non-interactive. */}
            <Handle
                type="source"
                position={Position.Top}
                id="node-handle"
                style={simMode ? { opacity: 0, pointerEvents: 'none' } : nodeHandleStyle}
            />
            <Handle
                type="target"
                position={Position.Top}
                id="node-handle-target"
                style={simMode ? { opacity: 0, pointerEvents: 'none' } : nodeHandleStyle}
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
                {data.executed && <StatusIcon $position="top-left"  $color="#28a745">✓</StatusIcon>}
                {data.pending  && <StatusIcon $position="top-right" $color="#2192FF">!</StatusIcon>}
                {data.variables && data.variables.length > 0 && <DataIcon />}
                {data.label}
            </EventLabel>
            {data.delayUntil && (
                <TimeInfo $color="#856404">⏳ Delay until:<br/>{data.delayUntil}</TimeInfo>
            )}
            {data.deadline && (
                <TimeInfo $color="#0c5460">
                    ⏰ Deadline:<br/>{data.deadline}
                </TimeInfo>
            )}

        </EventNodeContainer>
    );
};

export default DCREventNode;
