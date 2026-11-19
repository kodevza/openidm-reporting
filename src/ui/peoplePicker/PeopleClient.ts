// SPDX-License-Identifier: CDDL-1.1
import {endpoint, type Choice, type Request} from '../shared/reportingEndpoint';

interface PeoplePage {
  items: Choice[];
  nextOffset: number | null;
}

export class PeopleClient {
  private readonly peoplePages = new Map<string, Promise<PeoplePage>>();

  constructor(private readonly request: Request) {}

  getPeople(search: string, offset: number): Promise<PeoplePage> {
    const params = new URLSearchParams({dictionary: 'people', search, peopleOffset: String(offset)});
    const key = params.toString();
    const cached = this.peoplePages.get(key);
    if (cached) return cached;

    const pending = this.loadPeople(key).catch(error => {
      this.peoplePages.delete(key);
      throw error;
    });
    this.peoplePages.set(key, pending);
    return pending;
  }

  private async loadPeople(query: string): Promise<PeoplePage> {
    const page = await this.request(endpoint + query) as PeoplePage;
    if (!page || !Array.isArray(page.items)) throw Error('Invalid people dictionary');
    return page;
  }
}
