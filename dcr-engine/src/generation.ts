import { executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import { DCRGraphS, EventLog, RoleTrace, VariableStore } from "./types";
import { copyMarking, copySet, getRandomInt, getRandomItem, randomChoice } from "./utility";

type VariableInfo = { name: string; type: string; defaultValue?: string };
// Maps eventId → variable info
type VariableMap = Record<string, VariableInfo>;
// Maps source eventId → target eventId → delay in ms
type ConditionDelays = Record<string, Record<string, number>>;
// Maps source eventId → target eventId → deadline in ms
type ResponseDeadlines = Record<string, Record<string, number>>;

const noisify = (trace: RoleTrace, noisePercentage: number, graph: DCRGraphS): RoleTrace => {
    const retTrace: RoleTrace = [];

    for (let i = 0; i < trace.length; i++) {
        if (Math.random() <= noisePercentage) {
            console.log("Noising it up!");
            const choice = getRandomInt(0, 3);
            switch (choice) {
                // Insert
                case 0:
                    retTrace.push(trace[i]);
                    const activity = getRandomItem(graph.labels);
                    const event = getRandomItem(graph.labelMapInv[activity]);
                    retTrace.push({ activity, role: graph.roleMap[event] });
                    break;
                // Delete
                case 1:
                    break;
                // Swap
                case 2:
                    const elem = retTrace.pop();
                    retTrace.push(trace[i]);
                    if (elem !== undefined) {
                        retTrace.push(elem);
                    }
                    break;
                default: throw new Error("Wrong integer mate " + choice);
            }
        } else {
            retTrace.push(trace[i]);
        }
    }
    return retTrace;
}

const generateEventLog = (
    graph: DCRGraphS,
    noTraces: number,
    minTraceLen: number,
    maxTraceLen: number,
    noisePercentage: number,
    variableMap: VariableMap = {},
    conditionDelays: ConditionDelays = {},
    responseDeadlines: ResponseDeadlines = {}
): EventLog<RoleTrace> => {
    const allEvents = Object.values(graph.subProcesses).reduce(
        (acc, cum) => acc.union(cum.events),
        copySet(graph.events));

    // Build initial variable store from defaults
    const buildInitStore = (): VariableStore => {
        const store: VariableStore = {};
        for (const vi of Object.values(variableMap)) {
            if (vi.defaultValue !== undefined && vi.defaultValue !== '') {
                store[vi.name] = isNaN(Number(vi.defaultValue)) ? vi.defaultValue : Number(vi.defaultValue);
            }
        }
        return store;
    };

    // Pick a random value for a variable
    const pickValue = (vi: VariableInfo): number | string | boolean => {
        const t = vi.type.toLowerCase();
        if (t === 'boolean') return Math.random() < 0.5;
        if (t === 'string') return `val${getRandomInt(0, 5)}`;
        return getRandomInt(0, 20);  // Int / number
    };

    const retval: EventLog<RoleTrace> = {
        events: allEvents,
        traces: {},
    }

    let goodTraces = 0;
    let botchedTraces = 0;

    const initMarking = copyMarking(graph.marking);

    while (goodTraces < noTraces) {
        let trace: RoleTrace = [];
        let varStore = buildInitStore();
        // Virtual clock starts at a fixed reference point; traces in the same log
        // are independent so each starts from epoch offset by trace index.
        let virtualClock = Date.now() + goodTraces * 86400000;  // offset each trace by 1 day
        const delayUntil: Record<string, number> = {};
        const deadlineMap: Record<string, number> = {};

        const allEnabled = () => {
            const retval = new Set<string>();
            for (const event of allEvents) {
                const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
                if (isEnabledS(event, graph, group, varStore).enabled) {
                    retval.add(event);
                }
            }
            return retval;
        }

        while (trace.length <= maxTraceLen) {
            if (trace.length >= minTraceLen && isAcceptingS(graph, graph) && randomChoice()) {
                console.log("Good! ", trace.length);
                const noisyTrace = noisify(trace, noisePercentage, graph);
                retval.traces["Trace " + goodTraces++] = noisyTrace;
                break;
            }
            const enabled = allEnabled();
            if (enabled.size === 0) break;

            // Prefer events whose response deadline is approaching (70% bias)
            const withDeadline = Array.from(enabled).filter(e => deadlineMap[e] !== undefined);
            const event = withDeadline.length > 0 && Math.random() < 0.7
                ? withDeadline.reduce((a, b) => (deadlineMap[a] < deadlineMap[b] ? a : b))
                : getRandomItem(enabled);

            // Advance virtual clock: if event has a delay, skip past it; otherwise random 1-60 min
            if (delayUntil[event] !== undefined && virtualClock < delayUntil[event]) {
                virtualClock = delayUntil[event] + getRandomInt(0, 3600000);
            } else {
                virtualClock += getRandomInt(60000, 3600000);
            }

            // Assign variable value if this event owns one
            const varInfo = variableMap[event];
            const eventVars: Record<string, number | string | boolean> = {};
            if (varInfo) {
                const val = pickValue(varInfo);
                varStore = { ...varStore, [varInfo.name]: val };
                eventVars[varInfo.name] = val;
            }

            executeS(event, graph, varStore);

            // Apply outgoing condition delays to targets
            for (const [target, ms] of Object.entries(conditionDelays[event] ?? {})) {
                if (ms > 0) delayUntil[target] = virtualClock + ms;
            }
            // Apply outgoing response deadlines to targets
            for (const [target, ms] of Object.entries(responseDeadlines[event] ?? {})) {
                if (ms > 0) deadlineMap[target] = virtualClock + ms;
            }
            // Clear the executed event's own response deadline
            delete deadlineMap[event];

            trace.push({
                activity: graph.labelMap[event],
                role: graph.roleMap[event],
                timestamp: new Date(virtualClock),
                variables: Object.keys(eventVars).length > 0 ? eventVars : undefined,
            });
        }
        if (trace.length > maxTraceLen || trace.length < minTraceLen) {
            botchedTraces++;
            if (botchedTraces > 2 * noTraces) {
                throw new Error("Unable to generate log from parameters...");
            }
        }

        graph.marking = copyMarking(initMarking);
        // Reset satisfied condition cache between traces
        delete (graph as any).satisfiedConditions;
    }

    return retval;
}

export default generateEventLog
