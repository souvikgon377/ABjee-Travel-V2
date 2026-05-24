import Typesense, { Client } from 'typesense';

// ─── Environment Check (runs once at module load) ─────────────────────────────
//
// When TYPESENSE_API_KEY is missing or empty, TYPESENSE_ENABLED = false.
// All callers check this flag BEFORE making any network attempt.
// This eliminates the 2-second health-check timeout that was causing slow cold starts.
//
const _tsHost = (process.env.TYPESENSE_HOST || '').trim();
const _tsApiKey = (process.env.TYPESENSE_API_KEY || '').trim();
const _tsPort = parseInt((process.env.TYPESENSE_PORT || '8108').trim(), 10);
const _tsProtocol = (process.env.TYPESENSE_PROTOCOL || 'http').toLowerCase().replace(/:$/, '');

/**
 * True only when ALL required Typesense env vars are present and valid.
 * Callers must check this before any Typesense operation.
 */
export const TYPESENSE_ENABLED: boolean = (() => {
  if (!_tsApiKey) {
    // Only log once at startup, not on every import
    if (process.env.NODE_ENV !== 'test') {
      console.info('[Typesense] DISABLED — TYPESENSE_API_KEY is not set. Using Firestore fallback.');
    }
    return false;
  }
  if (!_tsHost) {
    console.info('[Typesense] DISABLED — TYPESENSE_HOST is not set. Using Firestore fallback.');
    return false;
  }
  if (Number.isNaN(_tsPort) || _tsPort < 1 || _tsPort > 65535) {
    console.warn(`[Typesense] DISABLED — Invalid TYPESENSE_PORT: "${_tsPort}". Using Firestore fallback.`);
    return false;
  }
  if (!['http', 'https'].includes(_tsProtocol)) {
    console.warn(`[Typesense] DISABLED — Invalid TYPESENSE_PROTOCOL: "${_tsProtocol}". Using Firestore fallback.`);
    return false;
  }
  return true;
})();

// ─── Typesense Client (only instantiated when enabled) ────────────────────────
//
// If TYPESENSE_ENABLED is false, `client` is a dummy object.
// All real calls are guarded by TYPESENSE_ENABLED checks upstream.
//
let client: Client;

if (TYPESENSE_ENABLED) {
  client = new Typesense.Client({
    nodes: [{ host: _tsHost, port: _tsPort, protocol: _tsProtocol }],
    apiKey: _tsApiKey,
    connectionTimeoutSeconds: 3, // Reduced from 5s for faster failover
    retryIntervalSeconds: 0.1,
    numRetries: 0, // No retries — fail fast, fall through to Firestore
    logLevel: process.env.TYPESENSE_DEBUG === 'true' ? 'debug' : 'silent',
  }) as Client;
  console.info(`[Typesense] ENABLED — ${_tsProtocol}://${_tsHost}:${_tsPort}`);
} else {
  // Stub client — prevents runtime errors if code accidentally calls it
  // while still making import resolution work.
  client = null as unknown as Client;
}

// ─── Collection Names ─────────────────────────────────────────────────────────

export const COLLECTION_NAME = 'tourist_places';
export const USERS_COLLECTION = 'users';
export const TRAVEL_DESTINATIONS_COLLECTION = 'travel_destinations';
export const TRAVEL_REQUESTS_COLLECTION = 'travel_requests';

type TypesenseSchemaField = {
  name: string;
  type: string;
  optional?: boolean;
};

const getSchemaFields = (fields: TypesenseSchemaField[]) =>
  fields.filter((field) => field.name !== 'id');

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Schema for tourist places
 */
export const touristPlacesSchema = {
  name: COLLECTION_NAME,
  fields: [
    { name: 'name', type: 'string' as const },
    { name: 'name_lower', type: 'string' as const, optional: true },
    { name: 'city', type: 'string' as const },
    { name: 'area', type: 'string' as const, optional: true },
    { name: 'state', type: 'string' as const },
    { name: 'country', type: 'string' as const },
    { name: 'category', type: 'string' as const },
    { name: 'isActive', type: 'bool' as const },
    { name: 'location_search', type: 'string' as const, optional: true },
    { name: 'location_lower', type: 'string' as const, optional: true },
    { name: 'description', type: 'string' as const, optional: true },
    { name: 'description_lower', type: 'string' as const, optional: true },
    { name: 'coverImage', type: 'string' as const, optional: true },
    { name: 'googleMapsUrl', type: 'string' as const, optional: true },
    { name: 'popularity', type: 'int32' as const, optional: true },
    { name: 'updatedAt', type: 'int64' as const },
  ],
  default_sorting_field: 'updatedAt',
};

/**
 * Schema for users
 */
