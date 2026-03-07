import { BiHome, BiLeftArrowCircle } from "react-icons/bi";
import FullScreenIcon from "../utilComponents/FullScreenIcon";
import TopRightIcons from "../utilComponents/TopRightIcons";
import ModalMenu, { ModalMenuElement } from "../utilComponents/ModalMenu";
import { StateEnum, StateProps } from "../App";
import { copyMarking, DCRGraphS, EventLog, generateEventLog, moddleToDCR, RoleTrace, writeEventLog } from "dcr-engine";
import MenuElement from "../utilComponents/MenuElement";
import Toggle from "../utilComponents/Toggle";
import DropDown from "../utilComponents/DropDown";
import Label from "../utilComponents/Label";
import { isSettingsVal } from "../types";
import Modeler from "./Modeler";
import React, { useEffect, useRef, useState } from "react";
import Form from "../utilComponents/Form";
import styled from "styled-components";
import StyledFileUpload from "../utilComponents/StyledFileUpload";
import FileUpload from "../utilComponents/FileUpload";
import { toast } from "react-toastify";
import { saveAs } from 'file-saver';
import { parseNativeDCRXML, buildDCRGraph, parseDurationMs } from "../utils/dcrToReactFlow";
import { Node, Edge } from "reactflow";

const Input = styled.input`
    width: 7rem; 
    font-size: 20px; 
`

