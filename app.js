/**
 * Rx Prescription & Receipt Studio
 * Multi-Page Dynamic Pagination, Clean Default State & Google Sheet Integration
 */

// Sample preset data (available via "Load Sample" button)
const SAMPLE_DATA = {
  doctor: {
    name: "Dr. Aparna T",
    degrees: "MD, DNB Dermatology, MRCPUK (SCE)",
    specialty: "Dermatology | Dermatosurgery | Aesthetics",
    exp: [
      "Ex-Senior Resident – PGIMER, Chandigarh",
      "Ex-Senior Resident – GMCH-32, Chandigarh",
      "Ex-Assistant Professor – Seth GS Medical College & KEM Hospital, Mumbai",
      "Training in Aesthetics and Laser, Siriraj Hospital, Bangkok, Thailand"
    ].join("\n"),
    regNo: "PMC Reg. No. 65062",
    phone: "9757387425",
    email: "taparna97@gmail.com",
    location: "Chandigarh",
    logoType: "silhouette"
  },
  patient: {
    name: "Salil Garg",
    date: "20/9/2026",
    ageSex: "30 / M",
    address: "Chandigarh",
    phone: "",
    drugAllergies: "None"
  },
  clinical: {
    chiefComplaints: "F/U/C/O Atopic dermatitis ; flare since 3 days on hands and face",
    diagnosis: "Atopic Dermatitis"
  },
  medications: [
    { name: "Tab Medrol 24mg", frequency: "OD (once a day )", duration: "7 days", remarks: "After breakfast" },
    { name: "Cap Omez 20mg", frequency: "OD ( once a day)", duration: "7 days", remarks: "30 min before breakfast" },
    { name: "Tab Allegra 180mg", frequency: "BD (twice a day)", duration: "7 days", remarks: "After meals" },
    { name: "Venusia max cream", frequency: "BD (twice a day)", duration: "7 days", remarks: "Face and body" },
    { name: "Momate cream", frequency: "HS ( at night on rash on face)", duration: "7 days", remarks: "Apply small quantity" },
    { name: "Tenovate cream", frequency: "BD (twice a day on rash on body)", duration: "7 days", remarks: "" }
  ],
  advice: [
    "To use Dove/ pears soap & continue Pelliwash shampoo",
    "To use gentle Cotton towels for wiping body and face",
    "To apply moisturiser within 3 min of taking bath",
    "To avoid harsh Sun exposure and any other face products"
  ].join("\n"),
  investigations: [
    "CBC , LFT , RFT , HBA1c , fasting lipid profile",
    "Thyroid function test"
  ].join("\n"),
  followUp: "After 7 days",
  disclaimer: "This prescription is based on an online consultation, limited to the information provided. Please follow the prescribed treatment and review as assessed.\nIn case of any worsening or new symptoms please reach out as soon as possible."
};

// Default Clean / Empty State for New Patients
const CLEAN_DEFAULT_DATA = {
  doctor: { ...SAMPLE_DATA.doctor }, // keep doctor branding
  patient: {
    name: "",
    date: new Date().toLocaleDateString('en-GB'),
    ageSex: "",
    address: "",
    phone: "",
    drugAllergies: "None"
  },
  clinical: {
    chiefComplaints: "",
    diagnosis: ""
  },
  medications: [
    { name: "", frequency: "", duration: "", remarks: "" }
  ],
  advice: "",
  investigations: "",
  followUp: "",
  disclaimer: SAMPLE_DATA.disclaimer
};

// Google Sheet URL
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1XA6S97SodEjr9MdOXryYdiMFZ2iYJ9LXp-P5YgojGNY/edit?usp=sharing";

// Application State (Clean by default)
let appState = JSON.parse(JSON.stringify(CLEAN_DEFAULT_DATA));
let customLogoDataUrl = null;
let currentTab = "editor";

// ==========================================================================
// Master Sheet Database & Patient Auto-Fetch System
// ==========================================================================
let cachedPatients = [];
let isFetchingSheetDb = false;

function getMasterSheetId() {
  const url = GOOGLE_SHEET_URL;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : "1XA6S97SodEjr9MdOXryYdiMFZ2iYJ9LXp-P5YgojGNY";
}

/**
 * Robust RFC 4180 CSV Parser
 */
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          currentVal += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        currentRow.push(currentVal.trim());
        currentVal = "";
      } else if (c === '\r') {
        // ignore carriage return
      } else if (c === '\n') {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
        currentRow = [];
        currentVal = "";
      } else {
        currentVal += c;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Intelligent Column Mapping for Sheet / Excel rows
 */
function mapRowsToPatients(rows) {
  if (!rows || rows.length < 2) return [];
  const headerRow = rows[0].map(h => String(h || "").toLowerCase().trim());

  const findIdx = (keywords, fallback) => {
    const idx = headerRow.findIndex(h => keywords.some(k => h.includes(k)));
    return idx !== -1 ? idx : fallback;
  };

  const colIndex = {
    timestamp: findIdx(["timestamp", "time"], 0),
    date: findIdx(["date"], 1),
    name: findIdx(["patient name", "patient", "name"], 2),
    ageSex: findIdx(["age/sex", "age / sex", "age", "sex", "gender"], 3),
    phone: findIdx(["phone", "mobile", "contact", "tel"], 4),
    address: findIdx(["address/city", "address", "city", "location"], 5),
    allergies: findIdx(["allerg"], 6),
    complaints: findIdx(["complaint", "symptom"], 7),
    diagnosis: findIdx(["diagnos"], 8),
    medications: findIdx(["medic", "rx"], 9),
    advice: findIdx(["advic", "instruct"], 10),
    investigations: findIdx(["investig", "test"], 11),
    followUp: findIdx(["follow"], 12),
    doctor: findIdx(["doctor"], 13)
  };

  const list = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawPhone = String(row[colIndex.phone] || "").trim();
    const digitsPhone = rawPhone.replace(/\D/g, "").slice(-10);
    const name = String(row[colIndex.name] || "").trim();

    if (!digitsPhone && !name) continue;

    list.push({
      phone: digitsPhone,
      rawPhone: rawPhone,
      name: name,
      date: String(row[colIndex.date] || "").trim(),
      timestamp: String(row[colIndex.timestamp] || "").trim(),
      ageSex: String(row[colIndex.ageSex] || "").trim(),
      address: String(row[colIndex.address] || "").trim(),
      drugAllergies: String(row[colIndex.allergies] || "None").trim(),
      chiefComplaints: String(row[colIndex.complaints] || "").trim(),
      diagnosis: String(row[colIndex.diagnosis] || "").trim(),
      medicationsSummary: String(row[colIndex.medications] || "").trim(),
      advice: String(row[colIndex.advice] || "").trim(),
      investigations: String(row[colIndex.investigations] || "").trim(),
      followUp: String(row[colIndex.followUp] || "").trim(),
      doctorName: String(row[colIndex.doctor] || "").trim()
    });
  }
  return list;
}

/**
 * Search patient records by phone number
 */
function searchPatientByPhone(inputPhone) {
  const digits = String(inputPhone || "").replace(/\D/g, "").slice(-10);
  if (!digits || digits.length < 10) return null;

  const matches = cachedPatients.filter(p => p.phone === digits);
  if (matches.length === 0) return null;

  // Prioritize named entries over "Unnamed Patient"
  const validNamedMatches = matches.filter(p => p.name && p.name.toLowerCase() !== "unnamed patient");
  const candidates = validNamedMatches.length > 0 ? validNamedMatches : matches;

  // Most recent visit is the last row in the sheet
  const latestMatch = candidates[candidates.length - 1];
  return {
    patient: latestMatch,
    allVisits: candidates
  };
}

/**
 * Auto-fill patient details into inputs & document preview
 */
function autoFillPatientDetails(match, showNotification = true) {
  if (!match || !match.patient) return;
  const p = match.patient;

  if (p.name && p.name.toLowerCase() !== "unnamed patient") {
    const inputName = document.getElementById("inputPatientName");
    if (inputName) inputName.value = p.name;
    appState.patient.name = p.name;
  }

  if (p.ageSex) {
    const inputAge = document.getElementById("inputAgeSex");
    if (inputAge) inputAge.value = p.ageSex;
    appState.patient.ageSex = p.ageSex;
  }

  if (p.address) {
    const inputAddr = document.getElementById("inputPatientAddress");
    if (inputAddr) inputAddr.value = p.address;
    appState.patient.address = p.address;
  }

  if (p.drugAllergies) {
    const inputAllergies = document.getElementById("inputDrugAllergies");
    if (inputAllergies) inputAllergies.value = p.drugAllergies;
    appState.patient.drugAllergies = p.drugAllergies;
  }

  // Update live preview document report immediately
  renderAllPages();

  // Status badge update
  const badge = document.getElementById("phoneLookupBadge");
  if (badge) {
    badge.className = "phone-status-badge found";
    badge.textContent = `✓ Patient Found: ${p.name || 'Record matched'}`;
    badge.classList.remove("hidden");
  }

  // Display patient found card
  renderPatientFoundCard(match);

  if (showNotification) {
    showToast(`✓ Patient details fetched from Sheet: ${p.name || 'Patient'} (${p.ageSex || 'Matched'} - ${p.address || ''})`);
  }
}

