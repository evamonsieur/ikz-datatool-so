// api/data.js — gegevens lezen en opslaan. Elke vraag wordt gecontroleerd:
// een directeur ziet en bewerkt enkel de eigen school(en), een coördinator alle scholen.
//   GET  /api/data?action=schooljaren
//   GET  /api/data?action=scholen
//   GET  /api/data?action=maand&maand=september&school=recXXX
//   POST /api/data?action=maand-opslaan    { maand, school, schooljaar, fields }
//   GET  /api/data?action=bijlagen&maand=september&school=recXXX
//   POST /api/data?action=bijlage-opslaan  { maand, school, schooljaar, sectie, link, notitie }

import {
  MAANDEN, alleRecords, maakRecord, wijzigRecord, isRecordId,
  vereisSessie, vereisSchool, isCoordinator, HttpFout, metFoutafhandeling, body,
} from "./_lib.js";

export default metFoutafhandeling(async (req, res) => {
  const sessie = vereisSessie(req);
  const actie = req.query.action;
  const get = req.method === "GET";
  const post = req.method === "POST";

  if (actie === "schooljaren" && get) return schooljaren(res);
  if (actie === "scholen" && get) return scholen(sessie, res);
  if (actie === "maand" && get) return maandLezen(sessie, req.query, res);
  if (actie === "maand-opslaan" && post) return maandOpslaan(sessie, body(req), res);
  if (actie === "bijlagen" && get) return bijlagenLezen(sessie, req.query, res);
  if (actie === "bijlage-opslaan" && post) return bijlageOpslaan(sessie, body(req), res);

  throw new HttpFout(404, "Onbekende actie.");
});

function maandInfo(maand) {
  const info = MAANDEN[String(maand || "").toLowerCase()];
  if (!info) throw new HttpFout(400, "Onbekende maand.");
  return info;
}

const bevatId = (veld, id) => Array.isArray(veld) && veld.includes(id);

async function schooljaren(res) {
  const records = await alleRecords("Schooljaren", { "fields[]": ["Name", "Jaar", "Huidig"] });
  return res.status(200).json({ records: records.map(({ id, fields }) => ({ id, fields })) });
}

async function scholen(sessie, res) {
  const records = await alleRecords("Scholen", {
    filterByFormula: "{Actief}=1",
    "fields[]": ["Name", "SchoolCode"],
  });
  const zichtbaar = isCoordinator(sessie.rol)
    ? records
    : records.filter((r) => (sessie.scholen || []).includes(r.id));
  return res.status(200).json({ records: zichtbaar.map(({ id, fields }) => ({ id, fields })) });
}

async function maandLezen(sessie, q, res) {
  const { tabel } = maandInfo(q.maand);
  vereisSchool(sessie, q.school);
  const records = await alleRecords(tabel);
  const vanSchool = records
    .filter((r) => bevatId(r.fields?.School, q.school))
    .map(({ id, fields }) => ({ id, fields }));
  return res.status(200).json({ records: vanSchool });
}

async function maandOpslaan(sessie, b, res) {
  const { tabel, velden } = maandInfo(b.maand);
  vereisSchool(sessie, b.school);
  if (!isRecordId(b.schooljaar)) throw new HttpFout(400, "Ongeldig schooljaar.");
  if (!b.fields || typeof b.fields !== "object" || Array.isArray(b.fields)) {
    throw new HttpFout(400, "Geen gegevens meegestuurd.");
  }

  // Enkel toegelaten velden; School en Schooljaar zet de server zelf
  const fields = {};
  for (const [naam, waarde] of Object.entries(b.fields)) {
    if (velden.includes(naam)) fields[naam] = waarde;
  }
  fields.School = [b.school];
  fields.Schooljaar = [b.schooljaar];

  const bestaand = (await alleRecords(tabel, { "fields[]": ["School", "Schooljaar"] }))
    .find((r) => bevatId(r.fields?.School, b.school) && bevatId(r.fields?.Schooljaar, b.schooljaar));

  const resultaat = bestaand
    ? await wijzigRecord(tabel, bestaand.id, fields)
    : await maakRecord(tabel, fields);
  return res.status(200).json({ id: resultaat.id });
}

async function bijlagenLezen(sessie, q, res) {
  maandInfo(q.maand);
  vereisSchool(sessie, q.school);
  const records = await alleRecords("Bijlagen", {
    "fields[]": ["Maand", "Sectie", "Link", "Notitie", "School", "Schooljaar"],
  });
  const lijst = records
    .filter((r) => r.fields?.Maand === q.maand && bevatId(r.fields?.School, q.school))
    .map(({ id, fields }) => ({ id, fields }));
  return res.status(200).json({ records: lijst });
}

async function bijlageOpslaan(sessie, b, res) {
  maandInfo(b.maand);
  vereisSchool(sessie, b.school);
  const sectie = String(b.sectie || "").slice(0, 200);
  const link = String(b.link || "").trim().slice(0, 2000);
  const notitie = String(b.notitie || "").slice(0, 10000);
  if (!sectie) throw new HttpFout(400, "Sectie ontbreekt.");
  if (!link && !notitie) return res.status(200).json({ overgeslagen: true });
  if (link && /^[a-z][a-z0-9+.-]*:/i.test(link) && !/^https?:\/\//i.test(link)) {
    throw new HttpFout(400, "Een link moet met http:// of https:// beginnen.");
  }

  const fields = { Maand: b.maand, Sectie: sectie, School: [b.school] };
  if (link) fields.Link = link;
  if (notitie) fields.Notitie = notitie;
  if (isRecordId(b.schooljaar)) fields.Schooljaar = [b.schooljaar];

  const bestaand = (await alleRecords("Bijlagen", { "fields[]": ["Maand", "Sectie", "Link", "School"] }))
    .find((r) =>
      r.fields?.Maand === b.maand &&
      r.fields?.Sectie === sectie &&
      bevatId(r.fields?.School, b.school) &&
      (r.fields?.Link || "") === link);

  const resultaat = bestaand
    ? await wijzigRecord("Bijlagen", bestaand.id, fields)
    : await maakRecord("Bijlagen", fields);
  return res.status(200).json({ id: resultaat.id });
}
