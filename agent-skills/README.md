# Agent Skills Directory

**Project:** Duties Dashboard — JD Group
**Purpose:** AI agent skill files for a US customs brokerage company. Each file is a complete AI agent prompt that makes an LLM expert in a specific domain of customs brokerage operations, compliance, sales, strategy, or data analysis.

---

## Overview

This directory contains 28 production-ready AI agent skill files organized across 5 categories. Each skill file follows a standard format: skill overview, domain knowledge (with specific regulatory citations and system references), a full AI system prompt (200-400 words), input/output specifications, and key regulatory references.

These skill files are designed to be used as system prompts in AI agent workflows — each one turns a general-purpose LLM into a deep expert in that specific customs brokerage domain.

---

## Directory Structure

```
agent-skills/
├── compliance/          7 files — US customs law and regulatory compliance
├── operations/          6 files — Day-to-day customs brokerage operations
├── sales/               5 files — Business development and account management
├── strategy/            5 files — C-level strategic advisory
└── data-analysis/       5 files — Trade data and analytics
```

---

## Compliance (7 Skills)

| File | Role | Description |
|------|------|-------------|
| `compliance/hts-classification.md` | Classification Specialist | Classifies imported goods to the correct 10-digit HTS code using GRI 1-6, chapter/section notes, explanatory notes, and CBP binding ruling precedent from the CROSS database |
| `compliance/isf-10plus2-filing.md` | ISF Filing Specialist | Prepares and validates Importer Security Filings (ISF-10 and ISF-5) under 19 CFR Part 149, manages the 24-hour rule, and advises on penalty mitigation for ISF violations up to $10,000/violation |
| `compliance/pga-flags-review.md` | PGA Compliance Specialist | Identifies all Partner Government Agency requirements (FDA, USDA/APHIS, EPA, CPSC, FWS, TTB, DEA, NHTSA, OFAC) for any import shipment using the ACE PGA message set |
| `compliance/antidumping-cvd.md` | AD/CVD Compliance Specialist | Identifies applicable antidumping and countervailing duty orders under 19 CFR Part 351, determines correct cash deposit rates, assesses scope and circumvention risk, and manages entry compliance |
| `compliance/usmca-qualification.md` | Trade Agreement Specialist | Determines USMCA preferential tariff eligibility using TCC, RVC, and specific process rules from Annex 4-B, and prepares certifications of origin with all 9 required data elements |
| `compliance/section301-review.md` | Section 301 Tariff Specialist | Analyzes China-origin goods against Section 301 Lists 1-4A, checks USTR exclusion eligibility, and recommends lawful tariff mitigation strategies including first sale, FTZ, and bonded warehouse |
| `compliance/binding-ruling-research.md` | Ruling Research Specialist | Researches CBP CROSS database for NY and HQ ruling precedent, advises on binding ruling requests under 19 CFR Part 177, and manages protest rights under 19 U.S.C. § 1514 |

---

## Operations (6 Skills)

| File | Role | Description |
|------|------|-------------|
| `operations/entry-filing.md` | Entry Specialist | Prepares complete CF 7501 entry summaries for all entry types (01, 03, 06, 11, 21, 52, 62) including duty calculation, MPF/HMF, ADD/CVD deposits, and ABI filing via ACE |
| `operations/document-review.md` | Import Documentation Specialist | Reviews and validates commercial invoices (19 CFR 141.86), packing lists, bills of lading (OBL/telex/SWB), and all import certificates before entry filing |
| `operations/cargo-release-exam.md` | Cargo Release Specialist | Manages CBP exam holds (VACIS, tailgate, intensive, CET, DOC) and PGA holds (FDA, USDA, FWS), minimizes demurrage and detention costs, and coordinates multi-agency exam resolution |
| `operations/post-entry-amendment.md` | Post-Entry Compliance Specialist | Executes Post Summary Corrections (PSC), CF 19 protests, prior disclosures under 19 CFR 162.74, and § 1520(c) petitions to correct entry errors and minimize 19 U.S.C. § 1592 penalty exposure |
| `operations/fda-prior-notice.md` | FDA Import Compliance Specialist | Prepares FDA Prior Notice submissions under 21 CFR Part 1 Subpart I, manages FSMA FSVP compliance, and resolves FDA holds including DWPE import alerts |
| `operations/ace-abi-processing.md` | ACE/ABI Systems Specialist | Manages all ACE Portal and ABI EDI processing including ANSI X12 transaction sets (352, 353, 355), CBP CSMS monitoring, e-Manifest compliance, and ABI reject code troubleshooting |