/**
 * Render dynamic Patient Found Card with details & action buttons
 */
function renderPatientFoundCard(match) {
  const card = document.getElementById("patientFoundCard");
  if (!card) return;
  const p = match.patient;
  const visitCount = match.allVisits ? match.allVisits.length : 1;
  const visitDate = p.date || p.timestamp || "Recent Visit";
  const hasClinicalNotes = Boolean(p.chiefComplaints || p.diagnosis || p.medicationsSummary || p.advice);

  card.innerHTML = `
    <div class="patient-match-header">
      <div class="patient-match-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <span>Existing Patient Record Found</span>
        <span class="patient-match-badge">${visitCount > 1 ? `${visitCount} Visits in Sheet` : 'Sheet Record'}</span>
      </div>
      <button type="button" class="btn-clear-match" id="btnCloseMatchCard" title="Dismiss">&times;</button>
    </div>
    <div class="patient-match-details">
      <div class="patient-detail-pill">
        <span class="patient-detail-label">Patient Name</span>
        <span class="patient-detail-val">${escapeHtml(p.name || '-')}</span>
      </div>
      <div class="patient-detail-pill">
        <span class="patient-detail-label">Age / Sex</span>
        <span class="patient-detail-val">${escapeHtml(p.ageSex || '-')}</span>
      </div>
      <div class="patient-detail-pill">
        <span class="patient-detail-label">Address</span>
        <span class="patient-detail-val">${escapeHtml(p.address || '-')}</span>
      </div>
      <div class="patient-detail-pill">
        <span class="patient-detail-label">Drug Allergies</span>
        <span class="patient-detail-val">${escapeHtml(p.drugAllergies || 'None')}</span>
      </div>
      ${p.diagnosis ? `
      <div class="patient-detail-pill" style="grid-column: 1 / -1;">
        <span class="patient-detail-label">Last Diagnosis (${escapeHtml(visitDate)})</span>
        <span class="patient-detail-val" style="color:#0284c7;">${escapeHtml(p.diagnosis)}</span>
      </div>` : ''}
    </div>
    <div class="patient-match-actions">
      ${hasClinicalNotes ? `
      <button type="button" id="btnLoadPreviousNotes" class="btn-load-notes" title="Also restore previous diagnosis, complaints & Rx">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <span>Load Previous Clinical Notes &amp; Rx</span>
      </button>` : ''}
      <span style="font-size:0.68rem;color:#059669;margin-left:auto;font-weight:600;">✓ Auto-filled in report</span>
    </div>
  `;

  card.classList.remove("hidden");

  const btnClose = document.getElementById("btnCloseMatchCard");
  if (btnClose) {
    btnClose.addEventListener("click", () => {
      card.classList.add("hidden");
    });
  }

  const btnNotes = document.getElementById("btnLoadPreviousNotes");
  if (btnNotes) {
    btnNotes.addEventListener("click", () => {
      loadPreviousClinicalNotes(p);
    });
  }
}

/**
 * Parse medications summary string back to array of medication objects
 */
function parseMedicationsSummary(summary) {
  if (!summary || !summary.trim()) return [];
  const parts = summary.split(/\s*\|\s*/);
  const meds = [];
  for (const part of parts) {
    const match = part.match(/^\d+\.\s*(.*?)\s*\[(.*?),\s*(.*?),\s*(.*?)\]$/);
    if (match) {
      meds.push({
        name: match[1].trim(),
        frequency: match[2].trim(),
        duration: match[3].trim(),
        remarks: match[4].trim()
      });
    } else {
      const clean = part.replace(/^\d+\.\s*/, "").trim();
      if (clean) {
        meds.push({ name: clean, frequency: "", duration: "", remarks: "" });
      }
    }
  }
  return meds;
}

/**
 * Load previous clinical notes & prescription
 */
function loadPreviousClinicalNotes(p) {
  if (p.chiefComplaints) {
    const el = document.getElementById("inputChiefComplaints");
    if (el) el.value = p.chiefComplaints;
    appState.clinical.chiefComplaints = p.chiefComplaints;
  }
  if (p.diagnosis) {
    const el = document.getElementById("inputDiagnosis");
    if (el) el.value = p.diagnosis;
    appState.clinical.diagnosis = p.diagnosis;
  }
  if (p.advice) {
    const el = document.getElementById("inputGeneralAdvice");
    if (el) el.value = p.advice;
    appState.advice = p.advice;
  }
  if (p.investigations) {
    const el = document.getElementById("inputInvestigations");
    if (el) el.value = p.investigations;
    appState.investigations = p.investigations;
  }
  if (p.followUp) {
    const el = document.getElementById("inputFollowUp");
    if (el) el.value = p.followUp;
    appState.followUp = p.followUp;
  }

  const parsedMeds = parseMedicationsSummary(p.medicationsSummary);
  if (parsedMeds.length > 0) {
    appState.medications = parsedMeds;
    renderMedicationEditorCards();
  }

  renderAllPages();
  showToast(`✓ Previous diagnosis & clinical notes loaded for ${p.name || 'Patient'}!`);
}

/**
 * Fetch and synchronize records from Master Sheet CSV endpoint
 */
