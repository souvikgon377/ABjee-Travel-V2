"use client";

import React, { useEffect, useState } from 'react';
import { adminAPI } from '@/lib/api';

type Wallet = {
  availablePoints: number;
  lifetimeEarnedPoints: number;
  lifetimeRedeemedPoints: number;
  lifetimeRedeemedRupees: number;
  monthly?: {
    monthKey?: string;
    redeemedPoints?: number;
    redeemedRupees?: number;
    monthlyCapRupees?: number;
  };
};

export default function ABJeeWalletAdmin() {
  const [users, setUsers] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAPI.getWallets();
      const usersList = res?.data?.data?.users || [];
      setUsers(usersList);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWallets();
  }, []);

  const resetMonthly = async (id: string) => {
    try {
      await adminAPI.postWalletAction(id, { action: 'resetMonthly' });
      await fetchWallets();
    } catch (e) {
      alert('Failed to reset: ' + String(e));
    }
  };

  const setAvailable = async (id: string) => {
    const val = prompt('Enter available points (integer)');
    if (!val) return;
    const n = Number(val);
    if (!Number.isFinite(n)) return alert('Invalid number');
    try {
      await adminAPI.postWalletAction(id, { action: 'setAvailable', availablePoints: Math.max(0, Math.floor(n)) });
      await fetchWallets();
    } catch (e) {
      alert('Failed to update: ' + String(e));
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">ABJee Wallet Admin</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && !error && users.length === 0 && (
        <div className="text-sm text-muted-foreground mb-4">No users found. If you expect users, ensure you're logged in as an admin and the server has user documents in Firestore.</div>
      )}
      <div className="overflow-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Available</th>
              <th className="text-left p-2">Lifetime Earned</th>
              <th className="text-left p-2">Monthly Redeemed</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-t">
                <td className="p-2 text-sm">{u.id}</td>
                <td className="p-2 text-sm">{u.email}</td>
                <td className="p-2 text-sm">{u.displayName}</td>
                <td className="p-2 text-sm">{u.wallet?.availablePoints ?? 0}</td>
                <td className="p-2 text-sm">{u.wallet?.lifetimeEarnedPoints ?? 0}</td>
                <td className="p-2 text-sm">{u.wallet?.monthly?.redeemedRupees ?? 0}</td>
                <td className="p-2 text-sm">
                  <button onClick={() => resetMonthly(u.id)} className="mr-2 rounded bg-rose-500 px-2 py-1 text-white">Reset Monthly</button>
                  <button onClick={() => setAvailable(u.id)} className="rounded bg-emerald-500 px-2 py-1 text-white">Set Available</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