export const usersSchema = {
  name: USERS_COLLECTION,
  fields: [
    { name: 'displayName', type: 'string' as const },
    { name: 'email', type: 'string' as const },
    { name: 'role', type: 'string' as const },
    { name: 'status', type: 'string' as const },
    { name: 'updatedAt', type: 'int64' as const },
  ],
  default_sorting_field: 'updatedAt',
};

/**
 * Schema for generated travel destinations / itineraries
 */
export const travelDestinationsSchema = {
  name: TRAVEL_DESTINATIONS_COLLECTION,
  fields: [
    { name: 'place', type: 'string' as const },
    { name: 'country', type: 'string' as const },
    { name: 'introduction', type: 'string' as const, optional: true },
    { name: 'itinerary', type: 'string' as const, optional: true },
    { name: 'name_lower', type: 'string' as const, optional: true },
    { name: 'location_search', type: 'string' as const, optional: true },
    { name: 'location_lower', type: 'string' as const, optional: true },
    { name: 'updatedAt', type: 'int64' as const },
  ],
  default_sorting_field: 'updatedAt',
};

/**
 * Schema for travel partner requests
 */
export const travelRequestsSchema = {
  name: TRAVEL_REQUESTS_COLLECTION,
  fields: [
    { name: 'destination', type: 'string' as const },
    { name: 'city', type: 'string' as const },
    { name: 'state', type: 'string' as const },
    { name: 'country', type: 'string' as const },
    { name: 'travelStyle', type: 'string' as const },
    { name: 'updatedAt', type: 'int64' as const },
  ],
  default_sorting_field: 'updatedAt',
};

// ─── Health Check ─────────────────────────────────────────────────────────────

/**
 * Health check: Verify Typesense is reachable and responsive.
 *
 * Returns false immediately if TYPESENSE_ENABLED is false.
 * No network call is made when Typesense is disabled.
 *
 * @param timeoutMs Timeout in milliseconds (default: 3000)
 * @returns true if Typesense is healthy, false otherwise
 */
export async function healthCheckTypesense(timeoutMs = 3000): Promise<boolean> {
  // Fast-path: skip ALL network calls when disabled
  if (!TYPESENSE_ENABLED) return false;

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);

    client.health
      .retrieve()
      .then(() => {
        clearTimeout(timer);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(false);
      });
  });
}

// ─── Collection Initialization ─────────────────────────────────────────────────

/**
 * Ensures all collections exist in Typesense.
 * Handles 404 gracefully (collection not found = create it).
 * Idempotent: safe to call multiple times.
 *
 * Returns early if TYPESENSE_ENABLED is false.
 */
export async function initializeTypesense() {
  if (!TYPESENSE_ENABLED) {
    console.info('[Typesense] initializeTypesense() skipped — Typesense is disabled.');
    return [];
  }

  const schemas = [touristPlacesSchema, usersSchema, travelDestinationsSchema, travelRequestsSchema];
  const results: { name: string; status: 'created' | 'updated' | 'exists' | 'error'; message?: string }[] = [];

  for (const schema of schemas) {
    try {
      const collection = (await client.collections(schema.name).retrieve()) as any;
      const existingFields = new Set<string>((collection.fields || []).map((field: any) => field.name));
      const schemaFields = getSchemaFields(schema.fields as TypesenseSchemaField[]);
      const expectedFields = schemaFields.map((field) => field.name);
      const missingFields = expectedFields.filter((fieldName) => !existingFields.has(fieldName));

      if (missingFields.length > 0) {
        console.log(`[Typesense] Updating collection "${schema.name}" — missing fields: ${missingFields.join(', ')}`);
        const fieldsToAdd = schemaFields.filter((field) => missingFields.includes(field.name));
        await client.collections(schema.name).update({ fields: fieldsToAdd } as any);
        results.push({ name: schema.name, status: 'updated', message: `Added fields: ${missingFields.join(', ')}` });
      } else {
        results.push({ name: schema.name, status: 'exists' });
      }
    } catch (error: any) {
      if (error.status === 404 || error.httpStatus === 404) {
        try {
          console.log(`[Typesense] Creating collection "${schema.name}"...`);
          await client.collections().create({
            ...schema,
            fields: getSchemaFields(schema.fields as TypesenseSchemaField[]),
          } as any);
          console.log(`[Typesense] ✅ Created collection "${schema.name}"`);
          results.push({ name: schema.name, status: 'created' });
        } catch (createErr: any) {
          console.error(`[Typesense] ❌ Failed to create "${schema.name}":`, createErr.message);
          results.push({ name: schema.name, status: 'error', message: createErr.message });
        }
      } else {
        console.error(`[Typesense] ❌ Error checking/updating "${schema.name}":`, error.message);
        results.push({ name: schema.name, status: 'error', message: error.message });
      }
    }
  }

  return results;
}

export default client;
