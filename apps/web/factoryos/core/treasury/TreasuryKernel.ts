          account.reservedTokenCapacityUnits - reservedTokenCapacity,
        settledTokenCapacityUnits:
          account.settledTokenCapacityUnits + actualTokenCapacity,
        availableTokenCapacityUnits:
          account.availableTokenCapacityUnits + releaseTokenCapacity,
        version: account.version + 1,
        updatedAt: now.toISOString(),
      };
      const nextReservation: TreasuryReservation = {
        ...reservation,
        status: "SETTLED",
        updatedAt: now.toISOString(),
      };

      await tx.putAccount(nextAccount);
      await tx.putReservation(nextReservation);
      await tx.appendEvent(event(
        "RESOURCE_CONSUMED",
        reservation.accountId,
        {
          actualTokens: consumption.actualTokens,
          actualDurationMs: consumption.actualDurationMs,
          resourceRequest: reservation.resourceRequest,
          executionEvidenceId: consumption.executionEvidenceId,
          verificationReceiptId: consumption.verificationReceiptId,
          verified: consumption.verified,
        },
        {
          reservationId,
          commandId: reservation.commandId,
          missionId: reservation.missionId,
          amountUsd: consumption.actualCostUsd,
          capacityUnits: consumption.actualCapacityUnits,
        },
        now,
      ));
      await tx.appendEvent(event(
        "SPEND_RECONCILED",
        reservation.accountId,
        {
          reservedUsd: reservation.reservedCostUsd,
          actualCostUsd: consumption.actualCostUsd,
          resourceRequest: reservation.resourceRequest,
          releasedUsd: releaseUsd,
          verificationReceiptId: consumption.verificationReceiptId,
        },
        {
          reservationId,
          commandId: reservation.commandId,
          missionId: reservation.missionId,
          amountUsd: consumption.actualCostUsd,
          capacityUnits: consumption.actualCapacityUnits,
        },
        now,
      ));
      return nextReservation;
    });