import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  AlertCircle,
  Database,
  ExternalLink,
  LoaderCircle,
  Search,
} from "lucide-react"
import { dicraService } from "@/services/dicraService"
import type { DicraItem } from "../../../shared/dicra.ts"

type Bbox = [number, number, number, number]

function itemDate(item: DicraItem): string {
  const value = item.properties.datetime ?? item.properties.start_datetime
  return typeof value === "string" ? value : "Acquisition date not supplied"
}

function assetDescription(asset: DicraItem["assets"][string]): string {
  return asset.description ?? asset.title ?? asset.type ?? "Asset metadata"
}

export function DicraDatasetPanel({
  watershedName,
  watershedIsDemo,
  bbox,
}: {
  watershedName?: string
  watershedIsDemo?: boolean
  bbox?: Bbox
}) {
  const [collectionFilter, setCollectionFilter] = useState("")
  const [collectionId, setCollectionId] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedItemId, setSelectedItemId] = useState<string>()

  const statusQuery = useQuery({
    queryKey: ["dicra-status"],
    queryFn: dicraService.getStatus,
    retry: false,
    staleTime: 60_000,
  })
  const collectionsQuery = useQuery({
    queryKey: ["dicra-collections"],
    queryFn: dicraService.getCollections,
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const collectionQuery = useQuery({
    queryKey: ["dicra-collection", collectionId],
    queryFn: () => dicraService.getCollection(collectionId),
    enabled: Boolean(collectionId),
    retry: 1,
    staleTime: 5 * 60_000,
  })
  const searchMutation = useMutation({
    mutationFn: dicraService.searchItems,
    onSuccess: () => setSelectedItemId(undefined),
  })

  const collections = collectionsQuery.data?.collections ?? []
  const filteredCollections = useMemo(() => {
    const query = collectionFilter.trim().toLowerCase()
    if (!query) return collections
    return collections.filter((collection) =>
      `${collection.id} ${collection.title ?? ""} ${collection.description ?? ""}`
        .toLowerCase()
        .includes(query),
    )
  }, [collectionFilter, collections])

  useEffect(() => {
    if (!collectionId && collections.length) setCollectionId(collections[0].id)
    else if (
      collectionId &&
      !collections.some((item) => item.id === collectionId)
    ) {
      setCollectionId("")
    }
  }, [collectionId, collections])

  const result = searchMutation.data
  const selectedItem = result?.features.find(
    (item) => item.id === selectedItemId,
  )

  function search() {
    if (
      !bbox ||
      !filteredCollections.some((collection) => collection.id === collectionId)
    )
      return
    const datetime =
      dateFrom || dateTo
        ? `${dateFrom ? `${dateFrom}T00:00:00Z` : ".."}/${
            dateTo ? `${dateTo}T23:59:59Z` : ".."
          }`
        : undefined
    searchMutation.mutate({
      bbox,
      collections: [collectionId],
      ...(datetime ? { datetime } : {}),
      limit: 25,
    })
  }

  return (
    <section
      className="panel satellite-analysis-panel"
      aria-labelledby="dicra-title"
    >
      <div className="table-toolbar">
        <div>
          <div className="section-kicker">
            <span className="kicker-dot blue-dot" /> THIRD-PARTY CATALOGUE
          </div>
          <h2 id="dicra-title">DiCRA datasets</h2>
          <p>
            Browse STAC metadata for the selected watershed. Catalogue records
            are not field observations.
          </p>
        </div>
        <a
          className="button button-small"
          href="https://dicra.nabard.org/data-catalogue"
          target="_blank"
          rel="noreferrer"
          aria-label="Open the DiCRA data catalogue in a new tab"
        >
          <ExternalLink size={13} /> Catalogue
        </a>
      </div>

      <div
        className="flex flex-wrap items-center gap-2 text-xs"
        aria-live="polite"
      >
        {statusQuery.isPending ? (
          <span>
            <LoaderCircle className="inline animate-spin" size={14} /> Checking
            DiCRA connection…
          </span>
        ) : statusQuery.isError ? (
          <span className="text-amber-800">
            <AlertCircle className="inline" size={14} /> Connection unavailable:{" "}
            {statusQuery.error.message}
          </span>
        ) : (
          <span className="text-emerald-800">
            <Database className="inline" size={14} /> Connected · STAC{" "}
            {statusQuery.data.stacVersion ?? "version not reported"}
          </span>
        )}
        {watershedName && (
          <span className="text-slate-600">
            Extent: {watershedName}
            {watershedIsDemo ? " · Demo boundary" : ""}
          </span>
        )}
      </div>

      {!bbox ? (
        <p className="mt-3 text-sm text-slate-600">
          Select a watershed with a WGS84 boundary to search its extent.
        </p>
      ) : (
        <>
          {collectionsQuery.isPending ? (
            <p className="mt-3 text-sm" role="status">
              Loading DiCRA collections…
            </p>
          ) : collectionsQuery.isError ? (
            <div className="mt-3 text-sm text-red-700" role="alert">
              Could not load collections: {collectionsQuery.error.message}
              <button
                className="button button-small ml-2"
                onClick={() => void collectionsQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="satellite-controls mt-3">
              <label>
                Search collections
                <input
                  value={collectionFilter}
                  onChange={(event) => setCollectionFilter(event.target.value)}
                  placeholder="Filter by name or ID"
                  aria-label="Filter DiCRA collections"
                />
              </label>
              <label>
                Collection
                <select
                  value={collectionId}
                  onChange={(event) => setCollectionId(event.target.value)}
                  aria-label="Select a DiCRA collection"
                >
                  {filteredCollections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title ?? collection.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From date (optional)
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label>
                To date (optional)
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
              <button
                className="button button-primary button-small"
                disabled={
                  !filteredCollections.some(
                    (collection) => collection.id === collectionId,
                  ) || searchMutation.isPending
                }
                onClick={search}
              >
                {searchMutation.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" size={14} />{" "}
                    Searching…
                  </>
                ) : (
                  <>
                    <Search size={14} /> Search watershed
                  </>
                )}
              </button>
            </div>
          )}

          {collectionId && collectionQuery.data && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <strong>
                {collectionQuery.data.title ?? collectionQuery.data.id}
              </strong>
              <p className="mt-1 text-slate-600">
                {collectionQuery.data.description ?? "No description supplied."}
              </p>
              <p className="mt-1 text-slate-500">
                License:{" "}
                {collectionQuery.data.license ?? "Not supplied by catalogue"}
              </p>
              {collectionQuery.data.extent !== undefined && (
                <details className="mt-2">
                  <summary className="cursor-pointer">
                    Spatial and temporal extent
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(collectionQuery.data.extent, null, 2)}
                  </pre>
                </details>
              )}
              {collectionId && collectionQuery.isError && (
                <div className="mt-3 text-sm text-red-700" role="alert">
                  Could not load collection details:{" "}
                  {collectionQuery.error.message}
                  <button
                    className="button button-small ml-2"
                    onClick={() => void collectionQuery.refetch()}
                  >
                    Retry details
                  </button>
                </div>
              )}
            </div>
          )}

          {!collectionsQuery.isPending &&
            !collectionsQuery.isError &&
            !filteredCollections.length && (
              <p className="mt-3 text-sm text-slate-600">
                No collections match that filter.
              </p>
            )}

          {searchMutation.isError && (
            <div className="mt-3 text-sm text-red-700" role="alert">
              Search failed: {searchMutation.error.message}
              <button className="button button-small ml-2" onClick={search}>
                Retry search
              </button>
            </div>
          )}
          {result && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-800">
                {result.numberMatched ?? result.features.length} catalogue
                matches
              </h3>
              {!result.features.length ? (
                <p className="mt-2 text-sm text-slate-600">
                  No DiCRA items matched this watershed and date range.
                </p>
              ) : (
                <ul className="mt-2 grid gap-2">
                  {result.features.map((item) => (
                    <li key={`${item.collection ?? collectionId}:${item.id}`}>
                      <button
                        type="button"
                        className="w-full rounded-md border border-slate-200 p-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                        aria-pressed={selectedItemId === item.id}
                        onClick={() =>
                          setSelectedItemId(
                            selectedItemId === item.id ? undefined : item.id,
                          )
                        }
                      >
                        <span className="block font-semibold text-slate-800">
                          {item.id}
                        </span>
                        <span className="block text-xs text-slate-600">
                          {item.collection ?? collectionId} · {itemDate(item)}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {Object.keys(item.assets).length} assets · metadata
                          only; raster rendering is not configured
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selectedItem && (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <h3 className="font-semibold text-slate-900">
                Item details · {selectedItem.id}
              </h3>
              <p className="mt-1 text-slate-600">
                Collection {selectedItem.collection ?? collectionId} ·{" "}
                {itemDate(selectedItem)}
              </p>
              <p className="mt-1 text-xs font-medium text-amber-800">
                Third-party metadata only. No raster layer or HydroSnap field
                evidence is created.
              </p>
              <ul className="mt-2 grid gap-2">
                {Object.entries(selectedItem.assets).map(
                  ([assetKey, asset]) => (
                    <li
                      key={assetKey}
                      className="rounded border border-blue-100 bg-white p-2"
                    >
                      <strong>{assetKey}</strong>
                      <p className="text-xs text-slate-600">
                        {assetDescription(asset)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {asset.type ?? "Media type not supplied"} · Roles:{" "}
                        {asset.roles?.join(", ") || "not supplied"}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}
          {statusQuery.isError && (
            <button
              className="button button-small mt-3"
              onClick={() => void statusQuery.refetch()}
            >
              Retry connection
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default DicraDatasetPanel
