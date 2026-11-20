import { createAdvisorCodec as codec } from './codec.js';
import { advisorReviewPacket as reviewPacket } from './packet.js';

const advisor = { createAdvisorCodec: codec, advisorReviewPacket: reviewPacket } satisfies typeof import('../api.d.ts');
export const { createAdvisorCodec, advisorReviewPacket } = advisor;
