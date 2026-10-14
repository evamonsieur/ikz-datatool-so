// airtable-client.js
// Hulpfuncties voor je HTML-pagina. Deze praten met je eigen serverfunctie
// (/api/airtable) in plaats van rechtstreeks met Airtable. Geen token nodig.
//
// Voeg in je HTML toe, vóór je eigen script:
//   <script src="airtable-client.js"></script>

const AIRTABLE_API = "/api/airtable";

async function airtableCall(url, opties = {}) {
  const antwoord = await fetch(url, {
    ...opties,
    headers: { "Content-Type": "application/json", ...(opties.headers || {}) },
  });
  const data = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok) {
    throw new Error(data.error || `Fout ${antwoord.status}`);
  }
  return data;
}

// Alle records ophalen (haalt automatisch alle pagina's op)
// opties: { view, filterByFormula, maxRecords, sortField, sortDir }
async function haalRecords(tabel, opties = {}) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({ table: tabel });
    for (const [sleutel, waarde] of Object.entries(opties)) {
      if (waarde !== undefined && waarde !== null) params.set(sleutel, waarde);
    }
    if (offset) params.set("offset", offset);
    const data = await airtableCall(`${AIRTABLE_API}?${params}`);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

// Nieuw record toevoegen
async function maakRecord(tabel, fields) {
  const params = new URLSearchParams({ table: tabel });
  return airtableCall(`${AIRTABLE_API}?${params}`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
}

// Bestaand record wijzigen
async function wijzigRecord(tabel, id, fields) {
  const params = new URLSearchParams({ table: tabel, id });
  return airtableCall(`${AIRTABLE_API}?${params}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

// Record verwijderen
async function verwijderRecord(tabel, id) {
  const params = new URLSearchParams({ table: tabel, id });
  return airtableCall(`${AIRTABLE_API}?${params}`, { method: "DELETE" });
}
