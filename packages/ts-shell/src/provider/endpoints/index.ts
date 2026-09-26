/**
 * The endpoint kinds this build speaks.
 *
 * Import this rather than `kinds.js` directly. The registry is populated by the
 * protocol modules declaring themselves, and a caller that reached the registry
 * without them would find it empty and get an error naming every protocol as
 * missing. Importing the protocols here is what makes the import the whole of
 * what a caller has to do to have them.
 *
 * A new protocol is a new module imported here and nowhere else: no caller, and
 * no other protocol, has to know it exists.
 */
import "./openaiCompatible.js";
import "./anthropicMessages.js";
import "./bedrockConverse.js";

export {
  DEFAULT_ENDPOINT_KIND,
  declareEndpoint,
  declaredEndpointKinds,
  endpointBody,
  endpointKind,
  endpointShape,
  endpointText,
  endpointTurnBody,
  endpointUrl,
  isEventStream,
  type EndpointKind,
  type EndpointShape,
  type SimpleRequest,
  type TurnRequest,
} from "./kinds.js";
