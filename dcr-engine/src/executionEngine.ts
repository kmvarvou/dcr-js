import init from "./init";
import {
  DCRGraph,
  DCRGraphS,
  Event,
  GuardMap,
  isSubProcess,
  SubProcess,
  VariableStore,
} from "./types";
import { copySet } from "./utility";

init();

// -----------------------------------------------------------
// -------------------- FEEL Guard Evaluator -----------------
// -----------------------------------------------------------

// Decodes XML-encoded FEEL operators: &gt; → >, &lt; → <, etc.
const decodeXMLEntities = (expr: string): string =>
  expr
    .replace(/&gt;=/g, ">=")
    .replace(/&lt;=/g, "<=")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

// Evaluate a simple FEEL guard expression against a variable store.
// Supports: >, <, >=, <=, =, != with one variable and one literal value.
// Returns true (guard passes) if:
//   - expression is empty / undefined
//   - comparison evaluates to true
// Returns false if variable is not in store (guard requires a value to be satisfied)
export const evaluateGuard = (
  expression: string | undefined,
  variableStore: VariableStore
): boolean => {
  if (!expression || expression.trim() === "") return true;

  const expr = decodeXMLEntities(expression).trim();

  // Match: <variable> <operator> <value>  OR  <value> <operator> <variable>
  const pattern = /^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|!=|>|<|=)\s*(.+)$|^(.+)\s*(>=|<=|!=|>|<|=)\s*([A-Za-z_][A-Za-z0-9_]*)$/;
  const match = expr.match(pattern);
  if (!match) return true; // Can't parse — don't block

  let varName: string;
  let operator: string;
  let literalStr: string;
  let flipped = false;

  if (match[1] !== undefined) {
    // variable OP literal
    varName = match[1];
    operator = match[2];
    literalStr = match[3].trim();
  } else {
    // literal OP variable — flip for evaluation
    literalStr = match[4].trim();
    operator = match[5];
    varName = match[6];
    flipped = true;
  }

  // Variable not in store — guard cannot be satisfied, return false
  if (!(varName in variableStore)) return false;

  const varValue = variableStore[varName];

  // Parse literal as boolean, number, or string
  const literal: boolean | number | string =
    literalStr === 'true' ? true :
    literalStr === 'false' ? false :
    isNaN(Number(literalStr)) ? literalStr.replace(/^["']|["']$/g, "") : Number(literalStr);

  // Flip operator if literal was on the left
  const effectiveOp = flipped
    ? { ">": "<", "<": ">", ">=": "<=", "<=": ">=", "=": "=", "!=": "!=" }[operator] ?? operator
    : operator;

  switch (effectiveOp) {
    case ">":  return varValue > literal;
    case "<":  return varValue < literal;
    case ">=": return varValue >= literal;
    case "<=": return varValue <= literal;
    case "=":  return varValue == literal; // intentional ==
    case "!=": return varValue != literal;
    default:   return true;
  }
};

// Look up guard for a specific relation edge
const getGuard = (
  guardMap: GuardMap | undefined,
  source: string,
  target: string,
  relationType: string
): string | undefined => {
  return guardMap?.[source]?.[target]?.[relationType];
};

// satisfiedConditions[source] = set of targets whose condition was cleared when source fired
// Stored on the graph object so it persists across calls
type GraphWithSatisfied = DCRGraphS & {
  satisfiedConditions?: { [source: string]: Set<string> };
};

const markConditionSatisfied = (graph: GraphWithSatisfied, source: string, target: string) => {
  if (!graph.satisfiedConditions) graph.satisfiedConditions = {};
  if (!graph.satisfiedConditions[source]) graph.satisfiedConditions[source] = new Set();
  graph.satisfiedConditions[source].add(target);
};

const isConditionSatisfied = (graph: GraphWithSatisfied, source: string, target: string): boolean => {
  // No guard → satisfied if executed (standard DCR)
  if (!graph.satisfiedConditions?.[source]?.has(target)) return false;
  return true;
};

// -----------------------------------------------------------
// -------------------- Execution Engine ---------------------
// -----------------------------------------------------------

// Mutates graph's marking
export const execute = (event: Event, graph: DCRGraph) => {
  graph.marking.executed.add(event);
  graph.marking.pending.delete(event);
  for (const rEvent of graph.responseTo[event]) {
    graph.marking.pending.add(rEvent);
  }
  for (const eEvent of graph.excludesTo[event]) {
    graph.marking.included.delete(eEvent);
  }
  for (const iEvent of graph.includesTo[event]) {
    graph.marking.included.add(iEvent);
  }
};

export const isAccepting = (graph: DCRGraph): boolean => {
  return (
    copySet(graph.marking.pending).intersect(graph.marking.included).size === 0
  );
};

export const isEnabled = (event: Event, graph: DCRGraph): boolean => {
  if (!graph.marking.included.has(event)) return false;
  for (const cEvent of graph.conditionsFor[event]) {
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      return false;
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      return false;
    }
  }
  return true;
};