async function fetchSheetDatabase(forceRefresh = false) {
  const statusDot = document.getElementById("sheetDbDot");
  const statusText = document.getElementById("sheetDbStatusText");

  if (!forceRefresh) {
    const saved = localStorage.getItem("rx_sheet_patient_records");
    if (saved) {
      try {
        cachedPatients = JSON.parse(saved);
        if (statusText && cachedPatients.length > 0) {
          statusText.textContent = `Master Sheet: ${cachedPatients.length} patient records ready`;
          if (statusDot) statusDot.className = "sheet-db-dot";
        }
      } catch (e) {}
    }
  }

  if (isFetchingSheetDb) return;
  isFetchingSheetDb = true;

  if (statusDot) statusDot.className = "sheet-db-dot loading";
  if (statusText) statusText.textContent = "Syncing latest records from Sheet...";

  const sheetId = getMasterSheetId();
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&t=${Date.now()}`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();
    const rows = parseCSV(csvText);
    const patients = mapRowsToPatients(rows);

    if (patients.length > 0) {
      cachedPatients = patients;
      localStorage.setItem("rx_sheet_patient_records", JSON.stringify(patients));
      if (statusDot) statusDot.className = "sheet-db-dot";
      if (statusText) statusText.textContent = `Master Sheet Connected: ${patients.length} patient records`;
      if (forceRefresh) showToast(`✓ Sheet synchronized! ${patients.length} records active.`);
    } else {
      if (statusDot) statusDot.className = "sheet-db-dot";
      if (statusText) statusText.textContent = "Sheet connected (0 records found)";
    }
  } catch (err) {
    console.warn("Could not fetch Google Sheet CSV directly:", err);
    if (cachedPatients.length > 0) {
      if (statusDot) statusDot.className = "sheet-db-dot";
      if (statusText) statusText.textContent = `Offline Mode: ${cachedPatients.length} cached records ready`;
    } else {
      if (statusDot) statusDot.className = "sheet-db-dot error";
      if (statusText) statusText.textContent = "Could not sync sheet (Check internet or permissions)";
    }
  } finally {
    isFetchingSheetDb = false;
  }
}

/**
 * Handle offline Excel / CSV file upload
 */
function handleExcelFileInput(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      if (typeof XLSX === "undefined") {
        showToast("Excel reader library loading, please try again in a moment.");
        return;
      }
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const patients = mapRowsToPatients(rows);

      if (patients.length > 0) {
        cachedPatients = [...cachedPatients, ...patients];
        localStorage.setItem("rx_sheet_patient_records", JSON.stringify(cachedPatients));
        const statusText = document.getElementById("sheetDbStatusText");
        if (statusText) {
          statusText.textContent = `Imported: ${patients.length} records from ${file.name}`;
        }
        showToast(`✓ Imported ${patients.length} patient records from ${file.name}!`);
      } else {
        showToast("No valid patient records found in file.");
      }
    } catch (err) {
      console.error("Error reading Excel file:", err);
      showToast("Could not parse file. Ensure valid .xlsx or .csv format.");
    }
  };
  reader.readAsArrayBuffer(file);
}

/**
 * Initialize Master Sheet Database Controls
 */
function initSheetDatabase() {
  const btnRefresh = document.getElementById("btnRefreshSheetData");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => fetchSheetDatabase(true));
  }

  const excelInput = document.getElementById("excelFileInput");
  if (excelInput) {
    excelInput.addEventListener("change", handleExcelFileInput);
  }

  const btnFetch = document.getElementById("btnFetchByPhone");
  if (btnFetch) {
    btnFetch.addEventListener("click", () => {
      const phoneInput = document.getElementById("inputPatientPhone");
      const val = phoneInput ? phoneInput.value : "";
      const digits = val.replace(/\D/g, "").slice(0, 10);
      if (!digits) {
        showToast("Please enter a 10-digit phone number to search.");
        if (phoneInput) phoneInput.focus();
        return;
      }
      const match = searchPatientByPhone(digits);
      if (match) {
        autoFillPatientDetails(match, true);
      } else {
        showToast(`No record found in Sheet for phone: ${digits}`);
        const badge = document.getElementById("phoneLookupBadge");
        if (badge) {
          badge.className = "phone-status-badge not-found";
          badge.textContent = "New Patient (Not in sheet)";
          badge.classList.remove("hidden");
        }
      }
    });
  }

  // Pre-load sheet database
  fetchSheetDatabase(false);
}

// SVGs
const CADUCEUS_SVG = `
<svg viewBox="0 0 100 115" width="66" height="76" fill="none" class="rx-silhouette-icon" xmlns="http://www.w3.org/2000/svg" style="width:66px;height:76px;display:block;">
  <path d="M50 8 V105" stroke="#7a5539" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="50" cy="8" r="6" fill="#7a5539"/>
  <path d="M50 18 C30 10, 15 22, 10 38 C20 40, 35 32, 50 25" fill="#c99f7d" opacity="0.8"/>
  <path d="M50 18 C70 10, 85 22, 90 38 C80 40, 65 32, 50 25" fill="#c99f7d" opacity="0.8"/>
  <path d="M30 35 C40 38, 60 38, 70 48 C78 55, 75 66, 62 70 C48 73, 35 80, 50 92" stroke="#7a5539" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M70 35 C60 38, 40 38, 30 48 C22 55, 25 66, 38 70 C52 73, 65 80, 50 92" stroke="#966a4a" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>
`;

const SILHOUETTE_SVG = `
<svg class="rx-silhouette-icon" viewBox="0 0 100 115" width="66" height="76" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:66px;height:76px;display:block;">
  <path d="M48 20 C42 12, 32 10, 20 18 C12 24, 8 36, 12 50 C16 64, 25 76, 38 88 C45 95, 52 102, 60 108 C54 100, 48 90, 44 80 C40 68, 42 58, 48 50 C54 42, 62 38, 70 36 C58 35, 52 28, 48 20 Z" fill="url(#bronzeGrad1)" opacity="0.85"/>
  <path d="M68 36 C76 34, 82 38, 86 45 C90 52, 88 60, 82 68 C80 71, 76 74, 72 76 C76 72, 78 68, 78 64 C78 60, 76 56, 73 54 C70 52, 68 53, 66 55 C65 52, 66 48, 68 45 C66 43, 62 42, 58 43 C62 40, 65 38, 68 36 Z" fill="url(#bronzeGrad2)" opacity="0.9"/>
  <path d="M72 54 C74 54, 76 57, 75 60 C73 63, 70 65, 68 67 C70 64, 71 60, 70 57 C70 55, 71 54, 72 54 Z" fill="#916c52"/>
  <path d="M60 62 C64 64, 66 68, 65 72 C63 76, 58 80, 54 84 C56 80, 58 76, 58 72 C58 68, 58 65, 60 62 Z" fill="#a47b5e"/>
  <path d="M35 32 C28 20, 38 12, 45 8 C40 14, 40 22, 42 28 Z" fill="url(#bronzeGrad1)" opacity="0.7"/>
  <path d="M22 45 C15 36, 22 28, 30 25 C25 31, 24 38, 26 44 Z" fill="url(#bronzeGrad1)" opacity="0.6"/>
  <defs>
    <linearGradient id="bronzeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b88d6b"/>
      <stop offset="50%" stop-color="#996d4d"/>
      <stop offset="100%" stop-color="#734e35"/>
    </linearGradient>
    <linearGradient id="bronzeGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c99f7d"/>
      <stop offset="100%" stop-color="#966a4a"/>
    </linearGradient>
  </defs>
</svg>
`;

const BOTANICAL_SVG = `
<div class="botanical-corner bottom-right">
  <svg viewBox="0 0 200 200" width="220" height="220" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:220px;height:220px;display:block;">
    <path d="M190 190 C150 140, 120 100, 110 50 C108 40, 112 30, 120 20" stroke="#d5beaa" stroke-width="1.2" fill="none" opacity="0.45"/>
    <path d="M190 190 C160 160, 140 120, 145 80" stroke="#d5beaa" stroke-width="1" fill="none" opacity="0.35"/>
    <path d="M120 30 C110 15, 125 5, 135 15 C145 25, 130 35, 120 30 Z" fill="#ebdccf" opacity="0.6"/>
    <path d="M142 80 C132 68, 148 58, 156 68 C164 78, 150 88, 142 80 Z" fill="#ebdccf" opacity="0.6"/>
    <path d="M165 125 C152 112, 170 100, 180 112 C190 124, 175 135, 165 125 Z" fill="#e8d8c9" opacity="0.55"/>
    <path d="M100 80 C85 70, 95 55, 105 65 C115 75, 110 88, 100 80 Z" fill="#e8d8c9" opacity="0.5"/>
    <path d="M78 120 C65 110, 75 95, 88 105 C100 115, 90 130, 78 120 Z" fill="#f1e5da" opacity="0.55"/>
    <path d="M175 170 C160 155, 180 140, 192 155 C200 170, 185 180, 175 170 Z" fill="#e8d8c9" opacity="0.5"/>
  </svg>
</div>
`;

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  initFormElements();
  loadStateIntoForm();
  renderAllPages();
  setupEventListeners();
  autoFitZoom();
  initSheetDatabase();

  window.addEventListener("resize", () => {
    autoFitZoom();
  });
});

/**
 * Initialize controls & modals
 */
function initFormElements() {
  // Collapsible cards toggle
  document.querySelectorAll(".form-card-header").forEach(header => {
    header.addEventListener("click", () => {
      const card = header.closest(".form-card");
      card.classList.toggle("open");
    });
  });

  // Mobile Tabs switcher
  const tabBtnEditor = document.getElementById("tabBtnEditor");
  const tabBtnPreview = document.getElementById("tabBtnPreview");
  const mainContentArea = document.getElementById("mainContentArea");
  const floatSwitchBtn = document.getElementById("floatSwitchBtn");
  const floatSwitchText = document.getElementById("floatSwitchText");
  const floatPrintBtn = document.getElementById("floatPrintBtn");
  const floatSaveSheetBtn = document.getElementById("floatSaveSheetBtn");

  function switchTab(toTab) {
    currentTab = toTab;
    if (toTab === "editor") {
      tabBtnEditor.classList.add("active");
      tabBtnPreview.classList.remove("active");
      mainContentArea.classList.remove("show-preview");
      mainContentArea.classList.add("show-editor");
      if (floatSwitchText) floatSwitchText.textContent = "View Receipt";
    } else {
      tabBtnPreview.classList.add("active");
      tabBtnEditor.classList.remove("active");
      mainContentArea.classList.remove("show-editor");
      mainContentArea.classList.add("show-preview");
      if (floatSwitchText) floatSwitchText.textContent = "Edit Form";
      setTimeout(() => autoFitZoom(), 50);
    }
  }

  if (tabBtnEditor && tabBtnPreview) {
    tabBtnEditor.addEventListener("click", () => switchTab("editor"));
    tabBtnPreview.addEventListener("click", () => switchTab("preview"));
  }

  if (floatSwitchBtn) {
    floatSwitchBtn.addEventListener("click", () => {
      switchTab(currentTab === "editor" ? "preview" : "editor");
    });
  }

  if (floatPrintBtn) {
    floatPrintBtn.addEventListener("click", () => window.print());
  }

  const floatDownloadBtn = document.getElementById("floatDownloadBtn");
  if (floatDownloadBtn) {
    floatDownloadBtn.addEventListener("click", () => downloadPDF());
  }

  if (floatSaveSheetBtn) {
    floatSaveSheetBtn.addEventListener("click", () => {
      const url = getWebhookUrl();
      if (url && url.startsWith("https://script.google.com")) {
        executeSyncToSheet(url, false);
      } else {
        openGoogleSheetModal(true);
      }
    });
  }

  // Google Sheet Modal triggers
  const btnSaveGoogleSheet = document.getElementById("btnSaveGoogleSheet");
  const sheetModal = document.getElementById("sheetModal");
  const btnCloseSheetModal = document.getElementById("btnCloseSheetModal");

  if (btnSaveGoogleSheet) {
    btnSaveGoogleSheet.addEventListener("click", openGoogleSheetModal);
  }

  if (btnCloseSheetModal) {
    btnCloseSheetModal.addEventListener("click", () => {
      sheetModal.classList.add("hidden");
    });
  }

  if (sheetModal) {
    sheetModal.addEventListener("click", (e) => {
      if (e.target === sheetModal) {
        sheetModal.classList.add("hidden");
      }
    });
  }

  // Logo selection
  document.querySelectorAll('input[name="logoType"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      appState.doctor.logoType = e.target.value;
      const uploadWrap = document.getElementById("customLogoUploadWrapper");
      if (e.target.value === "custom") {
        uploadWrap.classList.remove("hidden");
      } else {
        uploadWrap.classList.add("hidden");
      }
      renderAllPages();
    });
  });

  // Custom Logo upload
  const fileInput = document.getElementById("customLogoInput");
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        customLogoDataUrl = event.target.result;
        renderAllPages();
      };
      reader.readAsDataURL(file);
    }
  });

  initGoogleSheetModalLogic();
}

const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycby_Tch89vXLyi_Kfwmsat06Kc_yD1iozsVOfq4ITsw64551OZ0WER6ixEmG6XsDOOjM3Q/exec";

function getWebhookUrl() {
  const saved = localStorage.getItem("rx_gsheet_webhook");
  if (saved && saved.startsWith("https://script.google.com")) {
    return saved;
  }
  localStorage.setItem("rx_gsheet_webhook", DEFAULT_WEBHOOK_URL);
  return DEFAULT_WEBHOOK_URL;
}

/**
 * Open Google Sheet Modal
 */
function openGoogleSheetModal(isTriggeredByDownload = false) {
  const sheetModal = document.getElementById("sheetModal");
  const inputWebhookUrl = document.getElementById("inputWebhookUrl");
  const modalAlertBanner = document.getElementById("modalAlertBanner");
  const savedUrl = getWebhookUrl();
  
  if (inputWebhookUrl) {
    inputWebhookUrl.value = savedUrl;
    updateWebhookStatusFeedback(savedUrl);
  }
  
  const statusMsg = document.getElementById("syncStatusMsg");
  if (statusMsg) statusMsg.classList.add("hidden");

  if (modalAlertBanner) {
    if (isTriggeredByDownload) {
      modalAlertBanner.innerHTML = `<strong>⚡ 1-Step Setup Required:</strong><br/>Paste your Google Apps Script Web App URL below to activate automatic cloud saving whenever you download a PDF.<br/><span style="font-size:0.75rem;opacity:0.9;">(This prescription was also copied to your clipboard — press <strong>Ctrl+V</strong> into your Sheet to paste right now!)</span>`;
      modalAlertBanner.classList.remove("hidden");
    } else {
      modalAlertBanner.classList.add("hidden");
    }
  }

  sheetModal.classList.remove("hidden");
  if (inputWebhookUrl && (!savedUrl || isTriggeredByDownload)) {
    setTimeout(() => {
      inputWebhookUrl.focus();
      inputWebhookUrl.select();
    }, 150);
  }
}

/**
 * Update real-time visual status indicator for webhook URL
 */
function updateWebhookStatusFeedback(url) {
  const fb = document.getElementById("webhookFeedback");
  if (!fb) return;

  const trimmed = (url || "").trim();
  if (!trimmed) {
    fb.className = "webhook-feedback info";
    fb.innerHTML = `💡 Paste your Apps Script Web App URL to enable automatic cloud saving.`;
  } else if (trimmed.includes("docs.google.com/spreadsheets")) {
    fb.className = "webhook-feedback warning";
    fb.innerHTML = `⚠️ That is your Google Sheet link. You need the <strong>Web App URL</strong> from Deploy &gt; New deployment (starts with <code>https://script.google.com/macros/s/...</code>).`;
  } else if (trimmed.startsWith("https://script.google.com")) {
    fb.className = "webhook-feedback success";
    fb.innerHTML = `✓ Web App URL Connected! Auto-save is active for every PDF download.`;
  } else {
    fb.className = "webhook-feedback info";
    fb.innerHTML = `ℹ️ Web App URL should begin with <code>https://script.google.com/macros/s/...</code>`;
  }
}

