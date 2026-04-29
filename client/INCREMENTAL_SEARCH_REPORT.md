# Incremental Indexing & Search Architecture Report

## Overview
The search system for Tourist Places has been fully refactored from a destructive double-buffer rebuild model to an **Incremental Sync Model** designed to comply with aggressive Free-Tier Redis limits (e.g., Upstash's 500,000 monthly operation limit/10,000 daily limit). 

## Core Changes Implemented

### 1. Zero Prefix Hashing ("No Prefix Index")
We completely eliminated the `idx:prefix:*` structures that were artificially inflating the index size by a factor of 5-10x per word. This instantly reduces the burst rate of commands per save/rebuild dramatically.

### 2. Autocomplete Without Prefix Index
Instead of bloated prefix hashes, the `ZADD idx:autocomplete` (Lexical Sorted Set) is now utilized. 
- Words are inserted individually with score 0 (e.g., `ZADD idx:autocomplete 0 "kolkata"`).
- Querying uses native lex commands (`ZRANGEBYLEX idx:autocomplete "[kol" "[kol\xff" LIMIT 0 10`) giving true autocomplete resolution directly mapped to standard tokens without maintaining `idx:prefix` hashes. 

### 3. Stop Word Exclusion
Token sizes per description are naturally diminished by dropping non-domain logic words: 
`['the', 'in', 'of', 'and', 'to', 'for', 'a', 'an']`

### 4. Incremental Delta Tracking (`place_tokens:{id}`)
Updating an index is now localized purely to the document changed instead of full rebuilds:
1. System reads `place_tokens:{id}` to find what tokens this place **currently** belongs to.
2. System surgically removes the place ID (`SREM`) only from those specific explicit hash lists.
3. A pipeline pushes the new token structure and updates `place_tokens:{id}` and `place:{id}` (which contains heavily minified payload objects for quick reading, saving vast amounts of payload network memory layout). 

### 5. Bounded Token Expansion
Every place is legally capped at exactly **15 indexed tokens maximum** using `.slice(0, 15)`. No place can trigger a spike in search cost. Includes injected manual `geoMap` resolving localized domains (e.g., `parkstreet` → `kolkata`).

### Admin Sync Implementation
The hooks `updatePlaceIndex(doc)` and `deletePlaceIndex(id)` are now natively exported backwards compatible and aliased to the new logic, meaning your standard `POST` and `PUT` Admin endpoints will seamlessly apply these low-weight delta commands automatically without invoking large background batch cron tasks. 

## Deployment Next Steps (Checklist)
1. Flush or allow the previous Redis cache keys to naturally age out. 
2. Execute the new seeder manually **one time**: `npm run (or node) ./scripts/rebuild-search-index.mjs`
3. Perform standard CRUD in Firebase Admin; observe zero performance degradation or Redis spikes.
