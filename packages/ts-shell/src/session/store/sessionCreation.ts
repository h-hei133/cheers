import { projectSessionBinding, type ProjectBindingOptions } from "./projectBindingPolicy.js";
import type { Session } from "../schema/sessionRecord.js";
import { captureActivationGuard, type SessionActivationGuard, type SessionActivationOptions } from './activation.js';

export interface SessionCreationOptions extends ProjectBindingOptions {
  /** A title to start with, for a session that is born carrying another's. */
  readonly title?: string;
  /** The session this one is copied from, when it is a fork. */
  readonly parentSession?: string;
  readonly activationGuard?: SessionActivationGuard;
}

interface SessionCreationCallbacks {
  readonly sessionExists: (sessionId: string) => boolean;
  readonly validateSessionId: (sessionId: string) => string;
  readonly createSessionId: () => string;
  readonly writeSession: (session: Session) => void;
  readonly setCurrentSessionForProject: (
    projectRoot: string,
    sessionId: string,
    options?: SessionActivationOptions,
  ) => void;
  readonly now: () => string;
}

export function createSessionWithId(input: {
  readonly callbacks: SessionCreationCallbacks;
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly options?: SessionCreationOptions;
}): Session {
  const normalizedId = input.callbacks.validateSessionId(input.sessionId);
  if (input.callbacks.sessionExists(normalizedId)) {
    throw new Error(`Session ${normalizedId} already exists`);
  }
  return createBoundSession({
    callbacks: input.callbacks,
    sessionId: normalizedId,
    projectRoot: input.projectRoot,
    options: input.options,
  });
}

export function createSession(input: {
  readonly callbacks: SessionCreationCallbacks;
  readonly projectRoot: string;
  readonly options?: SessionCreationOptions;
}): Session {
  return createBoundSession({
    callbacks: input.callbacks,
    sessionId: input.callbacks.createSessionId(),
    projectRoot: input.projectRoot,
    options: input.options,
  });
}

function createBoundSession(input: {
  readonly callbacks: SessionCreationCallbacks;
  readonly sessionId: string;
  readonly projectRoot: string;
  readonly options?: SessionCreationOptions;
}): Session {
  const guard = captureActivationGuard(input.options?.activationGuard);
  const now = input.callbacks.now();
  const binding = projectSessionBinding({
    projectRoot: input.projectRoot,
    options: input.options,
  });
  const session: Session = {
    id: input.sessionId,
    ...binding,
    ...(input.options?.title ? { title: input.options.title } : { title: undefined }),
    ...(input.options?.parentSession ? { parentSession: input.options.parentSession } : {}),
    createdAt: now,
    updatedAt: now,
    status: "active",
    turns: [],
  };
  input.callbacks.writeSession(session);
  if (guard) input.callbacks.setCurrentSessionForProject(input.projectRoot, session.id, { guard });
  else input.callbacks.setCurrentSessionForProject(input.projectRoot, session.id);
  return session;
}
