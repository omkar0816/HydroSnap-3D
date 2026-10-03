import type {
  AnalysisJob,
  AnalysisResult,
  Asset,
  Intervention,
  Report,
  TeamMember,
  ThematicLayer,
  User,
  Watershed,
  WGS84Position,
} from "@/types/domain"
import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
  PolygonGeometry,
} from "@/types/geojson"

// DEMO DATA: every boundary below is an illustrative hand-drawn shape, not an
// official SLUSI / CWC / HydroBASINS record. Each watershed has its own polygon.
function demoBoundary(
  name: string,
  ring: WGS84Position[],
): Feature<PolygonGeometry> {
  return {
    type: "Feature",
    properties: { name, demo: true },
    geometry: { type: "Polygon", coordinates: [ring] },
  }
}

const bhimaBoundary = demoBoundary("Upper Bhima (demo)", [
  [74.456, 18.187],
  [74.498, 18.19],
  [74.524, 18.216],
  [74.512, 18.252],
  [74.476, 18.265],
  [74.445, 18.246],
  [74.436, 18.211],
  [74.456, 18.187],
])

const mulaBoundary = demoBoundary("Mula Headwaters (demo)", [
  [73.598, 18.522],
  [73.642, 18.516],
  [73.676, 18.538],
  [73.681, 18.571],
  [73.652, 18.598],
  [73.611, 18.594],
  [73.589, 18.561],
  [73.598, 18.522],
])

const indrayaniBoundary = demoBoundary("Indrayani East (demo)", [
  [73.712, 18.688],
  [73.761, 18.681],
  [73.797, 18.702],
  [73.802, 18.733],
  [73.771, 18.754],
  [73.727, 18.749],
  [73.704, 18.719],
  [73.712, 18.688],
])

export const currentUser: User = {
  id: "usr-001",
  name: "Ananya Deshmukh",
  email: "ananya.deshmukh@example.gov.in",
  role: "GIS Analyst",
  initials: "AD",
}

export const teamMembers: TeamMember[] = [
  {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    initials: currentUser.initials,
    area: "Pune district",
    status: "Active",
  },
  {
    id: "usr-002",
    name: "Rahul Patil",
    email: "rahul.patil@example.gov.in",
    role: "Field Officer",
    initials: "RP",
    area: "Khadakwasla cluster",
    status: "Active",
  },
  {
    id: "usr-003",
    name: "Meera Joshi",
    email: "meera.joshi@example.gov.in",
    role: "Field Officer",
    initials: "MJ",
    area: "Panshet cluster",
    status: "Active",
  },
]

export const watersheds: Watershed[] = [
  {
    id: "ws-bhima",
    name: "Upper Bhima",
    code: "MH-PUN-042",
    district: "Pune",
    state: "Maharashtra",
    areaSqKm: 84.6,
    villages: 12,
    status: "Active",
    boundary: bhimaBoundary,
    level: "watershed",
    source: "demo",
    demo: true,
  },
  {
    id: "ws-mula",
    name: "Mula Headwaters",
    code: "MH-PUN-018",
    district: "Pune",
    state: "Maharashtra",
    areaSqKm: 62.3,
    villages: 9,
    status: "Monitoring",
    boundary: mulaBoundary,
    level: "watershed",
    source: "demo",
    demo: true,
  },
  {
    id: "ws-indrayani",
    name: "Indrayani East",
    code: "MH-PUN-031",
    district: "Pune",
    state: "Maharashtra",
    areaSqKm: 47.8,
    villages: 7,
    status: "Active",
    boundary: indrayaniBoundary,
    level: "watershed",
    source: "demo",
    demo: true,
  },
]

const locations: WGS84Position[] = [
  [74.461, 18.214],
  [74.487, 18.226],
  [74.474, 18.245],
  [74.502, 18.239],
  [74.45, 18.231],
  [74.493, 18.206],
]