// Mutates graph's marking.
// Guards on outgoing response/exclude/include/milestone edges are checked:
// the relation's effect is only applied if the guard passes.
// For condition edges: we record which conditions were satisfied at execution time,
// so isEnabledS knows whether a guarded condition was truly cleared.
export const executeS = (
  event: Event,
  graph: DCRGraphS,
  variableStore: VariableStore = {}
) => {
  const g = graph as GraphWithSatisfied;

  graph.marking.executed.add(event);
  graph.marking.pending.delete(event);

  // For every event that has a condition ON this event (i.e. event is in conditionsFor[target]):
  // mark the condition as satisfied only if the guard passes.
  // This tells isEnabledS whether the condition was truly cleared.
  for (const target in graph.conditionsFor) {
    if (graph.conditionsFor[target].has(event)) {
      const guard = getGuard(graph.guardMap, event, target, "condition");
      const passes = evaluateGuard(guard, variableStore);
      if (passes) {
        markConditionSatisfied(g, event, target);
      }
    }
  }

  // Milestone: same logic — mark satisfied only if guard passes
  for (const target in graph.milestonesFor) {
    if (graph.milestonesFor[target].has(event)) {
      const guard = getGuard(graph.guardMap, event, target, "milestone");
      if (evaluateGuard(guard, variableStore)) {
        markConditionSatisfied(g, event, target);
      }
    }
  }

  for (const eEvent of graph.excludesTo[event]) {
    const guard = getGuard(graph.guardMap, event, eEvent, "exclude");
    if (evaluateGuard(guard, variableStore)) {
      graph.marking.included.delete(eEvent);
    }
  }
  for (const iEvent of graph.includesTo[event]) {
    const guard = getGuard(graph.guardMap, event, iEvent, "include");
    if (evaluateGuard(guard, variableStore)) {
      graph.marking.included.add(iEvent);
    }
  }
  for (const rEvent of graph.responseTo[event]) {
    const guard = getGuard(graph.guardMap, event, rEvent, "response");
    if (evaluateGuard(guard, variableStore)) {
      graph.marking.pending.add(rEvent);
    }
  }

  const group = graph.subProcessMap[event];
  if (group && isAcceptingS(group, graph)) {
    executeS(group.id, graph, variableStore);
  }
};

const hasExcludedElder = (group: SubProcess, graph: DCRGraphS) => {
  if (!graph.marking.included.has(group.id)) return true;
  if (!isSubProcess(group.parent)) return false;
  return hasExcludedElder(group.parent, graph);
};

export const isAcceptingS = (
  group: SubProcess | DCRGraphS,
  graph: DCRGraphS
): boolean => {
  let pending = copySet(graph.marking.pending).intersect(graph.marking.included);
  for (const blockingEvent of pending.intersect(group.events)) {
    const group = graph.subProcessMap[blockingEvent];
    if (!group || !hasExcludedElder(group, graph)) return false;
  }
  return true;
};

const formatEmpty = (label: string, title: string): string =>
  label === "" ? `Unnamed ${title}` : label;

// isEnabledS checks structural constraints (conditions, milestones) AND
// guard expressions on those incoming edges.
// variableStore is optional — existing callers pass nothing and behaviour is unchanged.
export const isEnabledS = (
  event: Event,
  graph: DCRGraphS,
  group: SubProcess | DCRGraph,
  variableStore: VariableStore = {}
): { enabled: boolean; msg: string } => {
  if (!graph.marking.included.has(event)) {
    return {
      enabled: false,
      msg: `${formatEmpty(graph.labelMap[event], "Subprocess")} is not included...`,
    };
  }

  if (isSubProcess(group)) {
    const subProcessStatus = isEnabledS(group.id, graph, group.parent, variableStore);
    if (!subProcessStatus.enabled) return subProcessStatus;
  }

  const g = graph as GraphWithSatisfied;

  // Check condition edges.
  // A condition blocks event if: source is included AND
  // either (a) source is not executed at all, or
  //        (b) source was executed but its guard for THIS target failed (not satisfied)
  for (const cEvent of graph.conditionsFor[event]) {
    if (!graph.marking.included.has(cEvent)) continue;

    const guard = getGuard(graph.guardMap, cEvent, event, "condition");
    const hasGuard = !!guard;

    if (hasGuard) {
      // Guard currently false → condition doesn't apply, skip
      if (!evaluateGuard(guard, variableStore)) continue;
      // Guard currently true → condition applies; must have been satisfied (executed with passing guard)
      if (!isConditionSatisfied(g, cEvent, event)) {
        return {
          enabled: false,
          msg: `At minimum, ${formatEmpty(graph.labelMap[cEvent], "Event")} is conditioning for ${formatEmpty(graph.labelMap[event], "Event")}...`,
        };
      }
    } else {
      // Standard unguarded condition: blocked if not executed
      if (!graph.marking.executed.has(cEvent)) {
        return {
          enabled: false,
          msg: `At minimum, ${formatEmpty(graph.labelMap[cEvent], "Event")} is conditioning for ${formatEmpty(graph.labelMap[event], "Event")}...`,
        };
      }
    }
  }

  // Check milestone edges
  for (const mEvent of graph.milestonesFor[event]) {
    if (!graph.marking.included.has(mEvent) || !graph.marking.pending.has(mEvent)) continue;

    const mGuard = getGuard(graph.guardMap, mEvent, event, "milestone");
    const hasGuard = !!mGuard;
    if (hasGuard) {
      if (!evaluateGuard(mGuard, variableStore)) continue;
      if (!isConditionSatisfied(g, mEvent, event)) {
        return {
          enabled: false,
          msg: `At minimum, ${formatEmpty(graph.labelMap[mEvent], "Event")} is a milestone for ${formatEmpty(graph.labelMap[event], "Event")}...`,
        };
      }
    } else {
      return {
        enabled: false,
        msg: `At minimum, ${formatEmpty(graph.labelMap[mEvent], "Event")} is a milestone for ${formatEmpty(graph.labelMap[event], "Event")}...`,
      };
    }
  }

  return { enabled: true, msg: "" };
};