---

## Sales (5 Skills)

| File | Role | Description |
|------|------|-------------|
| `sales/lead-qualification.md` | Business Development | Qualifies importer leads using customs-specific BANT criteria — entry volume, HTS diversity, ADD/CVD exposure, PGA requirements, and Section 301 liability — to identify high-value brokerage prospects |
| `sales/proposal-generation.md` | Account Executive | Creates customized customs brokerage proposals with service scope, pricing models (per-entry, retainer, hybrid), SLA commitments, ROI analysis, and 30-60-90 day implementation timelines |
| `sales/client-onboarding.md` | Account Manager / Onboarding | Executes structured 30-60-90 day onboarding — POA execution, continuous bond setup, ISF program, HTS portfolio mapping, ACE account integration, and first entry walkthrough |
| `sales/account-business-review.md` | Client Success Manager | Conducts quarterly and annual business reviews with entry performance metrics, duty analysis, ADD/CVD exposure reports, Section 301 impact summaries, and service expansion recommendations |
| `sales/tariff-intelligence-pitch.md` | Technology Sales | Sells the Duties Dashboard tariff intelligence subscription by quantifying HTS portfolio exposure, demonstrating the ROI of proactive monitoring, and converting trials to paid subscriptions |

---

## Strategy (5 Skills)

| File | Role | Description |
|------|------|-------------|
| `strategy/market-analysis.md` | Strategic Advisor | Analyzes the US customs brokerage market — $4-5B industry, ~18,000 licensed brokers, national vs. regional segmentation, technology disruption vectors, and corridor-specific growth dynamics |
| `strategy/tariff-impact-assessment.md` | Trade Policy Advisor | Models the financial impact of Section 301, 232, 201, and 337 tariff actions on importer portfolios using multi-scenario analysis (low/mid/high) and identifies mitigation strategies |
| `strategy/competitive-positioning.md` | Competitive Strategy Advisor | Defines differentiated market positioning for customs brokerage firms across five axes: speed, regulatory expertise, technology, corridor knowledge, and C-TPAT facilitation benefits |
| `strategy/service-expansion.md` | Business Development Advisor | Identifies and evaluates new service lines — drawback management, FTZ activation, first sale programs, C-TPAT consulting, export compliance (EAR/ITAR), and 3PL partnerships |
| `strategy/technology-roadmap.md` | CTO / Technology Advisor | Builds multi-year technology modernization roadmaps covering ACE API integration, AI-powered HTS classification, Duties Dashboard MS SQL to PostgreSQL migration via Airbyte ETL, and client portal development |

---

## Data Analysis (5 Skills)