const EventLogGenerationState = ({ setState, savedGraphs, lastSavedGraph, savedLogs, setSavedLogs, lastSavedLog }: StateProps) => {
    const [menuOpen, setMenuOpen] = useState(true);
    const [formToShow, setFormToShow] = useState("Simple");


    // State to put anything needed to render in the form inputs;
    const [customFormState, setCustomFormState] = useState<any>();

    const modelerRef = useRef<DCRModeler | null>(null);
    const graphRef = useRef<{ initial: DCRGraphS, current: DCRGraphS } | null>(null);
    // Populated when loading native DCR format; holds nodes/edges for variable and time extraction
    const nativeRef = useRef<{ nodes: Node[], edges: Edge[] } | null>(null);

    const algorithms: {
        [key: string]: {
            inputs: Array<React.JSX.Element>,
            onSubmit: (formData: FormData) => void;
        }
    } = {
        "Simple": {
            inputs: [
                <MenuElement>
                    <Label title="Name to save the event log under">Event Log Name:</Label>
                    <Input
                        type="text"
                        required
                        name="name"
                        min="0"
                        max="1"
                        defaultValue={customFormState?.name ? customFormState.name : "Event Log"}
                        step="0.01" />
                </MenuElement>,
                <MenuElement>
                    <Label >No. Traces</Label>
                    <Input
                        type="number"
                        required
                        name="noTraces"
                        min="0"
                        max=""
                        defaultValue={customFormState?.noTraces ? customFormState.noTraces : "100"}
                        step="1" />
                </MenuElement>,
                <MenuElement>
                    <Label title="Least acceptable trace length before noise is applied">Min. Trace Length</Label>
                    <Input
                        type="number"
                        required
                        name="minTrace"
                        min="0"
                        max=""
                        defaultValue={customFormState?.minTrace ? customFormState.minTrace : "5"}
                        step="1" />
                </MenuElement>,
                <MenuElement>
                    <Label title="Greatest acceptable trace length before noise is applied">Max. Trace Length</Label>
                    <Input
                        type="number"
                        required
                        name="maxTrace"
                        min="0"
                        max=""
                        defaultValue={customFormState?.maxTrace ? customFormState.maxTrace : "20"}
                        step="1" />
                </MenuElement>,
                <MenuElement>
                    <Label title="The amount of noise to add, with 0 being no noise and 1 being max.">Noise percentage</Label>
                    <Input
                        type="number"
                        required
                        name="noise"
                        min="0"
                        max="1"
                        defaultValue={customFormState?.noise !== undefined ? customFormState.noise : "0.20"}
                        step="0.01" />
                </MenuElement>
            ],
            onSubmit: (formData: FormData) => {

                const rawNoise = formData.get("noise");
                const noise = rawNoise && parseFloat(rawNoise.toString());
                const name = formData.get("name")?.toString();
                const rawNoTraces = formData.get("noTraces");
                const noTraces = rawNoTraces && parseInt(rawNoTraces.toString());
                const rawMinTrace = formData.get("minTrace");
                const minTrace = rawMinTrace && parseInt(rawMinTrace.toString());
                const rawMaxTrace = formData.get("maxTrace");
                const maxTrace = rawMaxTrace && parseInt(rawMaxTrace.toString());

                if (noise === "" || noise === null || noTraces === "" || noTraces === null || minTrace === "" || minTrace === null || maxTrace === "" || maxTrace === null || !name) {
                    toast.error("Can't parse input parameters...");
                    return;
                }

                if (minTrace > maxTrace) {
                    toast.error("Min trace length should be smaller or equal to max trace length!");
                    return;
                }

                if (!graphRef.current) return;

                setCustomFormState({ ...customFormState, noise, name, noTraces, minTrace, maxTrace });

                // Extract variable and time constraint data from native format
                const variableMap: Record<string, { name: string; type: string; defaultValue?: string }> = {};
                const conditionDelays: Record<string, Record<string, number>> = {};
                const responseDeadlines: Record<string, Record<string, number>> = {};
                if (nativeRef.current) {
                    const { nodes, edges } = nativeRef.current;
                    for (const node of nodes) {
                        const vars = node.data.variables || [];
                        if (vars.length > 0) {
                            variableMap[node.id] = vars[0];
                        }
                    }
                    for (const edge of edges) {
                        if (edge.label === 'condition' && edge.data?.delay) {
                            const ms = parseDurationMs(edge.data.delay);
                            if (ms > 0) {
                                if (!conditionDelays[edge.source]) conditionDelays[edge.source] = {};
                                conditionDelays[edge.source][edge.target] = ms;
                            }
                        }
                        if (edge.label === 'response' && edge.data?.deadline) {
                            const ms = parseDurationMs(edge.data.deadline);
                            if (ms > 0) {
                                if (!responseDeadlines[edge.source]) responseDeadlines[edge.source] = {};
                                responseDeadlines[edge.source][edge.target] = ms;
                            }
                        }
                    }
                }

                try {
                    const log = generateEventLog(
                        graphRef.current.current, noTraces, minTrace, maxTrace, noise,
                        variableMap, conditionDelays, responseDeadlines
                    );
                    saveEventLog(name, log);
                    saveLog(name, log);
                } catch (e) {
                    toast.error("Cannot generate log from parameters...");
                }
            }
        }
    }

    const saveLog = (name: string, eventLog: EventLog<RoleTrace>) => {
        if (!graphRef.current?.current) return;
        const newSavedLogs = { ...savedLogs };
        newSavedLogs[name] = eventLog;
        setSavedLogs(newSavedLogs);
        lastSavedLog.current = name;
        toast.success("Log saved!");
    }

    const saveEventLog = (name: string, eventLog: EventLog<RoleTrace>) => {
        const data = writeEventLog(eventLog);
        const blob = new Blob([data]);
        saveAs(blob, `${name}.xes`);
    }

    const open = (data: string, parse: ((xml: string) => Promise<void>) | undefined) => {
        if (data.includes("subProcess")) {
            toast.warning("Subprocesses not supported...");
            return;
        }
        // Native DCR format: parse directly without bpmn-js modeler
        if (data.includes('<dcr:definitions')) {
            try {
                const { nodes, edges } = parseNativeDCRXML(data);
                const graph = buildDCRGraph(nodes, edges);
                graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
                nativeRef.current = { nodes, edges };
                toast.success("Model loaded!");
            } catch (e) {
                console.log(e);
                toast.error("Unable to parse XML...");
            }
            return;
        }
        // Old bpmn-js format
        nativeRef.current = null;
        parse && parse(data).then((_) => {
            if (modelerRef.current && graphRef.current) {
                const graph = moddleToDCR(modelerRef.current.getElementRegistry());
                graphRef.current = { initial: graph, current: { ...graph, marking: copyMarking(graph.marking) } };
            }
        }).catch((e) => { console.log(e); toast.error("Unable to parse XML...") });
    }

    const savedGraphElements = () => {
        return Object.keys(savedGraphs).length > 0 ? [{
            text: "Saved Graphs:",
            elements: Object.keys(savedGraphs).map(name => {
                return ({
                    icon: <BiLeftArrowCircle />,
                    text: name,
                    onClick: () => { open(savedGraphs[name], modelerRef.current?.importXML); setMenuOpen(false) },
                })
            })
        }] : [];
    }


    const menuElements: Array<ModalMenuElement> = [
        {
            text: "Open Model",
            elements: [
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload accept="text/xml" fileCallback={(_, contents) => { open(contents, modelerRef.current?.importXML) }}>
                                <div />
                                <>Open Editor XML</>
                            </FileUpload>
                        </StyledFileUpload>),
                },
                {
                    customElement: (
                        <StyledFileUpload>
                            <FileUpload accept="text/xml" fileCallback={(_, contents) => { open(contents, modelerRef.current?.importDCRPortalXML) }}>
                                <div />
                                <>Open DCR Solution XML</>
                            </FileUpload>
                        </StyledFileUpload>),
                },
            ]
        },
        ...savedGraphElements(),
        {
            customElement: (
                <MenuElement>
                    <Label>Generation Algorithm:</Label>
                    <DropDown value={formToShow} options={Object.keys(algorithms).map((key) => ({ title: key, value: key }))} onChange={(val) => setFormToShow(val)} />
                </MenuElement>
            )
        },
        {
            customElement: (
                <Form submitText="Generate!" inputFields={algorithms[formToShow].inputs} submit={algorithms[formToShow].onSubmit} />
            )
        }
    ];


    // Only pass non-native XML to the bpmn-js Modeler; native format is handled separately
    const savedXml = lastSavedGraph.current ? savedGraphs[lastSavedGraph.current] : undefined;
    const initXml = savedXml && !savedXml.includes("subProcess") && !savedXml.includes('<dcr:definitions')
        ? savedXml
        : undefined;

    // Auto-load native DCR format graphs on mount (bpmn-js cannot handle them)
    useEffect(() => {
        if (savedXml?.includes('<dcr:definitions') && !savedXml.includes("subProcess")) {
            open(savedXml, undefined);
        }
    }, []);

    return (
        <>
            <Modeler modelerRef={modelerRef} initXml={initXml} override={{ graphRef: graphRef, overrideOnclick: () => null, noRendering: true, canvasClassName: "conformance" }} />
            <TopRightIcons>
                <FullScreenIcon />
                <BiHome onClick={() => setState(StateEnum.Home)} />
                <ModalMenu elements={menuElements} open={menuOpen} setOpen={setMenuOpen} />
            </TopRightIcons>
        </>
    )
}

export default EventLogGenerationState