// SPDX-License-Identifier: CDDL-1.1
import {useEffect, useRef, useState} from 'preact/hooks';
import {messages} from '../locales/en';
import type {ReportingClient} from './ReportingClient';
import type {Catalog, Filters} from './types';
import {exportHistory} from './export';

export function useHistoryDownload(client: ReportingClient, workflows: Catalog['workflows'], selected: string, filters: Filters, invalidRange: boolean) {
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    exportController.current?.abort();
  }, []);

  async function download() {
    if (!selected || downloading || invalidRange) return;
    const selection = selected === '*'
      ? {id: '*', title: messages.history.allWorkflows}
      : workflows.find(item => item.id === selected)!;
    const controller = new AbortController();
    exportController.current = controller;
    setDownloading(true);
    setExportError('');

    try {
      const file = await exportHistory(client, selection, filters, controller.signal);
      if (!mounted.current) return;

      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (mounted.current && !controller.signal.aborted) setExportError(messages.csv.exportError);
    } finally {
      if (mounted.current) setDownloading(false);
    }
  }

  return {download, downloading, exportError};
}
