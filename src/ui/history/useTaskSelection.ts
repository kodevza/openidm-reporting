// SPDX-License-Identifier: CDDL-1.1
import {useEffect, useRef, useState} from 'preact/hooks';
import type {ReportingClient} from './ReportingClient';
import {initialCursor, nextCursor, type Cursor} from './types';

export function useTaskSelection(client: ReportingClient, rejectTask: ((id: string) => Promise<void>) | undefined,
    refresh: () => void) {
  const [ids, setIds] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function toggle(id: string) {
    setIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function selectAll() {
    if (busy) return;
    setBusy(true);
    setStatus('Finding pending tasks across all pages…');
    const selected = new Set<string>();
    try {
      let cursor: Cursor | null = initialCursor;
      while (cursor && active.current) {
        const page = await client.getPage(cursor, '*', {}, {taskLinks: true});
        for (const id of page.taskIds ?? []) {
          if (id) selected.add(id);
        }
        cursor = nextCursor(page, cursor);
      }
      setIds(selected);
      setStatus(selected.size ? '' : 'No pending tasks available to reject.');
    } catch {
      setStatus('Could not select all pending tasks. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectTask || busy || !ids.size || !window.confirm(
      'Reject ' + ids.size + ' selected task(s)? This decision cannot be undone.',
    )) return;

    setBusy(true);
    setStatus('Rejecting selected tasks…');
    const failed = new Set<string>();
    for (const id of ids) {
      try {
        await rejectTask(id);
      } catch {
        failed.add(id);
      }
    }
    setIds(failed);
    setStatus('Rejected: ' + (ids.size - failed.size) + '. Failed: ' + failed.size + '.');
    setBusy(false);
    refresh();
  }

  return {ids, busy, status, toggle, selectAll, reject, clear: () => setIds(new Set())};
}