/**
 * Google Sheet Sync & CSV download logic
 */
function initGoogleSheetModalLogic() {
  const inputWebhookUrl = document.getElementById("inputWebhookUrl");
  if (inputWebhookUrl) {
    const handleUrlUpdate = () => {
      const url = inputWebhookUrl.value.trim();
      updateWebhookStatusFeedback(url);
      if (url.startsWith("https://script.google.com")) {
        localStorage.setItem("rx_gsheet_webhook", url);
      } else if (!url) {
        localStorage.removeItem("rx_gsheet_webhook");
      }
    };
    inputWebhookUrl.addEventListener("input", handleUrlUpdate);
    inputWebhookUrl.addEventListener("change", handleUrlUpdate);
    inputWebhookUrl.addEventListener("paste", () => setTimeout(handleUrlUpdate, 50));
  }

  const btnCopyScript = document.getElementById("btnCopyScript");
  if (btnCopyScript) {
    btnCopyScript.addEventListener("click", () => {
      const code = document.getElementById("appsScriptCode").innerText;
      navigator.clipboard.writeText(code).then(() => {
        btnCopyScript.textContent = "Copied!";
        setTimeout(() => { btnCopyScript.textContent = "Copy Script"; }, 2000);
      });
    });
  }

  const btnSyncNow = document.getElementById("btnSyncNow");
  if (btnSyncNow) {
    btnSyncNow.addEventListener("click", () => {
      const webhookUrl = (inputWebhookUrl ? inputWebhookUrl.value : "").trim();
      const statusMsg = document.getElementById("syncStatusMsg");

      if (!webhookUrl) {
        statusMsg.className = "sync-status info";
        statusMsg.innerHTML = `Please paste your Google Apps Script Web App URL above, or click <strong>Copy Row</strong> to paste directly into Master Receipt Sheet.`;
        statusMsg.classList.remove("hidden");
        if (inputWebhookUrl) inputWebhookUrl.focus();
        return;
      }

      if (webhookUrl.includes("docs.google.com/spreadsheets")) {
        statusMsg.className = "sync-status warning";
        statusMsg.innerHTML = `<strong>Action Required:</strong> You entered the spreadsheet view link. Google Sheets requires the Web App URL (starts with <code>https://script.google.com/macros/s/...</code>) to write rows.<br/><br/>👉 <strong>Fastest:</strong> Click <strong>Copy Row (Ctrl+V)</strong> below, open your Sheet, and press <strong>Ctrl+V</strong>!`;
        statusMsg.classList.remove("hidden");
        return;
      }

      localStorage.setItem("rx_gsheet_webhook", webhookUrl);
      executeSyncToSheet(webhookUrl, true);
    });
  }

  const btnCopyRow = document.getElementById("btnCopyRowForSheet");
  if (btnCopyRow) {
    btnCopyRow.addEventListener("click", () => {
      copyPrescriptionRowForSheet();
    });
  }

  const btnDownloadCsv = document.getElementById("btnDownloadCsv");
  if (btnDownloadCsv) {
    btnDownloadCsv.addEventListener("click", () => {
      downloadPrescriptionCsv();
    });
  }
}

/**
 * Copy Prescription Row for Google Sheet (TSV Format - Instant Paste via Ctrl+V)
 */
function copyPrescriptionRowForSheet() {
  const rowData = [
    new Date().toLocaleString('en-GB'),
    appState.patient.date || "",
    appState.patient.name || "",
    appState.patient.ageSex || "",
    appState.patient.phone || "",
    appState.patient.address || "",
    appState.patient.drugAllergies || "None",
    (appState.clinical.chiefComplaints || "").replace(/\n/g, " "),
    (appState.clinical.diagnosis || "").replace(/\n/g, " "),
    appState.medications
      .filter(m => m.name.trim().length > 0)
      .map((m, i) => `${i + 1}. ${m.name} [${m.frequency}, ${m.duration}, ${m.remarks}]`)
      .join(" | "),
    (appState.advice || "").replace(/\n/g, " ; "),
    (appState.investigations || "").replace(/\n/g, " ; "),
    appState.followUp || "",
    appState.doctor.name || ""
  ];

  const tsv = rowData.map(v => String(v || "").replace(/[\t\r\n]/g, " ")).join("\t");
  navigator.clipboard.writeText(tsv).then(() => {
    showToast("Prescription row copied! Open your Google Sheet and press Ctrl+V to paste.");
  }).catch(() => {
    downloadPrescriptionCsv();
  });
}

function copyRowToClipboardSilently() {
  const rowData = [
    new Date().toLocaleString('en-GB'),
    appState.patient.date || "",
    appState.patient.name || "",
    appState.patient.ageSex || "",
    appState.patient.phone || "",
    appState.patient.address || "",
    appState.patient.drugAllergies || "None",
    (appState.clinical.chiefComplaints || "").replace(/\n/g, " "),
    (appState.clinical.diagnosis || "").replace(/\n/g, " "),
    appState.medications
      .filter(m => m.name.trim().length > 0)
      .map((m, i) => `${i + 1}. ${m.name} [${m.frequency}, ${m.duration}, ${m.remarks}]`)
      .join(" | "),
    (appState.advice || "").replace(/\n/g, " ; "),
    (appState.investigations || "").replace(/\n/g, " ; "),
    appState.followUp || "",
    appState.doctor.name || ""
  ];

  const tsv = rowData.map(v => String(v || "").replace(/[\t\r\n]/g, " ")).join("\t");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsv).catch(() => {});
  }
}

