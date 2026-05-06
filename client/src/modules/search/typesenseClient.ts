import Typesense from 'typesense';

// ─── Validate & Initialize Typesense Client ────────────────────────────────
const validateTypesenseEnv = () => {
  const host = (process.env.TYPESENSE_HOST || 'localhost').trim();
  const portStr = (process.env.TYPESENSE_PORT || '8108').trim();
  const protocol = (process.env.TYPESENSE_PROTOCOL || 'http').toLowerCase().replace(/:$/, '');
  const apiKey = (process.env.TYPESENSE_API_KEY || '').trim();

  const port = parseInt(portStr, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid TYPESENSE_PORT: "${portStr}". Must be a number between 1-65535. (Default: 8108)`
    );
  }
  if (!['http', 'https'].includes(protocol)) {
    throw new Error(
      `Invalid TYPESENSE_PROTOCOL: "${protocol}". Must be "http" or "https". (Default: http)`
    );
  }
  if (!apiKey) {
    throw new Error(
      'TYPESENSE_API_KEY is required. Set it in .env (e.g., TYPESENSE_API_KEY=xyz)'
    );
  }
  if (!host) {
    throw new Error(
      'TYPESENSE_HOST is required. Set it in .env or defaults to "localhost". (Default: localhost)'
    );
  }

  return { host, port, protocol, apiKey };
};

const { host, port, protocol, apiKey } = validateTypesenseEnv();

const client = new Typesense.Client({
  nodes: [{ host, port, protocol }],
  apiKey,
  connectionTimeoutSeconds: 5,
});

export const COLLECTION_NAME = 'tourist_places';
export const USERS_COLLECTION = 'users';
export const TRAVEL_REQUESTS_COLLECTION = 'travel_requests';

/**
 * Schema for tourist places
 */
export const touristPlacesSchema = {
  name: COLLECTION_NAME,
  fields: [
    { name: 'id', type: 'string' as const },
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
    { name: 'id', type: 'string' as const },
    { name: 'displayName', type: 'string' as const },
    { name: 'email', type: 'string' as const },
    { name: 'role', type: 'string' as const },
    { name: 'status', type: 'string' as const },
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
    { name: 'id', type: 'string' as const },
    { name: 'destination', type: 'string' as const },
    { name: 'city', type: 'string' as const },
    { name: 'state', type: 'string' as const },
    { name: 'country', type: 'string' as const },
    { name: 'travelStyle', type: 'string' as const },
    { name: 'updatedAt', type: 'int64' as const },
  ],
  default_sorting_field: 'updatedAt',
};

/**
 * Health check: Verify Typesense is reachable and responsive.
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns true if Typesense is healthy, false otherwise
 */
export async function healthCheckTypesense(timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    
    client
      .health.retrieve()
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

/**
 * Ensures all collections exist in Typesense.
 * Handles 404 gracefully (collection not found = create it).
 * Idempotent: safe to call multiple times.
 */
export async function initializeTypesense() {
  const schemas = [touristPlacesSchema, usersSchema, travelRequestsSchema];
  const results: { name: string; status: 'created' | 'updated' | 'exists' | 'error'; message?: string }[] = [];

  for (const schema of schemas) {
    try {
      const collection = (await client.collections(schema.name).retrieve()) as any;
      const existingFields = new Set<string>((collection.fields || []).map((field: any) => field.name));
      const expectedFields = schema.fields.map((field: any) => field.name);
      const missingFields = expectedFields.filter((fieldName) => !existingFields.has(fieldName));

      if (missingFields.length > 0) {
        console.log(`[Typesense] Updating collection "${schema.name}" with missing fields: ${missingFields.join(', ')}`);
        await client.collections(schema.name).update(schema as any);
        results.push({ name: schema.name, status: 'updated', message: `Added fields: ${missingFields.join(', ')}` });
      } else {
        console.log(`[Typesense] Collection "${schema.name}" exists with all required fields.`);
        results.push({ name: schema.name, status: 'exists' });
      }
    } catch (error: any) {
      // 404 = collection doesn't exist, create it
      if (error.status === 404 || error.httpStatus === 404) {
        try {
          console.log(`[Typesense] Creating collection "${schema.name}"...`);
          await client.collections().create(schema as any);
          console.log(`[Typesense] ✅ Created collection "${schema.name}"`);
          results.push({ name: schema.name, status: 'created' });
        } catch (createErr: any) {
          console.error(`[Typesense] ❌ Failed to create collection "${schema.name}":`, createErr.message);
          results.push({ name: schema.name, status: 'error', message: createErr.message });
        }
      } else {
        console.error(`[Typesense] ❌ Error checking/updating collection "${schema.name}":`, error.message);
        results.push({ name: schema.name, status: 'error', message: error.message });
      }
    }
  }

  const allSuccessful = results.every((r) => r.status !== 'error');
  console.log(`\n[Typesense] Initialization Summary:`, results);
  
  if (!allSuccessful) {
    throw new Error(`Typesense initialization failed for some collections: ${results.filter(r => r.status === 'error').map(r => r.name).join(', ')}`);
  }

  return results;
}

export default client;
