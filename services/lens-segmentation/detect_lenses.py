#!/usr/bin/env python3
"""Copia isolada da YOLO frontal da MB Optical.

OD e OE vêm da posição na imagem, nunca do nome da classe: esquerda = OD,
direita = OE. Este arquivo nao importa a Torre-NeoSmart.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

SERVICE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = SERVICE_DIR / "models" / "best.pt"


@dataclass
class LensMeasurement:
    label: str
    confidence: float
    x: int
    y: int
    width: int
    height: int
    center_x: float
    center_y: float
    mask: np.ndarray


def mask_to_measurement(mask: np.ndarray, confidence: float) -> LensMeasurement | None:
    binary_mask = (mask > 0.5).astype(np.uint8)
    component_count, component_labels, stats, _ = cv2.connectedComponentsWithStats(
        binary_mask,
        connectivity=8,
    )
    if component_count <= 1:
        return None
    largest_component = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    binary_mask = (component_labels == largest_component).astype(np.uint8)
    points = cv2.findNonZero(binary_mask)
    if points is None:
        return None

    x, y, width, height = cv2.boundingRect(points)
    return LensMeasurement(
        label="",
        confidence=confidence,
        x=x,
        y=y,
        width=width,
        height=height,
        center_x=x + width / 2.0,
        center_y=y + height / 2.0,
        mask=binary_mask,
    )


def select_two_lenses(candidates: list[LensMeasurement]) -> list[LensMeasurement]:
    if len(candidates) < 2:
        raise ValueError(f"Expected two lens masks, but the model detected {len(candidates)}.")

    selected = sorted(candidates, key=lambda item: item.confidence, reverse=True)[:2]
    selected.sort(key=lambda item: item.center_x)
    selected[0].label = "OD"
    selected[1].label = "OE"
    return selected


def predict_lenses(
    model: YOLO,
    image: np.ndarray,
    confidence: float = 0.25,
    imgsz: int = 640,
) -> list[LensMeasurement]:
    result = model.predict(
        source=image,
        conf=confidence,
        imgsz=imgsz,
        retina_masks=True,
        verbose=False,
    )[0]

    if result.masks is None or result.boxes is None:
        raise ValueError("The model returned no segmentation masks.")

    masks = result.masks.data.cpu().numpy()
    confidences = result.boxes.conf.cpu().numpy()
    class_ids = result.boxes.cls.cpu().numpy().astype(int)
    candidates: list[LensMeasurement] = []

    image_height, image_width = image.shape[:2]
    for mask, mask_confidence, class_id in zip(masks, confidences, class_ids):
        class_name = str(result.names[class_id]).strip().lower()
        if class_name != "lente":
            continue
        if mask.shape != (image_height, image_width):
            mask = cv2.resize(mask, (image_width, image_height), interpolation=cv2.INTER_NEAREST)
        measurement = mask_to_measurement(mask, float(mask_confidence))
        if measurement is not None:
            candidates.append(measurement)

    return select_two_lenses(candidates)


def low_light_copy(image: np.ndarray, lenses: list[LensMeasurement] | None) -> np.ndarray | None:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    if lenses:
        region = (lenses[0].mask | lenses[1].mask).astype(bool)
        samples = luminance[region]
    else:
        h, w = luminance.shape
        samples = luminance[h // 5:4 * h // 5, w // 6:5 * w // 6]
    median = float(np.median(samples))
    if median >= 100 or median < 8 or float(np.std(samples)) < 4:
        return None
    gamma = float(np.clip(np.log(115 / 255) / np.log(max(median, 1) / 255), 0.65, 0.95))
    values = np.arange(256, dtype=np.float32) / 255
    table = np.round(255 * values ** gamma).astype(np.uint8)
    lab[:, :, 0] = cv2.LUT(luminance, table)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def plausible_pair(lenses: list[LensMeasurement]) -> bool:
    od, oe = lenses
    return (
        od.center_x < oe.center_x
        and min(od.width, oe.width) / max(od.width, oe.width) >= 0.45
        and min(od.height, oe.height) / max(od.height, oe.height) >= 0.45
        and abs(od.center_y - oe.center_y) < max(od.height, oe.height) * 0.65
        and np.count_nonzero(od.mask & oe.mask) / max(1, min(od.mask.sum(), oe.mask.sum())) < 0.15
    )


def choose_light_result(original: list[LensMeasurement] | None, corrected: list[LensMeasurement]) -> list[LensMeasurement]:
    if not plausible_pair(corrected):
        if original is not None:
            return original
        raise ValueError("Low-light retry did not produce a plausible lens pair.")
    if original is None:
        return corrected
    agreement = all(
        np.count_nonzero(a.mask & b.mask) / max(1, np.count_nonzero(a.mask | b.mask)) >= 0.70
        for a, b in zip(original, corrected)
    )
    improved = min(l.confidence for l in corrected) >= min(l.confidence for l in original) + 0.03
    return corrected if agreement and improved else original


def analyze_image(model: YOLO, image: np.ndarray, confidence: float = 0.25, imgsz: int = 640) -> list[LensMeasurement]:
    original = None
    original_error = None
    try:
        original = predict_lenses(model, image, confidence, imgsz)
    except ValueError as error:
        original_error = error
    enhanced = low_light_copy(image, original)
    if enhanced is not None:
        try:
            corrected = predict_lenses(model, enhanced, confidence, imgsz)
            return choose_light_result(original, corrected)
        except ValueError:
            pass
    if original is not None:
        return original
    raise ValueError(f"Unable to locate two lenses; improve lighting and retry. {original_error}")
