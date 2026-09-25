# quiche → Floor 03 Mapping

Source: https://github.com/cloudflare/quiche

Observed pattern:
- Low-level transport state is separated from application semantics.

ShortForge mapping:
- AssetPlanIR owns semantic media-planning state.
- Transport, networking, tunnels, and provider I/O remain outside F03.

Status: ARCHITECTURE_ANALOGY
