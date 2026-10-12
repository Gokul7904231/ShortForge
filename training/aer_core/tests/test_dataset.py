from training.aer_core.dataset import assert_no_group_leakage, deterministic_split
from training.aer_core.schema import validate_records, ValidationError


def row(example_id: str, group: str):
    return {
        "exampleId": example_id,
        "datasetVersion": "aer-core-dataset-v1",
        "sourceBatchId": example_id,
        "missionId": "mission-" + group,
        "trajectoryId": group,
        "input": {"questions": [{"id": "q1", "type": "NOUL", "question": "A?"}]},
        "goldAnswers": [{"questionId": "q1", "type": "NOUL", "value": True}],
        "evidenceRefs": ["evidence-1"],
        "outcomeRefs": [],
        "policyRefs": [],
        "verificationStatus": "VERIFIED",
        "labelSource": "VERIFIED_OUTCOME",
        "humanReviewed": True,
        "synthetic": False,
        "fallbackApplied": False,
        "trainingEligible": True,
        "provenance": {"trajectoryId": group},
    }


def test_rejects_synthetic():
    bad = row("e1", "t1")
    bad["synthetic"] = True
    try:
        validate_records([bad])
    except ValidationError:
        return
    raise AssertionError("synthetic record was accepted")


def test_group_split_has_no_leakage():
    records = validate_records([row("e" + str(i), "t" + str(i)) for i in range(40)])
    partitions = deterministic_split(records)
    assert_no_group_leakage(partitions)


def test_top_level_trajectory_is_the_split_group():
    records = validate_records([
        row("e1", "trajectory-shared"),
        row("e2", "trajectory-shared"),
    ])
    partitions = deterministic_split(records)
    owners = {
        split: [item.trajectory_id for item in rows]
        for split, rows in partitions.items()
    }
    populated = [name for name, rows in owners.items() if rows]
    assert len(populated) == 1
