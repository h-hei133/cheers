import type { Option } from '../../../presentation/tui/chrome/options.js';
import { NavigationViewport } from '../../../presentation/tui/chrome/navigation.js';

export interface NavigationItem { readonly id: string; readonly label: string; readonly note?: string }
export interface NavigationGroup { readonly category: string; readonly section?: string }
export interface NavigationUpdate { readonly options: readonly Option[]; readonly focus?: string; readonly query?: string }
export interface NavigationOrigin { readonly rows: readonly Option[]; readonly crossCategory: boolean }
export interface PickerNavigation {
  readonly placement?: 'side' | 'top';
  readonly viewport: NavigationViewport;
  readonly items: readonly NavigationItem[];
  readonly active: string;
  readonly focused: boolean;
  readonly preferred?: string;
  focus(id: string | undefined): void;
  key(key: string, current: string | undefined, query: string): NavigationUpdate | undefined;
  select(id: string): NavigationUpdate | undefined;
  /** A painted content row transfers keyboard focus into its navigation domain. */
  point(id: string, query: string): NavigationUpdate | undefined;
}

/** Display navigation retains row identities; it never applies a setting or model. */
export class CatalogNavigation implements PickerNavigation {
  readonly viewport = new NavigationViewport();
  private rows: readonly Option[] = [];
  private groups: ReadonlyMap<string, NavigationGroup> = new Map();
  private categories: readonly NavigationItem[] = [];
  private category: string;
  private domain: 'categories' | 'sections' | 'rows' = 'rows';
  private readonly rowFocus = new Map<string, string>();
  private section?: string;
  private searching = false;
  private searchDomain?: 'categories' | 'sections' | 'rows';
  private projection: readonly Option[] = [];
  private projectionQuery = '';

  constructor(category = 'all', private readonly sectionFocus = false,
    private readonly searchSelection = false, readonly placement: 'side' | 'top' = 'side') { this.category = category; }
  get items(): readonly NavigationItem[] { return this.categories; }
  get active(): string { return this.category; }
  get focused(): boolean { return this.domain === 'categories'; }
  get all(): readonly Option[] { return this.rows; }
  get preferred(): string | undefined { return this.domain === 'sections' ? this.section : this.rowFocus.get(this.category); }
  get origin(): NavigationOrigin { return { rows: this.projection, crossCategory: Boolean(this.projectionQuery) }; }
  focus(id: string | undefined): void {
    if (this.searching || !id) return;
    if (id.startsWith('section:')) this.section = id;
    else this.rowFocus.set(this.category, id);
  }

  set(rows: readonly Option[], groups: ReadonlyMap<string, NavigationGroup>, categories: readonly NavigationItem[]): void {
    this.rows = rows; this.groups = groups; this.categories = categories;
    const present = new Set(rows.map(row => row.id));
    for (const [category, id] of this.rowFocus) if (!present.has(id)) this.rowFocus.delete(category);
    if (!categories.some(item => item.id === this.category)) this.category = categories[0]?.id ?? 'all';
  }

  project(query: string): readonly Option[] {
    if (query && !this.searching) this.searchDomain = this.domain;
    else if (!query && this.searching) {
      this.domain = this.searchDomain ?? this.domain;
      this.searchDomain = undefined;
    }
    this.searching = Boolean(query);
    this.projectionQuery = query;
    if (query) {
      this.domain = 'rows';
      this.projection = this.rows.filter(row => `${row.label} ${row.detail ?? ''} ${row.note ?? ''} ${row.searchText ?? ''}`.toLowerCase().includes(query));
      return this.projection;
    }
    const rows = this.rows.filter(row => this.category === 'all' || this.groups.get(row.id)?.category === this.category);
    if (!this.sectionFocus) {
      this.projection = rows;
      return this.projection;
    }
    const result: Option[] = []; let previous: string | undefined;
    for (const row of rows) {
      const section = this.groups.get(row.id)?.section;
      if (section && section !== previous) {
        previous = section;
        result.push({ id: `section:${section}`, label: section, disabled: true, focusable: this.domain === 'sections' });
      }
      result.push(this.domain === 'sections' ? { ...row, disabled: true, focusable: false } : row);
    }
    this.projection = result;
    return this.projection;
  }

  select(id: string): NavigationUpdate | undefined {
    if (!this.categories.some(item => item.id === id)) return undefined;
    this.category = id;
    this.searching = false; this.searchDomain = undefined;
    this.domain = this.placement === 'top' ? 'rows' : 'categories';
    this.viewport.reveal();
    return { options: this.project(''), focus: this.rowFocus.get(id), query: '' };
  }

  point(id: string, query: string): NavigationUpdate | undefined {
    if (id.startsWith('section:')) {
      if (!this.project('').some(row => row.id === id)) return undefined;
      this.domain = 'sections'; this.section = id;
      return { options: this.project(''), focus: id };
    }
    if (!this.rows.some(row => row.id === id)) return undefined;
    if (!query) {
      this.searching = false; this.searchDomain = undefined;
      const group = this.groups.get(id);
      if (this.category !== 'all' && group && this.categories.some(item => item.id === group.category)) this.category = group.category;
    }
    this.domain = 'rows';
    this.focus(id);
    return { options: this.project(query.trim().toLowerCase()), focus: id };
  }

  key(key: string, current: string | undefined, query: string): NavigationUpdate | undefined {
    if (key === 'wheel-up' || key === 'wheel-down') {
      this.domain = 'rows';
      return { options: this.project(query), ...(current?.startsWith('section:') ? { focus: this.rowFocus.get(this.category) } : {}) };
    }
    if (!['tab', 'shift+tab', 'left', 'right', 'up', 'down', 'enter', 'escape'].includes(key)) return undefined;
    if (query && key === 'escape') {
      const group = current ? this.groups.get(current) : undefined;
      if (this.searchSelection && current && group) {
        this.category = group.category; this.domain = 'rows';
        this.searching = false; this.searchDomain = undefined;
        this.rowFocus.set(this.category, current);
      }
      const options = this.project('');
      this.viewport.reveal();
      return { options, focus: this.preferred, query: '' };
    }
    if (!this.searching && this.domain === 'rows' && current && !current.startsWith('section:')) this.rowFocus.set(this.category, current);
    if (query && !['left', 'right', 'tab', 'shift+tab'].includes(key)) return undefined;
    if (query) { this.searching = false; this.searchDomain = undefined; }
    if (key === 'tab' || key === 'shift+tab') {
      const domains: readonly ('categories' | 'sections' | 'rows')[] = this.placement === 'top'
        ? this.sectionFocus ? ['rows', 'sections'] : ['rows']
        : this.sectionFocus ? ['categories', 'rows', 'sections'] : ['categories', 'rows'];
      const index = domains.indexOf(this.domain);
      this.domain = domains[(index + (key === 'tab' ? 1 : -1) + domains.length) % domains.length];
    } else if (key === 'left' || key === 'right') {
      if (this.placement === 'top' || this.sectionFocus) {
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
    } else if (key === 'escape' && this.domain !== (this.placement === 'top' ? 'rows' : 'categories')) {
      this.domain = this.placement === 'top' ? 'rows' : 'categories';
    }
    else return undefined;
    if (this.domain === 'categories') this.viewport.reveal();
    const options = this.project('');
    return { options, query: '', focus: this.domain === 'sections'
      ? options.find(row => row.id === this.section)?.id ?? options.find(row => row.id.startsWith('section:'))?.id : this.rowFocus.get(this.category) };
  }
}
