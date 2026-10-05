export interface CommandParameter {
  readonly name: string;
  readonly kind: "text" | "integer";
  readonly required?: boolean;
  readonly rest?: boolean;
  readonly minimum?: number;
}

export interface CommandAction {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly summary: string;
  readonly parameters?: readonly CommandParameter[];
}

export interface CommandFlag {
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly kind: "boolean" | "text";
  readonly summary: string;
  readonly values?: readonly string[];
  readonly conflicts?: readonly string[];
  /** Confirmation tokens must be typed explicitly, never supplied by completion. */
  readonly suggest?: boolean;
}

export interface CommandSyntax<Action extends CommandAction = CommandAction> {
  readonly name: string;
  readonly defaultAction?: string;
  readonly actions: readonly Action[];
  readonly flags?: readonly CommandFlag[];
}
