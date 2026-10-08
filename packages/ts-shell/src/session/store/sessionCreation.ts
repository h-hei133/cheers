import { projectSessionBinding, type ProjectBindingOptions } from "./projectBindingPolicy.js";
import type { Session } from "../schema/sessionRecord.js";

export interface SessionCreationOptions extends ProjectBindingOptions {
  /** A title to start with, for a session that is born carrying another's. */
  readonly title?: string;
  /** The session this one is copied from, when it is a fork. */
  readonly parentSession?: string;
}

interface SessionCreationCallbacks {
  readonly sessionExists: (sessionId: string) => boolean;
  readonly validateSessionId: (sessionId: string) => string;
  readonly createSessionId: () => string;
  readonly writeSession: (session: Session) => void;
  readonly setCurrentSessionForProject: (
    projectRoot: string,
    sessionId: string,
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
  input.callbacks.setCurrentSessionForProject(input.projectRoot, session.id);
  return session;
}
