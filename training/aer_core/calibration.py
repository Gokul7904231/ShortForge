from __future__ import annotations

from typing import Sequence

import torch
from torch import Tensor, nn


class TemperatureScaler(nn.Module):
    def __init__(self, initial_temperature: float = 1.0):
        super().__init__()
        self.log_temperature = nn.Parameter(
            torch.tensor(float(initial_temperature)).log()
        )

    @property
    def temperature(self) -> Tensor:
        return self.log_temperature.exp().clamp(0.05, 20.0)

    def forward(self, logits: Tensor) -> Tensor:
        return logits / self.temperature


def fit_temperature(
    groups: Sequence[Tensor],
    targets: Sequence[int],
) -> float:
    if len(groups) != len(targets) or not groups:
        raise ValueError(
            "temperature calibration requires non-empty logits and targets"
        )

    device = groups[0].device
    scaler = TemperatureScaler().to(device)
    optimizer = torch.optim.LBFGS(
        [scaler.log_temperature],
        lr=0.1,
        max_iter=50,
    )
    criterion = nn.CrossEntropyLoss()
    logits = [item.detach() for item in groups]
    target_tensors = [
        torch.tensor([target], dtype=torch.long, device=device)
        for target in targets
    ]

    def closure():
        optimizer.zero_grad()
        loss = torch.stack(
            [
                criterion(scaler(item).unsqueeze(0), target)
                for item, target in zip(logits, target_tensors)
            ]
        ).mean()
        loss.backward()
        return loss

    optimizer.step(closure)
    return float(scaler.temperature.detach().cpu())


def calibrate_group(logits: Tensor, temperature: float) -> Tensor:
    return torch.softmax(logits / max(temperature, 0.05), dim=-1)
