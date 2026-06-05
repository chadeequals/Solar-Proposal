/**
 * Sundial v2 — Mock Aurora Solar API Client
 *
 * Simulates the real Aurora Solar REST API (docs.aurorasolar.com) with:
 *  - Realistic async delays (200-800ms per call, 3-8s for AI site model)
 *  - Physically plausible outputs (system sized to monthly bill)
 *  - Real lender names and typical financing structures
 *  - Credit usage tracking for the admin dashboard
 *
 * TODO: Replace each function with a real Aurora API call:
 *   Base URL: https://api.aurorasolar.com/v2
 *   Auth: Bearer token via AURORA_API_KEY env var
 *   Tenant: AURORA_TENANT_ID env var
 *   Docs: https://docs.aurorasolar.com/
 *
 * Aurora API cost reference (~$15-22 per full project pipeline):
 *   - Create Project:    free
 *   - AI Site Model:     ~$8-12
 *   - Auto Designer:     ~$4-6
 *   - Pricing/Financing: ~$1-2
 *   - Web Proposal:      ~$1-2
 */

import { v4 as uuidv4 } from "uuid";
import type {
  Intake,
  AuroraProject,
  AuroraDesignSummary,
  AuroraPricing,
  AuroraFinancingOption,
  AuroraWebProposal,
  AuroraApiCallType,
} from "./types";
import { logCreditUsage } from "./store";

// ─────────────────────────────────────────────
// MOCK COST TABLE (approximate real Aurora costs)
// ─────────────────────────────────────────────

