# DCR-js: an open-source process modelling and mining environment for DCR graphs

[Try it live!](https://kmvarvou.github.io/dcr-js/)

This repository extends [DCR-js](https://github.com/hugoalopez-dtu/dcr-js) to support multi-perspective declarative business processes. It is developed at the Technical University of Denmark by Konstantinos Varvoutas, Julian Neuberger, and Hugo A. Lòpez, as described in the preprint:

> *Process DoCtoR: Towards a Framework for Modeling, Diagnosing and Compliance Checking Multi-Perspective Declarative Business Processes* — preprint submitted to CAiSE Forums 2026.

The extensions cover three of the five modules of DCR-JS:

* **Modeling** — A React Flow-based modeler (V2) implemented in React 19. Each event can be associated with one variable (Int, Bool, or String) with an optional default value. Relations support FEEL-based guard expressions (e.g. `Diagnosis = true`) as well as time annotations: condition relations carry a minimum delay and response relations carry a deadline, both specified as ISO 8601 duration strings (e.g. `P30D` for 30 days, `PT2H` for 2 hours).
* **Simulation** — Step-based simulation extended with the time and data perspectives. Enabled events are highlighted in green. When an event with an associated variable is executed, a pop-up prompts the user for a value. The simulation clock is user-controlled and can be advanced by a chosen amount. Non-conformant execution mode is supported. Traces can be exported as XES event logs including timestamps and variable values.
* **Conformance checking** — Heatmap-based conformance checking extended to distinguish regular constraint violations from time violations.

What are DCR Graphs? A novel notation ideal for flexible processes, such as those in healthcare, municipal administration, or knowledge-intensive processes in general.

For a formal definition of DCR graphs, please [read this paper](https://arxiv.org/pdf/1110.4161.pdf).

## Instructions ##
A demo video of the extended version of DCR-JS can be watched [here](https://drive.google.com/file/d/1JYKle7RKJ_ZBBnIf75TVXzO_fgN84YYO/view).

# License
This package is published using an MIT license





