# Repository Mapping: AcademySoftwareFoundation/OpenTimelineIO

Status: selected F03 boundary reference
Adoption: logical shot intent vs resolved media

OTIO distinguishes a clip's logical source_range from the available range of the currently resolved media. Media can be relinked without changing the clip's logical source range.

F03 mapping:
- target_duration_seconds and scene intent are logical production intent.
- physical media resolution remains downstream.
- future reference resolution must not mutate semantic scene timing merely because a provider returns a different file/range.

URL: https://github.com/AcademySoftwareFoundation/OpenTimelineIO