const CALL_COSTS: Record<AuroraApiCallType, number> = {
  create_project: 0,
  ai_site_model: 10.0,
  auto_designer: 5.0,
  get_pricing: 1.0,
  get_financing: 1.0,
  create_web_proposal: 1.5,
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** Simulate realistic API latency */
function delay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random integer between min and max (inclusive) */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Round to N decimal places */
function round(n: number, places = 2): number {
  return Math.round(n * Math.pow(10, places)) / Math.pow(10, places);
}

/**
 * Estimate system size from monthly bill.
 * Rule of thumb: 1 kW DC ≈ 120 kWh/month in avg sunbelt market
 * Monthly bill / avg rate (~$0.14/kWh) = monthly kWh
 * Monthly kWh * 12 = annual kWh
 * Annual kWh / 1,400 (avg production ratio) = kW DC
 */
function estimateSystemSizeKw(monthlyBillUsd: number): number {
  const avgRatePerKwh = 0.135; // National average
  const monthlyKwh = monthlyBillUsd / avgRatePerKwh;
  const annualKwh = monthlyKwh * 12;
  const systemKw = annualKwh / 1400; // avg production ratio (kWh/kWp/yr)
  return round(Math.max(3.0, Math.min(20.0, systemKw)), 2); // 3-20 kW range
}

/** Standard 400W panel — calculate count from system size */
function estimatePanelCount(systemSizeKw: number): number {
  const panelWatts = 400;
  return Math.ceil((systemSizeKw * 1000) / panelWatts);
}

/** Log usage and return the mock response */
async function mockApiCall<T>(
  callType: AuroraApiCallType,
  sessionId: string,
  minDelayMs: number,
  maxDelayMs: number,
  resultFn: () => T,
  projectId?: string,
  designId?: string
): Promise<T> {
  await delay(minDelayMs, maxDelayMs);

  const result = resultFn();

  // TODO: Replace with real Aurora API call. Remove this mock log.
  logCreditUsage({
    session_id: sessionId,
    call_type: callType,
    cost_usd: CALL_COSTS[callType],
    project_id: projectId,
    design_id: designId,
    success: true,
  });

  return result;
}

// ─────────────────────────────────────────────
// AURORA API MOCK FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Create an Aurora project for the customer's property.
 * TODO: POST https://api.aurorasolar.com/v2/tenants/{tenant_id}/projects
 */
export async function createProject(
  intake: Intake
): Promise<AuroraProject> {
  return mockApiCall(
    "create_project",
    intake.session_id,
    200,
    500,
    () => ({
      id: uuidv4(),
      name: `${intake.first} ${intake.last} — ${intake.street}`,
      customer_name: `${intake.first} ${intake.last}`,
      customer_email: intake.email,
      customer_phone: intake.phone,
      property_address: {
        street: intake.street,
        city: intake.city,
        state: intake.state,
        zip: intake.zip,
        lat: intake.lat ?? 30.2672 + (Math.random() - 0.5) * 0.1,
        lng: intake.lng ?? -97.7431 + (Math.random() - 0.5) * 0.1,
      },
      created_at: new Date().toISOString(),
      status: "active" as const,
    })
  );
}

/**
 * Request the AI Site Model — analyzes satellite imagery, detects roof planes,
 * measures usable area. This is the most expensive Aurora call (~$8-12).
 * In production, this is async — you poll until status === "complete".
 *
 * TODO: POST https://api.aurorasolar.com/v2/tenants/{tenant_id}/projects/{project_id}/site-models
 * TODO: Poll GET .../site-models/{id} until status === "complete"
 */
export async function requestAiSiteModel(
  projectId: string,
  sessionId: string
): Promise<{ id: string; status: "processing" | "complete" }> {
  return mockApiCall(
    "ai_site_model",
    sessionId,
    3000, // AI site model takes 3-8 seconds (simulating Aurora's real latency)
    8000,
    () => ({
      id: uuidv4(),
      status: "complete" as const, // In mock, we skip the polling loop
    }),
    projectId
  );
}

/**
 * Run the Auto Designer to generate a solar layout.
 * Sizes the system to the target offset percentage.
 *
 * TODO: POST https://api.aurorasolar.com/v2/tenants/{tenant_id}/designs
 *       with auto_design: true, target_offset_pct
 */
export async function runAutoDesigner(
  projectId: string,
  sessionId: string,
  monthlyBillUsd: number,
  targetOffsetPct = 100
): Promise<AuroraDesignSummary> {
  const systemSizeKw = estimateSystemSizeKw(monthlyBillUsd);
  const systemSizeAc = round(systemSizeKw * 0.96, 2); // ~96% DC/AC ratio
  const panelCount = estimatePanelCount(systemSizeKw);
  const designId = uuidv4();

  // Production ratio varies by state/shade — realistic range 1200-1600 kWh/kWp/yr
  const productionRatio = 1250 + Math.random() * 250;
  const annualProduction = round(systemSizeKw * productionRatio, 0);

  const avgRatePerKwh = 0.135;
  const annualUsage = round((monthlyBillUsd / avgRatePerKwh) * 12, 0);
  const offset = Math.min(100, round((annualProduction / annualUsage) * 100, 1));

  return mockApiCall(
    "auto_designer",
    sessionId,
    400,
    800,
    () => ({
      id: designId,
      project_id: projectId,
      status: "complete" as const,
      system_size_kw: systemSizeKw,
      system_size_ac: systemSizeAc,
      panel_count: panelCount,
      annual_production_kwh: annualProduction,
      offset_percentage: offset,
      specific_yield: round(productionRatio, 0),
      co2_offset_tons_annual: round(annualProduction * 0.000386, 2), // EPA emission factor
      bill_of_materials: [
        {
          id: uuidv4(),
          type: "panel" as const,
          manufacturer: "REC Group",
          model: "REC Alpha Pure-R 400W",
          quantity: panelCount,
          unit_price_usd: 320,
          total_price_usd: panelCount * 320,
        },
        {
          id: uuidv4(),
          type: "inverter" as const,
          manufacturer: "Enphase",
          model: "IQ8M Microinverter",
          quantity: panelCount,
          unit_price_usd: 185,
          total_price_usd: panelCount * 185,
        },
        {
          id: uuidv4(),
          type: "other" as const,
          manufacturer: "Various",
          model: "Mounting Hardware & BOS",
          quantity: 1,
          unit_price_usd: round(systemSizeKw * 150, 0),
          total_price_usd: round(systemSizeKw * 150, 0),
        },
      ],
      created_at: new Date().toISOString(),
    }),
    projectId,
    designId
  );
}

/**
 * Get the full design summary.
 * TODO: GET https://api.aurorasolar.com/v2/tenants/{tenant_id}/designs/{design_id}
 */
export async function getDesignSummary(
  designId: string,
  sessionId: string,
  projectId: string
): Promise<AuroraDesignSummary> {
  // In mock, we just return a stub — the real data is in the session
  return mockApiCall(
    "auto_designer",
    sessionId,
    200,
    400,
    () => ({
      id: designId,
      project_id: projectId,
      status: "complete" as const,
      system_size_kw: 8.4,
      system_size_ac: 8.06,
      panel_count: 21,
      annual_production_kwh: 11760,
      offset_percentage: 95.2,
      specific_yield: 1400,
      co2_offset_tons_annual: 4.54,
      bill_of_materials: [],
      created_at: new Date().toISOString(),
    }),
    projectId,
    designId
  );
}

/**
 * Get pricing for a design.
 * Price per watt = $3.50 (typical installed cost for quality solar in 2024)
 *
 * TODO: POST https://api.aurorasolar.com/v2/tenants/{tenant_id}/designs/{design_id}/pricing
 */
export async function getPricing(
  design: AuroraDesignSummary,
  sessionId: string
): Promise<AuroraPricing> {
  const pricePerWatt = 3.5; // $/W installed
  const grossPrice = round(design.system_size_kw * 1000 * pricePerWatt, 0);
  const itcCredit = round(grossPrice * 0.30, 0); // 30% federal ITC
  const netPrice = grossPrice - itcCredit;

  return mockApiCall(
    "get_pricing",
    sessionId,
    200,
    500,
    () => ({
      design_id: design.id,
      gross_price_usd: grossPrice,
      itc_credit_usd: itcCredit,
      net_price_usd: netPrice,
      price_per_watt: pricePerWatt,
      price_per_kwh_lifetime: round(netPrice / (design.annual_production_kwh * 25), 4),
      equipment_cost_usd: round(grossPrice * 0.55, 0),
      installation_cost_usd: round(grossPrice * 0.35, 0),
      permit_fee_usd: round(grossPrice * 0.10, 0),
      created_at: new Date().toISOString(),
    }),
    design.project_id,
    design.id
  );
}

/**
 * Get financing options for a design.
 * Returns 4 standard options matching common lenders in solar.
 *
 * TODO: GET https://api.aurorasolar.com/v2/tenants/{tenant_id}/designs/{design_id}/financing
 */
export async function getFinancing(
  design: AuroraDesignSummary,
  pricing: AuroraPricing,
  sessionId: string,
  monthlyBillUsd: number
): Promise<AuroraFinancingOption[]> {
  const netPrice = pricing.net_price_usd;
  const annualSavings = monthlyBillUsd * 12; // Simplified: full bill offset

  return mockApiCall(
    "get_financing",
    sessionId,
    200,
    500,
    (): AuroraFinancingOption[] => [
      // Option 1: GoodLeap 25-Year Solar Loan
      {
        id: uuidv4(),
        lender: "GoodLeap",
        product_name: "25-Year Solar Loan",
        type: "loan",
        monthly_payment_usd: round(netPrice / (25 * 12) * 1.08, 0), // Simple approximation
        term_years: 25,
        apr_percentage: 6.99,
        down_payment_usd: 0,
        total_25_year_savings_usd: round(annualSavings * 25 - netPrice * 1.08, 0),
        total_25_year_cost_usd: round(netPrice * 1.08, 0),
        description: "Low fixed monthly payments with $0 down. Own your system outright.",
      },
      // Option 2: Sunlight Financial 12-Year Loan
      {
        id: uuidv4(),
        lender: "Sunlight Financial",
        product_name: "12-Year Solar Loan",
        type: "loan",
        monthly_payment_usd: round(netPrice / (12 * 12) * 1.12, 0),
        term_years: 12,
        apr_percentage: 9.99,
        down_payment_usd: 0,
        total_25_year_savings_usd: round(annualSavings * 25 - netPrice * 1.12, 0),
        total_25_year_cost_usd: round(netPrice * 1.12, 0),
        description: "Pay off faster — own system in 12 years, 13 years of free power.",
      },
      // Option 3: Mosaic Solar Lease
      {
        id: uuidv4(),
        lender: "Mosaic",
        product_name: "20-Year Solar Lease",
        type: "lease",
        monthly_payment_usd: round(monthlyBillUsd * 0.75, 0), // 25% savings
        term_years: 20,
        escalator_percentage: 2.9,
        down_payment_usd: 0,
        total_25_year_savings_usd: round(annualSavings * 0.25 * 20, 0),
        total_25_year_cost_usd: round(monthlyBillUsd * 0.75 * 12 * 20, 0),
        description: "No ownership, no maintenance. Just lower bills from day one.",
      },
      // Option 4: Cash Purchase (best long-term value)
      {
        id: uuidv4(),
        lender: "Victory Energy",
        product_name: "Cash Purchase",
        type: "cash",
        monthly_payment_usd: 0,
        term_years: 25,
        down_payment_usd: netPrice,
        total_25_year_savings_usd: round(annualSavings * 25 - netPrice, 0),
        total_25_year_cost_usd: netPrice,
        description: "Maximum ROI. Full ITC benefit. No debt. ~8-10 year payback.",
      },
    ],
    design.project_id,
    design.id
  );
}

/**
 * Create a shareable web proposal link.
 * In production, Aurora generates a beautiful hosted proposal page.
 * In mock, we route to our own /proposal/{designId} page.
 *
 * TODO: POST https://api.aurorasolar.com/v2/tenants/{tenant_id}/designs/{design_id}/web-proposals
 */
export async function createWebProposal(
  design: AuroraDesignSummary,
  sessionId: string
): Promise<AuroraWebProposal> {
  return mockApiCall(
    "create_web_proposal",
    sessionId,
    200,
    400,
    () => ({
      id: uuidv4(),
      design_id: design.id,
      shareable_url: `/proposal/${design.id}`,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    }),
    design.project_id,
    design.id
  );
}

/**
 * Run the full Aurora pipeline from intake to web proposal.
 * Called by the intake API after the gate passes.
 *
 * Progress callback receives messages for the UI polling endpoint.
 */
export async function runFullAuroraPipeline(
  intake: Intake,
  onProgress: (status: string, message: string) => void
): Promise<{
  project: AuroraProject;
  design: AuroraDesignSummary;
  pricing: AuroraPricing;
  financing: AuroraFinancingOption[];
  proposal: AuroraWebProposal;
}> {
  // Step 1: Create project
  onProgress("designing", "Creating Aurora project...");
  const project = await createProject(intake);

  // Step 2: AI Site Model (longest step)
  onProgress("designing", "Analyzing rooftop via satellite imagery...");
  await requestAiSiteModel(project.id, intake.session_id);

  // Step 3: Auto Designer
  onProgress("designing", "Generating optimal solar layout...");
  const design = await runAutoDesigner(
    project.id,
    intake.session_id,
    intake.monthly_bill_usd
  );

  // Step 4: Pricing
  onProgress("design_ready", "Calculating system pricing...");
  const pricing = await getPricing(design, intake.session_id);

  // Step 5: Financing options
  onProgress("design_ready", "Building financing options...");
  const financing = await getFinancing(design, pricing, intake.session_id, intake.monthly_bill_usd);

  // Step 6: Web Proposal
  onProgress("design_ready", "Generating shareable proposal...");
  const proposal = await createWebProposal(design, intake.session_id);

  return { project, design, pricing, financing, proposal };
}
