import { useEffect, useMemo, useRef, useState } from "react";
import { StateEnum, StateProps } from "../App";
import TopRightIcons from "../utilComponents/TopRightIcons";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import { BiHome, BiLeftArrowCircle, BiSolidFlame, BiUpload } from "react-icons/bi";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import { copyMarking, mergeViolations, parseLog, quantifyViolations, replayTraceS } from "dcr-engine";
import { DCRGraphS, EventLog, RelationViolations, RoleTrace } from "dcr-engine";
import { mergeActivations } from "dcr-engine/src/conformance";
import { RelationActivations } from "dcr-engine/src/types";
import { toast } from "react-toastify";
import FileUpload from "../utilComponents/FileUpload";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Label from "../utilComponents/Label";
import TraceView from "../utilComponents/TraceView";
import ReplayResults from "./ReplayResults";
import HeatmapResults from "./HeatmapResults";
import styled from "styled-components";
import { loadDCRFromXML, parseDurationMs } from "../utils/dcrToReactFlow";
import ModelerV2 from "./ModelerV2";
import { Node, Edge } from "reactflow";
import { ReplayLogResults, ViolationLogResults } from "../types";

const HeatmapButton = styled(BiSolidFlame)<{ $clicked: boolean; $disabled?: boolean }>`
    ${p => p.$clicked ? `
        background-color: black !important;
        color: white;
    ` : ``}
    ${p => p.$disabled ? `
        color: grey;
        border-color: grey !important;
        cursor: default !important;
        &:hover { box-shadow: none !important; }
    ` : ""}
`;

// Build a DCRGraphS from React Flow nodes/edges
function buildDCRGraphS(nodes: Node[], edges: Edge[]): DCRGraphS {
    const events = new Set(nodes.map(n => n.id));
    const labelMap: Record<string, string> = {};
    const labelMapInvRaw: Record<string, Set<string>> = {};
    const labelMapInv: Record<string, Set<string>> = new Proxy(labelMapInvRaw, {
        get: (target, key: string) => key in target ? target[key] : new Set<string>(),
    });
    const marking = {
        executed: new Set<string>(),
        included: new Set<string>(),
        pending: new Set<string>(),
    };
    const roleMap: Record<string, string> = {};
    const roles = new Set<string>();

    nodes.forEach(n => {
        const lbl = n.data.label || n.id;
        labelMap[n.id] = lbl;
        if (!labelMapInvRaw[lbl]) labelMapInvRaw[lbl] = new Set();
        labelMapInvRaw[lbl].add(n.id);
        if (n.data.included !== false) marking.included.add(n.id);
        if (n.data.executed) marking.executed.add(n.id);
        if (n.data.pending) marking.pending.add(n.id);
        // Always set roleMap — empty string means "any role" (open world)
        roleMap[n.id] = n.data.role || '';
        if (n.data.role) roles.add(n.data.role);
    });

    const labels = new Set(Object.values(labelMap));

    // Every event must have an entry (even if empty) — engine iterates without null checks
    const makeRelation = () => new Proxy({} as Record<string, Set<string>>, {
        get(target, key: string) { return key in target ? target[key] : new Set<string>(); },
    });

    const conditionsFor = makeRelation();
    const responseTo = makeRelation();
    const excludesTo = makeRelation();
    const includesTo = makeRelation();
    const milestonesFor = makeRelation();
    nodes.forEach(n => {
        conditionsFor[n.id] = new Set();
        responseTo[n.id] = new Set();
        excludesTo[n.id] = new Set();
        includesTo[n.id] = new Set();
        milestonesFor[n.id] = new Set();
    });

    const guardMap: Record<string, Record<string, Record<string, string>>> = {};
    const timeConstraintMap: Record<string, Record<string, { delay?: number; deadline?: number }>> = {};
    edges.forEach(e => {
        const s = e.source, t = e.target;
        const type = e.label as string;
        if (type === 'condition') {
            if (!conditionsFor[t]) conditionsFor[t] = new Set();
            conditionsFor[t].add(s);
        } else if (type === 'response') {
            if (!responseTo[s]) responseTo[s] = new Set();
            responseTo[s].add(t);
        } else if (type === 'exclude') {
            if (!excludesTo[s]) excludesTo[s] = new Set();
            excludesTo[s].add(t);
        } else if (type === 'include') {
            if (!includesTo[s]) includesTo[s] = new Set();
            includesTo[s].add(t);
        } else if (type === 'milestone') {
            if (!milestonesFor[t]) milestonesFor[t] = new Set();
            milestonesFor[t].add(s);
        }
        if (e.data?.guard && type) {
            if (!guardMap[s]) guardMap[s] = {};
            if (!guardMap[s][t]) guardMap[s][t] = {};
            guardMap[s][t][type] = e.data.guard;
        }
        if (type === 'condition' && e.data?.delay) {
            const ms = parseDurationMs(e.data.delay);
            if (ms > 0) {
                if (!timeConstraintMap[s]) timeConstraintMap[s] = {};
                if (!timeConstraintMap[s][t]) timeConstraintMap[s][t] = {};
                timeConstraintMap[s][t].delay = ms;
            }
        }
        if (type === 'response' && e.data?.deadline) {
            const ms = parseDurationMs(e.data.deadline);
            if (ms > 0) {
                if (!timeConstraintMap[s]) timeConstraintMap[s] = {};
                if (!timeConstraintMap[s][t]) timeConstraintMap[s][t] = {};
                timeConstraintMap[s][t].deadline = ms;
            }
        }
    });

    return {
        events,
        labels,
        labelMap,
        labelMapInv,
        marking,
        conditionsFor,
        responseTo,
        excludesTo,
        includesTo,
        milestonesFor,
        subProcesses: {},
        subProcessMap: {},
        roles,
        roleMap,
        guardMap,
        timeConstraintMap,
    } as unknown as DCRGraphS;
}

