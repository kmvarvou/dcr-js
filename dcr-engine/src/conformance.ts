import { evaluateGuard, executeS, isAcceptingS, isEnabledS } from "./executionEngine";
import { DCRGraphS, Event, EventMap, FuzzyRelation, RelationActivations, RelationViolations, RoleTrace, VariableStore } from "./types";
import { copyEventMap, copyMarking, copySet, reverseRelation } from "./utility";

export const replayTraceS = (
    graph: DCRGraphS,
    trace: RoleTrace,
    variableStore: VariableStore = {},
    executionTimestamps: Map<Event, number> = new Map()
): boolean => {
    let retval = false;

    if (trace.length === 0) return isAcceptingS(graph, graph);

    const [head, ...tail] = trace;
    // Open world principle!
    if (!graph.labels.has(head.activity)) {
        return replayTraceS(graph, tail, variableStore, executionTimestamps);
    }

    const updatedStore: VariableStore = { ...variableStore, ...(head.variables || {}) };
    const headTime = head.timestamp?.getTime();
    const initMarking = copyMarking(graph.marking);

    for (const event of graph.labelMapInv[head.activity]) {
        if (!(head.role === graph.roleMap[event])) continue;
        const group = graph.subProcessMap[event] ? graph.subProcessMap[event] : graph;
        if (!isEnabledS(event, graph, group, updatedStore).enabled) continue;

        // Check delay constraints: for each condition source → event with a delay,
        // the source must have been executed at least `delay` ms before now
        if (headTime !== undefined && graph.timeConstraintMap) {
            let delayViolated = false;
            for (const source of graph.conditionsFor[event]) {
                const delay = graph.timeConstraintMap[source]?.[event]?.delay;
                if (delay === undefined) continue;
                const sourceTime = executionTimestamps.get(source);
                if (sourceTime !== undefined && headTime - sourceTime < delay) {
                    delayViolated = true; break;
                }
            }
            if (delayViolated) continue;
        }

        // Check deadline constraints: for each response source → event with a deadline,
        // the event must fire within `deadline` ms of the source being executed
        if (headTime !== undefined && graph.timeConstraintMap) {
            let deadlineExceeded = false;
            for (const source in graph.timeConstraintMap) {
                const deadline = graph.timeConstraintMap[source]?.[event]?.deadline;
                if (deadline === undefined) continue;
                const sourceTime = executionTimestamps.get(source);
                if (sourceTime !== undefined && headTime - sourceTime > deadline) {
                    deadlineExceeded = true; break;
                }
            }
            if (deadlineExceeded) continue;
        }

        const updatedTimestamps = new Map(executionTimestamps);
        if (headTime !== undefined) updatedTimestamps.set(event, headTime);

        executeS(event, graph, updatedStore);
        retval = retval || replayTraceS(graph, tail, updatedStore, updatedTimestamps);
        graph.marking = copyMarking(initMarking);
    }

    return retval;
};


const mergeFuzRels = (viols1: FuzzyRelation, viols2: FuzzyRelation): FuzzyRelation => {
    const retval: FuzzyRelation = { ...viols1 };
    for (const e1 in viols2) {
        if (e1 in retval) {
            retval[e1] = Object.entries(viols2[e1]).reduce((acc, [key, value]) =>
                // if key is already in retval, add the values, otherwise, create new pair
                ({ ...acc, [key]: (acc[key] || 0) + value })
                , retval[e1]);
        } else {
            retval[e1] = { ...viols2[e1] };
        }
    }
    return retval;
}

export const mergeViolations = (viols1: RelationViolations, viols2: RelationViolations): RelationViolations => {
    return {
        conditionsFor: mergeFuzRels(viols1.conditionsFor, viols2.conditionsFor),
        responseTo: mergeFuzRels(viols1.responseTo, viols2.responseTo),
        excludesTo: mergeFuzRels(viols1.excludesTo, viols2.excludesTo),
        milestonesFor: mergeFuzRels(viols1.milestonesFor, viols2.milestonesFor),
    }
}