/**
 * Trigger Auto-Save to Google Sheet (Called on Download PDF)
 */
function triggerAutoSaveToSheet() {
  const webhookUrl = getWebhookUrl();

  // Save record to local browser history as permanent backup
  saveRecordToLocalLog();

  if (webhookUrl && webhookUrl.startsWith("https://script.google.com")) {
    executeSyncToSheet(webhookUrl, false);
  } else {
    // Silently copy row to clipboard for easy pasting into Google Sheet
    copyRowToClipboardSilently();
    // Prompt the user with modal so they can paste their Web App URL once
    openGoogleSheetModal(true);
  }
}

/**
 * Send prescription payload to Google Apps Script Webhook
 */
function executeSyncToSheet(webhookUrl, showInModal = false) {
  const btnSyncNow = document.getElementById("btnSyncNow");
  const statusMsg = document.getElementById("syncStatusMsg");

  if (btnSyncNow && showInModal) {
    btnSyncNow.innerHTML = `<span>Syncing to Sheet...</span>`;
    btnSyncNow.disabled = true;
  }

  const payload = {
    date: appState.patient.date || new Date().toLocaleDateString('en-GB'),
    patientName: appState.patient.name || "Unnamed Patient",
    ageSex: appState.patient.ageSex || "",
    phone: appState.patient.phone || "",
    address: appState.patient.address || "",
    drugAllergies: appState.patient.drugAllergies || "None",
    chiefComplaints: (appState.clinical.chiefComplaints || "").replace(/\n/g, " "),
    diagnosis: (appState.clinical.diagnosis || "").replace(/\n/g, " "),
    medicationsSummary: appState.medications
      .filter(m => m.name.trim().length > 0)
      .map((m, i) => `${i + 1}. ${m.name} [${m.frequency}, ${m.duration}, ${m.remarks}]`)
      .join(" | "),
    advice: (appState.advice || "").replace(/\n/g, " ; "),
    investigations: (appState.investigations || "").replace(/\n/g, " ; "),
    followUp: appState.followUp || "",
    doctorName: appState.doctor.name || ""
  };

  fetch(webhookUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    if (btnSyncNow) {
      btnSyncNow.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Synced Successfully!</span>`;
      btnSyncNow.disabled = false;
    }
    if (statusMsg) {
      statusMsg.className = "sync-status success";
      statusMsg.innerHTML = `✓ Prescription row saved to <strong>Master Receipt Sheet</strong>! Check your Google Sheet to verify.`;
      statusMsg.classList.remove("hidden");
    }
    showToast("Prescription row auto-saved to Google Sheet!");
  })
  .catch(err => {
    console.warn("Sheet sync notice:", err);
    if (btnSyncNow) {
      btnSyncNow.innerHTML = `<span>Sync Record Now</span>`;
      btnSyncNow.disabled = false;
    }
    if (statusMsg) {
      statusMsg.className = "sync-status info";
      statusMsg.textContent = "Could not reach webhook. Please verify your Apps Script URL.";
      statusMsg.classList.remove("hidden");
    }
  });
}

/**
 * Toast Notification Banner
 */
function showToast(message, allowOpenModal = false) {
  const existing = document.querySelector(".toast-notice");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-notice";
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
    <span>${message}</span>
    ${allowOpenModal ? `<button type="button" style="background:#fff;color:#0f9d58;border:none;padding:3px 8px;border-radius:4px;font-weight:700;cursor:pointer;margin-left:8px;">Setup Sheet</button>` : ''}
  `;

  if (allowOpenModal) {
    const btn = toast.querySelector("button");
    if (btn) btn.addEventListener("click", () => {
      toast.remove();
      openGoogleSheetModal();
    });
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 4500);
}

/**
 * Local record log in browser and instant cache update
 */
function saveRecordToLocalLog() {
  try {
    const p = appState.patient;
    const c = appState.clinical;
    const digits = (p.phone || "").replace(/\D/g, "").slice(-10);

    const medsSummary = appState.medications
      .filter(m => m.name.trim().length > 0)
      .map((m, i) => `${i + 1}. ${m.name} [${m.frequency}, ${m.duration}, ${m.remarks}]`)
      .join(" | ");

    const record = {
      timestamp: new Date().toISOString(),
      date: p.date || new Date().toLocaleDateString('en-GB'),
      name: p.name || "",
      ageSex: p.ageSex || "",
      phone: digits,
      address: p.address || "",
      drugAllergies: p.drugAllergies || "None",
      chiefComplaints: c.chiefComplaints || "",
      diagnosis: c.diagnosis || "",
      medicationsSummary: medsSummary,
      advice: appState.advice || "",
      investigations: appState.investigations || "",
      followUp: appState.followUp || "",
      doctorName: appState.doctor.name || ""
    };

    const records = JSON.parse(localStorage.getItem("rx_saved_records") || "[]");
    records.push(record);
    localStorage.setItem("rx_saved_records", JSON.stringify(records));

    // Update in-memory patient cache
    if (digits && p.name && p.name.toLowerCase() !== "unnamed patient") {
      cachedPatients.push(record);
      localStorage.setItem("rx_sheet_patient_records", JSON.stringify(cachedPatients));
      const statusText = document.getElementById("sheetDbStatusText");
      if (statusText) {
        statusText.textContent = `Master Sheet Connected: ${cachedPatients.length} patient records`;
      }
    }
  } catch (e) {
    console.error("Local log error:", e);
  }
}

/**
 * Generate and download CSV formatted for the Google Sheet
 */
function downloadPrescriptionCsv() {
  const p = appState.patient;
  const c = appState.clinical;
  const doc = appState.doctor;

  const medsSummary = appState.medications
    .filter(m => m.name.trim().length > 0)
    .map((m, i) => `${i + 1}. ${m.name} [${m.frequency}, ${m.duration}, ${m.remarks}]`)
    .join(" ; ");

  const headers = [
    "Timestamp",
    "Prescription Date",
    "Patient Name",
    "Age / Sex",
    "Phone",
    "Address / City",
    "Drug Allergies",
    "Chief Complaints",
    "Diagnosis",
    "Medications Summary",
    "General Advice",
    "Investigations",
    "Follow-up",
    "Doctor Name"
  ];

  const row = [
    new Date().toISOString(),
    p.date,
    p.name,
    p.ageSex,
    p.phone,
    p.address,
    p.drugAllergies,
    c.chiefComplaints,
    c.diagnosis,
    medsSummary,
    appState.advice.replace(/\n/g, " ; "),
    appState.investigations.replace(/\n/g, " ; "),
    appState.followUp,
    doc.name
  ];

  const csvContent = "\uFEFF" + [
    headers.map(escapeCsvCell).join(","),
    row.map(escapeCsvCell).join(",")
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (p.name || "Patient").replace(/[^a-zA-Z0-9_-]/g, "_");
  a.href = url;
  a.download = `Prescription_${safeName}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Load state into form inputs
 */
function loadStateIntoForm() {
  document.getElementById("inputDocName").value = appState.doctor.name || "";
  document.getElementById("inputDocDegrees").value = appState.doctor.degrees || "";
  document.getElementById("inputDocSpecialty").value = appState.doctor.specialty || "";
  document.getElementById("inputDocExp").value = appState.doctor.exp || "";
  document.getElementById("inputRegNo").value = appState.doctor.regNo || "";
  document.getElementById("inputPhone").value = appState.doctor.phone || "";
  document.getElementById("inputEmail").value = appState.doctor.email || "";
  document.getElementById("inputLocation").value = appState.doctor.location || "";

  document.getElementById("inputPatientName").value = appState.patient.name || "";
  document.getElementById("inputDate").value = appState.patient.date || new Date().toLocaleDateString('en-GB');
  document.getElementById("inputAgeSex").value = appState.patient.ageSex || "";
  document.getElementById("inputPatientAddress").value = appState.patient.address || "";
  document.getElementById("inputPatientPhone").value = appState.patient.phone || "";
  document.getElementById("inputDrugAllergies").value = appState.patient.drugAllergies || "None";

  document.getElementById("inputChiefComplaints").value = appState.clinical.chiefComplaints || "";
  document.getElementById("inputDiagnosis").value = appState.clinical.diagnosis || "";

  document.getElementById("inputGeneralAdvice").value = appState.advice || "";
  document.getElementById("inputInvestigations").value = appState.investigations || "";
  document.getElementById("inputFollowUp").value = appState.followUp || "";
  document.getElementById("inputDisclaimer").value = appState.disclaimer || "";

  const logoRadio = document.querySelector(`input[name="logoType"][value="${appState.doctor.logoType}"]`);
  if (logoRadio) logoRadio.checked = true;

  renderMedicationEditorCards();
  updateItemCountBadges();
}

/**
 * Event Listeners
 */
function setupEventListeners() {
  const textInputs = [
    { id: "inputDocName", path: "doctor.name" },
    { id: "inputDocDegrees", path: "doctor.degrees" },
    { id: "inputDocSpecialty", path: "doctor.specialty" },
    { id: "inputRegNo", path: "doctor.regNo" },
    { id: "inputPhone", path: "doctor.phone" },
    { id: "inputEmail", path: "doctor.email" },
    { id: "inputLocation", path: "doctor.location" },
    { id: "inputPatientName", path: "patient.name" },
    { id: "inputDate", path: "patient.date" },
    { id: "inputAgeSex", path: "patient.ageSex" },
    { id: "inputPatientAddress", path: "patient.address" },
    { id: "inputPatientPhone", path: "patient.phone" },
    { id: "inputDrugAllergies", path: "patient.drugAllergies" },
    { id: "inputFollowUp", path: "followUp" },
    { id: "inputDocExp", path: "doctor.exp" },
    { id: "inputChiefComplaints", path: "clinical.chiefComplaints" },
    { id: "inputDiagnosis", path: "clinical.diagnosis" },
    { id: "inputGeneralAdvice", path: "advice" },
    { id: "inputInvestigations", path: "investigations" },
    { id: "inputDisclaimer", path: "disclaimer" }
  ];

  textInputs.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      if (item.id === "inputPatientPhone" || item.id === "inputPhone") {
        el.setAttribute("maxlength", "10");
        el.addEventListener("keypress", (e) => {
          // Block non-digit keys except control shortcuts
          if (!/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
            e.preventDefault();
          }
        });
      }

      if (item.id === "inputPatientPhone") {
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const digitsOnly = el.value.replace(/\D/g, "").slice(0, 10);
            if (digitsOnly.length === 10) {
              const match = searchPatientByPhone(digitsOnly);
              if (match) {
                autoFillPatientDetails(match, true);
              } else {
                showToast(`No record found in Sheet for phone: ${digitsOnly}`);
              }
            }
          }
        });
      }

      el.addEventListener("input", (e) => {
        let val = e.target.value;
        if (item.id === "inputPatientPhone" || item.id === "inputPhone") {
          // Strictly keep only digits and slice to max 10 digits
          const digitsOnly = val.replace(/\D/g, "").slice(0, 10);
          if (val !== digitsOnly) {
            e.target.value = digitsOnly;
            val = digitsOnly;
          }

          // Real-time Sheet Auto-Fetch as soon as 10 digits are typed
          if (item.id === "inputPatientPhone") {
            const badge = document.getElementById("phoneLookupBadge");
            const card = document.getElementById("patientFoundCard");

            if (digitsOnly.length === 10) {
              if (badge) {
                badge.className = "phone-status-badge searching";
                badge.textContent = "Searching sheet...";
                badge.classList.remove("hidden");
              }

              const match = searchPatientByPhone(digitsOnly);
              if (match) {
                autoFillPatientDetails(match, true);
              } else {
                if (badge) {
                  badge.className = "phone-status-badge not-found";
                  badge.textContent = "New Patient (Not in sheet)";
                  badge.classList.remove("hidden");
                }
                if (card) {
                  card.classList.add("hidden");
                }
              }
            } else {
              if (badge) badge.classList.add("hidden");
              if (card) card.classList.add("hidden");
            }
          }
        }
        setDeepValue(appState, item.path, e.target.value);
        renderAllPages();
      });
    }
  });

  // Add Medicine Row
  const addSingleMed = () => {
    appState.medications.push({
      name: "",
      frequency: "",
      duration: "",
      remarks: ""
    });
    renderMedicationEditorCards();
    renderAllPages();
  };

  document.getElementById("btnAddMed").addEventListener("click", addSingleMed);
  document.getElementById("btnAddMedBottom").addEventListener("click", addSingleMed);

  // Load Sample Data (if button present)
  const btnLoadSample = document.getElementById("btnLoadSample");
  if (btnLoadSample) {
    btnLoadSample.addEventListener("click", () => {
      if (confirm("Load sample prescription data (Dr. Aparna T & Salil Garg)?")) {
        appState = JSON.parse(JSON.stringify(SAMPLE_DATA));
        loadStateIntoForm();
        renderAllPages();
      }
    });
  }

  // Clear Form
  document.getElementById("btnClearForm").addEventListener("click", () => {
    if (confirm("Clear form for a new patient?")) {
      const savedDoc = { ...appState.doctor };
      appState = JSON.parse(JSON.stringify(CLEAN_DEFAULT_DATA));
      appState.doctor = savedDoc;
      loadStateIntoForm();
      renderAllPages();
    }
  });

  // Print & PDF
  document.getElementById("btnPrint").addEventListener("click", () => window.print());
  document.getElementById("btnDownloadPdf").addEventListener("click", downloadPDF);

  // Zoom
  document.getElementById("btnZoomIn").addEventListener("click", () => adjustZoom(0.05));
  document.getElementById("btnZoomOut").addEventListener("click", () => adjustZoom(-0.05));
  document.getElementById("btnZoomReset").addEventListener("click", autoFitZoom);
}

/**
 * Zoom logic
 */
function adjustZoom(delta) {
  currentZoom = Math.min(Math.max(0.35, currentZoom + delta), 1.4);
  applyZoom();
}

function autoFitZoom() {
  const stage = document.getElementById("previewStage");
  if (!stage) return;
  const stageWidth = stage.clientWidth - 28;
  const targetWidth = 794;
  if (stageWidth < 500) {
    currentZoom = Math.max(0.35, Math.min(0.55, stageWidth / targetWidth));
  } else {
    currentZoom = Math.min(0.9, Math.max(0.45, stageWidth / targetWidth));
  }
  applyZoom();
}

function applyZoom() {
  const wrapper = document.getElementById("pagesWrapper");
  if (wrapper) {
    wrapper.style.transform = `scale(${currentZoom})`;
  }
  const zoomVal = document.getElementById("zoomVal");
  if (zoomVal) {
    zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

function updateItemCountBadges() {
  const count = appState.medications.length;
  const badge = document.getElementById("medCountBadge");
  if (badge) badge.textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
}

/**
 * Render Medication Editor Cards
 */
function renderMedicationEditorCards() {
  const container = document.getElementById("medicationsContainer");
  container.innerHTML = "";

  appState.medications.forEach((med, index) => {
    const card = document.createElement("div");
    card.className = "med-card";

    card.innerHTML = `
      <div class="med-card-header">
        <span class="med-index-badge">Item #${index + 1}</span>
        ${appState.medications.length > 1 ? `
        <button type="button" class="btn-remove-med" data-index="${index}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>` : ''}
      </div>

      <div class="med-grid-inputs">
        <input type="text" placeholder="Medicine / Product Name" class="med-inp-name" value="${escapeHtml(med.name)}" />
        <input type="text" placeholder="Dosage / Frequency (OD, BD, etc.)" class="med-inp-freq" value="${escapeHtml(med.frequency)}" />
      </div>

      <div class="med-grid-inputs">
        <input type="text" placeholder="Duration (e.g. 7 days)" class="med-inp-dur" value="${escapeHtml(med.duration)}" />
        <input type="text" placeholder="Remarks (e.g. After meals)" class="med-inp-rem" value="${escapeHtml(med.remarks)}" />
      </div>
    `;

    const inpName = card.querySelector(".med-inp-name");
    const inpFreq = card.querySelector(".med-inp-freq");
    const inpDur = card.querySelector(".med-inp-dur");
    const inpRem = card.querySelector(".med-inp-rem");

    inpName.addEventListener("input", (e) => {
      appState.medications[index].name = e.target.value;
      renderAllPages();
    });
    inpFreq.addEventListener("input", (e) => {
      appState.medications[index].frequency = e.target.value;
      renderAllPages();
    });
    inpDur.addEventListener("input", (e) => {
      appState.medications[index].duration = e.target.value;
      renderAllPages();
    });
    inpRem.addEventListener("input", (e) => {
      appState.medications[index].remarks = e.target.value;
      renderAllPages();
    });

    const removeBtn = card.querySelector(".btn-remove-med");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        appState.medications.splice(index, 1);
        renderMedicationEditorCards();
        renderAllPages();
      });
    }

    container.appendChild(card);
  });

  updateItemCountBadges();
}

/**
 * =========================================================================
 * CORE MULTI-PAGE PAGINATION ENGINE
 * Natural top-to-bottom layout on both Page 1 and Page 2 without empty gaps!
 * =========================================================================
 */
function renderAllPages() {
  const pagesWrapper = document.getElementById("pagesWrapper");
  if (!pagesWrapper) return;
  pagesWrapper.innerHTML = "";

  const totalMeds = appState.medications.length;
  const pageBatches = [];

  if (totalMeds <= 10) {
    // Fits cleanly on 1 single page with advice, investigations & follow-up
    pageBatches.push({
      pageIndex: 0,
      meds: appState.medications.slice(0),
      startIndex: 0,
      isFirst: true,
      isLast: true
    });
  } else {
    // Multi-page mode:
    // Ensure Page 1 holds up to 14 meds, and subsequent pages receive balanced counts
    const page1Count = Math.min(14, Math.max(8, totalMeds - 3));
    const FINAL_PAGE_CAPACITY = 16;
    const MIDDLE_PAGE_CAPACITY = 18;

    // Page 1 Batch
    pageBatches.push({
      pageIndex: 0,
      meds: appState.medications.slice(0, page1Count),
      startIndex: 0,
      isFirst: true,
      isLast: false
    });

    let currentOffset = page1Count;

    while (currentOffset < totalMeds) {
      const remaining = totalMeds - currentOffset;

      if (remaining <= FINAL_PAGE_CAPACITY) {
        // Fits on final page with bottom advice & investigations
        pageBatches.push({
          pageIndex: pageBatches.length,
          meds: appState.medications.slice(currentOffset),
          startIndex: currentOffset,
          isFirst: false,
          isLast: true
        });
        break;
      } else {
        const take = Math.min(MIDDLE_PAGE_CAPACITY, remaining);
        const willBeLast = (currentOffset + take >= totalMeds);

        pageBatches.push({
          pageIndex: pageBatches.length,
          meds: appState.medications.slice(currentOffset, currentOffset + take),
          startIndex: currentOffset,
          isFirst: false,
          isLast: willBeLast
        });

        currentOffset += take;
      }
    }

    if (pageBatches.length > 0) {
      pageBatches[pageBatches.length - 1].isLast = true;
    }
  }

  const totalPages = pageBatches.length;

  pageBatches.forEach((batch, idx) => {
    const pageNum = idx + 1;
    const pageEl = document.createElement("div");
    pageEl.className = "prescription-page";
    pageEl.id = `prescriptionPage_${pageNum}`;

    pageEl.innerHTML = buildPageHtml(batch, pageNum, totalPages);
    pagesWrapper.appendChild(pageEl);
  });

  const indicatorText = `${totalPages} ${totalPages === 1 ? 'Page' : 'Pages'} (A4 Portrait)`;
  document.getElementById("pageIndicatorText").textContent = indicatorText;
  document.getElementById("pageCountSummary").textContent = `Prescription (${indicatorText})`;
  document.getElementById("tabPreviewLabel").textContent = `2. View Receipt (${totalPages} ${totalPages === 1 ? 'Page' : 'Pages'})`;
  const splitNotice = document.getElementById("pageSplitNotice");
  if (splitNotice) {
    splitNotice.textContent = totalPages > 1 
      ? `Active: Split across ${totalPages} A4 pages with automatic continuation headers`
      : `Fits comfortably on 1 A4 page`;
  }
}

/**
 * Build HTML for an individual A4 Page
 */
function buildPageHtml(batch, pageNum, totalPages) {
  let html = BOTANICAL_SVG;

  // Header
  if (batch.isFirst) {
    html += buildFullDoctorHeader();
    html += `<hr class="rx-divider" />`;
    html += buildPatientSection();
    html += buildClinicalSection();
  } else {
    html += buildContinuationHeader(pageNum, totalPages);
  }

  // Prescription Meds Table
  html += buildMedsTable(batch.meds, batch.startIndex, batch.isFirst);

  // Bottom Section (Advice, Investigations, Follow-up, Disclaimer) on Last Page
  // In style.css, .rx-bottom-split sits right below table with 14px gap (no huge empty space!)
  if (batch.isLast) {
    html += buildBottomSection();
    html += buildFooterDisclaimer(pageNum, totalPages);
  } else {
    html += `
      <div class="continued-footer-tag">
        * Continued on Page ${pageNum + 1} &rarr;
      </div>
      <div class="page-number-footer">Page ${pageNum} of ${totalPages}</div>
    `;
  }

  return html;
}

/**
 * Doctor Full Header for Page 1
 */
function buildFullDoctorHeader() {
  const doc = appState.doctor;
  let logoSvg = `<img src="doctor_logo.png" class="rx-custom-logo rx-exact-logo" alt="Doctor Profile Logo" style="width:100%;height:100%;object-fit:contain;display:block;" />`;
  if (doc.logoType === "caduceus") {
    logoSvg = CADUCEUS_SVG;
  } else if (doc.logoType === "custom" && customLogoDataUrl) {
    logoSvg = `<img src="${customLogoDataUrl}" class="rx-custom-logo" alt="Doctor Logo" />`;
  }

  const expLines = (doc.exp || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const expHtml = expLines.map(l => `<li>${escapeHtml(l)}</li>`).join("");

  return `
    <header class="rx-header">
      <div class="rx-doc-info">
        <div class="rx-logo-container">${logoSvg}</div>
        <div class="rx-doc-text">
          <h2 class="rx-doc-name">${escapeHtml(doc.name || "Dr. Name")}</h2>
          <div class="rx-doc-degrees">${escapeHtml(doc.degrees || "")}</div>
          <div class="rx-doc-specialty">${escapeHtml(doc.specialty || "")}</div>
          <ul class="rx-doc-exp">${expHtml}</ul>
        </div>
      </div>

      <div class="rx-contact-info">
        <div class="rx-contact-item">
          <span class="rx-contact-icon medical-icon">
            <svg viewBox="0 0 24 32" width="18" height="24" fill="#6d4f3b" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:24px;display:inline-block;vertical-align:middle;">
              <path d="M12 1.5 a2 2 0 1 0 0.001 0z M11 4.5 h2 v24 h-2 z" fill="#6d4f3b"/>
              <path d="M12 5.5 C7 1.5, 2 4.5, 1 7.5 C4 8.5, 8 7.5, 12 9.5 Z" fill="#6d4f3b"/>
              <path d="M12 5.5 C17 1.5, 22 4.5, 23 7.5 C20 8.5, 16 7.5, 12 9.5 Z" fill="#6d4f3b"/>
              <path d="M6.5 9.5 C3.5 11.5, 4.5 15.5, 12 16.5 C19.5 17.5, 20.5 21.5, 16.5 24.5 C13.5 26.5, 10.5 24.5, 12 22.5" fill="none" stroke="#6d4f3b" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M17.5 9.5 C20.5 11.5, 19.5 15.5, 12 16.5 C4.5 17.5, 3.5 21.5, 7.5 24.5 C10.5 26.5, 13.5 24.5, 12 22.5" fill="none" stroke="#6d4f3b" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="rx-contact-text">${escapeHtml(doc.regNo || "")}</span>
        </div>
        <div class="rx-contact-item">
          <span class="rx-contact-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="#6d4f3b" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:16px;display:inline-block;vertical-align:middle;">
              <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.72 11.72 0 0 0 3.67.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.72 11.72 0 0 0 .59 3.67 1 1 0 0 1-.24 1.02l-2.23 2.1z" fill="#6d4f3b"/>
            </svg>
          </span>
          <span class="rx-contact-text">${escapeHtml(doc.phone || "")}</span>
        </div>
        <div class="rx-contact-item">
          <span class="rx-contact-icon">
            <svg viewBox="0 0 24 24" width="17" height="15" fill="none" stroke="#6d4f3b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="width:17px;height:15px;display:inline-block;vertical-align:middle;">
              <rect x="2" y="4" width="20" height="16" rx="2" stroke="#6d4f3b" fill="none" stroke-width="2"/>
              <polyline points="22 7 12 14 2 7" stroke="#6d4f3b" stroke-width="2"/>
            </svg>
          </span>
          <span class="rx-contact-text">${escapeHtml(doc.email || "")}</span>
        </div>
        <div class="rx-contact-item">
          <span class="rx-contact-icon">
            <svg viewBox="0 0 24 24" width="16" height="18" fill="#6d4f3b" xmlns="http://www.w3.org/2000/svg" style="width:16px;height:18px;display:inline-block;vertical-align:middle;">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 7.13 11.45 7.43 11.71a.88.88 0 0 0 1.14 0C12.87 21.45 20 15.25 20 10c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" fill="#6d4f3b"/>
            </svg>
          </span>
          <span class="rx-contact-text">${escapeHtml(doc.location || "")}</span>
        </div>
      </div>
    </header>
  `;
}

/**
 * Continuation Header for Pages 2+
 */
function buildContinuationHeader(pageNum, totalPages) {
  const doc = appState.doctor;
  const p = appState.patient;

  return `
    <div class="rx-continuation-header">
      <div class="cont-left">
        <span class="cont-doc-name">${escapeHtml(doc.name || "Doctor")}</span>
        <span class="cont-doc-sub">${escapeHtml(doc.specialty || "Medical Prescription")} &bull; ${escapeHtml(doc.regNo || "")}</span>
      </div>
      <div class="cont-right">
        <span class="cont-patient-badge">Patient: ${escapeHtml(p.name || "Patient")} ${p.ageSex ? `(${escapeHtml(p.ageSex)})` : ''}</span>
        <span class="cont-date-badge">Date: ${escapeHtml(p.date || "")} &bull; Page ${pageNum} of ${totalPages}</span>
      </div>
    </div>
  `;
}

/**
 * Patient Details Grid
 */
function buildPatientSection() {
  const p = appState.patient;
  return `
    <section class="rx-patient-section">
      <div class="rx-patient-col">
        <div class="rx-field-row">
          <span class="rx-field-label">Patient Name</span>
          <span class="rx-field-colon">:</span>
          <div class="rx-field-underline"><span class="rx-field-val">${escapeHtml(p.name)}</span></div>
        </div>
        <div class="rx-field-row">
          <span class="rx-field-label">Age / Sex</span>
          <span class="rx-field-colon">:</span>
          <div class="rx-field-underline"><span class="rx-field-val">${escapeHtml(p.ageSex)}</span></div>
        </div>
        <div class="rx-field-row">
          <span class="rx-field-label">Phone No.</span>
          <span class="rx-field-colon">:</span>
          <div class="rx-field-underline"><span class="rx-field-val">${escapeHtml(p.phone)}</span></div>
        </div>
      </div>

      <div class="rx-patient-col">
        <div class="rx-field-row">
          <span class="rx-field-label">Date</span>
          <span class="rx-field-colon">:</span>
          <div class="rx-field-underline"><span class="rx-field-val">${escapeHtml(p.date)}</span></div>
        </div>
        <div class="rx-field-row">
          <span class="rx-field-label">Address (City)</span>
          <span class="rx-field-colon">:</span>
          <div class="rx-field-underline"><span class="rx-field-val">${escapeHtml(p.address)}</span></div>
        </div>
        <div class="rx-field-row">
          <span class="rx-field-label">Drug Allergies</span>
          <span class="rx-field-colon">:</span>
          <div class="rx-field-underline"><span class="rx-field-val">${escapeHtml(p.drugAllergies)}</span></div>
        </div>
      </div>
    </section>
  `;
}

/**
 * Chief Complaints and Diagnosis Sections
 */
function buildClinicalSection() {
  const c = appState.clinical;
  return `
    <section class="rx-banner-section">
      <div class="rx-banner-pill">Chief Complaints</div>
      <div class="rx-ruled-box">
        ${buildRuledLinesHtml(c.chiefComplaints, 3)}
      </div>
    </section>

    <section class="rx-banner-section">
      <div class="rx-banner-pill">Diagnosis / Assessment</div>
      <div class="rx-ruled-box">
        ${buildRuledLinesHtml(c.diagnosis, 3)}
      </div>
    </section>
  `;
}

/**
 * Build Rx Medications Table for this page batch
 */
function buildMedsTable(meds, startIndex, isFirst) {
  let rowsHtml = "";
  meds.forEach((med, i) => {
    const sr = startIndex + i + 1;
    rowsHtml += `
      <tr>
        <td class="col-sr">${sr}</td>
        <td class="col-med">${escapeHtml(med.name)}</td>
        <td class="col-freq">${escapeHtml(med.frequency)}</td>
        <td class="col-dur">${escapeHtml(med.duration)}</td>
        <td class="col-rem">${escapeHtml(med.remarks)}</td>
      </tr>
    `;
  });

  if (meds.length === 0) {
    rowsHtml = `<tr><td class="col-sr">1</td><td class="col-med">&nbsp;</td><td class="col-freq"></td><td class="col-dur"></td><td class="col-rem"></td></tr>`;
  }

  return `
    <section class="rx-meds-section">
      <div class="rx-symbol-wrap">
        <span class="rx-symbol-text">℞</span>
      </div>

      <table class="rx-table">
        <thead>
          <tr>
            <th class="col-sr">Serial number</th>
            <th class="col-med">Medicine / Product</th>
            <th class="col-freq">Dosage / Frequency</th>
            <th class="col-dur">Duration</th>
            <th class="col-rem">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </section>
  `;
}

/**
 * Bottom Section (Advice, Investigations, Follow-up)
 * Positioned right below the table with a clean 14px gap (No awkward chasm!)
 */
function buildBottomSection() {
  return `
    <section class="rx-bottom-split">
      <div class="rx-bottom-col">
        <div class="rx-banner-pill">General Advice / Skin Care</div>
        <div class="rx-ruled-box">
          ${buildRuledLinesHtml(appState.advice, 4)}
        </div>
      </div>

      <div class="rx-bottom-col">
        <div class="rx-banner-pill">
          Investigations / Procedures / Referral
          <span class="sub-pill">(if advised)</span>
        </div>
        <div class="rx-ruled-box">
          ${buildRuledLinesHtml(appState.investigations, 4)}
        </div>
      </div>
    </section>

    <section class="rx-followup-section">
      <div class="rx-followup-label-wrap">
        <div class="cal-icon-box">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#7a5539" stroke-width="2" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;display:inline-block;vertical-align:middle;">
            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        </div>
        <span class="followup-title">Follow-up</span>
        <span class="followup-colon">:</span>
      </div>
      <div class="rx-followup-underline">
        <span class="followup-val">${escapeHtml(appState.followUp)}</span>
      </div>
    </section>
  `;
}

/**
 * Footer Disclaimer (Pinned to bottom edge)
 */
function buildFooterDisclaimer(pageNum, totalPages) {
  return `
    <footer class="rx-footer">
      <hr class="rx-footer-rule" />
      <p class="rx-disclaimer-text">${escapeHtml(appState.disclaimer).replace(/\n/g, '<br/>')}</p>
      <div class="page-number-footer">Page ${pageNum} of ${totalPages}</div>
    </footer>
  `;
}

/**
 * Ruled lines generator
 */
function buildRuledLinesHtml(textContent, minLines = 3) {
  const lines = (textContent || "").split("\n").map(l => l.trim()).filter(l => l.length > 0);
  let html = "";
  lines.forEach(line => {
    html += `<div class="rx-ruled-line filled">${escapeHtml(line)}</div>`;
  });
  const remaining = Math.max(0, minLines - lines.length);
  for (let i = 0; i < remaining; i++) {
    html += `<div class="rx-ruled-line blank"></div>`;
  }
  return html;
}

/**
 * Multi-Page High Quality PDF Export
 * Automatically triggers Google Sheet Auto-Save!
 */
function downloadPDF() {
  const wrapper = document.getElementById("pagesWrapper");
  if (!wrapper) return;

  // 1. TRIGGER GOOGLE SHEET AUTO-SAVE WHEN USER CLICKS DOWNLOAD PDF
  triggerAutoSaveToSheet();

  const btn = document.getElementById("btnDownloadPdf");
  const floatBtn = document.getElementById("floatDownloadBtn");
  const originalText = btn ? btn.innerHTML : "";
  if (btn) {
    btn.innerHTML = `<span>Exporting PDF...</span>`;
    btn.disabled = true;
  }
  if (floatBtn) {
    floatBtn.disabled = true;
  }

  // Ensure preview pane is visible during capture even if user was on mobile editor tab
  const previewPane = document.querySelector(".preview-pane");
  const originalPreviewDisplay = previewPane ? previewPane.style.display : "";
  if (previewPane && window.getComputedStyle(previewPane).display === "none") {
    previewPane.style.display = "flex";
  }

  const originalTransform = wrapper.style.transform;
  const originalGap = wrapper.style.gap;

  wrapper.style.transform = "none";
  wrapper.style.gap = "0px";

  const pages = wrapper.querySelectorAll(".prescription-page");
  pages.forEach(p => {
    p.style.boxShadow = "none";
    p.style.height = "296.5mm";
    p.style.minHeight = "296.5mm";
    p.style.maxHeight = "296.5mm";
    p.style.margin = "0px";
  });

  const patientName = (appState.patient.name || "Patient").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dateStr = (appState.patient.date || "Prescription").replace(/[\/\\:]/g, "-");
  const fileName = `Prescription_${patientName}_${dateStr}.pdf`;

  const opt = {
    margin: 0,
    filename: fileName,
    image: { type: "jpeg", quality: 0.98 },
    pagebreak: {
      mode: ['css'],
      before: '.prescription-page:not(:first-child)'
    },
    html2canvas: {
      scale: 2,
      useCORS: true,
      scrollY: 0,
      scrollX: 0
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait"
    }
  };

  function restoreStyles() {
    if (previewPane) {
      previewPane.style.display = originalPreviewDisplay;
    }
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
    if (floatBtn) {
      floatBtn.disabled = false;
    }
    wrapper.style.transform = originalTransform;
    wrapper.style.gap = originalGap;
    pages.forEach(p => {
      p.style.boxShadow = "";
      p.style.height = "";
      p.style.minHeight = "";
      p.style.maxHeight = "";
      p.style.margin = "";
    });
  }

  const generate = () => {
    html2pdf()
      .set(opt)
      .from(wrapper)
      .save()
      .then(() => {
        restoreStyles();
      })
      .catch(err => {
        console.error("PDF generation error:", err);
        restoreStyles();
        window.print();
      });
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(generate).catch(generate);
  } else {
    setTimeout(generate, 100);
  }
}

function setDeepValue(obj, path, value) {
  const parts = path.split(".");
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!curr[parts[i]]) curr[parts[i]] = {};
    curr = curr[parts[i]];
  }
  curr[parts[parts.length - 1]] = value;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
