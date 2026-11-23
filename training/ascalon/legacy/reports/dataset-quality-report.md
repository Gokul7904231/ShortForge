# Project Ascalon: Dataset Quality Report

**Generated At**: 2026-09-23T10:23:11.994Z  
**Total Trajectories**: 13  
**Status**: `ELIGIBLE`  

---

## 1. Dataset Split Summary

| Split | Count | Ratio | Leakage Prevention Mode |
| :--- | :--- | :--- | :--- |
| **Train** | 10 | ~70% | Grouped by episode / mission family |
| **Validation** | 2 | ~15% | Grouped by episode / mission family |
| **Test** | 1 | ~15% | Grouped by episode / mission family |
| **Rejected** | 0 | 0% | Quarantined for validation issues |

---

## 2. Quality Gate Metrics

- **Secret Leakage Detected**: 0 (PASSED)
- **Synthetic Data Mislabeled as Real**: 0 (PASSED)
- **Unverified Claims of Success**: 0 (PASSED)
- **Schema Validation Rate**: 100% (PASSED)
- **Deterministic Replay Rate**: 100% (PASSED)
