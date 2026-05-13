import { useEffect, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query as firestoreQuery,
  type QueryConstraint,
  type DocumentData,
  type QuerySnapshot,
  type DocumentSnapshot,
} from "firebase/firestore";
import { firestoreDb } from "@/lib/firebaseFirestore";

type UseRealtimeCollectionOpts<T> = {
  collectionPath: string;
  constraints?: QueryConstraint[];
  queryKey?: string;
  enabled?: boolean;
  // optional mapper to transform DocumentSnapshot -> T
  mapDoc?: (doc: DocumentSnapshot<DocumentData>) => T;
  // optional callback to sync an external cache (advanced)
  onChange?: (type: "added" | "modified" | "removed", id: string, doc?: T) => void;
};

export default function useRealtimeCollection<T = Record<string, unknown>>(opts: UseRealtimeCollectionOpts<T>) {
  const { collectionPath, constraints = [], queryKey = collectionPath, enabled = true, mapDoc, onChange } = opts;

  const mapRef = useRef<Map<string, T>>(new Map());
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const colRef = collection(firestoreDb, collectionPath);
    const q = constraints.length > 0 ? firestoreQuery(colRef, ...constraints) : (colRef as any);

    const unsubscribe = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        // Process docChanges incrementally, update mapRef only for changed docs
        snap.docChanges().forEach((change) => {
          const id = change.doc.id;
          try {
            if (change.type === "added") {
              const doc = (mapDoc ? mapDoc(change.doc) : ({ id, ...(change.doc.data() as any) } as unknown as T));
              mapRef.current.set(id, doc);
              onChange?.("added", id, doc);
            } else if (change.type === "modified") {
              const doc = (mapDoc ? mapDoc(change.doc) : ({ id, ...(change.doc.data() as any) } as unknown as T));
              mapRef.current.set(id, doc);
              onChange?.("modified", id, doc);
            } else if (change.type === "removed") {
              mapRef.current.delete(id);
              onChange?.("removed", id);
            }
          } catch (e) {
            // safety: ignore a single doc mapping failure but surface error below
            setError(e as Error);
          }
        });

        // After applying all changes, emit the array once.
        setData(Array.from(mapRef.current.values()));
        setLoading(false);
      },
      (err) => {
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [collectionPath, enabled, queryKey]);

  return { data, loading, error, asMap: mapRef.current } as const;
}
