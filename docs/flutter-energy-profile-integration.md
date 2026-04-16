# Energy Profile API — Flutter Integration Guide

Base URL: `{API_BASE}/api/energy-profile`

All endpoints require authentication via the `better-auth.session_token` cookie (set automatically by the Better Auth sign-in flow).

---

## Changelog (latest first)

### v2 — Solar Simulation + Dashboard Endpoint

**What changed — the Flutter dev must update these:**

1. **`GET /forecast/solar` now accepts query params** for "what if" simulation:
   - `?panelCount=8` — simulate with N panels (uses 430W Modern N-Type wattage)
   - `?capacityKwp=3.5` — simulate with exact system capacity
   - No params = uses profile's auto-detected or user-corrected capacity (same as before)
   - **Flutter change:** Add optional `panelCount`/`capacityKwp` params to the solar forecast API call. Build a slider UI for users to explore different system sizes.

2. **`GET /dashboard` added** — single endpoint returns status + profile + loadProfile + all forecasts:
   - Replace 5 sequential API calls with 1 call
   - **Flutter change:** Replace the dashboard init that calls `/status` + `/profile` + `/load-profile` + `/forecast/summary` with a single `GET /dashboard` call.

3. **`UserLoadProfile` response now includes display names:**
   - New fields: `providerName`, `tariffName`, `displayTariff` (e.g. "British Gas — Standard Variable Tariff")
   - **Flutter change:** Use `displayTariff` directly instead of joining provider + tariff names from separate calls. Update the Dart `UserLoadProfile` model to include the 3 new fields.

4. **`PropertyProfile` response cleaned up:**
   - Removed: `userId`, `lmkKey`, `uprn` (backend internals)
   - Added: `energyRating` (A-G from EPC), `historyCertCount`
   - **Flutter change:** Remove `userId`/`lmkKey`/`uprn` from the Dart model. Add `energyRating` and `historyCertCount`.

5. **`EpcHistory` response now includes `summary`:**
   - New field: `summary` (e.g. "Heat: Boiler and radiators · 272 kWh/m²")
   - **Flutter change:** Use `summary` for the timeline card subtitle instead of building it client-side.

6. **`GET /tariffs` now paginated with filters:**
   - Query params: `?providerId=X&type=flat&page=1&limit=20`
   - Response shape changed from `EnergyTariffDTO[]` to `{ data: [...], pagination: { page, limit, total, totalPages } }`
   - **Flutter change:** Update the tariff list API call to handle the paginated envelope. Add provider/type filter dropdowns.

7. **`EnergyProvider` response now includes `tariffCount`:**
   - **Flutter change:** Show the count badge next to each provider name in the picker.

8. **Forecast `summary` now includes `errors` object:**
   - Each forecast that returns `null` has a reason string in `errors.solar`, `errors.costImpact`, etc.
   - **Flutter change:** When a forecast is null, show `errors.{name}` message instead of a generic error.

---

### Dart Model Updates Required

```dart
// REMOVE these fields from PropertyProfile:
// - userId (removed from API response)
// - lmkKey (removed from API response)
// - uprn (removed from API response)

// ADD these fields to PropertyProfile:
// + energyRating: String?   (e.g. "D")
// + historyCertCount: int

// ADD these fields to UserLoadProfile:
// + providerName: String
// + tariffName: String
// + displayTariff: String   (e.g. "British Gas — Standard Variable Tariff")

// ADD this field to EpcHistory:
// + summary: String          (e.g. "Heat: Boiler and radiators · 272 kWh/m²")

// ADD this new model:
// class Dashboard {
//   final OnboardingStatus status;
//   final PropertyProfile? profile;
//   final UserLoadProfile? loadProfile;
//   final ForecastSummary? forecasts;
// }

// UPDATE tariff list response:
// Was: List<EnergyTariff>
// Now: { data: List<EnergyTariff>, pagination: Pagination }

// ADD optional params to solar forecast call:
// getSolarForecast({int? panelCount, double? capacityKwp})
```

---

