// -----------------------------------------------------------
// -------------------- Extended Set Type --------------------
// -----------------------------------------------------------

declare global {
  interface Set<T> {
    union(b: Set<T>): Set<T>;
    intersect(b: Set<T>): Set<T>;
    difference(b: Set<T>): Set<T>;
  }
}

// -----------------------------------------------------------
// --------------------- DCR Graph Types ---------------------
// -----------------------------------------------------------

export type Event = string;
export type Label = string;
export type Role = string;

export type RelationType = "condition" | "response" | "include" | "exclude" | "milestone";

export interface Marking {
  executed: Set<Event>;
  included: Set<Event>;
  pending: Set<Event>;
}

export type Nestings = { nestingIds: Set<string>, nestingRelations: { [event: Event]: string } };

// Map from event to a set of events
// Used to denote different relations between events
export interface EventMap {
  [startEventId: string]: Set<Event>;
}

export interface FuzzyRelation {
  [startEvent: string]: {
    [endEvent: string]: number;
  };
}

export type RelationViolations = {
  conditionsFor: FuzzyRelation;
  responseTo: FuzzyRelation;
  excludesTo: FuzzyRelation;
  milestonesFor: FuzzyRelation;
}

export type RelationActivations = {
  conditionsFor: FuzzyRelation;
  responseTo: FuzzyRelation;
  excludesTo: FuzzyRelation;
  milestonesFor: FuzzyRelation;
  includesTo: FuzzyRelation;
}

// -----------------------------------------------------------
// -------------------- Guard / Data Types -------------------
// -----------------------------------------------------------

// Variable store: maps variable name → its current value
export type VariableStore = { [variableName: string]: number | string | boolean };

// Guard map: [source][target][relationType] → FEEL expression string
// e.g. guardMap["A"]["B"]["condition"] = "Amount > 5"
export type GuardMap = {
  [source: string]: {
    [target: string]: {
      [relationType: string]: string;
    };
  };
};

// -----------------------------------------------------------
// ---------------------- DCR Graphs -------------------------
// -----------------------------------------------------------

export interface DCRGraph {
  events: Set<Event>;
  conditionsFor: EventMap;
  milestonesFor: EventMap;
  responseTo: EventMap;
  includesTo: EventMap;
  excludesTo: EventMap;
  marking: Marking;
}

export type AlignAction = "consume" | "model-skip" | "trace-skip";

export type CostFun = (action: AlignAction, target: Event) => number;

export type Alignment = { cost: number; trace: Trace };

export type Test = {
  polarity: "+" | "-",
  trace: Trace,
  context: Set<Event>
}

export interface Labelling {
  labels: Set<Label>;
  labelMap: { [event: Event]: Label };
  labelMapInv: { [label: Label]: Set<Event> };
}

export interface Optimizations {
  conditions: Set<Event>;
  includesFor: EventMap;
  excludesFor: EventMap;
}

export type LabelDCR = DCRGraph & Labelling;

export type LabelDCRPP = DCRGraph & Labelling & Optimizations;

export type DCRGraphS = DCRGraph & Labelling & {
  subProcesses: {
    [id: string]: SubProcess;
  };
  subProcessMap: {
    [event: Event]: SubProcess;
  };
  roles: Set<Role>;
  roleMap: { [event: Event]: Role };
  // Optional guard map — present when graph has data constraints
  guardMap?: GuardMap;
  // Optional time constraint map — delay (ms) on condition edges, deadline (ms) on response edges
  timeConstraintMap?: { [source: string]: { [target: string]: { delay?: number; deadline?: number } } };
}

export interface SubProcess {
  id: string;
  parent: SubProcess | DCRGraphS;
  events: Set<Event>;
}

export const isSubProcess = (obj: unknown): obj is SubProcess => {
  return (obj as SubProcess).parent !== undefined;
}

export type Trace = Array<Event>;
export type RoleTrace = Array<{ activity: Label, role: Role, timestamp?: Date, variables?: Record<string, number | string | boolean> }>

export interface EventLog<T extends RoleTrace | Trace> {
  events: Set<Event>;
  traces: {
    [traceId: string]: T;
  }
}

export interface XMLEvent {
  string: [{
    "@key": "concept:name";
    "@value": string;
  }, {
    "@key": "role";
    "@value": string;
  }];

}

export interface XMLTrace {
  string: {
    "@key": "concept:name";
    "@value": string;
  };
  boolean: {
    "@key": "pdc:isPos";
    "@value": boolean;
  };
  event: Array<XMLEvent>;
}

export interface XMLLog {
  log: {
    "@xes.version": "1.0";
    "@xes.features": "nested-attributes";
    "@openxes.version": "1.0RC7";
    global: {
      "@scope": "event";
      string: [{
        "@key": "concept:name";
        "@value": "__INVALID__";
      }, {
        "@key": "role";
        "@value": "__INVALID__";
      }];
    };
    classifier: {
      "@name": "Event Name";
      "@keys": "concept:name";
    };
    trace: Array<XMLTrace>;
  };
}

// Abstraction of the log used for mining
export interface LogAbstraction {
  events: Set<Event>;
  traces: {
    [traceId: string]: Trace;
  };
  chainPrecedenceFor: EventMap;
  precedenceFor: EventMap;
  responseTo: EventMap;
  predecessor: EventMap;
  successor: EventMap;
  atMostOnce: Set<Event>;
  nonCoExisters?: EventMap;
  precedesButNeverSuceeds?: EventMap;
}


export interface TraceCoverRelation {
  [startEventId: string]: {
    [endEventId: string]: Set<TraceId>;
  };
}

export interface TraceCoverGraph {
  conditionsFor: TraceCoverRelation;
  responseTo: TraceCoverRelation;
  excludesTo: TraceCoverRelation;
}

// -----------------------------------------------------------
// ------------------------ Log Types ------------------------
// -----------------------------------------------------------

type TraceId = string;


export type Traces = {
  [traceId: TraceId]: Trace;
};

export interface BinaryLog {
  events: Set<Event>;
  traces: Traces;
  nTraces: Traces;
}

export interface ClassifiedLog {
  [traceId: string]: {
    isPositive: boolean;
    trace: Trace;
  };
}

export interface ClassifiedTraces {
  [traceId: string]: boolean;
}
