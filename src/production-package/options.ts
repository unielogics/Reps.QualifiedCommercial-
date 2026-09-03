// MIRROR: keep identical to QCRep/src/production-package/*
export const US_STATES: Array<[string, string]> = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

export const ENTITY_TYPES = [
  "Limited liability company", "Corporation", "S corporation", "Limited partnership",
  "Limited liability partnership", "Sole proprietorship", "Trust", "Other",
] as const;

export const FACILITY_TYPES = [
  "Dealer capital advance", "Commission advance", "Revolving commission line", "Term advance", "Hybrid",
] as const;

export const EVIDENCE_OPTIONS = [
  "DMS unit reports", "F&I production reports", "Sponsor production reports", "Sponsor remittance statements",
  "Bank statements (Plaid)", "Bank statements (uploaded)", "Tax returns", "Dealer attestation",
] as const;

export const TERM_OPTIONS = [12, 18, 24, 36] as const;

export const CADENCES: Array<{ key: "month" | "quarter" | "balance"; label: string; detail: string; tag: string; tone: "bad" | "acc" | "warn" }> = [
  { key: "month", label: "Billed monthly as it occurs", detail: "The gap is invoiced in the month it happens. Tightest on cash, hardest on a dealer with lumpy production.", tag: "Strictest", tone: "bad" },
  { key: "quarter", label: "Netted quarterly", detail: "A strong month offsets a weak one inside the quarter, and only the net gap is billed.", tag: "Balanced", tone: "acc" },
  { key: "balance", label: "Tracked as a running balance", detail: "The gap accrues and is drawn on only when needed. Loosest, and appropriate only where production is predictable.", tag: "Loosest", tone: "warn" },
];

export const ADJUSTMENTS: Array<["none" | "bps" | "rate", string]> = [["none", "None"], ["bps", "Basis points"], ["rate", "Exact adjusted rate"]];
export const SIZING_MODES: Array<["backsolve" | "fixed", string]> = [["backsolve", "Back-solve the advance"], ["fixed", "Fix the advance"]];
export const BUILDOUT_MODES: Array<["reverse" | "forward", string]> = [["reverse", "Reverse-engineer the markup"], ["forward", "Set the repayment per contract"]];
export const FUNDING_PARTIES = ["Sponsor", "Qualified Commercial LLC", "Lender"] as const;

export const PRODUCTS: Array<{ key: import("./types").ProductKey; label: string; primary?: boolean }> = [
  { key: "vsc", label: "Vehicle service contracts", primary: true },
  { key: "gap", label: "GAP products" },
  { key: "theft", label: "Anti-theft products" },
  { key: "appearance", label: "Appearance protection" },
  { key: "key", label: "Key replacement" },
  { key: "tire", label: "Tire and wheel" },
  { key: "maint", label: "Maintenance products" },
  { key: "power", label: "Powertrain products" },
];
