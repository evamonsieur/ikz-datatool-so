// api/auth.js — aanmelden, afmelden, sessie controleren, wachtwoord wijzigen
//   POST /api/auth?action=login      { email, password }
//   POST /api/auth?action=logout
//   GET  /api/auth?action=me
//   POST /api/auth?action=wachtwoord { nieuw }

import {
  alleRecords, haalRecord, wijzigRecord, formuleTekst,
  hashWachtwoord, controleerWachtwoord, isGehasht,
  zetSessie, wisSessie, leesSessie, vereisSessie,
  isCoordinator, HttpFout, metFoutafhandeling, body,
} from "./_lib.js";

export default metFoutafhandeling(async (req, res) => {
  const actie = req.query.action;

  if (actie === "login" && req.method === "POST") return login(req, res);
  if (actie === "logout" && req.method === "POST") { wisSessie(res); return res.status(200).json({ ok: true }); }
  if (actie === "me" && req.method === "GET") return mij(req, res);
  if (actie === "wachtwoord" && req.method === "POST") return wachtwoord(req, res);

  throw new HttpFout(404, "Onbekende actie.");
});

async function login(req, res) {
  const { email, password } = body(req);
  if (typeof email !== "string" || typeof password !== "string" || !email || !password || email.length > 200) {
    throw new HttpFout(400, "E-mailadres en wachtwoord zijn verplicht.");
  }

  const records = await alleRecords("Gebruikers", {
    filterByFormula: `LOWER({DirecteurEmail})=LOWER(${formuleTekst(email.trim())})`,
    maxRecords: "5",
  });
  const rec = records.find((r) => controleerWachtwoord(password, r.fields.Wachtwoord_Hash));

  if (!rec) {
    await new Promise((r) => setTimeout(r, 600)); // remt het raden van wachtwoorden af
    throw new HttpFout(401, "Ongeldig e-mailadres of wachtwoord.");
  }

  const f = rec.fields;
  const update = { Laatste_Login: new Date().toISOString() };
  // Oud, leesbaar wachtwoord? Meteen omzetten naar een veilige hash.
  if (!isGehasht(f.Wachtwoord_Hash)) update.Wachtwoord_Hash = hashWachtwoord(password);
  await wijzigRecord("Gebruikers", rec.id, update).catch((e) => console.error("Login-update mislukt", e));

  const scholen = await scholenVan(f.Scholen || []);
  const gebruiker = {
    id: rec.id,
    recordId: rec.id,
    email: f.DirecteurEmail,
    name: f.Name || f.Naam || f.DirecteurEmail,
    role: f.Rol || "School",
    scholen,
    mustChangePw: !f.Wachtwoord_Gewijzigd,
  };

  zetSessie(res, { uid: rec.id, rol: gebruiker.role, scholen: scholen.map((s) => s.id) });
  return res.status(200).json({ user: gebruiker });
}

async function mij(req, res) {
  const s = leesSessie(req);
  if (!s) throw new HttpFout(401, "Niet aangemeld.");
  return res.status(200).json({ uid: s.uid, role: s.rol, coordinator: isCoordinator(s.rol) });
}

async function wachtwoord(req, res) {
  const s = vereisSessie(req);
  const { nieuw } = body(req);
  if (typeof nieuw !== "string" || nieuw.length < 8 || nieuw.length > 200) {
    throw new HttpFout(400, "Wachtwoord moet minstens 8 tekens bevatten.");
  }
  await wijzigRecord("Gebruikers", s.uid, {
    Wachtwoord_Hash: hashWachtwoord(nieuw),
    Wachtwoord_Gewijzigd: true,
  });
  return res.status(200).json({ ok: true });
}

async function scholenVan(ids) {
  const scholen = [];
  for (const id of ids) {
    try {
      const r = await haalRecord("Scholen", id);
      scholen.push({ id, name: r.fields?.Name || id, code: r.fields?.SchoolCode || id });
    } catch (e) {
      console.error("School niet geladen", id);
    }
  }
  return scholen;
}
