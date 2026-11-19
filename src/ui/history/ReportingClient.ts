// SPDX-License-Identifier: CDDL-1.1
import {endpoint, type Request} from '../shared/reportingEndpoint';
import type {Catalog, Cursor, Filters, Page} from './types';

export class ReportingClient {
  constructor(private readonly request: Request) {}

  async getCatalog(): Promise<Catalog> {
    const catalog = await this.request(endpoint + 'capabilities=true&workflows=true') as Catalog;
    if (!catalog || !Array.isArray(catalog.workflows) || !Array.isArray(catalog.columns) || !catalog.columns.length) {
      throw Error('Not configured');
    }
    return catalog;
  }

  async getPage(cursor: Cursor, workflow: string, filters: Filters, {size = 50, taskLinks = false} = {}): Promise<Page> {
    const params = new URLSearchParams({
      report: 'workflow-history',
      offset: String(cursor.offset),
      sourceIndex: String(cursor.sourceIndex),
      pageSize: String(size),
      filters: JSON.stringify(filters)
    });
    if (workflow !== '*') params.set('workflow', workflow);
    if (taskLinks) params.set('taskLinks', 'true');

    const page = await this.request(endpoint + params) as Page;
    if (!page || page.report !== 'workflow-history' || !Array.isArray(page.columns) || !Array.isArray(page.rows) ||
        typeof page.header !== 'string' || typeof page.csv !== 'string' || typeof page.filename !== 'string') {
      throw Error('Invalid report page');
    }
    return page;
  }
}
