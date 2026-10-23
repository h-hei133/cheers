import type { Option } from './options.js';

export interface TreeOption extends Option {
  readonly depth: number;
}

/** Display-only disclosure state over one stable depth-first catalogue. */
export class TreeModel {
  private readonly indices = new Map<string, number>();
  private readonly parents: Array<number | undefined> = [];
  private readonly ends: number[] = [];
  private readonly collapsed = new Set<string>();
  private options: readonly Option[];

  constructor(private readonly source: readonly TreeOption[]) {
    const ancestors: number[] = [];
    source.forEach((option, index) => {
      if (this.indices.has(option.id)) throw new Error('Tree identities must be unique.');
      this.indices.set(option.id, index);
      while (ancestors.length && source[ancestors.at(-1)!]!.depth >= option.depth) {
        this.ends[ancestors.pop()!] = index;
      }
      this.parents[index] = ancestors.at(-1);
      ancestors.push(index);
    });
    for (const index of ancestors) this.ends[index] = source.length;
    this.options = source.map((option, index) => this.decorate(option, index));
  }

  get catalogue(): readonly Option[] { return this.options; }

  /** Search every admitted node, temporarily ignoring disclosure state. */
  filter(query: string, options: readonly Option[]): readonly Option[] {
    if (query) return options.filter(option =>
      `${option.label} ${option.detail ?? ''} ${option.note ?? ''} ${option.searchText ?? ''}`.toLowerCase().includes(query));
    const visible: Option[] = [];
    for (let index = 0; index < options.length; index++) {
      const option = options[index]!;
      visible.push(option);
      if (this.collapsed.has(option.id)) index = this.ends[index]! - 1;
    }
    return visible;
  }

  navigate(direction: 'left' | 'right', id: string, query: string): {
    readonly options: readonly Option[];
    readonly focus?: string;
  } | undefined {
    const index = this.indices.get(id);
    if (index === undefined) return undefined;
    const hasChildren = this.ends[index]! > index + 1;
    let target: number | undefined = index;
    let moveChild = false;
    if (direction === 'left') {
      if (!query && hasChildren && !this.collapsed.has(id)) this.setCollapsed(index, true);
      else target = this.parents[index];
    } else if (!query && hasChildren && this.collapsed.has(id)) this.setCollapsed(index, false);
    else if (hasChildren) moveChild = true;
    const visible = new Set(this.filter(query, this.options).filter(option => !option.disabled).map(option => option.id));
    if (direction === 'right' && moveChild) {
      target = undefined;
      for (let child = index + 1; child < this.ends[index]!; child = this.ends[child]!) {
        if (visible.has(this.source[child]!.id)) { target = child; break; }
      }
    }
    if (target !== undefined && !visible.has(this.source[target]!.id)) target = undefined;
    return { options: this.options, ...(target === undefined ? {} : { focus: this.source[target]!.id }) };
  }

  private setCollapsed(index: number, value: boolean): void {
    const option = this.source[index]!;
    if (value) this.collapsed.add(option.id);
    else this.collapsed.delete(option.id);
    const options = [...this.options];
    options[index] = this.decorate(option, index);
    this.options = options;
  }

  private decorate(option: TreeOption, index: number): Option {
    const marker = this.ends[index]! > index + 1 ? this.collapsed.has(option.id) ? '▸' : '▾' : '·';
    return { ...option, label: `${marker} ${option.label}` };
  }
}
