import { Position } from 'reactflow';

function getNodeIntersection(intersectionNode: any, targetNode: any) {
    const { width: w2, height: h2, positionAbsolute: pos2 } = intersectionNode;
    const pos1 = targetNode.positionAbsolute;

    const cx2 = pos2.x + w2 / 2;
    const cy2 = pos2.y + h2 / 2;
    const cx1 = pos1.x + targetNode.width / 2;
    const cy1 = pos1.y + targetNode.height / 2;

    const xx1 = (cx1 - cx2) / (2 * (w2 / 2)) - (cy1 - cy2) / (2 * (h2 / 2));
    const yy1 = (cx1 - cx2) / (2 * (w2 / 2)) + (cy1 - cy2) / (2 * (h2 / 2));
    const a = 1 / (Math.abs(xx1) + Math.abs(yy1));
    const xx3 = a * xx1;
    const yy3 = a * yy1;

    return {
        x: (w2 / 2) * (xx3 + yy3) + cx2,
        y: (h2 / 2) * (-xx3 + yy3) + cy2,
    };
}

function getEdgePosition(node: any, intersect: { x: number; y: number }): Position {
    const n = { ...node.positionAbsolute, ...node };
    const nx = Math.round(n.x);
    const ny = Math.round(n.y);
    const px = Math.round(intersect.x);
    const py = Math.round(intersect.y);

    if (px <= nx + 1) return Position.Left;
    if (px >= nx + Math.round(node.width) - 1) return Position.Right;
    if (py <= ny + 1) return Position.Top;
    if (py >= ny + Math.round(node.height) - 1) return Position.Bottom;
    return Position.Top;
}

export function getFloatingEdgeParams(
    sourceNode: any,
    targetNode: any,
    parallelIndex = 0,
    parallelTotal = 1,
) {
    const sourceIntersect = getNodeIntersection(sourceNode, targetNode);
    const targetIntersect = getNodeIntersection(targetNode, sourceNode);

    const sourcePos = getEdgePosition(sourceNode, sourceIntersect);
    const targetPos = getEdgePosition(targetNode, targetIntersect);

    const SPACING = 20;
    const offset = parallelTotal > 1
        ? (parallelIndex - (parallelTotal - 1) / 2) * SPACING
        : 0;

    let sx = sourceIntersect.x;
    let sy = sourceIntersect.y;
    let tx = targetIntersect.x;
    let ty = targetIntersect.y;

    if (offset !== 0) {
        // CANONICAL direction: always from the node with the smaller id toward the other.
        // This ensures A->B and B->A use the same perpendicular axis,
        // so their offsets go to opposite sides rather than cancelling out.
        const aNode = sourceNode.id < targetNode.id ? sourceNode : targetNode;
        const bNode = sourceNode.id < targetNode.id ? targetNode : sourceNode;
        const aCenter = {
            x: aNode.positionAbsolute.x + aNode.width / 2,
            y: aNode.positionAbsolute.y + aNode.height / 2,
        };
        const bCenter = {
            x: bNode.positionAbsolute.x + bNode.width / 2,
            y: bNode.positionAbsolute.y + bNode.height / 2,
        };
        const cdx = bCenter.x - aCenter.x;
        const cdy = bCenter.y - aCenter.y;
        const len = Math.sqrt(cdx * cdx + cdy * cdy) || 1;

        // Perpendicular to canonical direction
        const px = (-cdy / len) * offset;
        const py = (cdx / len) * offset;

        if (sourcePos === Position.Top || sourcePos === Position.Bottom) {
            sx += px;
        } else {
            sy += py;
        }
        if (targetPos === Position.Top || targetPos === Position.Bottom) {
            tx += px;
        } else {
            ty += py;
        }
    }

    return { sx, sy, tx, ty, sourcePos, targetPos };
}
