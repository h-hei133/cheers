/**
 * Steerable Prompt & Follow-Up Queues
 *
 * Implements:
 * 1. Mid-turn steering message queue (injected at tool boundaries to redirect active turns)
 * 2. Follow-up queue (executed sequentially after current turn settles)
 */

export interface SteeringMessage {
  readonly id: string;
  readonly content: string;
  readonly timestamp: string;
}

export class SteerableQueueManager {
  private static instance?: SteerableQueueManager;
  private readonly steeringQueue: SteeringMessage[] = [];
  private readonly followUpQueue: SteeringMessage[] = [];

  static getShared(): SteerableQueueManager {
    if (!SteerableQueueManager.instance) {
      SteerableQueueManager.instance = new SteerableQueueManager();
    }
    return SteerableQueueManager.instance;
  }

  steer(content: string): SteeringMessage {
    const msg: SteeringMessage = {
      id: `steer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      timestamp: new Date().toISOString(),
    };
    this.steeringQueue.push(msg);
    return msg;
  }

  followUp(content: string): SteeringMessage {
    const msg: SteeringMessage = {
      id: `followup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      timestamp: new Date().toISOString(),
    };
    this.followUpQueue.push(msg);
    return msg;
  }

  hasSteering(): boolean {
    return this.steeringQueue.length > 0;
  }

  hasFollowUp(): boolean {
    return this.followUpQueue.length > 0;
  }

  drainSteering(): SteeringMessage[] {
    const drained = [...this.steeringQueue];
    this.steeringQueue.length = 0;
    return drained;
  }

  drainFollowUp(): SteeringMessage[] {
    const drained = [...this.followUpQueue];
    this.followUpQueue.length = 0;
    return drained;
  }

  clear(): void {
    this.steeringQueue.length = 0;
    this.followUpQueue.length = 0;
  }
}

export const steerableQueue = SteerableQueueManager.getShared();
