# DCR-js: an open-source process modelling and mining environment for DCR graphs

[Try it live!](https://kmvarvou.github.io/dcr-js/)

This repository extends [DCR-js](https://github.com/hugoalopez-dtu/dcr-js) to support multi-perspective declarative business processes, as described in the preprint:

> *Process DoCtoR: Towards a Framework for Modeling, Diagnosing and Compliance Checking Multi-Perspective Declarative Business Processes* — preprint submitted to CAiSE Forums 2026.

The extensions include:
* A **React Flow-based modeler** (V2) as an alternative to the original diagram-js editor.
* **Data variables** (Int, Bool, String) attached to events, with default values and FEEL guard expressions on relations.
* **Time constraints** on condition (delay) and response (deadline) relations, specified as ISO 8601 duration strings (e.g. `P30D`, `PT2H`).
* **Simulation** with a controllable clock, variable input popups, non-conformant execution mode, and XES event log export including timestamps and variable values.
* **Conformance checking** with heatmap visualization distinguishing regular violations from time violations.

What are DCR Graphs? A novel notation ideal for flexible processes, such as those in healthcare, municipal administration, or knowledge-intensive processes in general.

For a formal definition of DCR graphs, please [read this paper](https://arxiv.org/pdf/1110.4161.pdf).

This tool supports a wide range of process mining activities for DCR graphs:

## Instructions ##
A demo video of the extended version of DCR-JS can be watched [here](https://drive.google.com/file/d/1JYKle7RKJ_ZBBnIf75TVXzO_fgN84YYO/view).

# License
This package is published using an MIT license