## Table of Contents

1. [Onboarding Flow (State Machine)](#1-onboarding-flow)
2. [API Reference](#2-api-reference)
3. [Dashboard — Single Endpoint](#3-dashboard)
4. [Error Handling](#4-error-handling)
5. [Loading States](#5-loading-states)
6. [Dart Models](#6-dart-models)
7. [Complete Flow Examples](#7-complete-flow-examples)

---

## 1. Onboarding Flow

The onboarding is a 4-step state machine. Use `GET /status` to determine which screen to show.

```
┌─────────────┐     ┌─────────────────┐     ┌────────────────┐     ┌──────────────┐
│  Step 1      │────▶│  Step 2          │────▶│  Step 3         │────▶│  Step 4       │
│  EPC Search  │     │  Review Hardware │     │  Set Tariff     │     │  Dashboard    │
│              │     │                  │     │  & Monthly Bill │     │  (Forecasts)  │
│  completion: │     │  completion:     │     │  completion:    │     │  completion:  │
│  0%          │     │  40%             │     │  80%            │     │  100%         │
└─────────────┘     └─────────────────┘     └────────────────┘     └──────────────┘
```

### Status Response

```http
GET /status
```

```json
{
  "hasProfile": false,
  "hasLoadProfile": false,
  "readyForForecasts": false,
  "completionPercent": 0,
  "nextSteps": ["Search your postcode and select your property"],
  "profileId": null
}
```

### Decision Logic

```dart
final status = await api.getStatus();

if (!status.hasProfile) {
  // Show: EPC postcode search screen
  navigator.push(EpcSearchScreen());
} else if (!status.hasLoadProfile) {
  // Show: Provider + tariff + bill screen
  navigator.push(LoadProfileScreen());
} else {
  // Show: Dashboard with forecasts
  navigator.push(DashboardScreen());
}
```

---

## 2. API Reference

### Step 1: EPC Search + Profile Creation

#### Search by postcode

```http
GET /api/epc/search?postcode=CR0+6JA&size=10
```

Response `200`:

```json
{
  "rows": [
    {
      "lmkKey": "73b71c59...",
      "address": "6 Dartnell Road",
      "propertyType": "House",
      "builtForm": "Mid-Terrace",
      "currentEnergyRating": "D",
      "totalFloorArea": "72",
      "mainheatDescription": "Boiler and radiators, mains gas"
    }
  ],
  "totalResults": 5
}
```

**Flutter notes:**

- Display a list of properties for user to pick
- Show `address`, `propertyType`, `currentEnergyRating`, `totalFloorArea`
- The `lmkKey` is the unique identifier — pass it to profile creation

#### Create property profile

```http
POST /profile
Content-Type: application/json

{ "lmkKey": "73b71c59..." }
```

Response `201`:

```json
{
  "id": "c9b8e366-...",
  "address": "6 Dartnell Road",
  "postcode": "CR0 6JA",
  "propertyType": "House",
  "builtForm": "Mid-Terrace",
  "totalFloorArea": 72,
  "energyRating": "D",
  "hardware": {
    "solar": {
      "detected": false,
      "birthDate": null,
      "estimatedPanelCount": 6,
      "estimatedPanelWattage": 430,
      "panelTechnology": "Modern N-Type",
      "estimatedCapacityKwp": 2.58,
      "confidence": "medium",
      "manualSurveyRequired": false
    },
    "battery": {
      "probability": 0.01,
      "estimatedCapacityKwh": 0,
      "recommendation": "Bundle a 5kWh battery with solar installation for optimal savings."
    },
    "heatPump": {
      "detected": false,
      "birthDate": null,
      "type": null,
      "readiness": "insulation_required",
      "readinessScore": 272
    }
  },
  "userVerified": false,
  "historyCertCount": 1,
  "createdAt": "2026-04-16T05:46:17.022Z",
  "updatedAt": "2026-04-16T05:46:17.022Z"
}
```

**Possible errors:**
| HTTP | Code | When | UI Action |
|------|------|------|-----------|
| `400` | `BAD_REQUEST` | LMK key not found in EPC database | Show "Property not found. Try searching again." |
| `409` | `CONFLICT` | User already has a profile | Navigate to dashboard or offer refresh |

---

### Step 2: Review & Correct Hardware

Display the `hardware` object from the profile response. Let the user confirm or correct.

#### Correct hardware guesses

```http
PATCH /profile/hardware
Content-Type: application/json

{
  "solar": {
    "detected": true,
    "estimatedPanelCount": 8
  },
  "battery": {
    "estimatedCapacityKwh": 5
  },
  "heatPump": {
    "detected": true,
    "type": "air-source"
  }
}
```

All fields are optional — only send what the user changed.

Response `200`: Returns the updated `PropertyProfileDTO` with `userVerified: true` and `confidence: "high"` on solar.

**Validation errors (400):**

- `estimatedPanelCount` must be 0–50
- `estimatedCapacityKwp` must be 0–50
- `estimatedCapacityKwh` must be 0–100
- At least one section (solar/battery/heatPump) must be provided

---

### Step 3: Set Energy Provider + Monthly Bill

#### List providers

```http
GET /tariffs/providers
```

Response `200`:

```json
[
  { "id": "c5d938ab-...", "name": "British Gas", "slug": "british-gas", "tariffCount": 1 },
  { "id": "8d8712e1-...", "name": "Octopus Energy", "slug": "octopus-energy", "tariffCount": 9 }
]
```

#### List tariffs (with filtering + pagination)

```http
GET /tariffs?providerId={id}&type=flat&page=1&limit=20
```

All query params are optional:

- `providerId` — filter by provider UUID
- `type` — `flat`, `tou`, or `export`
- `page` — page number (default 1)
- `limit` — items per page (default 50, max 100)

Response `200`:

```json
{
  "data": [
    {
      "id": "701ea080-...",
      "providerId": "c5d938ab-...",
      "providerName": "British Gas",
      "name": "Standard Variable Tariff",
      "tariffType": "flat",
      "displayRate": "24.50p/kWh",
      "flatRatePence": 2450,
      "standingChargePence": 6138,
      "segExportRatePence": 1200,
      "isDefault": true,
      "validFrom": "2026-04-16",
      "validTo": null,
      "source": "ofgem_svt"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 26,
    "totalPages": 2
  }
}
```

**Rate units:** All `*Pence` fields are stored as integer pence x 100. To display: `(flatRatePence / 100).toFixed(2)` = "24.50p". Or use the pre-formatted `displayRate` field.

#### Create load profile

```http
POST /load-profile
Content-Type: application/json

{
  "providerId": "c5d938ab-...",
  "tariffId": "701ea080-...",
  "monthlyBillPence": 12000
}
```

The `monthlyBillPence` is the user's monthly electricity bill in pence. For a £120 bill, send `12000`.

Response `201`:

```json
{
  "id": "37fa702e-...",
  "providerId": "c5d938ab-...",
  "providerName": "British Gas",
  "tariffId": "701ea080-...",
  "tariffName": "Standard Variable Tariff",
  "displayTariff": "British Gas — Standard Variable Tariff",
  "monthlyBillPence": 12000,
  "displayBill": "£120.00/month",
  "dailyKwh": 13.59,
  "hourlyDistribution": [0.27, 0.24, ...],
  "createdAt": "2026-04-16T05:47:35.213Z",
  "updatedAt": "2026-04-16T05:47:35.213Z"
}
```

**Possible errors:**
| HTTP | Code | When | UI Action |
|------|------|------|-----------|
| `404` | `NOT_FOUND` | Property profile doesn't exist | Redirect to Step 1 |
| `404` | `NOT_FOUND` | Provider or tariff ID invalid | Show "Invalid selection. Please choose again." |

---

### Step 4: Forecasts

#### Individual forecast endpoints

| Endpoint                          | Returns                                        |
| --------------------------------- | ---------------------------------------------- |
| `GET /forecast/solar`             | Seasonal hourly generation curves              |
| `GET /forecast/cost-impact`       | Solar + battery financial savings              |
| `GET /forecast/tariff-comparison` | SVT vs Time-of-Use comparison                  |
| `GET /forecast/heat-pump`         | Heat pump running cost simulation              |
| `GET /forecast/summary`           | All 4 combined with per-forecast error reasons |

**Always prefer `GET /forecast/summary`** — it runs all 4 in parallel and returns error reasons for any that fail.

#### Solar "What If" Simulation

The solar forecast supports query parameters for on-the-fly simulation. This lets users explore different system sizes **without modifying their profile**:

```http
# Simulate with a specific number of panels
GET /forecast/solar?panelCount=12

# Simulate with a specific system capacity
GET /forecast/solar?capacityKwp=5.0

# Use the profile's auto-detected or user-corrected capacity (default)
GET /forecast/solar
```

This is especially useful for:

- **Flats/maisonettes** (0 panels auto-detected) — user can still simulate
- **Planning a new installation** — user can try different sizes before committing
- **Comparison slider UI** — call with different `panelCount` values to show a range

**Note:** Override results are NOT cached — they're computed fresh each time. Only the default (no query params) response is cached.

**Possible errors per forecast:**
| Error message | Cause | UI Action |
| ------------------------------------------------------ | ------------------------------ | --------------------------------------------------- |
| `"No solar capacity estimated..."` | Property type = flat, 0 panels, no override | Show "Not suitable for rooftop solar" + simulation slider |
| `"Set your energy provider and monthly bill first."` | Load profile not created | Show "Complete Step 3 first" button |
| `"Hardware extrapolation not available."` | Profile data incomplete | Show "Refresh your property profile" |

---

## 3. Dashboard — Single Endpoint

**Use this for the main dashboard screen.** One API call returns everything:

```http
GET /dashboard
```

Response `200`:

```json
{
  "status": {
    "hasProfile": true,
    "hasLoadProfile": true,
    "readyForForecasts": true,
    "completionPercent": 100,
    "nextSteps": [],
    "profileId": "c9b8e366-..."
  },
  "profile": {
    "id": "c9b8e366-...",
    "address": "6 Dartnell Road",
    "postcode": "CR0 6JA",
    "propertyType": "House",
    "builtForm": "Mid-Terrace",
    "totalFloorArea": 72,
    "energyRating": "D",
    "hardware": { ... },
    "userVerified": true,
    "historyCertCount": 1
  },
  "loadProfile": {
    "displayTariff": "British Gas — Standard Variable Tariff",
    "displayBill": "£120.00/month",
    "dailyKwh": 13.59,
    ...
  },
  "forecasts": {
    "solar": { "capacityKwp": 2.58, "annualYieldKwh": 2780, ... },
    "costImpact": { "annualSavingsPounds": 569, "selfSufficiencyPercent": 42, ... },
    "tariffComparison": { "recommendation": "tou", "annualSavingPounds": 135, ... },
    "heatPump": { "annualRunningCostPounds": 876, "cop": 3, ... },
    "errors": {
      "solar": null,
      "costImpact": null,
      "tariffComparison": null,
      "heatPump": null
    }
  }
}
```

### Null Handling

Each section can be `null`:

```dart
final dashboard = await api.getDashboard();

// Profile might not exist yet
if (dashboard.profile == null) {
  showOnboardingPrompt();
  return;
}

// Load profile might not be set
if (dashboard.loadProfile == null) {
  showSetBillPrompt();
  return;
}

// Individual forecasts might fail
if (dashboard.forecasts?.solar == null) {
  showError(dashboard.forecasts?.errors.solar ?? 'Solar forecast unavailable');
}
```

---

## 4. Error Handling

### Error Response Format

Every error follows this shape:

```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": [
    { "field": "monthlyBillPence", "message": "Monthly bill must be a positive integer (pence)" }
  ],
  "requestId": "6074abc8-..."
}
```

### Error Codes

| Code                  | HTTP | Meaning                               | UI Pattern                                               |
| --------------------- | ---- | ------------------------------------- | -------------------------------------------------------- |
| `VALIDATION_ERROR`    | 400  | Bad input                             | Show field-level errors from `details[]`                 |
| `BAD_REQUEST`         | 400  | Insufficient data / invalid operation | Show `message` in a snackbar                             |
| `UNAUTHORIZED`        | 401  | Session expired                       | Redirect to login                                        |
| `NOT_FOUND`           | 404  | Profile/tariff/provider not found     | Show "not found" state                                   |
| `CONFLICT`            | 409  | Profile already exists                | Offer "refresh" or navigate to dashboard                 |
| `INTERNAL_ERROR`      | 500  | Server error                          | Show "Something went wrong. Try again."                  |
| `SERVICE_UNAVAILABLE` | 503  | EPC/PVGIS/Octopus API down            | Show "Service temporarily unavailable. Try again later." |

### Dart Error Handling Pattern

```dart
class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  final List<FieldError>? details;

  bool get isValidation => code == 'VALIDATION_ERROR';
  bool get isNotFound => code == 'NOT_FOUND';
  bool get isConflict => code == 'CONFLICT';
  bool get isUnauthorized => code == 'UNAUTHORIZED';
  bool get isServiceDown => code == 'SERVICE_UNAVAILABLE';
}

// Usage
try {
  final profile = await api.createProfile(lmkKey);
  navigator.push(HardwareReviewScreen(profile));
} on ApiException catch (e) {
  if (e.isConflict) {
    // Profile already exists — navigate to dashboard
    navigator.pushReplacement(DashboardScreen());
  } else if (e.isValidation) {
    showFieldErrors(e.details!);
  } else if (e.isServiceDown) {
    showRetryDialog('EPC service is temporarily unavailable');
  } else {
    showSnackbar(e.message);
  }
}
```

---

## 5. Loading States

### Per-Screen Loading Matrix

| Screen              | Initial Load         | User Action                | Loading State                                   | Success                                    | Error                                          |
| ------------------- | -------------------- | -------------------------- | ----------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| **EPC Search**      | None                 | User enters postcode       | Searching spinner on button                     | Show property list                         | "No properties found" or "Service unavailable" |
| **Property Select** | None                 | User taps a property       | Full-screen loader "Analysing your property..." | Navigate to Step 2                         | Snackbar with error                            |
| **Hardware Review** | Profile data shown   | User edits + confirms      | Save button spinner                             | Navigate to Step 3, show "Verified!" toast | Field-level errors                             |
| **Provider Picker** | Fetch providers list | User selects provider      | Skeleton list                                   | Show tariffs for provider                  | "Could not load providers"                     |
| **Tariff Picker**   | Fetch tariffs        | User selects tariff        | Skeleton list with pagination                   | Highlight selected                         | "Could not load tariffs"                       |
| **Bill Input**      | None                 | User enters bill + submits | Submit button spinner                           | Navigate to Dashboard                      | Field-level errors                             |
| **Dashboard**       | `GET /dashboard`     | Pull-to-refresh            | Skeleton cards                                  | Show all data                              | Per-section error messages                     |
| **Solar Forecast**  | Part of dashboard    | Tap for details            | Already loaded from dashboard                   | Show hourly chart                          | "No solar capacity estimated"                  |
| **Cost Impact**     | Part of dashboard    | Tap for details            | Already loaded from dashboard                   | Show comparison cards                      | "Set your bill first"                          |

### Skeleton Loading Pattern

```dart
class DashboardScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DashboardDTO>(
      future: api.getDashboard(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return DashboardSkeleton(); // Shimmer placeholders
        }
        if (snapshot.hasError) {
          return ErrorState(
            message: 'Could not load your energy profile',
            onRetry: () => setState(() {}),
          );
        }
        final dashboard = snapshot.data!;
        return DashboardContent(dashboard);
      },
    );
  }
}
```

### Pull-to-Refresh

```dart
RefreshIndicator(
  onRefresh: () async {
    // Force refresh from EPC API (clears cache)
    await api.refreshProfile();
    // Reload dashboard
    setState(() {});
  },
  child: DashboardContent(dashboard),
)
```

---

## 6. Dart Models

```dart
// ── Status ──────────────────────────────────────────────

class OnboardingStatus {
  final bool hasProfile;
  final bool hasLoadProfile;
  final bool readyForForecasts;
  final int completionPercent;
  final List<String> nextSteps;
  final String? profileId;
}

// ── Profile ─────────────────────────────────────────────

class PropertyProfile {
  final String id;
  final String address;
  final String postcode;
  final String propertyType;
  final String builtForm;
  final double totalFloorArea;
  final String? energyRating;
  final HardwareExtrapolation? hardware;
  final bool userVerified;
  final int historyCertCount;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class HardwareExtrapolation {
  final SolarGuess solar;
  final BatteryGuess battery;
  final HeatPumpGuess heatPump;
}

class SolarGuess {
  final bool detected;
  final String? birthDate;
  final int estimatedPanelCount;
  final int estimatedPanelWattage;
  final String panelTechnology;
  final double estimatedCapacityKwp;
  final String confidence; // "high", "medium", "low"
  final bool manualSurveyRequired;
}

class BatteryGuess {
  final double probability;
  final double estimatedCapacityKwh;
  final String? recommendation;
}

class HeatPumpGuess {
  final bool detected;
  final String? birthDate;
  final String? type; // "air-source", "ground-source", "unknown"
  final String readiness; // "highly_suitable", "suitable", "insulation_required", "unknown"
  final double? readinessScore;
}

// ── Load Profile ────────────────────────────────────────

class UserLoadProfile {
  final String id;
  final String providerId;
  final String providerName;
  final String tariffId;
  final String tariffName;
  final String displayTariff; // "British Gas — Standard Variable Tariff"
  final int monthlyBillPence;
  final String displayBill;   // "£120.00/month"
  final double dailyKwh;
  final List<double> hourlyDistribution; // 24 elements
  final DateTime createdAt;
  final DateTime updatedAt;
}

// ── Tariffs ─────────────────────────────────────────────

class EnergyProvider {
  final String id;
  final String name;
  final String slug;
  final int? tariffCount;
}

class EnergyTariff {
  final String id;
  final String providerId;
  final String? providerName;
  final String name;
  final String tariffType; // "flat", "tou", "export"
  final String displayRate; // "24.50p/kWh"
  final int? flatRatePence;
  final int? peakRatePence;
  final int? offPeakRatePence;
  final int standingChargePence;
  final int? segExportRatePence;
  final bool isDefault;
  final String validFrom;
  final String? validTo;
  final String source;
}

// ── Forecasts ───────────────────────────────────────────

class SolarForecast {
  final double capacityKwp;
  final double annualYieldKwh;
  final List<SeasonalForecast> seasons;
}

class SeasonalForecast {
  final String season; // "summer", "winter", "shoulder"
  final List<double> hourlyCurve; // 24 elements
  final double dailyYieldKwh;
  final double peakHourKwh;
}

class CostImpact {
  final ScenarioResult withoutSolar;
  final ScenarioResult withSolarOnly;
  final ScenarioResult withSolarAndBattery;
  final int dailySavingsPence;
  final int annualSavingsPounds;
  final int selfSufficiencyPercent;
}

class ScenarioResult {
  final int dailyCostPence;
  final int annualCostPounds;
  final double gridImportKwh;
  final double gridExportKwh;
  final int exportRevenuePence;
  final double selfConsumedKwh;
  final double batteryChargeKwh;
  final double batteryDischargeKwh;
}

class TariffComparison {
  final TariffScenario svt;
  final TariffScenario tou;
  final String recommendation; // "svt" or "tou"
  final int annualSavingPounds;
  final String explanation;
}

class TariffScenario {
  final String tariffName;
  final int dailyCostPence;
  final int annualCostPounds;
  final double gridImportKwh;
  final double gridExportKwh;
  final double overnightChargeKwh;
}

class HeatPumpSimulation {
  final int annualElectricalDemandKwh;
  final double dailyHeatPumpKwh;
  final int cop;
  final List<double> heatPumpLoadCurve; // 24 elements
  final List<double> combinedLoadCurve; // 24 elements
  final TariffComparison tariffComparison;
  final int solarAbsorptionPercent;
  final int annualRunningCostPounds;
}

// ── Dashboard Bundle ────────────────────────────────────

class Dashboard {
  final OnboardingStatus status;
  final PropertyProfile? profile;
  final UserLoadProfile? loadProfile;
  final ForecastSummary? forecasts;
}

class ForecastSummary {
  final SolarForecast? solar;
  final CostImpact? costImpact;
  final TariffComparison? tariffComparison;
  final HeatPumpSimulation? heatPump;
  final ForecastErrors errors;
}

class ForecastErrors {
  final String? solar;
  final String? costImpact;
  final String? tariffComparison;
  final String? heatPump;

  bool get hasSolarError => solar != null;
  bool get hasCostError => costImpact != null;
  bool get hasTariffError => tariffComparison != null;
  bool get hasHeatPumpError => heatPump != null;
}
```

---

## 7. Complete Flow Examples

### Example 1: Full Happy Path

```dart
// 1. Check where user is
final status = await api.getStatus();
// → completionPercent: 0, nextSteps: ["Search your postcode..."]

// 2. User searches postcode
final epcResults = await api.searchEpc('CR0 6JA');
// → 5 properties found

// 3. User picks "6 Dartnell Road"
final profile = await api.createProfile(epcResults[0].lmkKey);
// → hardware guesses: 6 panels, 2.58 kWp, no battery, insulation needed

// 4. User confirms hardware (corrects to 8 panels + 5kWh battery)
final updated = await api.updateHardware({
  solar: { detected: true, estimatedPanelCount: 8 },
  battery: { estimatedCapacityKwh: 5 },
});
// → userVerified: true, confidence: "high", 3.44 kWp

// 5. User picks provider + tariff + bill
final providers = await api.getProviders();
// → 18 providers with tariffCount

final tariffs = await api.getTariffs(providerId: providers[0].id);
// → paginated list with displayRate

final loadProfile = await api.createLoadProfile(
  providerId: providers[0].id,
  tariffId: tariffs[0].id,
  monthlyBillPence: 12000,
);
// → displayTariff: "British Gas — SVT", dailyKwh: 13.59

// 6. Dashboard loads everything in one call
final dashboard = await api.getDashboard();
// → status.completionPercent: 100
// → forecasts.solar.annualYieldKwh: 2780
// → forecasts.costImpact.annualSavingsPounds: 569
// → forecasts.tariffComparison.recommendation: "tou"
// → forecasts.heatPump.annualRunningCostPounds: 876
```

### Example 2: Returning User (cached data)

```dart
// Dashboard loads instantly from Redis cache (1-year TTL)
final dashboard = await api.getDashboard();
assert(dashboard.status.completionPercent == 100);
assert(dashboard.profile != null);
assert(dashboard.forecasts != null);
// No EPC API calls — all from cache
```

### Example 3: User Force-Refreshes

```dart
// Pull-to-refresh triggers a re-fetch from EPC API
final refreshed = await api.refreshProfile();
// → userVerified reset to false (user should re-confirm)
// → all forecast caches invalidated
// → next getDashboard() will recompute forecasts

// Show a prompt to re-verify hardware
if (!refreshed.userVerified) {
  showDialog('Your property data has been updated. Please review your hardware details.');
}
```

### Example 4: Partial Onboarding (load profile not set)

```dart
final dashboard = await api.getDashboard();

// Profile exists but load profile is null
assert(dashboard.profile != null);
assert(dashboard.loadProfile == null);
assert(dashboard.status.completionPercent == 80);

// Solar forecast works (doesn't need load profile)
assert(dashboard.forecasts!.solar != null);

// Cost/tariff/heatpump fail with helpful error
assert(dashboard.forecasts!.costImpact == null);
assert(dashboard.forecasts!.errors.costImpact ==
  'Set your energy provider and monthly bill first.');

// Show: solar card with data, other cards with "Set your bill" CTA
```

### Example 5: Flat/Maisonette (no auto-detected solar — use simulation)

```dart
final profile = await api.createProfile(flatLmkKey);

// Solar panel count = 0 for flats
assert(profile.hardware!.solar.estimatedPanelCount == 0);
assert(profile.hardware!.solar.manualSurveyRequired == true);

// Default solar forecast will fail (0 capacity)
final dashboard = await api.getDashboard();
assert(dashboard.forecasts!.solar == null);
assert(dashboard.forecasts!.errors.solar!.contains('No solar capacity'));

// BUT — user can still simulate with query params!
// "What if I install 6 panels on my flat roof?"
final simulated = await api.getSolarForecast(panelCount: 6);
print('Simulated yield: ${simulated.annualYieldKwh} kWh/year');

// Or let user pick from a slider:
for (final panels in [4, 6, 8, 10]) {
  final sim = await api.getSolarForecast(panelCount: panels);
  print('$panels panels → ${sim.annualYieldKwh.round()} kWh/yr');
}

// Or if they know the exact system size:
final customSim = await api.getSolarForecast(capacityKwp: 3.5);

// To make this permanent, use PATCH /profile/hardware:
await api.updateHardware({
  solar: { detected: true, estimatedPanelCount: 6 },
});
// Now GET /forecast/solar works without query params
```

### Example 6: Handling 503 (upstream service down)

```dart
try {
  await api.createProfile(lmkKey);
} on ApiException catch (e) {
  if (e.isServiceDown) {
    // EPC API is down — show retry with back-off
    showDialog(
      title: 'Service Temporarily Unavailable',
      body: 'The EPC lookup service is currently down. Please try again in a few minutes.',
      actions: [
        TextButton('Try Again', onPressed: () => retryWithBackoff()),
        TextButton('Cancel', onPressed: () => navigator.pop()),
      ],
    );
  }
}
```

---

## Endpoint Quick Reference

| Method   | Path                                              | Purpose                                              |
| -------- | ------------------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/status`                                         | Onboarding completion state                          |
| `GET`    | `/dashboard`                                      | Everything in one call (profile + load + forecasts)  |
| `POST`   | `/profile`                                        | Create profile from EPC LMK key                      |
| `GET`    | `/profile`                                        | Get property profile                                 |
| `POST`   | `/profile/refresh`                                | Force re-fetch from EPC API                          |
| `DELETE` | `/profile`                                        | Delete all energy profile data                       |
| `PATCH`  | `/profile/hardware`                               | User corrects hardware guesses                       |
| `GET`    | `/profile/history`                                | UPRN historical EPC certificates                     |
| `GET`    | `/tariffs/providers`                              | List 18 UK energy providers                          |
| `GET`    | `/tariffs?providerId=X&type=flat&page=1&limit=20` | Filtered + paginated tariffs                         |
| `GET`    | `/tariffs/:providerId`                            | Tariffs for one provider                             |
| `POST`   | `/tariffs/refresh`                                | Re-seed tariff data (admin)                          |
| `POST`   | `/load-profile`                                   | Set provider + tariff + monthly bill                 |
| `GET`    | `/load-profile`                                   | Get current load profile                             |
| `PATCH`  | `/load-profile`                                   | Update bill or tariff                                |
| `GET`    | `/forecast/solar?panelCount=8&capacityKwp=3.5`    | Hourly generation (with optional "what if" override) |
| `GET`    | `/forecast/cost-impact`                           | Solar + battery savings                              |
| `GET`    | `/forecast/tariff-comparison`                     | SVT vs ToU comparison                                |
| `GET`    | `/forecast/heat-pump`                             | Heat pump running cost                               |
| `GET`    | `/forecast/summary`                               | All 4 forecasts + error reasons                      |
