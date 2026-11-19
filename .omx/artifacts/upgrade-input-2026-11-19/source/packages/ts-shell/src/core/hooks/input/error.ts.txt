/** Input callback refusal exposes no application-owned error details. */
export class InputRefusal extends Error {
  constructor() {
    super('Extension input was refused.');
    this.name = 'InputRefusal';
  }
}
