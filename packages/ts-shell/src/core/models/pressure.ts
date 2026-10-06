/** Shared context risk bands, matching the rounded percentage shown in status. */
export function contextPressure(used: number, window: number): 'normal' | 'elevated' | 'high' | 'critical' {
  const percent = window > 0 ? Math.round(used / window * 100) : 0;
  return percent >= 90 ? 'critical' : percent >= 70 ? 'high' : percent >= 50 ? 'elevated' : 'normal';
}