// Map relation type to violation key
const VIOLATION_KEYS: Record<string, keyof RelationViolations> = {
    condition: 'conditionsFor',
    response: 'responseTo',
    exclude: 'excludesTo',
    milestone: 'milestonesFor',
};
const ACTIVATION_KEYS: Record<string, keyof RelationActivations> = {
    condition: 'conditionsFor',
    response: 'responseTo',
    exclude: 'excludesTo',
    milestone: 'milestonesFor',
    include: 'includesTo',
};

const ConformanceV2State = ({ setState, savedGraphs, savedLogs, lastSavedGraph, lastSavedLog }: StateProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [heatmapMode, setHeatmapMode] = useState(false);

    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const graphRef = useRef<{ initial: DCRGraphS; current: DCRGraphS } | null>(null);
    const [graphName, setGraphName] = useState<string>('');
    const defaultVarsRef = useRef<Record<string, number | string | boolean>>({});

    const [logResults, setLogResults] = useState<ReplayLogResults>([]);
    const [violationLogResults, setViolationLogResults] = useState<ViolationLogResults>([]);
    const [logName, setLogName] = useState<string>('');
    const [selectedTrace, setSelectedTrace] = useState<{ traceId: string; traceName: string; trace: RoleTrace } | null>(null);


    const totalLogResults = useMemo<{
        totalViolations: number;
        totalTimeViolations: number;
        violations: RelationViolations;
        timeViolations: RelationViolations;
        activations: RelationActivations;
    } | undefined>(() => {
        if (violationLogResults.length === 0) return undefined;
        return violationLogResults.reduce((acc, cum) => cum.results ? {
            totalViolations: acc.totalViolations + cum.results.totalViolations,
            totalTimeViolations: acc.totalTimeViolations + cum.results.totalTimeViolations,
            violations: mergeViolations(acc.violations, cum.results.violations),
            timeViolations: mergeViolations(acc.timeViolations, cum.results.timeViolations),
            activations: mergeActivations(acc.activations, cum.results.activations),
        } : acc, {
            totalViolations: 0,
            totalTimeViolations: 0,
            violations: { conditionsFor: {}, responseTo: {}, excludesTo: {}, milestonesFor: {} },
            timeViolations: { conditionsFor: {}, responseTo: {}, excludesTo: {}, milestonesFor: {} },
            activations: { conditionsFor: {}, responseTo: {}, excludesTo: {}, milestonesFor: {}, includesTo: {} },
        });
    }, [violationLogResults]);

    // Use selected trace results if available, otherwise aggregate
    const activeResults = useMemo(() => {
        if (selectedTrace) {
            return violationLogResults.find(r => r.traceId === selectedTrace.traceId)?.results ?? totalLogResults;
        }
        return totalLogResults;
    }, [selectedTrace, violationLogResults, totalLogResults]);

    // Recompute edge heatmap colors: red=violated, orange=time-violated, green=activated+ok, gray=never activated
    const edgeHeatmap = useMemo<Record<string, '#dc3545' | '#FFD600' | '#28a745' | '#adb5bd'>>(() => {
        const result: Record<string, '#dc3545' | '#FFD600' | '#28a745' | '#adb5bd'> = {};
        if (!activeResults || !heatmapMode) return result;
        edges.forEach(e => {
            const violKey = VIOLATION_KEYS[e.label as string];
            const actKey = ACTIVATION_KEYS[e.label as string];
            if (!violKey || !actKey) return;
            const isConditionStyle = violKey === 'conditionsFor' || violKey === 'milestonesFor';
            const outer = isConditionStyle ? e.target : e.source;
            const inner = isConditionStyle ? e.source : e.target;
            const violated = (activeResults.violations[violKey]?.[outer]?.[inner] ?? 0) > 0;
            const timeViolated = (activeResults.timeViolations?.[violKey]?.[outer]?.[inner] ?? 0) > 0;
            const activated = (activeResults.activations[actKey]?.[outer]?.[inner] ?? 0) > 0;
            if (violated) result[e.id] = '#dc3545';
            else if (timeViolated) result[e.id] = '#FFD600';
            else if (activated) result[e.id] = '#28a745';
            else result[e.id] = '#adb5bd';
        });
        return result;
    }, [activeResults, heatmapMode, edges]);

    // Apply heatmap coloring to edges
    const displayEdges = useMemo(() => {
        if (!heatmapMode) return edges.map(e => ({ ...e, data: { ...e.data, heatmapColor: undefined } }));
        return edges.map(e => ({
            ...e,
            data: { ...e.data, heatmapColor: edgeHeatmap[e.id] ?? '#adb5bd' },
        }));
    }, [edges, heatmapMode, edgeHeatmap]);

    const extractDefaultVariables = (ns: Node[]): Record<string, number | string | boolean> => {
        const defaults: Record<string, number | string | boolean> = {};
        ns.forEach(n => (n.data.variables || []).forEach((v: any) => {
            const nm = v.name?.trim();
            if (nm && v.defaultValue !== undefined && v.defaultValue !== '') {
                if (v.type === 'Bool') defaults[nm] = v.defaultValue === 'true';
                else defaults[nm] = isNaN(Number(v.defaultValue)) ? v.defaultValue : Number(v.defaultValue);
            }
        }));
        return defaults;
    };

    // Strip all execution markings — conformance view is static
    const resetNodeMarkings = (ns: Node[]) => ns.map(n => ({
        ...n,
        data: { ...n.data, executed: false, pending: false, included: true, enabled: false, simulationMode: false },
    }));

    const loadGraph = async (xmlString: string, name?: string) => {
        try {
            const { nodes: n, edges: e } = await loadDCRFromXML(xmlString);
            setNodes(resetNodeMarkings(n));
            setEdges(e);
            const graph = buildDCRGraphS(n, e);
            const initVars = extractDefaultVariables(n);
            defaultVarsRef.current = initVars;
            graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
            if (name) setGraphName(name);
            // Re-run results if log already loaded
            if (logResults.length > 0) {
                const newResults = logResults.map(({ traceId, trace }) => ({
                    traceId, trace, isPositive: replayTraceS(graph, trace, initVars),
                }));
                setLogResults(newResults);
            }
            if (violationLogResults.length > 0) {
                const newViolations = violationLogResults.map(({ traceId, trace }) => ({
                    traceId, trace, results: quantifyViolations(graph, trace, initVars),
                }));
                setViolationLogResults(newViolations);
            }
            toast.success('Graph loaded!');
        } catch (e) {
            console.error(e);
            toast.error('Unable to parse XML...');
        }
    };

    const openLog = (name: string, log: EventLog<RoleTrace>, graph: DCRGraphS | undefined, initVars: Record<string, number | string | boolean> = {}) => {
        const replay = Object.keys(log.traces).map(traceId => ({
            traceId,
            trace: log.traces[traceId],
            isPositive: graph ? replayTraceS(graph, log.traces[traceId], initVars) : undefined,
        }));
        const violations = Object.keys(log.traces).map(traceId => ({
            traceId,
            trace: log.traces[traceId],
            results: graph ? quantifyViolations(graph, log.traces[traceId], initVars) : undefined,
        }));
        setLogName(name);
        setLogResults(replay);
        setViolationLogResults(violations);
    };

    // Load last saved graph on mount
    const hasLoadedRef = useRef(false);
    useEffect(() => {
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        const lastGraph = lastSavedGraph.current;
        const initXml = lastGraph ? savedGraphs[lastGraph] : undefined;
        if (initXml) loadGraph(initXml, lastGraph);
        const lastLog = lastSavedLog.current;
        const initLog = lastLog ? savedLogs[lastLog] : undefined;
        if (initLog && graphRef.current) openLog(lastLog!, initLog, graphRef.current.current, defaultVarsRef.current);
    }, []);

    const savedGraphElements = (): ModalMenuElement[] =>
        Object.keys(savedGraphs).length > 0 ? [{
            text: 'Saved Graphs:',
            elements: Object.keys(savedGraphs).map(name => ({
                icon: <BiLeftArrowCircle />,
                text: name,
                onClick: () => { loadGraph(savedGraphs[name], name); setMenuOpen(false); },
            })),
        }] : [];

    const savedLogElements = (): ModalMenuElement[] =>
        Object.keys(savedLogs).length > 0 ? [{
            text: 'Saved Logs:',
            elements: Object.keys(savedLogs).map(name => ({
                icon: <BiLeftArrowCircle />,
                text: name,
                onClick: () => { openLog(name, savedLogs[name], graphRef.current?.current, defaultVarsRef.current); setMenuOpen(false); },
            })),
        }] : [];

    const menuElements: ModalMenuElement[] = [
        {
            text: 'Open Model',
            elements: [
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload accept="text/xml" fileCallback={(name, contents) => {
                                loadGraph(contents, name.replace(/\.xml$/i, ''));
                                setMenuOpen(false);
                            }}>
                                <div /><>Open XML</>
                            </FileUpload>
                        </StyledFileUpload>
                    ),
                },
            ],
        },
        {
            customElement: (
                <StyledFileUpload>
                    <FileUpload accept=".xes" fileCallback={(name, contents) => {
                        try {
                            const log = parseLog(contents);
                            openLog(name.slice(0, -4), log, graphRef.current?.current, defaultVarsRef.current);
                            setMenuOpen(false);
                        } catch (e) {
                            console.error('Parse log error:', e);
                            toast.error('Cannot parse log: ' + (e instanceof Error ? e.message : String(e)));
                        }
                    }}>
                        <BiUpload /><>Upload Log</>
                    </FileUpload>
                </StyledFileUpload>
            ),
        },
        ...savedGraphElements(),
        ...savedLogElements(),
    ];

    return (
        <>
            <ModelerV2
                nodes={nodes}
                edges={displayEdges}
                simulationMode={true}
            />

            {logResults.length > 0 && !heatmapMode && (
                <ReplayResults
                    logName={logName}
                    logResults={logResults}
                    selectedTrace={selectedTrace}
                    setLogResults={setLogResults}
                    setSelectedTrace={setSelectedTrace}
                />
            )}

            {violationLogResults.length > 0 && heatmapMode && (
                <HeatmapResults
                    modelerRef={{ current: null }}
                    totalLogResults={totalLogResults}
                    logName={logName}
                    violationLogResults={violationLogResults}
                    selectedTrace={selectedTrace}
                    setViolationLogResults={setViolationLogResults}
                    setSelectedTrace={setSelectedTrace}
                />
            )}

            {selectedTrace && (
                <TraceView
                    graphRef={graphRef}
                    selectedTrace={selectedTrace}
                    setSelectedTrace={setSelectedTrace}
                    stepViolations={violationLogResults.find(r => r.traceId === selectedTrace.traceId)?.results?.stepViolations}
                    onCloseCallback={() => {}}
                />
            )}

            <TopRightIcons>
                <HeatmapButton
                    $clicked={heatmapMode}
                    $disabled={violationLogResults.length === 0}
                    title="Toggle violation heatmap"
                    onClick={() => {
                        if (violationLogResults.length === 0) return;
                        setHeatmapMode(m => !m);
                    }}
                />
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    );
};

export default ConformanceV2State;
