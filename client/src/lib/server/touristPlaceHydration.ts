import { adminDb } from '@/lib/server/firebaseAdminFirestore';

const isNonEmptyArray = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;

export async function enrichTouristPlacesFromFirestore(rows: any[]) {
  const ids = Array.from(
    new Set(
      rows
        .map((row) => String(row?.id || '').trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) return rows;

  const refs = ids.map((id) => adminDb.collection('touristPlaces').doc(id));
  const docs = await adminDb.getAll(...refs).catch(() => []);
  const byId = new Map(docs.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() || {}]));

  return rows.map((row) => {
    const full = byId.get(String(row?.id || ''));
    if (!full) return row;

    return {
      ...row,
      area: row.area || full.area || full.city || '',
      city: row.city || full.city || full.area || '',
      description: full.description || row.description || '',
      googleMapsUrl: full.googleMapsUrl || row.googleMapsUrl || '',
      coverImage: full.coverImage || row.coverImage || '',
      extraInfo: isNonEmptyArray(full.extraInfo) ? full.extraInfo : (Array.isArray(row.extraInfo) ? row.extraInfo : []),
      media: isNonEmptyArray(full.media) ? full.media : (Array.isArray(row.media) ? row.media : []),
    };
  });
}
