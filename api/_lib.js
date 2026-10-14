// api/_lib.js
// Gedeelde code voor de serverfuncties. Bestanden die met "_" beginnen,
// worden door Vercel niet als aparte functie gepubliceerd.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   AIRTABLE_TOKEN    Airtable personal access token (enkel deze base,
//                     scopes data.records:read + data.records:write)
//   AIRTABLE_BASE_ID  appNiHSDVrEsCW3yw
//   SESSION_SECRET    lange willekeurige tekst (minstens 32 tekens)

import crypto from "node:crypto";

const AIRTABLE_URL = process.env.AIRTABLE_API_URL || "https://api.airtable.com/v0";
const SESSIE_DUUR_SEC = 8 * 60 * 60; // 8 uur aangemeld blijven
const COOKIE_NAAM = "ikz_sessie";

// ── Welke tabellen en velden mogen via de tool gelezen/ingevuld worden ──
// Velden die de server zelf invult (School, Schooljaar) staan hier niet in.
export const MAANDEN = {
  september: { tabel: "September", velden: [
    "Status","Link",
    "bsa_1a","bsa_1b","bsa_zij","bsa_totaal","bsa_school","bsa_vanwaar","bsa_overzicht_basisscholen",
    "bsa_doorstroom_eigen","bsa_go","bsa_ovsg","bsa_vrij","bsa_achtst_1a","bsa_geen_getuig","bsa_achtst_zij",
    "bsa_verhoogd_1a","bsa_verhoogd_1b","bsa_verhoogd_zij",
    "uit_vert","uit_horiz","uit_tot",
    "markt_1a","markt_1b","markt_2do","markt_2df","markt_2af","markt_3do","markt_3df","markt_3af","markt_tot",
  ]},
  oktober: { tabel: "Oktober", velden: [
    "Status","Link",
    "vt_lezen_2a","vt_lezen_2b","vt_wisk_2a_1","vt_wisk_2a_2","vt_wisk_2a_3","vt_wisk_2b_1","vt_wisk_2b_2","vt_wisk_2b_3",
    "anal_opvallend","anal_verg_wisk_a","anal_vlgem_wisk_a","anal_verg_ned_a","anal_vlgem_ned_b",
    "anal_verwachtingen","anal_vakdomeinen","anal_evoluties",
    "sterk_goed_scorend","sterk_uitdagingen","sterk_deelvaardigheden","sterk_contextfactoren","sterk_leren_van_sterk",
  ]},
  november: { tabel: "November", velden: [
    "Status","Link","welz_team","welz_lln","ouder_platform","ouder_contact","ouder_tevreden",
  ]},
  december: { tabel: "December", velden: [
    "Status","Link",
    "att_b_pct","att_b_cluster","att_c_pct","att_c_cluster","att_uitgest","att_oki","att_vertraging",
    "att_vert_cluster","att_zitten","att_geen_dip","att_vsv","att_oki_evol",
    "afwez_pct","afwez_cluster","afwez_oki",
  ]},
  januari: { tabel: "Januari", velden: [
    "Status","Link","studie_evol",
    "ho_df_aba","ho_df_pba","ho_df_niet","ho_ddf_aba","ho_ddf_pba","ho_ddf_niet",
    "ss_df_aba","ss_df_aba_ref","ss_df_pba","ss_df_pba_ref","ss_ddf_aba","ss_ddf_aba_ref","ss_ddf_pba","ss_ddf_pba_ref",
    "tewerkst","tewerkst_sect",
  ]},
  februari: { tabel: "Februari", velden: ["Status","Link","feb_uit","feb_lln","feb_uren"] },
  maart:    { tabel: "Maart",    velden: ["Status","Link","oki_waarde","oki_tendens","oki_ind"] },
  april:    { tabel: "April",    velden: [
    "Status","Link","ext_stage","oc_1a","oc_1b","oc_2do","oc_2df","oc_2af","oc_3do","oc_3df","oc_3af",
  ]},
  mei:      { tabel: "Mei",      velden: ["Status","Link","verz_1dag","verz_week","lestijden","prof_pct"] },
  juni:     { tabel: "Juni",     velden: ["Status","Link","sop","visie","tucht","eval_lesbezoek","eval_starters"] },
};

// ── Airtable ────────────────────────────────────────────────
function config() {
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) throw new HttpFout(500, "Serverconfiguratie ontbreekt (token of base-ID).");
  return { token, base };
}

