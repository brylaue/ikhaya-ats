'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface SyncStats {
  totalMessagesSynced: number;
  totalMatches: number;
  lastSyncTime: string | null;
}

export function AdminEmailSection() {
  const router = useRouter();
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [processingPurge, setProcessingPurge] = useState(false);
  const [processingExport, setProcessingExport] = useState(false);

  useEffect(() => {
    const checkOwnerAndLoadStats = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if owner
      const { data: agency } = await supabase
        .from('agencies')
        .select('owner_id')
        .eq('owner_id', user.id)
        .single();

      if (agency) {
        setIsOwner(true);

        // Load stats
        const { data: syncEvents } = await supabase
          .from('sync_events')
          .select('messages_processed,matches_created,created_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (syncEvents && syncEvents.length > 0) {
          const totalMessages = syncEvents.reduce(
            (sum, e) => sum + (e.messages_processed || 0),
            0
          );
          const totalMatches = syncEvents.reduce(
            (sum, e) => sum + (e.matches_created || 0),
            0
          );
          const lastSync = syncEvents[0]?.created_at;

          setStats({
            totalMessagesSynced: totalMessages,
            totalMatches: totalMatches,
            lastSyncTime: lastSync,
          });
        }
      }

      setLoading(false);
    };

    checkOwnerAndLoadStats();
  }, []);

  const handlePurge = async () => {
    if (
      !confirm(
        'Are you sure? This will delete all email data for your agency. This cannot be undone.'
      )
    ) {
      return;
    }

    setProcessingPurge(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        alert('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/email/purge', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        alert('Email data purged successfully');
        setStats({
          totalMessagesSynced: 0,
          totalMatches: 0,
          lastSyncTime: null,
        });
      } else {
        alert('Failed to purge email data');
      }
    } catch (error) {
      console.error('Purge error:', error);
      alert('Error purging email data');
    } finally {
      setProcessingPurge(false);
    }
  };

  const handleExport = async () => {
    setProcessingExport(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        alert('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/email/export', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `email-export-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to export email data');
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting email data');
    } finally {
      setProcessingExport(false);
    }
  };

  if (!isOwner || loading) {
    return null;
  }

  return (
    <div className="space-y-6 border-t pt-6">
      <div>
        <h3 className="text-lg font-semibold">Email Sync Admin</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage email sync operations for your agency
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div>
            <div className="text-2xl font-bold">{stats.totalMessagesSynced}</div>
            <div className="text-xs text-muted-foreground">Messages Synced</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.totalMatches}</div>
            <div className="text-xs text-muted-foreground">Matches Created</div>
          </div>
          <div>
            <div className="text-sm font-medium">
              {stats.lastSyncTime
                ? new Date(stats.lastSyncTime).toLocaleDateString()
                : 'Never'}
            </div>
            <div className="text-xs text-muted-foreground">Last Sync</div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleExport}
          disabled={processingExport}
          className="w-full px-4 py-2 bg-brand-600 text-white rounded text-sm hover:bg-brand-700 disabled:opacity-50"
        >
          {processingExport ? 'Exporting...' : 'Export Email Data'}
        </button>

        <button
          onClick={handlePurge}
          disabled={processingPurge}
          className="w-full px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
        >
          {processingPurge ? 'Purging...' : 'Purge All Email Data'}
        </button>
      </div>
    </div>
  );
}