export const mergeActivations = (acts1: RelationActivations, acts2: RelationActivations): RelationActivations => {
    return {
        conditionsFor: mergeFuzRels(acts1.conditionsFor, acts2.conditionsFor),
        responseTo: mergeFuzRels(acts1.responseTo, acts2.responseTo),
        excludesTo: mergeFuzRels(acts1.excludesTo, acts2.excludesTo),
        milestonesFor: mergeFuzRels(acts1.milestonesFor, acts2.milestonesFor),
        includesTo: mergeFuzRels(acts1.includesTo, acts2.includesTo)
    }
}

export const emptyFuzzyRel = (events: Set<Event>): FuzzyRelation => {
    const retval: FuzzyRelation = {};
    for (const event of events) {
        retval[event] = {};
        for (const event2 of events) {
            retval[event][event2] = 0;
        }
    }
    return retval;
}

const emptyEventMap = (events: Set<Event>): EventMap => {
    const retval: EventMap = {};
    for (const event of events) {
        retval[event] = new Set();
    }
    return retval;
}

const computeActivations = (
    executedEvent: Event,
    events: Set<Event>,
    rel: EventMap,
    getGuard: (event2: Event) => string | undefined,
    variableStore: VariableStore
): FuzzyRelation => {
    const retval: FuzzyRelation = {};
    for (const event of events) {
        retval[event] = {};
        if (event === executedEvent && rel[event]) {
            for (const event2 of events) {
                if (rel[event].has(event2)) {
                    const guard = getGuard(event2);
                    retval[event][event2] = (!guard || evaluateGuard(guard, variableStore)) ? 1 : 0;
                } else {
                    retval[event][event2] = 0;
                }
            }
        } else {
            for (const event2 of events) {
                retval[event][event2] = 0;
            }
        }
    }
    return retval;
}

