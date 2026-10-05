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

export interface CommandSyntax<Action extends CommandAction = CommandAction> {
  readonly name: string;
  readonly defaultAction?: string;
  readonly actions: readonly Action[];
}
