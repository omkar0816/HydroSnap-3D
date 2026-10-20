"""Tests for the current STAC-based satellite analysis backend."""

import pytest

from scripts.satellite import analyze_watershed as aw


@pytest.mark.parametrize(
    ("window_start", "window_end", "index", "message"),
    [
        ("2026-01-01", "2026-02-01", "EVI", "index must be NDVI or NDWI"),
        ("2026-02-01", "2026-01-01", "NDVI", "window end must not precede window start"),
    ],
)
def test_rejects_invalid_analysis_request(
    window_start, window_end, index, message
):
    with pytest.raises(ValueError, match=message):
        aw.analyze_watershed(
            "ws-1",
            window_start,
            window_end,
            index,
            database_url="postgresql://unused",
        )


def test_empty_result_preserves_window_and_source_metadata():
    result = aw._empty_result(
        "ws-1",
        "asset-1",
        500,
        "NDWI",
        "2026-07-01",
        "2026-09-28",
    )

    assert result["status"] == "insufficient_data"
    assert result["mean"] is None
    assert result["scene_count"] == 0
    assert result["scene_ids"] == []
    assert result["source"] == aw.SOURCE
    assert result["watershed_id"] == "ws-1"
    assert result["asset_id"] == "asset-1"
    assert result["aoi_scope"] == "asset_buffer"
    assert result["buffer_m"] == 500
    assert result["index_type"] == "NDWI"
    assert result["window_start"] == "2026-07-01"
    assert result["window_end"] == "2026-09-28"
