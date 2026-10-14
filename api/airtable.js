// api/airtable.js
// Serverfunctie voor Vercel: bewaart de Airtable-token en stuurt enkel
// toegelaten vragen door naar Airtable. De browser ziet de token nooit.
//
// Instellen in Vercel (Project → Settings → Environment Variables):
//   AIRTABLE_TOKEN   = je Airtable personal access token
//   AIRTABLE_BASE_ID = het ID van je base (begint met "app...")

// ─────────────────────────────────────────────────────────────
// 1. PAS DIT AAN: welke tabellen mag je tool gebruiken, en wat mag ermee?
//    - read / create / update / remove: true of false
//    - fields: lijst van veldnamen die gelezen/geschreven mogen worden,
//              of null om alle velden toe te laten (minder veilig)
// ─────────────────────────────────────────────────────────────
const TOEGELATEN = {
  "Aanvragen": {
    read: true,
    create: true,
    update: false,
    remove: false,
    fields: null, // bv. ["Naam", "School", "Datum", "Opmerking"]
  },
  // "Andere tabel": { read: true, create: false, update: false, remove: false, fields: ["Naam"] },
};

// ─────────────────────────────────────────────────────────────
// 2. Vanaf hier hoef je normaal niets te veranderen
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) {
    return res.status(500).json({ error: "Serverconfiguratie ontbreekt (token of base-ID)." });
  }

  const tabel = req.query.table;
  const regels = TOEGELATEN[tabel];
  if (!regels) {
    return res.status(403).json({ error: "Deze tabel is niet toegelaten." });
  }

  const basisUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabel)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let url;
  let opties;

  switch (req.method) {
    case "GET": {
      if (!regels.read) return weiger(res);
      const params = new URLSearchParams();
      for (const sleutel of ["view", "filterByFormula", "maxRecords", "pageSize", "offset"]) {
        if (req.query[sleutel]) params.set(sleutel, String(req.query[sleutel]));
      }
      if (req.query.sortField) {
        params.set("sort[0][field]", String(req.query.sortField));
        params.set("sort[0][direction]", req.query.sortDir === "desc" ? "desc" : "asc");
      }
      (regels.fields || []).forEach((veld) => params.append("fields[]", veld));
      url = `${basisUrl}?${params.toString()}`;
      opties = { method: "GET", headers };
      break;
    }

    case "POST": {
      if (!regels.create) return weiger(res);
      const fields = filterVelden(req.body?.fields, regels.fields);
      if (!fields) return res.status(400).json({ error: "Geen geldige velden meegestuurd." });
      url = basisUrl;
      opties = { method: "POST", headers, body: JSON.stringify({ fields }) };
      break;
    }

    case "PATCH": {
      if (!regels.update) return weiger(res);
      const id = req.query.id;
      if (!isRecordId(id)) return res.status(400).json({ error: "Ongeldig record-ID." });
      const fields = filterVelden(req.body?.fields, regels.fields);
      if (!fields) return res.status(400).json({ error: "Geen geldige velden meegestuurd." });
      url = `${basisUrl}/${id}`;
      opties = { method: "PATCH", headers, body: JSON.stringify({ fields }) };
      break;
    }

    case "DELETE": {
      if (!regels.remove) return weiger(res);
      const id = req.query.id;
      if (!isRecordId(id)) return res.status(400).json({ error: "Ongeldig record-ID." });
      url = `${basisUrl}/${id}`;
      opties = { method: "DELETE", headers };
      break;
    }

    default:
      res.setHeader("Allow", "GET, POST, PATCH, DELETE");
      return res.status(405).json({ error: "Methode niet toegelaten." });
  }

  try {
    const antwoord = await fetch(url, opties);
    const data = await antwoord.json();
    if (!antwoord.ok) {
      // Details enkel in de Vercel-logs, niet naar de browser
      console.error("Airtable-fout:", antwoord.status, JSON.stringify(data));
      return res.status(antwoord.status).json({ error: "Airtable gaf een fout terug." });
    }
    return res.status(200).json(data);
  } catch (fout) {
    console.error("Serverfout:", fout);
    return res.status(500).json({ error: "Er ging iets mis op de server." });
  }
}

function weiger(res) {
  return res.status(403).json({ error: "Deze actie is niet toegelaten." });
}

// Houdt enkel de toegelaten velden over
function filterVelden(fields, toegelaten) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  if (!toegelaten) return fields;
  const resultaat = {};
  for (const [naam, waarde] of Object.entries(fields)) {
    if (toegelaten.includes(naam)) resultaat[naam] = waarde;
  }
  return Object.keys(resultaat).length ? resultaat : null;
}

// Airtable record-ID's zien eruit als "rec" + 14 tekens
function isRecordId(id) {
  return typeof id === "string" && /^rec[a-zA-Z0-9]{14}$/.test(id);
}