| File | Role | Description |
|------|------|-------------|
| `data-analysis/tariff-monitoring.md` | Tariff Intelligence Specialist | Monitors all HTSUS tariff changes, Section 301 USTR notices, AD/CVD Federal Register publications, and CBP CSMS broadcasts, applying a four-dimensional impact scoring methodology to prioritize client alerts |
| `data-analysis/duty-optimization.md` | Duty Savings Specialist | Identifies duty overpayments, drawback refund opportunities (19 U.S.C. § 1313), AD/CVD deposit-vs-liquidation rate gaps, first sale valuation savings, and FTA preference recovery |
| `data-analysis/client-portfolio-analysis.md` | Client Intelligence Specialist | Builds HTS portfolio profiles with ADD/CVD exposure mapping, Section 301 burden analysis, PGA flag frequency, USMCA eligibility screening, landed cost modeling, and what-if tariff scenario analysis |
| `data-analysis/compliance-kpi-reporting.md` | Compliance Performance Manager | Designs and interprets compliance KPI dashboards tracking entry accuracy rate, ISF on-time rate, exam rate, penalty events, protest success rate, bond utilization, and client satisfaction scoring |
| `data-analysis/trade-data-analysis.md` | Macro Trade Intelligence Specialist | Analyzes Census Bureau USA Trade Online, USITC DataWeb, and BTS border crossing statistics to measure commodity flow trends, trade diversion effects, supplier concentration risk, and nearshoring patterns |

---

## Regulatory Reference Quick Index

| Topic | Primary Citations |
|-------|------------------|
| HTS Classification | GRI 1-6 (HTSUS front matter); 19 CFR Part 177; 19 U.S.C. § 1592 |
| ISF Filing | 19 CFR Part 149; SAFE Port Act (Pub. L. 109-347) |
| PGA Requirements | 21 CFR Part 1 (FDA); 7 CFR Part 319 (USDA); 15 U.S.C. § 2601 (EPA/TSCA) |
| AD/CVD | 19 U.S.C. §§ 1671-1677n; 19 CFR Part 351 |
| USMCA | 19 CFR Part 182; USMCA Chapter 4, Annex 4-B |
| Section 301 | 19 U.S.C. §§ 2411-2420; HTSUS Chapter 99 (9903.88.XX) |
| Binding Rulings | 19 CFR Part 177; 19 U.S.C. § 1625; 19 U.S.C. § 1514 |
| Entry Filing | 19 CFR Parts 141-143; 19 U.S.C. § 1484; CBP Form 7501 |
| Document Review | 19 CFR 141.86; 19 U.S.C. § 1592 |
| Post-Entry Corrections | 19 U.S.C. § 1514; 19 CFR 162.74; 19 U.S.C. § 1520(c) |
| FDA Prior Notice | 21 CFR Part 1, Subpart I (§§ 1.278-1.285); 21 U.S.C. § 350d |
| ACE/ABI | CBP CATAIR; 19 CFR Part 143; CBP CSMS |
| Drawback | 19 U.S.C. § 1313; TFTEA (2015) |
| FTZ | 19 CFR Part 146 |
| First Sale Valuation | 19 U.S.C. § 1401a; Nissho Iwai (16 CIT 86) |
| C-TPAT | 19 CFR Part 165; cbp.gov/ctpat |
| Export Compliance | 15 CFR Parts 730-774 (EAR); 22 CFR Parts 120-130 (ITAR) |

---

## Key Systems Index

| System | Purpose | URL |
|--------|---------|-----|
| ACE Portal | CBP entry filing and account management | ace.cbp.gov |
| CBP CROSS | Customs rulings database | rulings.cbp.gov |
| USITC HTS | Official tariff schedule | hts.usitc.gov |
| CBP CSMS | Cargo systems messaging service | cbp.gov/trade/automated/cargo-system-messaging-service |
| Federal Register | All regulatory publications | federalregister.gov |
| FDA OASIS | FDA import screening system | FDA internal |
| PNSI | FDA Prior Notice submission | access.fda.gov |
| ITA AD/CVD | Commerce antidumping database | enforcement.trade.gov/adcvd |
| USTR Section 301 | Section 301 exclusion portal | ustr.gov |
| USA Trade Online | Census trade statistics | census.gov/foreign-trade |
| USITC DataWeb | Trade and tariff data | dataweb.usitc.gov |
| BTS | Border crossing statistics | bts.gov |
| Airbyte | ETL/ELT data pipeline platform | airbyte.com |

---

*Last updated: April 2026*
*Total skill files: 28*
*Categories: Compliance (7), Operations (6), Sales (5), Strategy (5), Data Analysis (5)*