export const assets: Asset[] = [
  {
    id: "ast-001",
    name: "Khadakwasla Check Dam",
    type: "Check dam",
    watershedId: "ws-bhima",
    location: { type: "Point", coordinates: locations[0], source: "demo" },
    status: "Verified",
    lastInspected: "2026-09-28",
    village: "Khadakwasla",
    description: "Masonry check dam across a seasonal stream.",
  },
  {
    id: "ast-002",
    name: "Shivane Farm Pond",
    type: "Farm pond",
    watershedId: "ws-bhima",
    location: { type: "Point", coordinates: locations[1], source: "demo" },
    status: "Verified",
    lastInspected: "2026-09-25",
    village: "Shivane",
    description: "Community farm pond with a stone-lined inlet.",
  },
  {
    id: "ast-003",
    name: "Panshet Plantation",
    type: "Plantation",
    watershedId: "ws-bhima",
    location: { type: "Point", coordinates: locations[2], source: "demo" },
    status: "Pending review",
    lastInspected: "2026-09-23",
    village: "Panshet",
    description: "Native species planting area along the ridge.",
  },
  {
    id: "ast-004",
    name: "Kondanpur Percolation Tank",
    type: "Percolation tank",
    watershedId: "ws-bhima",
    location: { type: "Point", coordinates: locations[3], source: "demo" },
    status: "Verified",
    lastInspected: "2026-09-21",
    village: "Kondanpur",
    description: "Earthen percolation structure.",
  },
  {
    id: "ast-005",
    name: "Gorhe Check Dam",
    type: "Check dam",
    watershedId: "ws-bhima",
    location: { type: "Point", coordinates: locations[4], source: "demo" },
    status: "Flagged",
    lastInspected: "2026-09-19",
    village: "Gorhe",
    description: "Inspection note requests a post-monsoon follow-up.",
  },
  {
    id: "ast-006",
    name: "Kuran Farm Pond",
    type: "Farm pond",
    watershedId: "ws-bhima",
    location: { type: "Point", coordinates: locations[5], source: "demo" },
    status: "Verified",
    lastInspected: "2026-09-17",
    village: "Kuran",
    description: "Smallholder farm pond with a functioning overflow channel.",
  },
  {
    id: "ast-007",
    name: "Mula Stream Check Dam",
    type: "Check dam",
    watershedId: "ws-mula",
    location: { type: "Point", coordinates: [73.631, 18.556], source: "demo" },
    status: "Pending review",
    lastInspected: "2026-09-26",
    village: "Mulshi (demo)",
    description: "Demo record: gabion check dam on a first-order stream.",
  },
  {
    id: "ast-008",
    name: "Mula Ridge Plantation",
    type: "Plantation",
    watershedId: "ws-mula",
    location: { type: "Point", coordinates: [73.655, 18.578], source: "demo" },
    status: "Verified",
    lastInspected: "2026-09-12",
    village: "Mulshi (demo)",
    description: "Demo record: contour trench plantation block.",
  },
  {
    id: "ast-009",
    name: "Indrayani Farm Pond",
    type: "Farm pond",
    watershedId: "ws-indrayani",
    location: { type: "Point", coordinates: [73.752, 18.716], source: "demo" },
    status: "Pending review",
    lastInspected: "2026-09-20",
    village: "Indrayani (demo)",
    description: "Demo record: lined farm pond awaiting first inspection.",
  },
]

export const jobs: AnalysisJob[] = [
  {
    id: "job-2026-091",
    watershedId: "ws-bhima",
    type: "NDVI",
    status: "Completed",
    createdAt: "2026-09-30",
    progress: 100,
    demo: true,
  },
  {
    id: "job-2026-090",
    watershedId: "ws-bhima",
    type: "Change detection",
    status: "Processing",
    createdAt: "2026-10-02",
    progress: 68,
    demo: true,
  },
]

export const results: AnalysisResult[] = [
  {
    id: "res-1",
    jobId: "job-2026-091",
    metric: "NDVI",
    date: "2026-04",
    value: 0.41,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-2",
    jobId: "job-2026-091",
    metric: "NDVI",
    date: "2026-05",
    value: 0.44,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-3",
    jobId: "job-2026-091",
    metric: "NDVI",
    date: "2026-06",
    value: 0.48,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-4",
    jobId: "job-2026-091",
    metric: "NDVI",
    date: "2026-07",
    value: 0.62,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-5",
    jobId: "job-2026-091",
    metric: "NDVI",
    date: "2026-08",
    value: 0.71,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-6",
    jobId: "job-2026-091",
    metric: "NDVI",
    date: "2026-09",
    value: 0.68,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-7",
    jobId: "job-2026-091",
    metric: "NDWI",
    date: "2026-04",
    value: 0.22,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-8",
    jobId: "job-2026-091",
    metric: "NDWI",
    date: "2026-05",
    value: 0.19,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-9",
    jobId: "job-2026-091",
    metric: "NDWI",
    date: "2026-06",
    value: 0.24,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-10",
    jobId: "job-2026-091",
    metric: "NDWI",
    date: "2026-07",
    value: 0.38,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-11",
    jobId: "job-2026-091",
    metric: "NDWI",
    date: "2026-08",
    value: 0.52,
    watershedId: "ws-bhima",
    demo: true,
  },
  {
    id: "res-12",
    jobId: "job-2026-091",
    metric: "NDWI",
    date: "2026-09",
    value: 0.48,
    watershedId: "ws-bhima",
    demo: true,
  },
]

