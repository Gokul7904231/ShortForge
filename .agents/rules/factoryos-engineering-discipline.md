# FactoryOS Engineering Discipline Rules

1. **Reconnaissance First**: Never edit code before inspecting existing source files and creating an internal implementation map.
2. **Preserve Hierarchy**: Never introduce competing `OracleAgent`, `TestingAgent`, or parallel orchestrators. FactoryOS already has Overseer, Slayers, Guardians, Healers.
3. **Physical Evidence Over Claims**: An artifact is valid only if verified physically on disk with matching SHA-256 digest and valid media container/streams.
4. **No Synthetic Bypasses**: Downstream floors must consume what upstream floors actually produced.
5. **Clean-Room Assimilation**: External repositories provide architectural inspiration; always reimplement cleanly without copying code, and document in `.okf/research/`.
