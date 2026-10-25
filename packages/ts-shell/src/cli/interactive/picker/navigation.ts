import type { Option } from '../../../presentation/tui/chrome/options.js';

export interface NavigationItem { readonly id: string; readonly label: string; readonly note?: string }
export interface NavigationGroup { readonly category: string; readonly section?: string }
export interface NavigationUpdate { readonly options: readonly Option[]; readonly focus?: string; readonly query?: string }
export interface PickerNavigation {
  readonly items: readonly NavigationItem[];
  readonly active: string;
  readonly focused: boolean;
  readonly preferred?: string;
  focus(id: string | undefined): void;
  key(key: string, current: string | undefined, query: string): NavigationUpdate | undefined;
  select(id: string): NavigationUpdate | undefined;
}

/** Display navigation retains row identities; it never applies a setting or model. */
export class CatalogNavigation implements PickerNavigation {
  private rows: readonly Option[] = [];
  private groups: ReadonlyMap<string, NavigationGroup> = new Map();
  private categories: readonly NavigationItem[] = [];
  private category: string;
  private domain: 'categories' | 'sections' | 'rows' = 'rows';
  private readonly rowFocus = new Map<string, string>();
  private section?: string;
  private searching = false;

  constructor(category = 'all', private readonly sectionFocus = false) { this.category = category; }
  get items(): readonly NavigationItem[] { return this.categories; }
  get active(): string { return this.category; }
  get focused(): boolean { return this.domain === 'categories'; }
  get all(): readonly Option[] { return this.rows; }
  get preferred(): string | undefined { return this.rowFocus.get(this.category); }
  focus(id: string | undefined): void {
    if (!this.searching && id && !id.startsWith('section:')) this.rowFocus.set(this.category, id);
  }

  set(rows: readonly Option[], groups: ReadonlyMap<string, NavigationGroup>, categories: readonly NavigationItem[]): void {
    this.rows = rows; this.groups = groups; this.categories = categories;
    if (!categories.some(item => item.id === this.category)) this.category = categories[0]?.id ?? 'all';
  }

  project(query: string): readonly Option[] {
    this.searching = Boolean(query);
    if (query) {
      this.domain = 'rows';
      return this.rows.filter(row => `${row.label} ${row.detail ?? ''} ${row.note ?? ''} ${row.searchText ?? ''}`.toLowerCase().includes(query));
    }
    const rows = this.rows.filter(row => this.category === 'all' || this.groups.get(row.id)?.category === this.category);
    if (!this.sectionFocus) return rows;
    const result: Option[] = []; let previous: string | undefined;
    for (const row of rows) {
      const section = this.groups.get(row.id)?.section;
      if (section && section !== previous) {
        previous = section;
        result.push({ id: `section:${section}`, label: section, disabled: true, focusable: this.domain === 'sections' });
      }
      result.push(this.domain === 'sections' ? { ...row, disabled: true, focusable: false } : row);
    }
    return result;
  }

  select(id: string): NavigationUpdate | undefined {
    if (!this.categories.some(item => item.id === id)) return undefined;
    this.category = id;
    return { options: this.project(''), focus: this.rowFocus.get(id), query: '' };
  }

  key(key: string, current: string | undefined, query: string): NavigationUpdate | undefined {
    if (!['tab', 'shift+tab', 'left', 'right', 'up', 'down', 'enter', 'escape'].includes(key)) return undefined;
    if (!this.searching && this.domain === 'rows' && current && !current.startsWith('section:')) this.rowFocus.set(this.category, current);
    if (query && !['left', 'right', 'tab', 'shift+tab'].includes(key)) return undefined;
    if (key === 'tab' || key === 'shift+tab') {
      const domains: readonly ('categories' | 'sections' | 'rows')[] = this.sectionFocus ? ['categories', 'rows', 'sections'] : ['categories', 'rows'];
      const index = domains.indexOf(this.domain);
      this.domain = domains[(index + (key === 'tab' ? 1 : -1) + domains.length) % domains.length];
    } else if (key === 'left' || key === 'right') {
      if (this.sectionFocus) {
        const index = this.categories.findIndex(item => item.id === this.category);
        this.category = this.categories[(index + (key === 'right' ? 1 : -1) + this.categories.length) % this.categories.length]?.id ?? this.category;
      } else this.domain = key === 'left' ? 'categories' : 'rows';
    } else if (this.domain === 'categories' && (key === 'up' || key === 'down')) {
      const index = this.categories.findIndex(item => item.id === this.category);
      this.category = this.categories[(index + (key === 'down' ? 1 : -1) + this.categories.length) % this.categories.length]?.id ?? this.category;
    } else if (this.domain === 'sections' && (key === 'up' || key === 'down')) {
      const sections = this.project('').filter(row => row.id.startsWith('section:'));
      const index = sections.findIndex(row => row.id === current);
      this.section = sections[(index + (key === 'down' ? 1 : -1) + sections.length) % sections.length]?.id;
    } else if (key === 'enter' && this.domain !== 'rows') {
      if (this.domain === 'sections' && current?.startsWith('section:')) {
        this.section = current;
        const rows = this.project(''); const index = rows.findIndex(row => row.id === current);
        const next = rows[index + 1]; if (next) this.rowFocus.set(this.category, next.id);
      }
      this.domain = 'rows';
    } else if (key === 'escape' && this.domain !== 'categories') this.domain = 'categories';
    else return undefined;
    const options = this.project('');
    return { options, query: '', focus: this.domain === 'sections'
      ? this.section ?? options.find(row => row.id.startsWith('section:'))?.id : this.rowFocus.get(this.category) };
  }
}