async function airtable(pad, opties = {}) {
  const { token, base } = config();
  const res = await fetch(`${AIRTABLE_URL}/${base}/${pad}`, {
    ...opties,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Airtable-fout", res.status, pad, JSON.stringify(data));
    throw new HttpFout(502, "Airtable gaf een fout terug.");
  }
  return data;
}

// Haalt ALLE records op (Airtable geeft er max. 100 per keer)
export async function alleRecords(tabel, params = {}) {
  const records = [];
  let offset;
  do {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
      else if (v !== undefined) p.set(k, v);
    }
    if (offset) p.set("offset", offset);
    const data = await airtable(`${encodeURIComponent(tabel)}?${p}`);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

export const haalRecord = (tabel, id) => airtable(`${encodeURIComponent(tabel)}/${id}`);
export const maakRecord = (tabel, fields) =>
  airtable(encodeURIComponent(tabel), { method: "POST", body: JSON.stringify({ fields }) });
export const wijzigRecord = (tabel, id, fields) =>
  airtable(`${encodeURIComponent(tabel)}/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });

// Tekst veilig in een Airtable-formule zetten
export function formuleTekst(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export const isRecordId = (id) => typeof id === "string" && /^rec[a-zA-Z0-9]{14}$/.test(id);

// ── Wachtwoorden ────────────────────────────────────────────
// Opslagformaat: scrypt$<salt>$<hash>. Een oud, leesbaar wachtwoord wordt bij
// de eerstvolgende geslaagde login automatisch omgezet naar dit formaat.
export function hashWachtwoord(wachtwoord) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(wachtwoord, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function isGehasht(opgeslagen) {
  return typeof opgeslagen === "string" && opgeslagen.startsWith("scrypt$");
}

export function controleerWachtwoord(wachtwoord, opgeslagen) {
  if (!opgeslagen || typeof opgeslagen !== "string") return false;
  if (isGehasht(opgeslagen)) {
    const [, salt, hash] = opgeslagen.split("$");
    if (!salt || !hash) return false;
    const poging = crypto.scryptSync(wachtwoord, salt, 64);
    const echt = Buffer.from(hash, "hex");
    return echt.length === poging.length && crypto.timingSafeEqual(echt, poging);
  }
  // Oud formaat: leesbaar wachtwoord
  const a = crypto.createHash("sha256").update(String(wachtwoord)).digest();
  const b = crypto.createHash("sha256").update(opgeslagen).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Sessie (ondertekende cookie) ────────────────────────────
function geheim() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new HttpFout(500, "SESSION_SECRET ontbreekt of is te kort.");
  return s;
}

function onderteken(tekst) {
  return crypto.createHmac("sha256", geheim()).update(tekst).digest("base64url");
}

export function zetSessie(res, gegevens) {
  const inhoud = Buffer.from(JSON.stringify({
    ...gegevens,
    exp: Math.floor(Date.now() / 1000) + SESSIE_DUUR_SEC,
  })).toString("base64url");
  const waarde = `${inhoud}.${onderteken(inhoud)}`;
  res.setHeader("Set-Cookie",
    `${COOKIE_NAAM}=${waarde}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSIE_DUUR_SEC}`);
}

export function wisSessie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAAM}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

export function leesSessie(req) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "").split(";").map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
  const waarde = cookies[COOKIE_NAAM];
  if (!waarde || !waarde.includes(".")) return null;
  const [inhoud, handtekening] = waarde.split(".");
  const verwacht = onderteken(inhoud);
  if (handtekening.length !== verwacht.length ||
      !crypto.timingSafeEqual(Buffer.from(handtekening), Buffer.from(verwacht))) return null;
  try {
    const s = JSON.parse(Buffer.from(inhoud, "base64url").toString());
    if (!s.exp || s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

export function vereisSessie(req) {
  const s = leesSessie(req);
  if (!s) throw new HttpFout(401, "Niet aangemeld of sessie verlopen.");
  return s;
}

export const isCoordinator = (rol) => {
  const r = String(rol || "").toLowerCase();
  return r === "coordinator" || r === "coördinator";
};

// Mag deze gebruiker gegevens van deze school zien/bewerken?
export function vereisSchool(sessie, schoolId) {
  if (!isRecordId(schoolId)) throw new HttpFout(400, "Ongeldige school.");
  if (isCoordinator(sessie.rol)) return;
  if (!(sessie.scholen || []).includes(schoolId)) throw new HttpFout(403, "Geen toegang tot deze school.");
}

// ── Hulp voor antwoorden ────────────────────────────────────
export class HttpFout extends Error {
  constructor(status, bericht) { super(bericht); this.status = status; }
}

export function metFoutafhandeling(handler) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method === "POST" && !String(req.headers["content-type"] || "").includes("application/json")) {
        throw new HttpFout(415, "Verwacht JSON.");
      }
      await handler(req, res);
    } catch (e) {
      const status = e instanceof HttpFout ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e instanceof HttpFout ? e.message : "Er ging iets mis op de server." });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
