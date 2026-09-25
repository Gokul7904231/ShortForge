# Team Reports

Every non-trivial change emits one machine-readable report.

For pull requests:

Team/reports/pr-<number>.json

The report retains:
- .okf sweep status and source refs
- classification
- routed Forgers
- security evidence and statuses
- every detected contradiction
- proposed and accepted resolutions
- final disposition
- evidence references
- model/version metadata when Ascalon participates

Resolved conflicts remain in history. They are not deleted to make a result look clean.

Never store secrets or raw credentials in reports.
