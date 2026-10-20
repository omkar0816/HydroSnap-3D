import numpy as np
import pytest

from scripts.satellite.analyze_watershed import (
    CLEAR_SCL_CLASSES,
    clear_scl_mask,
    ndvi_ndwi,
    summarize_aoi,
)


def test_scl_mask_accepts_only_clear_classes():
    scl = np.array([[4, 5, 6, 3, 8, 9]])
    assert clear_scl_mask(scl).tolist() == [[True, True, True, False, False, False]]
    assert CLEAR_SCL_CLASSES == (4, 5, 6)


def test_indices_and_valid_pixel_statistics_use_aoi_pixels_only():
    green = np.array([[0.2, 0.2], [0.2, 0.2]])
    red = np.array([[0.1, 0.1], [0.1, 0.1]])
    nir = np.array([[0.3, 0.3], [0.3, 0.3]])
    values = ndvi_ndwi(green, red, nir, "NDVI")
    summary = summarize_aoi(values, np.array([[True, True], [False, False]]))
    assert summary["valid_pixel_pct"] == 100.0
    assert summary["mean"] == pytest.approx(0.5)


def test_empty_valid_pixels_have_no_measurement_values():
    summary = summarize_aoi(np.array([[np.nan, np.nan]]), np.array([[True, True]]))
    assert summary["valid_pixel_pct"] == 0.0
    assert summary["mean"] is None
