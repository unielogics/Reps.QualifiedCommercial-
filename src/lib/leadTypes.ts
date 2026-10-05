export type LeadType = "dealer" | "main_street" | "real_estate";

export type FundingIntent =
  | "general_capital"
  | "working_capital"
  | "equipment"
  | "business_acquisition"
  | "real_estate"
  | "debt_refinance"
  | "mca_refinance"
  | "other";

export type LeadTypeDefinition = {
  key: LeadType;
  label: string;
  shortLabel: string;
  description: string;
  businessNoun: string;
  website: string;
  tone: "blue" | "green" | "amber";
};

export const LEAD_TYPES: LeadTypeDefinition[] = [
  {
    key: "dealer",
    label: "Auto Dealer",
    shortLabel: "Dealer",
    description: "Dealerships, dealer groups, and automotive retail or service businesses.",
    businessNoun: "dealership",
    website: "https://qualifiedcommercial.com/industries/auto",
    tone: "blue",
  },
  {
    key: "main_street",
    label: "Main Street Business",
    shortLabel: "Main Street",
    description: "Operating businesses seeking capital for growth, equipment, or acquisitions.",
    businessNoun: "business",
    website: "https://qualifiedcommercial.com/industries/business",
    tone: "green",
  },
  {
    key: "real_estate",
    label: "Real Estate",
    shortLabel: "Real Estate",
    description: "Property investors, owners, sponsors, and transaction-specific opportunities.",
    businessNoun: "real estate business",
    website: "https://qualifiedcommercial.com/industries/realestate",
    tone: "amber",
  },
];

export const FUNDING_INTENTS: Array<{ key: FundingIntent; label: string }> = [
  { key: "general_capital", label: "General capital" },
  { key: "working_capital", label: "Working capital" },
  { key: "equipment", label: "Equipment" },
  { key: "business_acquisition", label: "Business acquisition" },
  { key: "real_estate", label: "Real estate" },
  { key: "debt_refinance", label: "Debt refinance" },
  { key: "mca_refinance", label: "MCA refinance" },
  { key: "other", label: "Other / not sure" },
];

export function leadTypeDefinition(value?: string | null): LeadTypeDefinition {
  return LEAD_TYPES.find((item) => item.key === value) ?? LEAD_TYPES[0];
}

export function leadTypeLabel(value?: string | null): string {
  return leadTypeDefinition(value).shortLabel;
}

export function isLeadType(value: unknown): value is LeadType {
  return typeof value === "string" && LEAD_TYPES.some((item) => item.key === value);
}
