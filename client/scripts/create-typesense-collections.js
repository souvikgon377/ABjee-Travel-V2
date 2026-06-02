#!/usr/bin/env node
const http = require('http');

const host = process.env.TYPESENSE_HOST || 'localhost';
const port = process.env.TYPESENSE_PORT || 8108;
const apiKey = process.env.TYPESENSE_API_KEY || 'typesense_dev_key';

function get(path) {
  return new Promise((res, rej) => {
    const opts = { hostname: host, port: port, path: path, method: 'GET', headers: { 'X-TYPESENSE-API-KEY': apiKey } };
    const req = http.request(opts, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => res({ status: r.statusCode, body }));
    });
    req.on('error', rej);
    req.end();
  });
}

function post(path, obj) {
  return new Promise((res, rej) => {
    const bodyStr = JSON.stringify(obj);
    const opts = {
      hostname: host,
      port: port,
      path: path,
      method: 'POST',
      headers: {
        'X-TYPESENSE-API-KEY': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = http.request(opts, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => res({ status: r.statusCode, body }));
    });
    req.on('error', rej);
    req.write(bodyStr);
    req.end();
  });
}

const touristPlacesSchema = {
  name: 'tourist_places',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'name_lower', type: 'string', optional: true },
    { name: 'city', type: 'string' },
    { name: 'area', type: 'string', optional: true },
    { name: 'state', type: 'string' },
    { name: 'country', type: 'string' },
    { name: 'category', type: 'string' },
    { name: 'isActive', type: 'bool' },
    { name: 'location_search', type: 'string', optional: true },
    { name: 'location_lower', type: 'string', optional: true },
    { name: 'description', type: 'string', optional: true },
    { name: 'description_lower', type: 'string', optional: true },
    { name: 'coverImage', type: 'string', optional: true },
    { name: 'mediaCount', type: 'int32', optional: true },
    { name: 'googleMapsUrl', type: 'string', optional: true },
    { name: 'popularity', type: 'int32', optional: true },
    { name: 'updatedAt', type: 'int64' }
  ],
  default_sorting_field: 'updatedAt'
};

const usersSchema = {
  name: 'users',
  fields: [
    { name: 'displayName', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'role', type: 'string' },
    { name: 'status', type: 'string' },
    { name: 'updatedAt', type: 'int64' }
  ],
  default_sorting_field: 'updatedAt'
};

const travelDestinationsSchema = {
  name: 'travel_destinations',
  fields: [
    { name: 'place', type: 'string' },
    { name: 'country', type: 'string' },
    { name: 'introduction', type: 'string', optional: true },
    { name: 'itinerary', type: 'string', optional: true },
    { name: 'name_lower', type: 'string', optional: true },
    { name: 'location_search', type: 'string', optional: true },
    { name: 'location_lower', type: 'string', optional: true },
    { name: 'updatedAt', type: 'int64' }
  ],
  default_sorting_field: 'updatedAt'
};

const travelRequestsSchema = {
  name: 'travel_requests',
  fields: [
    { name: 'destination', type: 'string' },
    { name: 'city', type: 'string' },
    { name: 'state', type: 'string' },
    { name: 'country', type: 'string' },
    { name: 'travelStyle', type: 'string' },
    { name: 'updatedAt', type: 'int64' }
  ],
  default_sorting_field: 'updatedAt'
};

async function run() {
  console.log('Checking Typesense at', `${host}:${port}`);
  try {
    const health = await get('/health');
    console.log('Health:', health.status, health.body);
    if (health.status !== 200) {
      console.error('Typesense unhealthy; aborting');
      process.exit(1);
    }

    const collectionsResp = await get('/collections');
    console.log('Collections list status:', collectionsResp.status);
    console.log('Collections body:', collectionsResp.body);

    const schemas = [touristPlacesSchema, usersSchema, travelDestinationsSchema, travelRequestsSchema];

    for (const schema of schemas) {
      const name = schema.name;
      try {
        const exists = await get(`/collections/${name}`);
        if (exists.status === 200) {
          console.log(`Collection ${name} already exists`);
          continue;
        }
      } catch (e) {
        // fall through to creation
      }

      console.log(`Creating collection ${name}...`);
      const created = await post('/collections', schema);
      console.log(`Create ${name}:`, created.status, created.body);
    }

    console.log('All done');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
