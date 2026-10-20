"""Earth Engine backend tests. `ee` is replaced by a mock, so no network or credentials are needed."""

import io
import sys
import urllib.request
from unittest.mock import MagicMock

import pytest
from shapely.geometry import box

from scripts.satellite import analyze_watershed as aw


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


@pytest.fixture
def fake_ee(monkeypatch):
    ee = MagicMock()
    monkeypatch.setitem(sys.modules, "ee", ee)
    monkeypatch.setattr(aw, "_EE_READY", True)
    monkeypatch.setattr(urllib.request, "urlopen", lambda url, timeout=0: _Response(b"\x89PNG-test"))
    collection = (
        ee.ImageCollection.return_value.filterBounds.return_value.filterDate.return_value
        .filter.return_value.sort.return_value.limit.return_value
    )
    collection.aggregate_array.return_value.getInfo.return_value = ["S2A_1", "S2B_2", "S2A_3"]
    composite = collection.map.return_value.median.return_value.rename.return_value
    composite.clip.return_value.visualize.return_value.getThumbURL.return_value = "https://example.test/x.png"
    ee.Image.constant.return_value.rename.return_value.reduceRegion.return_value.getInfo.return_value = {
        "total": 1000
    }
    return ee, collection, composite


def _stats(count):
    reduced = MagicMock()
    reduced.getInfo.return_value = {
        "NDVI_mean": 0.42, "NDVI_median": 0.4, "NDVI_p10": 0.15,
        "NDVI_p90": 0.71, "NDVI_stdDev": 0.2, "NDVI_count": count,
    }
    return reduced


def _run(include_raster=True, asset_id=None, buffer_m=None, index="NDVI"):
    return aw._analyze_earth_engine(
        box(73.1, 18.4, 73.3, 18.6), "ws-1", "2026-07-01", "2026-09-28",
        index, asset_id, buffer_m, include_raster,
    )


def test_measured_statistics_scenes_and_raster(fake_ee):
    _, _, composite = fake_ee
    composite.reduceRegion.return_value = _stats(900)
    result = _run()
    assert result["status"] == "measured"
    assert result["mean"] == pytest.approx(0.42)
    assert result["valid_pixel_pct"] == pytest.approx(90.0)
    assert result["scene_ids"] == ["S2A_1", "S2B_2", "S2A_3"]
    assert result["source"] == aw.EE_SOURCE
    assert result["raster"]["png"].startswith(b"\x89PNG")
    assert result["raster"]["bounds"] == pytest.approx([73.1, 18.4, 73.3, 18.6])


def test_low_valid_coverage_reports_no_values_and_no_raster(fake_ee):
    _, _, composite = fake_ee
    composite.reduceRegion.return_value = _stats(300)
    result = _run(asset_id="ast-1", buffer_m=500)
    assert result["status"] == "insufficient_data"
    assert result["mean"] is None and result["p90"] is None
    assert "raster" not in result
    assert result["aoi_scope"] == "asset_buffer" and result["buffer_m"] == 500


def test_no_scenes_is_insufficient_data(fake_ee):
    _, collection, _ = fake_ee
    collection.aggregate_array.return_value.getInfo.return_value = []
    result = _run(index="NDWI")
    assert result["status"] == "insufficient_data"
    assert result["scene_count"] == 0
    assert result["source"] == aw.EE_SOURCE


def test_rejects_unknown_index_and_reversed_window():
    with pytest.raises(ValueError):
        aw.analyze_watershed("ws", "2026-01-01", "2026-02-01", "EVI", database_url="x")
    with pytest.raises(ValueError):
        aw.analyze_watershed("ws", "2026-02-01", "2026-01-01", "NDVI", database_url="x")


def test_init_requires_project(monkeypatch):
    monkeypatch.setitem(sys.modules, "ee", MagicMock())
    monkeypatch.setattr(aw, "_EE_READY", False)
    monkeypatch.delenv("EE_PROJECT", raising=False)
    with pytest.raises(RuntimeError, match="EE_PROJECT"):
        aw.init_earth_engine()
