# ShortForge Obsidian Tooling

Repository-side tooling for the Obsidian-compatible knowledge/ vault.

## Commands

~~~powershell
node tools/obsidian/lint-vault.mjs knowledge
node tools/obsidian/build-catalog.mjs knowledge
node tools/obsidian/compile-memory.mjs knowledge "F03" 10
~~~

These tools deliberately do not require the Obsidian desktop app.

That keeps Obsidian a knowledge IDE rather than a production dependency while still allowing CI, agents and developer tooling to validate and project vault content.

For interactive workstation use, Obsidian CLI complements these tools. For controlled server-side synchronization, use Obsidian Headless Sync rather than the desktop application.
