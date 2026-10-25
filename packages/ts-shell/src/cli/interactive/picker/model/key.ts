import type { CommandContext } from '../../../../core/commands/types.js';
import type { RuntimeProvider } from '../../../../config/runtimeConfig.js';
import type { Picker } from '../../overlay.js';
import { modelAuthentication, type ModelKey, type ModelSignIn } from './auth.js';

/** Explicit submission saves through the connection owner without echoing a command. */
export function modelKeyPicker(context: CommandContext, provider: RuntimeProvider, target: Omit<ModelKey, 'apiKey'>,
  signIn: ModelSignIn, back: (current: CommandContext, note?: string, connectionId?: string) => Picker): Picker {
  const attempt = modelAuthentication(context, provider, signIn, back);
  const validate = (text: string) => !text.trim() || /\s|[\x00-\x1f\x7f-\x9f]/.test(text)
    ? 'Enter a nonempty API key without whitespace.' : undefined;
  return {
    title: `Configure ${target.model}`, form: 'panel', empty: '', filterable: false, exclusive: true, holdInput: true,
    back: () => back(context), previewEnd: attempt.close,
    async load() { attempt.offer(); return []; },
    apply: async () => undefined,
    input: { initial: '', label: 'API key', masked: true, hint: 'Enter: save connection    Esc: cancel    Ctrl+U: clear',
      validate,
      apply: async text => validate(text) ? undefined : attempt.start({ ...target, apiKey: text }),
    },
  };
}
