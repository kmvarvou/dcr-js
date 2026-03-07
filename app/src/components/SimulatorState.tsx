import { useEffect, useRef, useState, useCallback } from "react";
import { StateEnum, StateProps } from "../App";
import { toast } from "react-toastify";
import TopRightIcons from "../utilComponents/TopRightIcons";
import { BiHome, BiLeftArrowCircle, BiMeteor, BiPlus, BiUpload } from "react-icons/bi";
import ModelerV2 from "./ModelerV2";

import {
    isEnabledS, executeS, copyMarking, isAcceptingS,
    RoleTrace, DCRGraphS, EventLog, parseLog, writeEventLog
} from "dcr-engine";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import styled from "styled-components";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import FileUpload from "../utilComponents/FileUpload";
import Button from "../utilComponents/Button";
import { saveAs } from "file-saver";
import EventLogView from "./EventLogView";
import TraceView from "../utilComponents/TraceView";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import MenuElement from "../utilComponents/MenuElement";
import Label from "../utilComponents/Label";
import { loadDCRFromXML, buildDCRGraph, parseDurationMs } from "../utils/dcrToReactFlow";
import { Node, Edge } from "reactflow";
import { evaluateGuard, VariableStore } from "../utils/evaluateGuard";



function formatClock(d: Date): string {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
        + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}


type VariablePopup = {
    nodeId: string;
    variableName: string;
    variableType: string;
};

const ClockBar = styled.div`
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 10px 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 12px;
    z-index: 100;
    font-size: 14px;
`;

const GreyOut = styled.div`
    position: fixed;
    height: 100%;
    width: 100%;
    top: 0;
    left: 0;
    cursor: default;
    opacity: 50%;
    background-color: grey;
    z-index: 3;
`;

const WildButton = styled(BiMeteor)<{ $clicked: boolean; $disabled?: boolean }>`
    ${props => props.$clicked ? `background-color: black !important; color: white;` : ``}
    ${props => props.$disabled ? `color: grey; border-color: grey !important; cursor: default !important; &:hover { box-shadow: none !important; }` : ""}
`;

const FinalizeButton = styled(Button)`
    margin: auto;
    margin-bottom: 0;
    width: fit-content;
`;

enum SimulatingEnum { Default, Wild, Not }



type VS = { [k: string]: number | string | boolean };
function applyMarkingToNodes(
    nodes: Node[],
    graph: DCRGraphS,
    simulationMode = true,
    variableStore: VS = {},
    clock?: Date,
    timeConstraints?: Record<string, { delayUntil?: Date; deadline?: Date }>,
    edges: Edge[] = [],
    wildMode = false
): Node[] {
    return nodes.map(n => {
        const group = (graph as any).subProcessMap?.[n.id] ? (graph as any).subProcessMap[n.id] : graph;

        const tc = timeConstraints?.[n.id];
        let enabled: boolean;
        let msg: string;
        if (wildMode) {
            enabled = true;
            msg = '';
        } else if (tc?.delayUntil && clock && clock < tc.delayUntil) {
            enabled = false;
            msg = 'Delay not yet elapsed';
        } else {
            const r = isEnabledS(n.id, graph, group, variableStore);
            enabled = r.enabled;
            msg = r.msg;
        }

        
        const showDelay = !!tc?.delayUntil && edges
            .filter(e => e.target === n.id && e.label === 'condition' && e.data?.delay)
            .some(e => !e.data?.guard || evaluateGuard(e.data.guard, variableStore));

        const showDeadline = !!tc?.deadline && edges
            .filter(e => e.target === n.id && e.label === 'response' && e.data?.deadline)
            .some(e => !e.data?.guard || evaluateGuard(e.data.guard, variableStore));

        return {
            ...n,
            data: {
                ...n.data,
                included: graph.marking.included.has(n.id),
                executed: graph.marking.executed.has(n.id),
                pending: graph.marking.pending.has(n.id),
                enabled,
                simulationMode,
                delayUntil: showDelay ? formatClock(tc!.delayUntil!) : undefined,
                deadline: showDeadline ? formatClock(tc!.deadline!) : undefined,
            },
        };
    });
}