export const quantifyViolations = (graph: DCRGraphS, trace: RoleTrace, initialVariableStore: VariableStore = {}): { totalViolations: number, totalTimeViolations: number, violations: RelationViolations, timeViolations: RelationViolations, activations: RelationActivations, stepViolations: number[] } => {
    // Copies and flips excludesTo and responseTo to easily find all events that are the sources of the relations
    const excludesFor = reverseRelation(graph.excludesTo);
    const responseFor = reverseRelation(graph.responseTo);

    const allEvents = Object.values(graph.subProcesses).reduce(
        (acc, cum) => acc.union(cum.events),
        copySet(graph.events)).union(new Set(Object.keys(graph.subProcesses)));

    const quantifyRec = (graph: DCRGraphS, trace: RoleTrace, exSinceIn: EventMap, exSinceEx: EventMap, variableStore: VariableStore = {}, executionTimestamps: Map<Event, number> = new Map(), lastEventTime: number | undefined = undefined): { totalViolations: number, totalTimeViolations: number, violations: RelationViolations, timeViolations: RelationViolations, activations: RelationActivations, stepViolations: number[] } => {
        if (trace.length === 0) {
            // Regular response violations: B never appeared after A fired (B still pending at end of trace).
            // Time violations for responses come only from mid-trace deadline checks (B appeared but too late).
            const responseTo = emptyFuzzyRel(allEvents);
            let totalViolations = 0;
            for (const event of copySet(graph.marking.pending).intersect(
                graph.marking.included
            )) {
                for (const otherEvent of copySet(responseFor[event]).intersect(
                    exSinceEx[event]
                )) {
                    responseTo[otherEvent][event]++;
                    totalViolations++;
                }
            }
            return {
                totalViolations,
                totalTimeViolations: 0,
                violations: {
                    conditionsFor: emptyFuzzyRel(allEvents),
                    responseTo,
                    excludesTo: emptyFuzzyRel(allEvents),
                    milestonesFor: emptyFuzzyRel(allEvents),
                },
                timeViolations: {
                    conditionsFor: emptyFuzzyRel(allEvents),
                    responseTo: emptyFuzzyRel(allEvents),
                    excludesTo: emptyFuzzyRel(allEvents),
                    milestonesFor: emptyFuzzyRel(allEvents),
                },
                activations: {
                    conditionsFor: emptyFuzzyRel(allEvents),
                    responseTo: emptyFuzzyRel(allEvents),
                    excludesTo: emptyFuzzyRel(allEvents),
                    milestonesFor: emptyFuzzyRel(allEvents),
                    includesTo: emptyFuzzyRel(allEvents)
                },
                stepViolations: [],
            }
        };

        const [head, ...tail] = trace;

        // Open world principle: skip events not in the graph
        if (!graph.labels.has(head.activity)) {
            return quantifyRec(graph, tail, exSinceIn, exSinceEx, variableStore, executionTimestamps, lastEventTime);
        }

        const updatedStore: VariableStore = { ...variableStore, ...(head.variables || {}) };

        let leastViolations = Infinity;
        let bestTotalTimeViolations = 0;
        let bestStepViolations: number[] = [];
        let bestRelationViolations: RelationViolations = {
            conditionsFor: {},
            responseTo: {},
            excludesTo: {},
            milestonesFor: {}
        };
        let bestRelationTimeViolations: RelationViolations = {
            conditionsFor: {},
            responseTo: {},
            excludesTo: {},
            milestonesFor: {}
        };
        let bestRelationActivations: RelationActivations = {
            conditionsFor: {},
            responseTo: {},
            excludesTo: {},
            milestonesFor: {},
            includesTo: {}
        };
        const initMarking = copyMarking(graph.marking);
        for (const event of graph.labelMapInv[head.activity]) {
            if (!(head.role === graph.roleMap[event])) continue;

            const localExSinceIn = copyEventMap(exSinceIn);
            const localExSinceEx = copyEventMap(exSinceEx);
            let localViolationCount = 0;
            let localTimeViolationCount = 0;
            const localViolations: RelationViolations = {
                conditionsFor: emptyFuzzyRel(allEvents),
                responseTo: emptyFuzzyRel(allEvents),
                excludesTo: emptyFuzzyRel(allEvents),
                milestonesFor: emptyFuzzyRel(allEvents)
            };
            const localTimeViolations: RelationViolations = {
                conditionsFor: emptyFuzzyRel(allEvents),
                responseTo: emptyFuzzyRel(allEvents),
                excludesTo: emptyFuzzyRel(allEvents),
                milestonesFor: emptyFuzzyRel(allEvents)
            };

            const localActivations: RelationActivations = {
                conditionsFor: computeActivations(event, allEvents, graph.conditionsFor,
                    (event2) => graph.guardMap?.[event2]?.[event]?.['condition'], updatedStore),
                responseTo: computeActivations(event, allEvents, graph.responseTo,
                    (event2) => graph.guardMap?.[event]?.[event2]?.['response'], updatedStore),
                excludesTo: computeActivations(event, allEvents, graph.excludesTo,
                    (event2) => graph.guardMap?.[event]?.[event2]?.['exclude'], updatedStore),
                milestonesFor: computeActivations(event, allEvents, graph.milestonesFor,
                    (event2) => graph.guardMap?.[event2]?.[event]?.['milestone'], updatedStore),
                includesTo: computeActivations(event, allEvents, graph.includesTo,
                    (event2) => graph.guardMap?.[event]?.[event2]?.['include'], updatedStore),
            };

            // Condition violations (structural + delay)
            const headTime = head.timestamp?.getTime();
            for (const otherEvent of copySet(graph.conditionsFor[event]).intersect(graph.marking.included)) {
                const guard = graph.guardMap?.[otherEvent]?.[event]?.['condition'];
                if (guard && !evaluateGuard(guard, updatedStore)) continue; // guard inactive
                // Structural: not executed → regular violation
                if (!graph.marking.executed.has(otherEvent)) {
                    if (!localViolations.conditionsFor[event]) localViolations.conditionsFor[event] = {};
                    if (!localViolations.conditionsFor[event][otherEvent]) localViolations.conditionsFor[event][otherEvent] = 0;
                    localViolations.conditionsFor[event][otherEvent]++;
                    localViolationCount++;
                }
                // Delay: executed but too soon → time violation
                else if (headTime !== undefined && graph.timeConstraintMap) {
                    const delay = graph.timeConstraintMap[otherEvent]?.[event]?.delay;
                    if (delay !== undefined) {
                        const sourceTime = executionTimestamps.get(otherEvent);
                        if (sourceTime !== undefined && headTime - sourceTime < delay) {
                            if (!localTimeViolations.conditionsFor[event]) localTimeViolations.conditionsFor[event] = {};
                            if (!localTimeViolations.conditionsFor[event][otherEvent]) localTimeViolations.conditionsFor[event][otherEvent] = 0;
                            localTimeViolations.conditionsFor[event][otherEvent]++;
                            localViolationCount++;
                            localTimeViolationCount++;
                        }
                    }
                }
            }
            // Milestone violations
            for (const otherEvent of copySet(graph.milestonesFor[event]).intersect(
                graph.marking.pending,
            )) {
                if (graph.marking.included.has(otherEvent)) {
                    const guard = graph.guardMap?.[otherEvent]?.[event]?.['milestone'];
                    if (!guard || evaluateGuard(guard, updatedStore)) {
                        if (!localViolations.milestonesFor[event]) localViolations.milestonesFor[event] = {};
                        if (!localViolations.milestonesFor[event][otherEvent]) localViolations.milestonesFor[event][otherEvent] = 0;
                        localViolations.milestonesFor[event][otherEvent]++;
                        localViolationCount++;
                    }
                }
            }
            // Deadline violation: response source → event with deadline, event fires too late → time violation
            if (headTime !== undefined && graph.timeConstraintMap) {
                for (const source in graph.timeConstraintMap) {
                    const deadlineMs = graph.timeConstraintMap[source]?.[event]?.deadline;
                    if (deadlineMs === undefined) continue;
                    const sourceTime = executionTimestamps.get(source);
                    if (sourceTime !== undefined && headTime - sourceTime > deadlineMs) {
                        if (!localTimeViolations.responseTo[source]) localTimeViolations.responseTo[source] = {};
                        if (!localTimeViolations.responseTo[source][event]) localTimeViolations.responseTo[source][event] = 0;
                        localTimeViolations.responseTo[source][event]++;
                        localViolationCount++;
                        localTimeViolationCount++;
                    }
                }
            }
            // Exclude violation
            // If event is not included, then for all events, 'otherEvent' that has been executed since 'event'
            // was last included, the relation otherEvent ->% event covers the trace
            if (!graph.marking.included.has(event)) {
                for (const otherEvent of copySet(localExSinceIn[event]).intersect(
                    excludesFor[event]
                )) {
                    localViolations.excludesTo[otherEvent][event]++;
                    localViolationCount++;
                }
            }

            executeS(event, graph, updatedStore);

            // Update timestamps
            const updatedTimestamps = new Map(executionTimestamps);
            const headTime2 = head.timestamp?.getTime();
            if (headTime2 !== undefined) updatedTimestamps.set(event, headTime2);

            // For all events included by 'event' clear executed since included set
            for (const otherEvent of graph.includesTo[event]) {
                localExSinceIn[otherEvent] = new Set();
            }

            // Add to executed since included for all events
            for (const otherEvent of allEvents) {
                localExSinceEx[otherEvent].add(event);
                localExSinceIn[otherEvent].add(event);
            }
            // Clear executed since set
            localExSinceEx[event] = new Set([event]);

            const { totalViolations: recTotalViolations, totalTimeViolations: recTotalTimeViolations, violations: recViolations, timeViolations: recTimeViolations, activations: recActivations, stepViolations: recStepViolations } = quantifyRec(graph, tail, localExSinceIn, localExSinceEx, updatedStore, updatedTimestamps, headTime2);
            if (localViolationCount + recTotalViolations < leastViolations) {
                leastViolations = localViolationCount + recTotalViolations;
                bestTotalTimeViolations = localTimeViolationCount + recTotalTimeViolations;
                bestRelationViolations = mergeViolations(localViolations, recViolations);
                bestRelationTimeViolations = mergeViolations(localTimeViolations, recTimeViolations);
                bestRelationActivations = mergeActivations(localActivations, recActivations);
                bestStepViolations = [localViolationCount, ...recStepViolations];
            }
            graph.marking = copyMarking(initMarking);
        }


        graph.marking = copyMarking(initMarking);
        return { totalViolations: leastViolations, totalTimeViolations: bestTotalTimeViolations, violations: bestRelationViolations, timeViolations: bestRelationTimeViolations, activations: bestRelationActivations, stepViolations: bestStepViolations };
    };

    const results = quantifyRec(graph, trace, emptyEventMap(allEvents), emptyEventMap(allEvents), initialVariableStore);

    return results;
}