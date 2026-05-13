"use client";

import React from "react";
import useRealtimeCollection from "@/hooks/useRealtimeCollection";
import { where, orderBy } from "firebase/firestore";

type MinimalPlace = { id: string; name: string; isActive?: boolean };

export const RealtimePlacesList: React.FC<{ adminView?: boolean }> = ({ adminView = false }) => {
  const { data: places, loading, error } = useRealtimeCollection<MinimalPlace>({
    collectionPath: "touristPlaces",
    constraints: [where("isActive", "==", true), orderBy("name_lower")],
    mapDoc: (doc) => ({ id: doc.id, ...(doc.data() as any) } as MinimalPlace),
  });

  if (loading) return <div>Loading places…</div>;
  if (error) return <div>Error loading places: {String(error.message)}</div>;

  return (
    <div className="space-y-2">
      {places.length === 0 && <div>No places found</div>}
      {places.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded border p-2">
          <div className="font-medium">{p.name}</div>
          {adminView && <div className="text-sm text-muted">{p.isActive ? "Active" : "Inactive"}</div>}
        </div>
      ))}
    </div>
  );
};

export default RealtimePlacesList;
