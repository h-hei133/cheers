from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, TypedDict, Union


RUNTIME_PROTOCOL_SCHEMA_VERSION = "1.0.0"

RuntimeOrigin = Literal["typescript", "rust", "python", "user", "system", "external"]
RuntimeErrorCode = Literal[
    "E_SCHEMA_VERSION_REQUIRED",
    "E_SCHEMA_VERSION_FORMAT",
    "E_COMPATIBILITY_UNSUPPORTED",
    "E_KIND_INVALID",
    "E_FIELD_REQUIRED",
    "E_FIELD_INVALID_TYPE",
    "E_FIELD_INVALID_VALUE",
    "E_COMMAND_INVALID",
    "E_TASK_STATUS_INVALID",
    "E_PERMISSION_RESPONSE_INVALID",
    "E_CANCELLATION_INVALID",
]

TaskStatus = Literal["pending", "running", "completed", "failed", "killed", "cancelled"]
StreamChannel = Literal["stdout", "stderr", "system", "assistant", "tool"]
PermissionScopeMode = Literal["read", "write", "execute", "network", "system"]
PermissionDecision = Literal["allow", "deny", "ask"]


class PermissionScope(TypedDict):
    mode: PermissionScopeMode
    target: str


class CommandRequest(TypedDict, total=False):
    schemaVersion: str
    kind: Literal["command.request"]
    commandId: str
    taskId: str
    commandName: str
    args: Dict[str, Any]
    requestedBy: RuntimeOrigin
    issuedAt: int
    correlationId: str


class TaskLifecycleEvent(TypedDict, total=False):
    schemaVersion: str
    kind: Literal["task.lifecycle"]
    eventId: str
    taskId: str
    status: TaskStatus
    previousStatus: TaskStatus
    message: str
    progress: float
    timestamp: int


class StreamChunk(TypedDict, total=False):
    schemaVersion: str
    kind: Literal["stream.chunk"]
    streamId: str
    taskId: str
    channel: StreamChannel
    chunkIndex: int
    content: str
    isFinal: bool
    emittedAt: int


class RuntimeErrorPayload(TypedDict, total=False):
    schemaVersion: str
    kind: Literal["runtime.error"]
    errorId: str
    taskId: str
    code: RuntimeErrorCode
    message: str
    recoverable: bool
    details: Dict[str, Any]
    emittedAt: int


class PermissionPrompt(TypedDict, total=False):
    schemaVersion: str
    kind: Literal["permission.prompt"]
    promptId: str
    taskId: str
    toolName: str
    action: str
    rationale: str
    scope: PermissionScope
    defaultDecision: PermissionDecision
    requestedAt: int
    expiresAt: int


class CancellationRequest(TypedDict, total=False):
    schemaVersion: str
    kind: Literal["task.cancel"]
    requestId: str
    taskId: str
    reason: str
    requestedBy: RuntimeOrigin
    requestedAt: int
    immediate: bool
    correlationId: str


RuntimeProtocolMessage = Union[
    CommandRequest,
    TaskLifecycleEvent,
    StreamChunk,
    RuntimeErrorPayload,
    PermissionPrompt,
    CancellationRequest,
]


@dataclass(frozen=True)
class ValidationFailure:
    code: RuntimeErrorCode
    message: str
    path: Optional[str] = None


def schema_version_required_error() -> ValidationFailure:
    return ValidationFailure(
        code="E_SCHEMA_VERSION_REQUIRED",
        message="schemaVersion is required",
        path="/schemaVersion",
    )


def schema_version_format_error() -> ValidationFailure:
    return ValidationFailure(
        code="E_SCHEMA_VERSION_FORMAT",
        message="schemaVersion must match major.minor.patch",
        path="/schemaVersion",
    )


def validate_schema_version(value: Optional[str]) -> List[ValidationFailure]:
    import re

    semver_re = re.compile(
        r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$"
    )
    if value is None:
        return [schema_version_required_error()]
    if not semver_re.match(value):
        return [schema_version_format_error()]
    return []