const SimulatorState = ({ setState, savedGraphs, setSavedGraphs, savedLogs, setSavedLogs, lastSavedGraph, lastSavedLog }: StateProps) => {
    const graphRef = useRef<{ initial: DCRGraphS; current: DCRGraphS } | null>(null);
    const nodesRef = useRef<Node[]>([]);
    const edgesRef = useRef<Edge[]>([]);

    const [graphState, setGraphState] = useState<{ nodes: Node[], edges: Edge[] }>({ nodes: [], edges: [] });
    const nodes = graphState.nodes;
    const edges = graphState.edges;
    const setNodes = (n: Node[] | ((prev: Node[]) => Node[])) => 
        setGraphState(prev => ({ ...prev, nodes: typeof n === 'function' ? n(prev.nodes) : n }));
    const setEdges = (e: Edge[] | ((prev: Edge[]) => Edge[])) => 
        setGraphState(prev => ({ ...prev, edges: typeof e === 'function' ? e(prev.edges) : e }));
    const [menuOpen, setMenuOpen] = useState(false);
    const [simulating, setSimulating] = useState<SimulatingEnum>(SimulatingEnum.Not);
    const [wildMode, setWildMode] = useState(false);

    const [selectedTrace, setSelectedTrace] = useState<{ traceId: string; traceName: string; trace: RoleTrace } | null>(null);
    const [eventLog, setEventLog] = useState<{
        name: string;
        traces: { [traceId: string]: { traceId: string; traceName: string; trace: RoleTrace } };
    }>({ name: "Unnamed Event Log", traces: {} });
    const [traceName, setTraceName] = useState("Trace 1");

    const isSimulatingRef = useRef<SimulatingEnum>(SimulatingEnum.Not);
    const traceRef = useRef<{ traceId: string; trace: RoleTrace } | null>(null);
    type ExtendedEntry = { activity: string; role: string; timestamp: Date; variables?: Record<string, any> };
    const extendedTraceRef = useRef<ExtendedEntry[]>([]);
    const savedExtendedTraces = useRef<Record<string, ExtendedEntry[]>>({});

   
    const [variableStore, setVariableStore] = useState<VariableStore>({});
    const variableStoreRef = useRef<VariableStore>({});
    const [variablePopup, setVariablePopup] = useState<VariablePopup | null>(null);
    const [variableInputValue, setVariableInputValue] = useState<string>("");
    
    const [clock, setClock] = useState<Date>(() => new Date());
    const clockRef = useRef<Date>(new Date());
    const [advanceValue, setAdvanceValue] = useState<number>(1);
    const [advanceUnit, setAdvanceUnit] = useState<'days' | 'hours' | 'minutes' | 'seconds'>('days');
    
    const timeConstraintsRef = useRef<Record<string, { delayUntil?: Date; deadline?: Date }>>({});

    
    const [variableAnnotations, setVariableAnnotations] = useState<{ [stepIndex: number]: string }>({});
    const variableAnnotationsRef = useRef<{ [stepIndex: number]: string }>({});
    
    const [displayTrace, setDisplayTrace] = useState<RoleTrace>([]);
    const displayTraceRef = useRef<RoleTrace>([]);

   
    const updateVariableStore = (updates: VariableStore) => {
        const next = { ...variableStoreRef.current, ...updates };
        variableStoreRef.current = next;
        setVariableStore(next);
    };

    
    useEffect(() => {
        const lastLog = lastSavedLog.current;
        const initLog = lastLog ? savedLogs[lastLog] : undefined;
        if (initLog && lastLog) {
            openLog(lastLog, initLog);
        } else {
            setEventLog({ name: "Unnamed Event Log", traces: { "Trace 1": { traceId: "Trace 1", traceName: "", trace: [] } } });
        }

        const lastGraph = lastSavedGraph.current;
        const initXml = lastGraph ? savedGraphs[lastGraph] : undefined;
        if (initXml) {
            loadGraph(initXml).then((loadedNodes) => {
                isSimulatingRef.current = SimulatingEnum.Default;
                setSimulating(SimulatingEnum.Default);
                const traceId = "Trace 1";
                setEventLog({ name: "Unnamed Event Log", traces: { [traceId]: { traceId, traceName: traceId, trace: [] } } });
                setSelectedTrace({ traceId, traceName: traceId, trace: [] });
                traceRef.current = { traceId, trace: [] };
                setTraceName(traceId);
                if (loadedNodes) applyDefaultsFromNodes(loadedNodes);
            });
        } else {
            toast.warn("No saved graph found. Please save a graph in the modeler first.");
        }
    }, []);

    const loadGraph = async (xmlString: string): Promise<Node[] | undefined> => {
        try {
            if (xmlString.includes("multi-instance=\"true\"")) {
                toast.error("Multi-instance subprocesses not supported...");
                return undefined;
            }
            const { nodes: loadedNodes, edges: loadedEdges } = await loadDCRFromXML(xmlString);
            const graph = buildDCRGraph(loadedNodes, loadedEdges);
            graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
            setGraphState({ nodes: applyMarkingToNodes(loadedNodes, graph, true, {}, clockRef.current, timeConstraintsRef.current, loadedEdges), edges: loadedEdges });
            return loadedNodes;
        } catch (e) {
            console.error(e);
            toast.error("Unable to parse XML...");
            return undefined;
        }
    };

    const applyDefaultsFromNodes = (loadedNodes: Node[]) => {
        const defaults: VariableStore = {};
        loadedNodes.forEach(n => {
            (n.data.variables || []).forEach((v: any) => {
                const nm = v.name?.trim();
                if (nm && v.defaultValue !== undefined && v.defaultValue !== '') {
                    if (v.type === 'Bool') {
                        defaults[nm] = v.defaultValue === 'true';
                    } else {
                        defaults[nm] = isNaN(Number(v.defaultValue)) ? v.defaultValue : Number(v.defaultValue);
                    }
                }
            });
        });
        variableStoreRef.current = defaults;
        setVariableStore(defaults);
        if (graphRef.current) {
            setNodes(applyMarkingToNodes(nodesRef.current, graphRef.current.current, true, defaults, clockRef.current, timeConstraintsRef.current, edgesRef.current));
        }
        if (Object.keys(defaults).length > 0) {
            const initStr = Object.entries(defaults).map(([k, v]) => `${k} = ${v}`).join(', ');
            displayTraceRef.current = [{ activity: `Initial values: ${initStr}`, role: '' }];
            setDisplayTrace([...displayTraceRef.current]);
        }
    };

    const saveGraph = () => {
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;
        if (currentNodes.length === 0) return; 
        const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const nl = '\n';
        const eventsXml = currentNodes.map((n: any) => {
            const d = n.data;
            const included = d.included ? ' included="true"' : '';
            const executed = d.executed ? ' executed="true"' : '';
            const pending = d.pending ? ' pending="true"' : '';
            return `    <dcr:event id="${n.id}" description="${esc(d.label || '')}" role="${esc(d.role || '')}"${included}${executed}${pending}/>`;
        }).join(nl);
        const toISO = (tc: any): string | null => {
            if (!tc || typeof tc !== 'string') return null;
            return tc;
        };
        const relationsXml = currentEdges.map((e: any) => {
            const isoTime = toISO(e.data?.delay) || toISO(e.data?.deadline);
            const timeAttr = isoTime ? ` time="${isoTime}"` : '';
            const guardAttr = e.data?.guard ? ` expressionId="${e.id}--guard"` : '';
            return `    <dcr:relation type="${e.label}" sourceId="${e.source}" targetId="${e.target}"${timeAttr}${guardAttr}/>`;
        }).join(nl);
        const esc2 = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const varNodes = currentNodes.filter((n: any) => n.data.variables && n.data.variables.length > 0);
        const variablesXml = varNodes.length > 0
            ? nl + '  <dcr:variables>' + nl + varNodes.map((n: any) => {
                const v = n.data.variables[0];
                const defVal = v.defaultValue !== undefined && v.defaultValue !== '' ? ` defaultValue="${esc2(v.defaultValue)}"` : '';
                return `    <dcr:variable id="${v.id}" name="${esc2(v.name)}" type="${v.type}" eventId="${n.id}"${defVal}/>`;
            }).join(nl) + nl + '  </dcr:variables>'
            : '';
        const guardEdges = currentEdges.filter((e: any) => e.data?.guard);
        const expressionsXml = guardEdges.length > 0
            ? nl + '  <dcr:expressions>' + nl + guardEdges.map((e: any) =>
                `    <dcr:expression id="${e.id}--guard" value="${esc2(e.data.guard)}"/>`
            ).join(nl) + nl + '  </dcr:expressions>'
            : '';
        const positionsXml = currentNodes.map((n: any) =>
            `    <dcr:position eventId="${n.id}" x="${Math.round(n.position.x)}" y="${Math.round(n.position.y)}" width="140" height="160"/>`
        ).join(nl);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>${nl}<dcr:definitions xmlns:dcr="http://tk/schema/dcr">${nl}  <dcr:dcrGraph id="graph">${nl}${eventsXml}${nl}${relationsXml}${nl}  </dcr:dcrGraph>${expressionsXml}${variablesXml}${nl}  <dcr:positions>${nl}${positionsXml}${nl}  </dcr:positions>${nl}</dcr:definitions>`;
        const name = lastSavedGraph.current || 'Untitled';
        setSavedGraphs({ ...savedGraphs, [name]: xml });
        lastSavedGraph.current = name;
    };

        const reset = useCallback((resetClock = true) => {
        if (!graphRef.current) return;
        graphRef.current.current = { ...graphRef.current.initial, marking: copyMarking(graphRef.current.initial.marking) };
        
        delete (graphRef.current.current as any).satisfiedConditions;
        variableStoreRef.current = {};
        setVariableStore({});
        variableAnnotationsRef.current = {};
        setVariableAnnotations({});
        displayTraceRef.current = [];
        setDisplayTrace([]);
        if (resetClock) {
            const now = new Date();
            clockRef.current = now;
            setClock(now);
        }
        timeConstraintsRef.current = {};
        setNodes(applyMarkingToNodes(nodesRef.current, graphRef.current.current, true, {}, clockRef.current, timeConstraintsRef.current, edgesRef.current));
    }, []);

    const openLog = (name: string, log: EventLog<RoleTrace>) => {
        if (Object.keys(eventLog.traces).length === 0 || confirm("This will override your current event log! Do you wish to continue?")) {
            const el = {
                name,
                traces: Object.keys(log.traces).map(tn => ({ traceName: tn, traceId: tn, trace: log.traces[tn] }))
                    .reduce((acc, cur) => ({ ...acc, [cur.traceId]: cur }), {}),
            };
            setEventLog(el);
            isSimulatingRef.current = SimulatingEnum.Not;
            setSimulating(SimulatingEnum.Not);
            traceRef.current = null;
            setSelectedTrace(null);
            setTraceName("");
            reset();
        }
    };

    
    const handleSimulationNodeClick = useCallback((nodeId: string) => {
        if (isSimulatingRef.current === SimulatingEnum.Not) return;
        if (!graphRef.current || !traceRef.current) return;

        const graph = graphRef.current.current;
        const group = (graph as any).subProcessMap?.[nodeId] ? (graph as any).subProcessMap[nodeId] : graph;

        
        const node = nodesRef.current.find(n => n.id === nodeId);
        const variable = node?.data.variables?.[0];

        const doExecute = (store: VariableStore) => {
            const enabledResponse = isEnabledS(nodeId, graph, group, store);
            if (isSimulatingRef.current !== SimulatingEnum.Wild && !enabledResponse.enabled) {
                toast.warn(enabledResponse.msg);
                return;
            }
            const tc = timeConstraintsRef.current[nodeId];
            if (isSimulatingRef.current !== SimulatingEnum.Wild && tc?.delayUntil && clockRef.current < tc.delayUntil) {
                toast.warn('Delay not yet elapsed');
                return;
            }
            executeS(nodeId, graph, store);

            
            const outgoingEdges = edgesRef.current.filter(e => e.source === nodeId);
            for (const edge of outgoingEdges) {
                const target = edge.target;
                
                if (edge.data?.guard && !evaluateGuard(edge.data.guard, store)) continue;
                if (edge.label === 'condition' && edge.data?.delay) {
                    const ms = parseDurationMs(edge.data.delay);
                    if (ms > 0) {
                        const delayUntil = new Date(clockRef.current.getTime() + ms);
                        timeConstraintsRef.current = {
                            ...timeConstraintsRef.current,
                            [target]: { ...timeConstraintsRef.current[target], delayUntil },
                        };
                    }
                }
                if (edge.label === 'response' && edge.data?.deadline) {
                    const ms = parseDurationMs(edge.data.deadline);
                    if (ms > 0) {
                        const deadline = new Date(clockRef.current.getTime() + ms);
                        timeConstraintsRef.current = {
                            ...timeConstraintsRef.current,
                            [target]: { ...timeConstraintsRef.current[target], deadline },
                        };
                    }
                }
            }
            
            if (timeConstraintsRef.current[nodeId]) {
                const { deadline: _d, ...rest } = timeConstraintsRef.current[nodeId];
                timeConstraintsRef.current = { ...timeConstraintsRef.current, [nodeId]: rest };
            }

            const label = node?.data.label || nodeId;
            const role = node?.data.role || '';
            const nodeVarNames = new Set((node?.data.variables || []).map((v: any) => v.name).filter(Boolean));
            const eventVars = Object.fromEntries(Object.entries(store).filter(([k]) => nodeVarNames.has(k)));
            const eventVarsOrUndef = Object.keys(eventVars).length > 0 ? eventVars : undefined;
            traceRef.current!.trace.push({ activity: label, role, timestamp: new Date(clockRef.current.getTime()), variables: eventVarsOrUndef });
            extendedTraceRef.current.push({ activity: label, role, timestamp: new Date(clockRef.current.getTime()), variables: eventVarsOrUndef });
            
            const stepIndex = traceRef.current!.trace.length - 1;
            const varAnnotation = variable ? `${variable.name} = ${store[variable.name] ?? ''}` : undefined;
            if (varAnnotation) {
                variableAnnotationsRef.current = { ...variableAnnotationsRef.current, [stepIndex]: varAnnotation };
                setVariableAnnotations({ ...variableAnnotationsRef.current });
            }
            
            const displayEntry = { activity: `${label}${varAnnotation ? `  [${varAnnotation}]` : ''}`, role };
            displayTraceRef.current = [...displayTraceRef.current, displayEntry];
            setDisplayTrace([...displayTraceRef.current]);
            setSelectedTrace({ traceId: traceRef.current!.traceId, traceName, trace: [...traceRef.current!.trace] });
            setNodes(applyMarkingToNodes(nodesRef.current, graph, true, store, clockRef.current, timeConstraintsRef.current, edgesRef.current, wildMode));
        };

        if (variable) {
            
            const storedVal = variableStoreRef.current[variable.name.trim()];
            setVariableInputValue(storedVal !== undefined ? String(storedVal) : variable.type === 'Bool' ? 'true' : "");
            setVariablePopup({
                nodeId,
                variableName: variable.name,
                variableType: variable.type || 'number',
            });
        } else {
            doExecute(variableStoreRef.current);
        }
    }, [traceName]);

    const handleVariablePopupSubmit = () => {
        if (!variablePopup || !graphRef.current || !traceRef.current) return;
        const raw = variableInputValue.trim();
        if (raw === "") return;
        let value: number | string | boolean;
        if (variablePopup.variableType === 'Int') {
            const n = Number(raw);
            if (isNaN(n)) return;
            value = n;
        } else if (variablePopup.variableType === 'Bool') {
            value = raw === 'true';
        } else {
            value = raw;
        }

        
        const updates: VariableStore = { [variablePopup.variableName]: value };
        const newStore = { ...variableStoreRef.current, ...updates };
        variableStoreRef.current = newStore;
        setVariableStore(newStore);

        
        const nodeId = variablePopup.nodeId;
        const graph = graphRef.current.current;
        const group = (graph as any).subProcessMap?.[nodeId] ? (graph as any).subProcessMap[nodeId] : graph;
        const enabledResponse = isEnabledS(nodeId, graph, group, newStore);
        if (isSimulatingRef.current !== SimulatingEnum.Wild && !enabledResponse.enabled) {
            toast.warn(enabledResponse.msg);
            setVariablePopup(null);
            setVariableInputValue("");
            return;
        }
        const tcV = timeConstraintsRef.current[nodeId];
        if (isSimulatingRef.current !== SimulatingEnum.Wild && tcV?.delayUntil && clockRef.current < tcV.delayUntil) {
            toast.warn('Delay not yet elapsed');
            setVariablePopup(null);
            setVariableInputValue("");
            return;
        }
        executeS(nodeId, graph, newStore);

        
        const outgoingEdgesV = edgesRef.current.filter(e => e.source === nodeId);
        for (const edge of outgoingEdgesV) {
            const target = edge.target;
            if (edge.label === 'condition' && edge.data?.delay) {
                const ms = parseDurationMs(edge.data.delay);
                if (ms > 0) {
                    const delayUntil = new Date(clockRef.current.getTime() + ms);
                    timeConstraintsRef.current = {
                        ...timeConstraintsRef.current,
                        [target]: { ...timeConstraintsRef.current[target], delayUntil },
                    };
                }
            }
            if (edge.label === 'response' && edge.data?.deadline) {
                const ms = parseDurationMs(edge.data.deadline);
                if (ms > 0) {
                    const deadline = new Date(clockRef.current.getTime() + ms);
                    timeConstraintsRef.current = {
                        ...timeConstraintsRef.current,
                        [target]: { ...timeConstraintsRef.current[target], deadline },
                    };
                }
            }
        }
        if (timeConstraintsRef.current[nodeId]) {
            const { deadline: _d, ...rest } = timeConstraintsRef.current[nodeId];
            timeConstraintsRef.current = { ...timeConstraintsRef.current, [nodeId]: rest };
        }

        const node = nodesRef.current.find(n => n.id === nodeId);
        const label = node?.data.label || nodeId;
        const role = node?.data.role || '';
        traceRef.current.trace.push({ activity: label, role, timestamp: new Date(clockRef.current.getTime()), variables: { [variablePopup.variableName]: value } });
        extendedTraceRef.current.push({ activity: label, role, timestamp: new Date(clockRef.current.getTime()), variables: { [variablePopup.variableName]: value } });
        
        const annotation = `${variablePopup.variableName} = ${value}`;
        const displayEntry = { activity: `${label}  [${annotation}]`, role };
        displayTraceRef.current = [...displayTraceRef.current, displayEntry];
        setDisplayTrace([...displayTraceRef.current]);
        setSelectedTrace({ traceId: traceRef.current.traceId, traceName, trace: [...traceRef.current.trace] });
        setNodes(applyMarkingToNodes(nodesRef.current, graph, true, newStore, clockRef.current, timeConstraintsRef.current, edgesRef.current, wildMode));

        setVariablePopup(null);
        setVariableInputValue("");
    };

    const saveLog = () => {
        if (!graphRef.current?.current) return;
        const newSavedLogs = { ...savedLogs };
        newSavedLogs[eventLog.name] = {
            traces: Object.values(eventLog.traces).reduce((acc, { traceName, trace }) => ({ ...acc, [traceName]: trace }), {}),
            events: graphRef.current.current.events,
        };
        setSavedLogs(newSavedLogs);
        lastSavedLog.current = eventLog.name;
        toast.success("Log saved!");
    };

    const saveEventLog = () => {
        if (!graphRef.current) return;
        const esc = (s: string) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<log xes.version="1.0" xes.features="nested-attributes" openxes.version="1.0RC7">\n';
        xml += '  <global scope="event">\n';
        xml += '    <string key="concept:name" value="__INVALID__"/>\n';
        xml += '    <string key="role" value="__INVALID__"/>\n';
        xml += '    <date key="time:timestamp" value="1970-01-01T00:00:00.000+00:00"/>\n';
        xml += '  </global>\n';
        xml += '  <classifier name="Event Name" keys="concept:name"/>\n';
        for (const entry of Object.values(eventLog.traces)) {
            const extended = savedExtendedTraces.current[entry.traceId] || [];
            xml += '  <trace>\n';
            xml += `    <string key="concept:name" value="${esc(entry.traceName)}"/>\n`;
            for (let i = 0; i < entry.trace.length; i++) {
                const e = entry.trace[i];
                const ext = extended[i];
                const ts = ext?.timestamp ? ext.timestamp.toISOString() : new Date().toISOString();
                xml += '    <event>\n';
                xml += `      <string key="concept:name" value="${esc(e.activity)}"/>\n`;
                xml += `      <string key="role" value="${esc(e.role)}"/>\n`;
                xml += `      <date key="time:timestamp" value="${ts}"/>\n`;
                for (const [k, v] of Object.entries(ext?.variables ?? {})) {
                    const tag = typeof v === 'number' ? 'int' : 'string';
                    xml += `      <${tag} key="${esc(k)}" value="${esc(String(v))}"/>\n`;
                }
                xml += '    </event>\n';
            }
            xml += '  </trace>\n';
        }
        xml += '</log>';
        saveAs(new Blob([xml], { type: 'text/xml' }), `${eventLog.name}.xes`);
    };

    const closeTraceCallback = () => {
        if (!selectedTrace) return;
        if (isSimulatingRef.current !== SimulatingEnum.Not) {
            const copy = { ...eventLog, traces: { ...eventLog.traces } };
            delete copy.traces[selectedTrace.traceId];
            setEventLog(copy);
        } else if (traceRef.current) {
            const copy = { ...eventLog, traces: { ...eventLog.traces } };
            copy.traces[traceRef.current.traceId].traceName = traceName;
            setEventLog(copy);
            savedExtendedTraces.current[traceRef.current.traceId] = [...extendedTraceRef.current];
            extendedTraceRef.current = [];
        }
        isSimulatingRef.current = SimulatingEnum.Not;
        setSimulating(SimulatingEnum.Not);
    };

    const savedGraphElements = (): ModalMenuElement[] =>
        Object.keys(savedGraphs).length > 0 ? [{
            text: "Saved Graphs:",
            elements: Object.keys(savedGraphs).map(name => ({
                icon: <BiLeftArrowCircle />,
                text: name,
                onClick: () => {
                    if (Object.keys(eventLog.traces).length === 0 || confirm("This will override your current event log!")) {
                        loadGraph(savedGraphs[name]).then((loadedNodes) => {
                            setEventLog({ name: "Unnamed Event Log", traces: { "Trace 1": { traceId: "Trace 1", traceName: "", trace: [] } } });
                            isSimulatingRef.current = SimulatingEnum.Default;
                            setSimulating(SimulatingEnum.Default);
                            traceRef.current = { traceId: "Trace 1", trace: [] };
                            setSelectedTrace({ traceId: "Trace 1", traceName: "Trace 1", trace: [] });
                            setTraceName("Trace 1");
                            setMenuOpen(false);
                            if (loadedNodes) applyDefaultsFromNodes(loadedNodes);
                        });
                    }
                },
            })),
        }] : [];

    const savedLogElements = (): ModalMenuElement[] =>
        Object.keys(savedLogs).length > 0 ? [{
            text: "Saved Logs:",
            elements: Object.keys(savedLogs).map(name => ({
                icon: <BiLeftArrowCircle />,
                text: name,
                onClick: () => { openLog(name, savedLogs[name]); setMenuOpen(false); },
            })),
        }] : [];

    const menuElements: ModalMenuElement[] = [
        {
            text: "New Simulation",
            icon: <BiPlus />,
            onClick: () => {
                if (confirm("This will erase your current simulated Event Log. Are you sure?")) {
                    setEventLog({ name: "Unnamed Event Log", traces: {} });
                    isSimulatingRef.current = SimulatingEnum.Not;
                    setSimulating(SimulatingEnum.Not);
                    traceRef.current = null;
                    setSelectedTrace(null);
                    setTraceName("");
                    reset();
                    setMenuOpen(false);
                }
            },
        },
        {
            text: "Open",
            elements: [
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload accept="text/xml" fileCallback={(_, contents) => {
                                if (Object.keys(eventLog.traces).length === 0 || confirm("This will override your current event log!")) {
                                    loadGraph(contents);
                                    setMenuOpen(false);
                                }
                            }}>
                                <div /><>Open DCR XML</>
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
                            openLog(name.slice(0, -4), log);
                        } catch {
                            toast.error("Unable to parse log...");
                        }
                        setMenuOpen(false);
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
            {simulating === SimulatingEnum.Not && <GreyOut />}

            {/* ── Variable input popup ── */}
            {variablePopup && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)',
                }}>
                    <div style={{
                        background: 'white', borderRadius: 10, padding: '28px 32px',
                        minWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                        display: 'flex', flexDirection: 'column', gap: 16,
                    }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>
                            Enter value for <span style={{ color: '#2192FF' }}>{variablePopup.variableName}</span>
                        </div>
                        {variablePopup.variableType === 'Bool' ? (
                            <select
                                value={variableInputValue}
                                onChange={e => setVariableInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleVariablePopupSubmit(); if (e.key === 'Escape') setVariablePopup(null); }}
                                autoFocus
                                style={{
                                    border: '2px solid #2192FF', borderRadius: 6,
                                    padding: '8px 12px', fontSize: 15, outline: 'none',
                                }}
                            >
                                <option value="true">true</option>
                                <option value="false">false</option>
                            </select>
                        ) : (
                            <input
                                type={variablePopup.variableType === 'Int' ? 'number' : 'text'}
                                value={variableInputValue}
                                onChange={e => setVariableInputValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleVariablePopupSubmit(); if (e.key === 'Escape') setVariablePopup(null); }}
                                autoFocus
                                placeholder={`${variablePopup.variableName} value...`}
                                style={{
                                    border: '2px solid #2192FF', borderRadius: 6,
                                    padding: '8px 12px', fontSize: 15, outline: 'none',
                                }}
                            />
                        )}
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => setVariablePopup(null)}
                                style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', background: '#f5f5f5' }}>
                                Cancel
                            </button>
                            <button onClick={handleVariablePopupSubmit}
                                style={{ padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#2192FF', color: 'white', fontWeight: 600 }}>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ModelerV2
                nodes={nodes}
                edges={edges}
                nodesRef={nodesRef}
                edgesRef={edgesRef}
                simulationMode={true}
                onSimulationNodeClick={handleSimulationNodeClick}
            />
            {simulating === SimulatingEnum.Not && (
                <EventLogView
                    eventLog={eventLog}
                    selectedTrace={selectedTrace}
                    setSelectedTrace={setSelectedTrace}
                    traceRef={traceRef}
                    editProps={{ setEventLog, setTraceName }}
                    defaultVariables={(() => {
                        const d: Record<string, number | string | boolean> = {};
                        nodes.forEach(n => (n.data.variables || []).forEach((v: any) => {
                            if (v.name && v.defaultValue !== undefined && v.defaultValue !== '')
                                d[v.name] = v.type === 'Bool' ? v.defaultValue === 'true' : isNaN(Number(v.defaultValue)) ? v.defaultValue : Number(v.defaultValue);
                        }));
                        return Object.keys(d).length > 0 ? d : undefined;
                    })()}
                >
                    <Button
                        disabled={simulating !== SimulatingEnum.Not}
                        onClick={() => {
                            isSimulatingRef.current = SimulatingEnum.Default;
                            setSimulating(SimulatingEnum.Default);
                            const existingNums = Object.keys(eventLog.traces)
                                .map(k => parseInt(k.replace('Trace ', '')))
                                .filter(n => !isNaN(n));
                            let next = 1;
                            while (existingNums.includes(next)) next++;
                            const traceId = "Trace " + next;
                            setEventLog({ ...eventLog, traces: { ...eventLog.traces, [traceId]: { traceId, traceName: traceId, trace: [] } } });
                            setSelectedTrace({ traceId, traceName: traceId, trace: [] });
                            traceRef.current = { traceId, trace: [] };
                            displayTraceRef.current = [];
                            setDisplayTrace([]);
                            variableAnnotationsRef.current = {};
                            setVariableAnnotations({});
                            setTraceName(traceId);
                            
                            applyDefaultsFromNodes(nodes);
                        }}
                    >
                        Add new trace
                    </Button>
                    <Button disabled={simulating !== SimulatingEnum.Not} onClick={saveLog}>Save log</Button>
                    <Button disabled={simulating !== SimulatingEnum.Not} onClick={saveEventLog}>Export log</Button>
                </EventLogView>
            )}
            {selectedTrace && (
                <TraceView
                    hugLeft={simulating !== SimulatingEnum.Not}
                    graphRef={graphRef}
                    onCloseCallback={closeTraceCallback}
                    selectedTrace={simulating !== SimulatingEnum.Not && displayTrace.length > 0
                        ? { ...selectedTrace, trace: displayTrace }
                        : selectedTrace}
                    setSelectedTrace={setSelectedTrace}
                    editProps={simulating !== SimulatingEnum.Not ? { traceName, setTraceName, traceRef, reset } : undefined}
                >
                    {simulating !== SimulatingEnum.Not ? (
                        <FinalizeButton onClick={() => {
                            if (!graphRef.current?.current) return;
                            if ((simulating === SimulatingEnum.Wild || isAcceptingS(graphRef.current.current, graphRef.current.current)) && traceRef.current) {
                                isSimulatingRef.current = SimulatingEnum.Not;
                                setSimulating(SimulatingEnum.Not);
                                const copy = { ...eventLog, traces: { ...eventLog.traces } };
                                copy.traces[traceRef.current.traceId].traceName = traceName;
                                copy.traces[traceRef.current.traceId].trace = traceRef.current.trace;
                                setEventLog(copy);
                                savedExtendedTraces.current[traceRef.current.traceId] = [...extendedTraceRef.current];
                                extendedTraceRef.current = [];
                                setWildMode(false);
                                setSelectedTrace(null);
                                reset(false);
                            } else {
                                toast.warn("Graph is not accepting...");
                            }
                        }}>
                            Finalize trace
                        </FinalizeButton>
                    ) : <></>}
                </TraceView>
            )}
            {/* ── Clock Bar ── */}
            {simulating !== SimulatingEnum.Not && (
                <ClockBar>
                    <span style={{ fontWeight: 600, color: '#495057' }}>🕐 {formatClock(clock)}</span>
                    <span style={{ color: '#adb5bd' }}>|</span>
                    <input
                        type="number"
                        min="1"
                        value={advanceValue}
                        onChange={e => setAdvanceValue(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: 50, padding: '4px 6px', border: '1px solid #ced4da', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                    />
                    <select
                        value={advanceUnit}
                        onChange={e => setAdvanceUnit(e.target.value as any)}
                        style={{ padding: '4px 6px', border: '1px solid #ced4da', borderRadius: 6, fontSize: 13 }}
                    >
                        <option value="seconds">Seconds</option>
                        <option value="minutes">Minutes</option>
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                    </select>
                    <button
                        onClick={() => {
                            const units: Record<string, number> = { days: 86400000, hours: 3600000, minutes: 60000, seconds: 1000 };
                            const advanceMs = advanceValue * units[advanceUnit];
                            const newClock = new Date(clockRef.current.getTime() + advanceMs);

                            // Warn if any deadline would be overrun
                            const tc = timeConstraintsRef.current;
                            const overrun = Object.entries(tc)
                                .filter(([, v]) => v.deadline && clockRef.current <= v.deadline && newClock > v.deadline)
                                .map(([nodeId, v]) => {
                                    const node = nodesRef.current.find(n => n.id === nodeId);
                                    return node?.data?.label ?? nodeId;
                                });
                            if (overrun.length > 0) {
                                const names = overrun.join(', ');
                                if (!window.confirm(`Advancing time will overrun the deadline for: ${names}.\n\nProceed?`)) return;
                            }

                            clockRef.current = newClock;
                            setClock(newClock);
                            if (graphRef.current) {
                                const graph = graphRef.current.current;
                                const newTC = { ...tc };
                                for (const nodeId in newTC) {
                                    const entry = newTC[nodeId];
                                    const updated = { ...entry };
                                    // Deadline expiry: keep pending marking, just clean up the constraint display
                                    if (entry.deadline && newClock > entry.deadline) {
                                        delete updated.deadline;
                                    }
                                    if (entry.delayUntil && newClock >= entry.delayUntil) {
                                        delete updated.delayUntil;
                                    }
                                    if (Object.keys(updated).length === 0) delete newTC[nodeId];
                                    else newTC[nodeId] = updated;
                                }
                                timeConstraintsRef.current = newTC;
                                setNodes(applyMarkingToNodes(
                                    nodesRef.current,
                                    graph,
                                    true,
                                    variableStoreRef.current,
                                    newClock,
                                    newTC,
                                    edgesRef.current
                                ));
                            }
                        }}
                        style={{
                            padding: '4px 12px', backgroundColor: '#2192FF', color: 'white',
                            border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                        }}
                    >
                        Advance ▶
                    </button>
                </ClockBar>
            )}

            <TopRightIcons>
                <WildButton
                    $disabled={simulating === SimulatingEnum.Not}
                    title={wildMode ? "Disable non-conformant behaviour" : "Enable non-conformant behaviour"}
                    $clicked={wildMode}
                    onClick={() => {
                        if (simulating === SimulatingEnum.Not) return;
                        if (wildMode) {
                            setWildMode(false);
                            isSimulatingRef.current = SimulatingEnum.Default;
                            setSimulating(SimulatingEnum.Default);
                            if (graphRef.current) setNodes(applyMarkingToNodes(nodesRef.current, graphRef.current.current, true, variableStoreRef.current, clockRef.current, timeConstraintsRef.current, edgesRef.current, false));
                        } else {
                            setWildMode(true);
                            isSimulatingRef.current = SimulatingEnum.Wild;
                            setSimulating(SimulatingEnum.Wild);
                            if (graphRef.current) setNodes(applyMarkingToNodes(nodesRef.current, graphRef.current.current, true, variableStoreRef.current, clockRef.current, timeConstraintsRef.current, edgesRef.current, true));
                        }
                    }}
                />
                <FullScreenIcon />
                <BiHome onClick={() => { setState(StateEnum.Home); }} />
                <ModalMenu elements={menuElements} open={menuOpen} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    );
};

export default SimulatorState;