export const interventions: Intervention[] = [
  {
    id: "int-01",
    name: "Ridge-to-valley treatment",
    type: "Watershed treatment",
    watershedId: "ws-bhima",
    village: "Panshet",
    status: "In progress",
    progress: 72,
    budget: 840000,
    dueDate: "2026-11-20",
  },
  {
    id: "int-02",
    name: "Community pond restoration",
    type: "Water conservation",
    watershedId: "ws-bhima",
    village: "Shivane",
    status: "Planned",
    progress: 12,
    budget: 460000,
    dueDate: "2026-12-05",
  },
  {
    id: "int-03",
    name: "Native species plantation",
    type: "Afforestation",
    watershedId: "ws-bhima",
    village: "Gorhe",
    status: "Completed",
    progress: 100,
    budget: 275000,
    dueDate: "2026-09-15",
  },
]

export const reports: Report[] = [
  {
    id: "rpt-01",
    name: "Upper Bhima monthly summary",
    type: "Watershed summary",
    watershedId: "ws-bhima",
    createdAt: "2026-10-01",
    status: "Ready",
  },
  {
    id: "rpt-02",
    name: "September field inspections",
    type: "Field inspection",
    watershedId: "ws-bhima",
    createdAt: "2026-09-30",
    status: "Ready",
  },
]

export const streams: FeatureCollection<LineStringGeometry> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Seasonal stream" },
      geometry: {
        type: "LineString",
        coordinates: [
          [74.441, 18.257],
          [74.459, 18.245],
          [74.47, 18.229],
          [74.49, 18.215],
          [74.513, 18.199],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Western tributary" },
      geometry: {
        type: "LineString",
        coordinates: [
          [74.437, 18.222],
          [74.455, 18.224],
          [74.47, 18.229],
          [74.484, 18.239],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Mula first-order stream (demo)" },
      geometry: {
        type: "LineString",
        coordinates: [
          [73.6, 18.585],
          [73.618, 18.566],
          [73.632, 18.555],
          [73.655, 18.541],
          [73.672, 18.529],
        ],
      },
    },
    {
      type: "Feature",
      properties: { name: "Indrayani tributary (demo)" },
      geometry: {
        type: "LineString",
        coordinates: [
          [73.71, 18.74],
          [73.735, 18.727],
          [73.756, 18.714],
          [73.785, 18.699],
        ],
      },
    },
  ],
}

export const ndviOverlay: Feature<PolygonGeometry> = {
  type: "Feature",
  properties: { layer: "ndvi", simulated: true },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [74.453, 18.202],
        [74.491, 18.2],
        [74.513, 18.222],
        [74.494, 18.251],
        [74.459, 18.251],
        [74.453, 18.202],
      ],
    ],
  },
}

export const ndwiOverlay: Feature<PolygonGeometry> = {
  type: "Feature",
  properties: { layer: "ndwi", simulated: true },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [74.458, 18.214],
        [74.49, 18.212],
        [74.502, 18.229],
        [74.483, 18.244],
        [74.463, 18.236],
        [74.458, 18.214],
      ],
    ],
  },
}

export const thematicLayers: ThematicLayer[] = [
  {
    id: "boundary",
    name: "Watershed boundary",
    group: "Reference",
    detail: "GeoJSON polygon · WGS84",
    dateLabel: "Boundary reference",
    description:
      "Demonstration watershed outline for the active monitoring area.",
    visibleByDefault: true,
    demo: true,
    geometry: bhimaBoundary,
  },
  {
    id: "streams",
    name: "Drainage network",
    group: "Hydrology",
    detail: "GeoJSON line features",
    dateLabel: "Illustrative",
    description: "Illustrative streams and seasonal drainage paths.",
    visibleByDefault: true,
    demo: true,
    geometry: streams,
  },
  {
    id: "ndvi",
    name: "Vegetation health · NDVI",
    group: "Satellite index",
    detail: "Simulated multispectral index",
    dateLabel: "Sep 2026 · DEMO",
    description: "Illustrative normalized difference vegetation index overlay.",
    visibleByDefault: false,
    demo: true,
    geometry: ndviOverlay,
  },
  {
    id: "ndwi",
    name: "Surface water · NDWI",
    group: "Satellite index",
    detail: "Simulated multispectral index",
    dateLabel: "Sep 2026 · DEMO",
    description: "Illustrative normalized difference water index overlay.",
    visibleByDefault: false,
    demo: true,
    geometry: ndwiOverlay,
  },
]
